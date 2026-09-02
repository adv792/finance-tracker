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

const now = new Date()
const currentMonth = now.toISOString().slice(0, 7) + '-01'
const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' })
const monthStart = currentMonth
const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

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

  const loadTransactions = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('transactions')
      .select('id, bank, amount, currency, description, date')
      .eq('user_id', uid)
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .order('date', { ascending: false })
    setTransactions((data ?? []) as Transaction[])
  }, [])

  useEffect(() => {
  const init = async (uid: string, providerToken?: string | null) => {
    setUserId(uid)
    if (providerToken) {
      await supabase.from('users').upsert({
        id: uid, email: '', provider_token: providerToken,
      })
    }
    const { data: incomeData } = await supabase
      .from('income_entries').select('gross_amount')
      .eq('user_id', uid).eq('month', currentMonth).single()
    if (incomeData) {
      setIncome(incomeData.gross_amount as number)
      setIncomeInput(String(incomeData.gross_amount))
    }
    await loadTransactions(uid)
  }

  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) init(session.user.id, session.provider_token)
  })

  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) init(session.user.id, session.provider_token)
  })

  return () => subscription.unsubscribe()
}, [loadTransactions])

  const handleSync = async () => {
    if (!userId) return
    setSyncing(true)
    setSyncMessage('')
    const res = await fetch('/api/sync-emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    const json = await res.json()
    setSyncing(false)
    if (json.success) {
      setSyncMessage(`✅ ${json.saved} new transactions saved`)
      await loadTransactions(userId)
    } else {
      setSyncMessage(`❌ Error: ${json.error}`)
    }
  }

  const handleSaveIncome = async () => {
    if (!userId || !incomeInput) return
    const amount = parseFloat(incomeInput)
    if (isNaN(amount) || amount <= 0) {
      setIncomeMessage('❌ Enter a valid amount')
      return
    }
    setSavingIncome(true)
    const { error } = await supabase.from('income_entries').upsert(
      { user_id: userId, month: currentMonth, amount },
      { onConflict: 'user_id,month' }
    )
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
    total: transactions.filter(t => t.bank === bank).reduce((sum, t) => sum + t.amount, 0),
    currency: bank === 'DAVIBANK' ? 'USD' : 'CRC',
  }))
  const safeToSpend = income !== null ? income - totalCRC : null

  return (
    <div style={{ padding: '40px', maxWidth: '700px', fontFamily: 'sans-serif' }}>
      <h1 style={{ marginBottom: '8px' }}>Finance Tracker</h1>
      <p style={{ color: '#666', marginTop: 0 }}>{monthLabel}</p>

      <div style={{
        marginTop: '24px', padding: '24px', borderRadius: '8px',
        background: safeToSpend === null ? '#f5f5f5' : safeToSpend >= 0 ? '#e8f5e9' : '#ffebee',
        border: `1px solid ${safeToSpend === null ? '#ddd' : safeToSpend >= 0 ? '#81c784' : '#e57373'}`,
      }}>
        <h2 style={{ margin: '0 0 8px' }}>Safe to Spend</h2>
        {safeToSpend !== null ? (
          <p style={{ fontSize: '36px', fontWeight: 'bold', margin: 0, color: safeToSpend >= 0 ? '#2e7d32' : '#c62828' }}>
            {fmt(safeToSpend)}
          </p>
        ) : (
          <p style={{ color: '#888', margin: 0 }}>Enter your income below to see this.</p>
        )}
        <p style={{ margin: '8px 0 0', color: '#666', fontSize: '14px' }}>
          Income: {income !== null ? fmt(income) : '—'} &nbsp;|&nbsp; CRC Expenses: {fmt(totalCRC)} &nbsp;|&nbsp; USD Expenses: {fmt(totalUSD, 'USD')}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
        {bankTotals.map(b => (
          <div key={b.bank} style={{ flex: 1, padding: '16px', border: '1px solid #ddd', borderRadius: '8px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 4px', fontWeight: 'bold', color: '#555' }}>{b.bank}</p>
            <p style={{ margin: 0, fontSize: '18px' }}>{fmt(b.total, b.currency)}</p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '24px', padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
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
            style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', borderRadius: '4px' }}
          >
            {savingIncome ? 'Saving...' : income !== null ? 'Update' : 'Save'}
          </button>
        </div>
        {incomeMessage && <p style={{ marginTop: '8px' }}>{incomeMessage}</p>}
      </div>

      <div style={{ marginTop: '20px' }}>
        <button
          onClick={handleSync}
          disabled={syncing}
          style={{ padding: '12px 24px', fontSize: '16px', cursor: 'pointer', borderRadius: '4px' }}
        >
          {syncing ? 'Syncing...' : 'Sync Emails'}
        </button>
        {syncMessage && <p style={{ marginTop: '8px' }}>{syncMessage}</p>}
      </div>

      <div style={{ marginTop: '32px' }}>
        <h2 style={{ marginBottom: '12px' }}>Transactions — {monthLabel}</h2>
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
                  <td style={{ padding: '8px' }}>
                    <span style={{
                      background: t.bank === 'BCR' ? '#e3f2fd' : t.bank === 'BAC' ? '#f3e5f5' : '#fff3e0',
                      padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold',
                    }}>
                      {t.bank}
                    </span>
                  </td>
                  <td style={{ padding: '8px' }}>{t.description}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>{fmt(t.amount, t.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
