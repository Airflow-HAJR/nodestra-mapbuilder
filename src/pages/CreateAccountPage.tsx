import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { AuthLayout } from '../components/ui/auth-layout'

const ACCENT = '#2A4A5E'

const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z" />
    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z" />
  </svg>
)

export function CreateAccountPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()

  const [joinCode, setJoinCode] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [joinCodeValidated, setJoinCodeValidated] = useState(false)
  const [validatingCode, setValidatingCode] = useState(false)

  useEffect(() => {
    if (!loading && session) navigate('/dashboard', { replace: true })
  }, [session, loading, navigate])

  async function lookupAirport(code: string) {
    const { data, error } = await supabase
      .from('airports')
      .select('id, name')
      .eq('join_code', code.trim())
      .maybeSingle()
    console.log('[airport lookup]', { code: code.trim(), data, error })
    return { airport: data, error }
  }

  async function validateJoinCode(code: string) {
    if (!code.trim()) {
      setJoinCodeValidated(false)
      return
    }

    setValidatingCode(true)
    const { airport, error } = await lookupAirport(code)
    setValidatingCode(false)

    if (!error && airport) {
      setJoinCodeValidated(true)
      setError(null)
    } else {
      setJoinCodeValidated(false)
      setError(null)
    }
  }

  async function handleGoogleSignUp() {
    setError(null)

    if (!joinCode.trim()) {
      setError('Enter your join code first.')
      return
    }

    setGoogleLoading(true)

    const { airport, error: airportError } = await lookupAirport(joinCode)
    if (airportError || !airport) {
      setError('Invalid join code.')
      setGoogleLoading(false)
      return
    }

    sessionStorage.setItem('pending_airport_id', airport.id)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/dashboard' },
    })
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!joinCode.trim()) {
      setError('Join code is required.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setSubmitting(true)

    const { airport, error: airportError } = await lookupAirport(joinCode)
    if (airportError || !airport) {
      setError('Invalid join code.')
      setSubmitting(false)
      return
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password })
    console.log('[signUp]', { signUpData, signUpError })

    if (signUpError || !signUpData.user) {
      setError(signUpError?.message ?? 'Sign up failed.')
      setSubmitting(false)
      return
    }

    if (!signUpData.session) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setError('Account created — please sign in to continue.')
        setSubmitting(false)
        navigate('/sign-in', { replace: true })
        return
      }
    }

    const { error: linkError } = await supabase
      .from('airport_users')
      .insert({ id: signUpData.user.id, airport_id: airport.id, role: 'admin' })
    console.log('[airport_users insert]', { linkError })

    if (linkError) {
      setError(`Failed to link airport: ${linkError.message}`)
      setSubmitting(false)
      return
    }

    navigate('/dashboard', { replace: true })
  }

  const revealMethods = joinCodeValidated && !validatingCode
  const busy = submitting || googleLoading

  return (
    <AuthLayout>
      <div className="auth-card-shell">
        <div className="mb-9">
          <h1
            className="text-[28px] font-bold tracking-tight mb-2"
            style={{ color: '#0f1423', letterSpacing: '-0.03em' }}
          >
            Create account
          </h1>
          <p className="text-sm font-medium" style={{ color: '#9299b8' }}>
            You&apos;ll need a join code from your airport
          </p>
        </div>

        {error && <div className="auth-error-box">{error}</div>}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="join-code" className="auth-label">
              Airport join code
            </label>
            <input
              id="join-code"
              name="joinCode"
              type="text"
              placeholder="e.g. JFK-2026"
              value={joinCode}
              onChange={(e) => {
                setJoinCode(e.target.value)
                setError(null)
                setJoinCodeValidated(false)
              }}
              onBlur={() => validateJoinCode(joinCode)}
              autoComplete="off"
              spellCheck={false}
              disabled={validatingCode || busy}
              className="auth-input"
            />
            {validatingCode && (
              <p className="mt-2 text-[12px] font-medium" style={{ color: '#9299b8' }}>
                Checking code...
              </p>
            )}
          </div>

          <div
            style={{
              maxHeight: revealMethods ? '1000px' : '0',
              opacity: revealMethods ? 1 : 0,
              overflow: 'hidden',
              transition: 'all 0.4s ease-out',
              borderTop: revealMethods ? '1px solid rgba(0,0,0,0.06)' : 'none',
              marginTop: revealMethods ? '8px' : '0',
              paddingTop: revealMethods ? '20px' : '0',
            }}
          >
            <button
              onClick={handleGoogleSignUp}
              disabled={busy}
              type="button"
              className="auth-google-btn"
            >
              <GoogleIcon />
              <span>{googleLoading ? 'Verifying...' : 'Sign up with Google'}</span>
            </button>

            <div className="auth-divider-line">
              <span>or</span>
            </div>

            <div className="space-y-5">
              <div>
                <label htmlFor="email" className="auth-label">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@airport.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required={revealMethods}
                  autoComplete="email"
                  disabled={busy}
                  className="auth-input"
                />
              </div>

              <div>
                <label htmlFor="password" className="auth-label">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Minimum 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required={revealMethods}
                    autoComplete="new-password"
                    disabled={busy}
                    className="auth-input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center transition-colors"
                    style={{ color: '#c1c7d8' }}
                    disabled={busy}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword
                      ? <EyeOff className="w-4 h-4 hover:text-[#2A4A5E]" />
                      : <Eye className="w-4 h-4 hover:text-[#2A4A5E]" />
                    }
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirm-password" className="auth-label">
                  Confirm password
                </label>
                <div className="relative">
                  <input
                    id="confirm-password"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required={revealMethods}
                    autoComplete="new-password"
                    disabled={busy}
                    className="auth-input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((value) => !value)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center transition-colors"
                    style={{ color: '#c1c7d8' }}
                    disabled={busy}
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirmPassword
                      ? <EyeOff className="w-4 h-4 hover:text-[#2A4A5E]" />
                      : <Eye className="w-4 h-4 hover:text-[#2A4A5E]" />
                    }
                  </button>
                </div>
              </div>

              <button type="submit" className="auth-submit-btn" disabled={busy}>
                <span className="text-[13px] font-bold tracking-wide">
                  {submitting ? 'Creating account...' : 'Create Account'}
                </span>
                {!submitting && <ArrowRight className="w-4 h-4" />}
                {submitting && (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
              </button>
            </div>
          </div>
        </form>

        <div className="auth-footer-link">
          Already have an account?{' '}
          <Link to="/sign-in" style={{ color: ACCENT }}>
            Sign in
          </Link>
        </div>
      </div>
    </AuthLayout>
  )
}
