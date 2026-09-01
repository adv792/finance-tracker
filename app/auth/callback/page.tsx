'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
  
export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        if (session.provider_token) {
          await supabase.from(  'users').upsert({
            id: session.user.id,
            email: session.user.email ?? '',
            provider_token: session.provider_token,
          })
        }
        router.push('/dashboard')
      }
    })
    return () => subscription.unsubscribe()
  }, [router])

  return <p style={{ textAlign: 'center', marginTop: '100px' }}>Signing in...</p>
}