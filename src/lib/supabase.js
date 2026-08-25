import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const hayConexion = Boolean(url && key)

// Sin claves no se construye el cliente. createClient lanza en el momento de
// crearse, y como esto corre al importar el módulo, la excepción mataba la app
// antes de que React alcanzara a mostrar el aviso de configuración.
export const supabase = hayConexion
  ? createClient(url, key, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 10 } }
    })
  : null

if (!hayConexion) {
  console.error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY.\n' +
    'En local: copia .env.example a .env, completa los valores y reinicia el servidor.\n' +
    'En Vercel: cárgalas en Settings > Environment Variables y vuelve a desplegar. ' +
    'Vite las incrusta al compilar, así que agregarlas sin redesplegar no cambia nada.'
  )
}
