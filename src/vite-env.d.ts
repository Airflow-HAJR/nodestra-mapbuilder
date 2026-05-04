/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_SIGNIN_URL: string
  readonly VITE_GATEGETTER_URL: string
  readonly VITE_MAPBUILDER_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
