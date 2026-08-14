import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseEmail } from '../../../lib/parsers'

const BANKS = [
  { name: 'BAC', query: 'subject:BAC OR subject:Credomatic' },
  { name: 'BCR', query: 'subject:BCR OR subject:SINPEMOVIL' },
  { name: 'DAVIBANK', query: 'subject:Davivienda OR subject:DAVIbank' },
]

function decodeBase64(str: string): string {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { userId } = await request.json()

    // Get user's Gmail token
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('provider_token')
      .eq('id', userId)
      .single()

    if (userError || !userData?.provider_token) {
      return NextResponse.json({ error: 'No Gmail token found' }, { status: 401 })
    }

    const token = userData.provider_token
    let totalSaved = 0

    for (const bank of BANKS) {
      const searchRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(bank.query)}&maxResults=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const searchData = await searchRes.json()
      const messages = searchData.messages || []

      for (const msg of messages) {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        const msgData = await msgRes.json()

        let body = ''
        function extractBody(payload: any) {
          if (payload?.body?.data) {
            body += decodeBase64(payload.body.data)
          }
          if (payload?.parts) {
            for (const part of payload.parts) {
              extractBody(part)
            }
          }
        }
        extractBody(msgData.payload)

        const parsed = parseEmail(bank.name, body)
        if (!parsed) continue

        const { error } = await supabase.from('transactions').upsert({
          user_id: userId,
          bank: bank.name,
          amount: parsed.amount,
          currency: parsed.currency,
          description: parsed.description,
          date: parsed.date || new Date().toISOString().split('T')[0],
          raw_email: body.substring(0, 1000),
          email_message_id: msg.id,
        }, { onConflict: 'email_message_id' })

        if (!error) totalSaved++
        else console.error('[sync] upsert error:', error)
      }
    }

    return NextResponse.json({ success: true, saved: totalSaved })
  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
