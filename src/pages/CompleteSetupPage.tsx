import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { AuthCard } from '../components/AuthCard'
import '../styles/auth.css'

export function CompleteSetupPage() {
  const { user } = useAuth()
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // If a pending airport ID was stored before Google OAuth redirect, auto-link
  useEffect(() => {
    const pendingAirportId = sessionStorage.getItem('pending_airport_id')
    if (!pendingAirportId || !user) return

    sessionStorage.removeItem('pending_airport_id')

    supabase
      .from('airport_users')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data: existing }) => {
        if (existing) {
          window.location.href = '/dashboard'
          return
        }
        supabase.from('airport_users').insert({
          id: user.id,
          airport_id: pendingAirportId,
          role: 'admin',
        }).then(({ error }) => {
          if (error) {
            setError('Failed to link airport. Please enter your join code manually.')
          } else {
            window.location.href = '/dashboard'
          }
        })
      })
  }, [user])

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault()
    setError(null)

    if (!joinCode.trim()) {
      setError('Join code is required.')
      return
    }

    setSubmitting(true)

    const { data: airport, error: airportError } = await supabase
      .from('airports')
      .select('id')
      .eq('join_code', joinCode.trim())
      .maybeSingle()

    if (airportError || !airport) {
      setError('Invalid join code. Please check with your airport administrator.')
      setSubmitting(false)
      return
    }

    const { data: existing } = await supabase
      .from('airport_users')
      .select('id')
      .eq('id', user!.id)
      .maybeSingle()

    if (existing) {
      window.location.href = '/dashboard'
      return
    }

    const { error: linkError } = await supabase.from('airport_users').insert({
      id: user!.id,
      airport_id: airport.id,
      role: 'admin',
    })

    if (linkError) {
      setError('Failed to link airport. Please try again or contact support.')
      setSubmitting(false)
      return
    }

    window.location.href = '/dashboard'
  }

  return (
    <AuthCard
      title="One more step"
      subtitle="Enter your airport join code to complete setup"
    >
      <div className="auth-form">
        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
          <div className="auth-field">
            <label htmlFor="join-code">Airport join code</label>
            <input
              id="join-code"
              type="text"
              placeholder="e.g. JFK-2026"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value)}
              required
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
          </div>

          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? 'Verifying…' : 'Continue to dashboard'}
          </button>
        </form>
      </div>
    </AuthCard>
  )
}
