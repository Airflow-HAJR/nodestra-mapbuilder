import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

/**
 * Fetches the current user's airport IATA code from Supabase.
 * The airports table uses the IATA code as its primary key (id),
 * so airport_users.airport_id is the IATA code directly.
 */
export function useAirportCode() {
  const { user } = useAuth()
  const [airportCode, setAirportCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }

    let cancelled = false
    ;(async () => {
      const { data: airportUser } = await supabase
        .from('airport_users')
        .select('airport_id')
        .eq('id', user.id)
        .maybeSingle()

      if (cancelled) return

      if (airportUser?.airport_id) {
        setAirportCode(airportUser.airport_id)
      }

      setLoading(false)
    })()

    return () => { cancelled = true }
  }, [user])

  return { airportCode, loading }
}
