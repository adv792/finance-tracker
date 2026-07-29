'use client'

import { supabase } from '../../lib/supabase'

export default function LoginPage() {
  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/gmail.readonly',
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <h1>Finance Tracker</h1>
        <p>Sign in to view your transactions and spending summary.</p>
        <button onClick={handleLogin} style={{ padding: '12px 24px', fontSize: '16px', cursor: 'pointer' }}>
          Sign in with Google
        </button>
      </div>
    </div>
  )
}
