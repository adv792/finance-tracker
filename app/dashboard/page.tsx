'use client'

import { useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function DashboardPage() {
  useEffect(() => {
    const saveToken = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.provider_token && session?.user) {
        await supabase.from('users').upsert({
          id: session.user.id,
          email: session.user.email,
          provider_token: session.provider_token,
        })
      }
    }

    saveToken()
  }, [])

  return (
    <div style={{ padding: '40px' }}>
      <h1>Dashboard</h1>
      <p>Welcome to your Finance Tracker!</p>
    </div>
  )
}