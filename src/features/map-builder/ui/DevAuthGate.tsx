import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Loader2, LogIn } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

interface DevAuthGateProps {
  user: User | null
  onContinue: () => void
}

export function DevAuthGate({ user, onContinue }: DevAuthGateProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit() {
    setError(null)
    setIsSubmitting(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError) {
      setError(signInError.message)
      setIsSubmitting(false)
      return
    }

    setPassword('')
    setIsSubmitting(false)
    onContinue()
  }

  async function handleSignOut() {
    setError(null)
    setIsSubmitting(true)
    await supabase.auth.signOut()
    setEmail('')
    setPassword('')
    setIsSubmitting(false)
  }

  return (
    <div className="map-builder dev-auth-shell">
      <div className="dev-auth-panel">
        <div className="dev-auth-header">
          <div className="dev-auth-badge">
            <LogIn size={18} />
          </div>
          <div className="dev-auth-copy">
            <h1>Developer Sign In</h1>
            <p>Use a real Supabase user that is linked to an airport in `airport_users`.</p>
          </div>
        </div>

        {user ? (
          <div className="dev-auth-session">
            <div className="dev-auth-session-card">
              <span className="dev-auth-session-label">Existing session</span>
              <strong className="dev-auth-session-email">{user.email ?? user.id}</strong>
              <p className="dev-auth-session-copy">Dev mode now requires an explicit continue action before entering the editor.</p>
            </div>

            <div className="dev-auth-actions">
              <button
                type="button"
                className="editor-topbar-btn dev-auth-action"
                onClick={() => void handleSignOut()}
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 size={16} className="dev-auth-spinner" /> : null}
                <span>{isSubmitting ? 'Signing Out...' : 'Sign Out'}</span>
              </button>

              <button
                type="button"
                className="editor-topbar-btn accent dev-auth-action"
                onClick={onContinue}
                disabled={isSubmitting}
              >
                Continue
              </button>
            </div>
          </div>
        ) : (
          <form
            className="dev-auth-form"
            autoComplete="off"
            onSubmit={(event) => event.preventDefault()}
            data-lpignore="true"
            data-1p-ignore="true"
          >
            <label className="dev-auth-field">
              <span>Email</span>
              <input
                type="email"
                name="dev-auth-email"
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleSubmit()
                  }
                }}
                placeholder="dev@example.com"
                disabled={isSubmitting}
                data-lpignore="true"
                data-1p-ignore="true"
                required
              />
            </label>

            <label className="dev-auth-field">
              <span>Password</span>
              <input
                type="password"
                name="dev-auth-password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleSubmit()
                  }
                }}
                placeholder="Password"
                disabled={isSubmitting}
                data-lpignore="true"
                data-1p-ignore="true"
                required
              />
            </label>

            {error ? <p className="dev-auth-error">{error}</p> : null}

            <button
              type="button"
              className="editor-topbar-btn accent dev-auth-submit"
              onClick={() => void handleSubmit()}
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 size={16} className="dev-auth-spinner" /> : <LogIn size={16} />}
              <span>{isSubmitting ? 'Signing In...' : 'Sign In'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
