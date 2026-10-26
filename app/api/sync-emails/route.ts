import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseBCR } from '../../../lib/parsers/bcr'
import { parseBAC } from '../../../lib/parsers/bac'
import { parseDAVIBANK } from '../../../lib/parsers/davibank'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function fetchMessages(token: string, query: string, maxResults = 20) {
  const listRes = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const listData = await listRes.json()
  if (!listData.messages?.length) return []

  return Promise.all(
    listData.messages.map(async (msg: { id: string }) => {
      const res = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      return res.json()
    })
  )
}

function getBody(message: any): string {
  const payload = message?.payload
  if (!payload) return ''

  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }

  const parts: any[] = payload.parts ?? []
  for (const part of parts) {
    if ((part.mimeType === 'text/html' || part.mimeType === 'text/plain') && part.body?.data) {
      return Buffer.from(part.body.data, 'base64').toString('utf-8')
    }
    for (const sub of part.parts ?? []) {
      if ((sub.mimeType === 'text/html' || sub.mimeType === 'text/plain') && sub.body?.data) {
        return Buffer.from(sub.body.data, 'base64').toString('utf-8')
      }
    }
  }
  return ''
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json()

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('provider_token')
      .eq('id', userId)
      .single()

    if (userError || !userData?.provider_token) {
      return NextResponse.json({ success: false, error: 'No provider token. Log out and log back in.' })
    }

    const token = userData.provider_token

    const [bcrMsgs, bacMsgs, daviMsgs] = await Promise.all([
      fetchMessages(token, 'from:notificaciones@bancobcr.com'),
      fetchMessages(token, 'from:notificaciones@bac.net'),
      fetchMessages(token, 'from:notificaciones@davivienda.com'),
    ])

    const rows: any[] = []

    for (const msg of bcrMsgs) {
      const tx = parseBCR(getBody(msg))
      if (tx) rows.push({ ...tx, user_id: userId, bank: 'BCR' })
    }
    for (const msg of bacMsgs) {
      const tx = parseBAC(getBody(msg))
      if (tx) rows.push({ ...tx, user_id: userId, bank: 'BAC' })
    }
    for (const msg of daviMsgs) {
      const tx = parseDAVIBANK(getBody(msg))
      if (tx) rows.push({ ...tx, user_id: userId, bank: 'DAVIBANK' })
    }

    if (rows.length === 0) {
      return NextResponse.json({ success: true, saved: 0 })
    }

    const { data: inserted, error: insertError } = await supabase
      .from('transactions')
      .upsert(rows, { onConflict: 'user_id,bank,date,amount,description', ignoreDuplicates: true })
      .select()

    if (insertError) {
      return NextResponse.json({ success: false, error: insertError.message })
    }

    return NextResponse.json({ success: true, saved: inserted?.length ?? 0 })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? 'Unknown error' })
  }
}
