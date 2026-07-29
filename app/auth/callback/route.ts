import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data } = await supabase.auth.exchangeCodeForSession(code)
    console.log('Session:', JSON.stringify(data?.session?.provider_token))

    if (data.session) {
      const { user, provider_token } = data.session

      if (user && provider_token) {
        await supabase.from('users').upsert({
          id: user.id,
          email: user.email,
          provider_token,
        })
      }
    }
  }

  return NextResponse.redirect(new URL('/dashboard', requestUrl.origin))
}