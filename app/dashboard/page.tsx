'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Transaction = {
  id: string
  bank: string
  amount: number
  currency: string
  description: string
  date: string
}

function getMonthBounds(offset: number) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  const year = d.getFullYear()
  const month = d.getMonth()
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const monthLabel = d.toLocaleString('default', { month: 'long', year: 'numeric' })
  return { monthStart, monthEnd, monthLabel }
}

function fmt(n: number, currency = 'CRC'): string {
  return currency === 'USD'
    ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    : `₡${n.toLocaleString('es-CR')}`
}

export default function DashboardPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [income, setIncome] = useState<number | null>(null)
  const [incomeInput, setIncomeInput] = useState('')
  const [savingIncome, setSavingIncome] = useState(false)
  const [incomeMessage, setIncomeMessage] = useState('')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [monthOffset, setMonthOffset] = useState(0)

  const { monthStart, monthEnd, monthLabel } = getMonthBounds(monthOffset)

  const loadTransactions = useCallback(async (uid: string, start: string, end: string) => {
    const { data } = await supabase
      .from('transactions')
      .select('id, bank, amount, currency, description, date')
      .eq('user_id', uid)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false })
    setTransactions((data ?? []) as Transaction[])
  }, [])

  // Re-load data when user or selected month changes
  useEffect(() => {
    if (!userId) return
    setTransactions([])
    setIncome(null)
    setIncomeInput('')
    setIncomeMessage('')

    supabase
      .from('income_entries')
      .select('gross_amount')
      .eq('user_id', userId)
      .eq('month', monthStart)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const amt = (data as any).gross_amount as number
          setIncome(amt)
          setIncomeInput(String(amt))
        }
      })

    loadTransactions(userId, monthStart, monthEnd)
  }, [userId, monthOffset, monthStart, monthEnd, loadTransactions])

  // Auth listener (runs once)
  useEffect(() => {
    const init = async (uid: string, providerToken?: string | null) => {
      if (providerToken) {
        await supabase.from('users').upsert({
          id: uid, email: '', provider_token: providerToken,
        })
      }
      setUserId(uid)
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) init(session.user.id, session.provider_token)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) init(session.user.id, session.provider_token)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSync = async () => {
    if (!userId) return
    setSyncing(true)
    setSyncMessage('')
    try {
      const res = await fetch('/api/sync-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const json = await res.json()
      if (json.success) {
        setSyncMessage(`✅ ${json.saved} new transactions saved`)
        await loadTransactions(userId, monthStart, monthEnd)
      } else {
        setSyncMessage(`❌ Error: ${json.error}`)
      }
    } catch {
      setSyncMessage('❌ Sync failed (timeout or network error)')
    } finally {
      setSyncing(false)
    }
  }

  const handleSaveIncome = async () => {
    if (!userId || !incomeInput) return
    const amount = parseFloat(incomeInput)
    if (isNaN(amount) || amount <= 0) {
      setIncomeMessage('❌ Please enter a valid amount')
      return
    }
    setSavingIncome(true)
    const { error } = await supabase.from('income_entries').upsert({
      user_id: userId,
      month: monthStart,
      gross_amount: amount,
    }, { onConflict: 'user_id,month' })
    setSavingIncome(false)
    if (!error) {
      setIncome(amount)
      setIncomeMessage('✅ Saved')
    } else {
      setIncomeMessage(`❌ ${error.message}`)
    }
  }

  const totalCRC = transactions.filter(t => t.currency === 'CRC').reduce((sum, t) => sum + t.amount, 0)
  const totalUSD = transactions.filter(t => t.currency === 'USD').reduce((sum, t) => sum + t.amount, 0)
  const bankTotals = ['BCR', 'BAC', 'DAVIBANK'].map(bank => ({
    bank,
    crc: transactions.filter(t => t.bank === bank && t.currency === 'CRC').reduce((sum, t) => sum + t.amount, 0),
    usd: transactions.filter(t => t.bank === bank && t.currency === 'USD').reduce((sum, t) => sum + t.amount, 0),
  }))
  const safeToSpend = income !== null ? income - totalCRC : null

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px', fontFamily: 'sans-serif' }}>
      <h1 style={{ marginBottom: '8px' }}>Finance Tracker</h1>

      {/* Month Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <button
          onClick={() => setMonthOffset(o => o - 1)}
          style={{ padding: '4px 12px', cursor: 'pointer', fontSize: '18px', border: '1px solid #ddd', borderRadius: '4px', background: 'white' }}
        >&#8592;</button>
        <p style={{ color: '#666', margin: 0, fontWeight: 500 }}>{monthLabel}</p>
        <button
          onClick={() => setMonthOffset(o => o + 1)}
          disabled={monthOffset >= 0}
          style={{ padding: '4px 12px', cursor: monthOffset >= 0 ? 'not-allowed' : 'pointer', fontSize: '18px', border: '1px solid #ddd', borderRadius: '4px', background: 'white', opacity: monthOffset >= 0 ? 0.4 : 1 }}
        >&#8594;</button>
      </div>

      {/* Safe to Spend */}
      <div style={{
        marginTop: '0', padding: '24px', borderRadius: '8px',
        background: safeToSpend === null ? '#f5f5f5' : safeToSpend >= 0 ? '#e8f5e9' : '#ffebee',
        border: `1px solid ${safeToSpend === null ? '#ddd' : safeToSpend >= 0 ? '#81c784' : '#e57373'}`,
        marginBottom: '16px',
      }}>
        <h2 style={{ margin: '0 0 8px' }}>Safe to Spend</h2>
        {safeToSpend !== null ? (
          <p style={{ fontSize: '36px', fontWeight: 'bold', margin: 0, color: safeToSpend >= 0 ? '#2e7d32' : '#c62828' }}>
            {fmt(safeToSpend)}
          </p>
        ) : (
          <p style={{ color: '#888', margin: 0 }}>Enter your income below to see this.</p>
        )}
        <p style={{ margin: '8px 0 0', fontSize: '14px', color: '#555' }}>
          Income: {income !== null ? fmt(income) : '—'} &nbsp;|&nbsp; CRC Expenses: {fmt(totalCRC)} &nbsp;|&nbsp; USD Expenses: {fmt(totalUSD, 'USD')}
        </p>
      </div>

      {/* Bank Totals */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        {bankTotals.map(({ bank, crc, usd }) => (
          <div key={bank} style={{ flex: 1, padding: '16px', border: '1px solid #ddd', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{bank}</div>
            {crc > 0 && <div>{fmt(crc)}</div>}
            {usd > 0 && <div>{fmt(usd, 'USD')}</div>}
            {crc === 0 && usd === 0 && <div style={{ color: '#aaa' }}>{fmt(0)}</div>}
          </div>
        ))}
      </div>

      {/* Income */}
      <div style={{ marginTop: '0', padding: '20px', border: '1px solid #ddd', borderRadius: '8px', marginBottom: '16px' }}>
        <h2 style={{ margin: '0 0 12px' }}>Gross Income — {monthLabel}</h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            type="number"
            placeholder="Enter amount"
            value={incomeInput}
            onChange={e => setIncomeInput(e.target.value)}
            style={{ padding: '10px', fontSize: '16px', width: '200px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
          <button
            onClick={handleSaveIncome}
            disabled={savingIncome}
            style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', borderRadius: '4px', border: 'none', background: '#1976d2', color: 'white' }}
          >
            {savingIncome ? 'Saving...' : 'Save'}
          </button>
        </div>
        {incomeMessage && <p style={{ margin: '8px 0 0', fontSize: '14px' }}>{incomeMessage}</p>}
      </div>

      {/* Sync */}
      <button
        onClick={handleSync}
        disabled={syncing}
        style={{ padding: '10px 20px', fontSize: '16px', cursor: syncing ? 'not-allowed' : 'pointer', borderRadius: '4px', border: 'none', background: '#388e3c', color: 'white', marginBottom: '8px' }}
      >
        {syncing ? 'Syncing...' : 'Sync Emails'}
      </button>
      {syncMessage && <p style={{ margin: '0 0 12px', fontSize: '14px' }}>{syncMessage}</p>}

      {/* Transactions */}
      <h2>Transactions — {monthLabel}</h2>
      {transactions.length === 0 ? (
        <p style={{ color: '#888' }}>No transactions found for this month. Try syncing.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
              <th style={{ padding: '8px' }}>Date</th>
              <th style={{ padding: '8px' }}>Bank</th>
              <th style={{ padding: '8px' }}>Description</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '8px', color: '#555' }}>{t.date}</td>
                <td style={{ padding: '8px' }}>{t.bank}</td>
                <td style={{ padding: '8px' }}>{t.description}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 500 }}>{fmt(t.amount, t.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
