import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. ' +
    'Copia .env.example a .env y completa los valores.'
  )
}

export const supabase = createClient(url ?? '', key ?? '', {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 10 } }
})

export const hayConexion = Boolean(url && key)
