// Navegación por hash. Sin router: son cuatro pantallas y el panel de TV
// necesita una URL fija que se pueda dejar abierta en un navegador kiosco.
//
//   #/proyectos          lista de proyectos
//   #/proyecto/{id}      detalle, carga de ítems y etiquetas
//   #/escaneo            pantalla del lector
//   #/panel/{id}         panel para el televisor

import { useEffect, useState } from 'react'
import { hayConexion, supabase } from './lib/supabase'
import { Aviso } from './components/ui'
import Proyectos from './components/Proyectos'
import Proyecto from './components/Proyecto'
import Escaneo from './components/Escaneo'
import Panel from './components/Panel'

function useRuta() {
  const [ruta, setRuta] = useState(() => window.location.hash.slice(1) || '/proyectos')
  useEffect(() => {
    const alCambiar = () => setRuta(window.location.hash.slice(1) || '/proyectos')
    window.addEventListener('hashchange', alCambiar)
    return () => window.removeEventListener('hashchange', alCambiar)
  }, [])
  const ir = (destino) => { window.location.hash = destino }
  return [ruta, ir]
}

function Navegacion({ ruta, ir }) {
  const enlaces = [
    { href: '/proyectos', texto: 'Proyectos' },
    { href: '/escaneo', texto: 'Escaneo' }
  ]
  return (
    <nav className="sticky top-0 z-30 bg-tinta text-papel">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center gap-1">
        <span className="font-display font-extrabold tracking-tight text-lg pr-5 py-3">
          TECC <span className="text-white/50 font-semibold">Despacho</span>
        </span>
        {enlaces.map(e => {
          const activo = ruta.startsWith(e.href)
          return (
            <button
              key={e.href}
              onClick={() => ir(e.href)}
              className={`min-h-[48px] px-4 font-display uppercase tracking-wide text-[13px] border-b-2 ${
                activo ? 'border-papel' : 'border-transparent text-papel/55 hover:text-papel'
              }`}
            >
              {e.texto}
            </button>
          )
        })}
        <button
          onClick={() => ir('/panel')}
          className="ml-auto min-h-[48px] px-4 font-display uppercase tracking-wide text-[13px] text-papel/55 hover:text-papel"
        >
          Panel del taller
        </button>
      </div>
    </nav>
  )
}

export default function App() {
  const [ruta, ir] = useRuta()

  // El panel abre siempre el proyecto activo más próximo a despacharse
  const [proyectoPanel, setProyectoPanel] = useState(null)
  const enPanel = ruta.startsWith('/panel')
  const idEnRuta = ruta.split('/')[2] ?? null

  useEffect(() => {
    if (!enPanel || idEnRuta) return
    supabase.from('proyectos').select('id')
      .is('deleted_at', null).eq('estado', 'activo')
      .order('fecha_despacho', { ascending: true, nullsFirst: false })
      .limit(1)
      .then(({ data }) => { if (data?.[0]) ir(`/panel/${data[0].id}`) })
  }, [enPanel, idEnRuta])

  if (!hayConexion) {
    return (
      <div className="max-w-xl mx-auto p-6 pt-16">
        <Aviso tono="alerta">
          Falta la conexión con Supabase. Copia <code>.env.example</code> a{' '}
          <code>.env</code>, completa <code>VITE_SUPABASE_URL</code> y{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>, y vuelve a levantar la app.
        </Aviso>
      </div>
    )
  }

  // El panel de TV ocupa la pantalla completa, sin barra de navegación
  if (enPanel) {
    return (
      <Panel
        proyectoId={idEnRuta ?? proyectoPanel}
        onCambiarProyecto={(id) => { setProyectoPanel(id); ir(`/panel/${id}`) }}
      />
    )
  }

  return (
    <>
      <Navegacion ruta={ruta} ir={ir} />
      {ruta.startsWith('/proyecto/') && (
        <Proyecto proyectoId={ruta.split('/')[2]} onVolver={() => ir('/proyectos')} />
      )}
      {ruta.startsWith('/proyectos') && (
        <Proyectos onAbrir={(id) => ir(`/proyecto/${id}`)} />
      )}
      {ruta.startsWith('/escaneo') && <Escaneo />}
      {!['/proyecto', '/escaneo'].some(p => ruta.startsWith(p)) && !ruta.startsWith('/proyectos') && (
        <div className="p-6"><Aviso>Esa dirección no existe. Vuelve a Proyectos.</Aviso></div>
      )}
    </>
  )
}
