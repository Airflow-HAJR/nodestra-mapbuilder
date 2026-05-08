import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local')
}

const cookieDomain = window.location.hostname.includes('nodestra.com')
  ? '.nodestra.com'
  : window.location.hostname

const cookieStorage = {
  getItem(key: string): string | null {
    const match = document.cookie
      .split('; ')
      .find(c => c.startsWith(`${key}=`))
    return match ? decodeURIComponent(match.slice(key.length + 1)) : null
  },
  setItem(key: string, value: string): void {
    const maxAge = 60 * 60 * 24 * 365
    const secure = location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${key}=${encodeURIComponent(value)}; domain=${cookieDomain}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`
  },
  removeItem(key: string): void {
    document.cookie = `${key}=; domain=${cookieDomain}; path=/; max-age=0; SameSite=Lax`
  },
}

export const supabase = createClient(url, key, {
  auth: {
    storage: cookieStorage,
    storageKey: 'nodestra-auth',  // must match signin app exactly
  },
})
