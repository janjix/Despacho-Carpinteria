// Panel para el televisor del taller.
//
// El criterio de diseño no es estético, es de distancia de lectura. A cuatro
// o cinco metros, un carácter necesita medir cerca de 25 mm para leerse sin
// esfuerzo. En un televisor de 55 pulgadas eso son unos 40 px de altura de
// letra a 1080p, así que el cuerpo base arranca en 34 px y los números
// grandes en 100. Todo lo que aquí parece exagerado en un monitor de
// escritorio es lo justo en la pared del taller.
//
// De ahí salen las otras decisiones:
//   · Nada de scroll. Lo que no cabe se pagina solo cada doce segundos.
//   · Márgenes generosos: muchos televisores recortan hasta un 4% del borde.
//   · Blanco roto sobre gris muy oscuro, no blanco puro sobre negro puro, que
//     a esa distancia produce halo alrededor de las letras.
//   · Los tres estados se distinguen por color y además por posición y por
//     texto, para que funcione con alguien que no distinga verde de amarillo.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProyecto, useUltimosEscaneos } from '../hooks/useSupabase'
import { useEscaneoGlobal } from '../hooks/useEscaneoGlobal'
import { ESTADOS, esHoy, fechaCorta, hora, resumir } from '../lib/codigos'

const SEGUNDOS_POR_PAGINA = 12
const CLAVE_AJUSTES = 'tecc.panel'

const AJUSTES_INICIALES = { escala: 1, porPagina: 20, soloPendientes: false }

function estadoGrupo(items) {
  if (items.every(i => i.estado === 'cargado')) return 'cargado'
  if (items.every(i => i.estado !== 'pendiente')) return 'embalado'
  return 'pendiente'
}

// ---------------------------------------------------------------------

function Cifra({ valor, etiqueta, color, e }) {
  return (
    <div className="text-center">
      <div
        className="font-display font-extrabold leading-none tabular-nums"
        style={{ color, fontSize: `${5.2 * e}rem` }}
      >
        {valor}
      </div>
      <div
        className="font-display uppercase tracking-[0.16em] text-white/45 mt-1"
        style={{ fontSize: `${0.95 * e}rem` }}
      >
        {etiqueta}
      </div>
    </div>
  )
}

function Tarjeta({ grupo, e }) {
  const estado = estadoGrupo(grupo.items)
  const info = ESTADOS[estado]
  const cargados = grupo.items.filter(i => i.estado === 'cargado').length
  const embalados = grupo.items.filter(i => i.estado !== 'pendiente').length

  const fondo = estado === 'pendiente' ? '#1B1F26' : info.hex
  const texto = estado === 'embalado' ? '#2E2200' : estado === 'cargado' ? '#FFFFFF' : '#C7CAD1'
  const borde = estado === 'pendiente' ? '2px solid #2E343E' : 'none'

  return (
    <div
      className="flex flex-col justify-between overflow-hidden"
      style={{
        background: fondo, color: texto, border: borde,
        padding: `${0.85 * e}rem ${1 * e}rem`,
        minHeight: `${8.2 * e}rem`
      }}
    >
      <span
        className="font-display font-bold leading-[1.1]"
        style={{ fontSize: `${1.85 * e}rem` }}
      >
        {grupo.base.nombre}
      </span>

      <div className="flex items-end justify-between gap-2" style={{ marginTop: `${0.6 * e}rem` }}>
        <span
          className="font-display font-semibold uppercase tracking-wider opacity-80"
          style={{ fontSize: `${0.95 * e}rem` }}
        >
          {estado === 'pendiente' ? 'Pendiente' : estado === 'embalado' ? 'Embalado' : 'Cargado'}
        </span>
        <span
          className="font-codigo tabular-nums opacity-75"
          style={{ fontSize: `${0.95 * e}rem` }}
        >
          {grupo.items.length > 1
            ? `${cargados}/${grupo.items.length}`
            : grupo.base.codigo.split('-').slice(-1)[0]}
        </span>
      </div>

      {grupo.items.length > 1 && estado !== 'cargado' && (
        <div className="flex mt-2" style={{ height: `${0.4 * e}rem`, gap: '2px' }}>
          {grupo.items.map(i => (
            <span key={i.id} className="flex-1" style={{
              background: i.estado === 'cargado' ? '#0E4B29'
                : i.estado === 'embalado' ? 'rgba(0,0,0,.35)'
                : 'rgba(255,255,255,.18)'
            }} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------

export default function Panel({ proyectoId, onCambiarProyecto, onSalir }) {
  const [proyectos, setProyectos] = useState([])
  const { proyecto, areas, items, cargando } = useProyecto(proyectoId)
  const escaneos = useUltimosEscaneos(1)
  const { viaje, ultimo: ultimoLocal } = useEscaneoGlobal()

  const [ajustes, setAjustes] = useState(() => {
    try { return { ...AJUSTES_INICIALES, ...JSON.parse(localStorage.getItem(CLAVE_AJUSTES) ?? '{}') } }
    catch { return AJUSTES_INICIALES }
  })
  const [pagina, setPagina] = useState(0)
  const [reloj, setReloj] = useState(() => new Date())
  const [controles, setControles] = useState(false)

  const e = ajustes.escala
  const guardar = useCallback((parche) => {
    setAjustes(prev => {
      const nuevo = { ...prev, ...parche }
      try { localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(nuevo)) } catch { /* da igual */ }
      return nuevo
    })
  }, [])

  useEffect(() => {
    supabase.from('proyectos').select('id,nombre,fecha_despacho')
      .is('deleted_at', null).eq('estado', 'activo')
      .order('fecha_despacho', { ascending: true, nullsFirst: false })
      .then(({ data }) => setProyectos(data ?? []))
  }, [])

  useEffect(() => {
    const t = setInterval(() => setReloj(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const total = resumir(items)

  // Grupos, respetando el orden de las áreas
  const grupos = useMemo(() => {
    const porArea = new Map(areas.map(a => [a.id, []]))
    const mapa = new Map()
    for (const it of items) {
      if (!mapa.has(it.grupo_id)) {
        const g = { grupo_id: it.grupo_id, base: it, area: it.area_id, items: [] }
        mapa.set(it.grupo_id, g)
        porArea.get(it.area_id)?.push(g)
      }
      mapa.get(it.grupo_id).items.push(it)
    }
    return areas.flatMap(a => (porArea.get(a.id) ?? []).map(g => ({ ...g, areaNombre: a.nombre })))
  }, [areas, items])

  const visibles = ajustes.soloPendientes
    ? grupos.filter(g => estadoGrupo(g.items) !== 'cargado')
    : grupos

  // Paginado: lo que no cabe rota solo, porque en un televisor nadie va a
  // bajar con la rueda del ratón
  const paginas = useMemo(() => {
    const n = Math.max(1, ajustes.porPagina)
    const trozos = []
    for (let i = 0; i < visibles.length; i += n) trozos.push(visibles.slice(i, i + n))
    return trozos.length ? trozos : [[]]
  }, [visibles, ajustes.porPagina])

  useEffect(() => { setPagina(p => (p >= paginas.length ? 0 : p)) }, [paginas.length])

  useEffect(() => {
    if (paginas.length < 2) return
    const t = setInterval(() => setPagina(p => (p + 1) % paginas.length), SEGUNDOS_POR_PAGINA * 1000)
    return () => clearInterval(t)
  }, [paginas.length])

  const ultimoEscaneo = escaneos[0]
  const alerta = proyecto && esHoy(proyecto.fecha_despacho) && total.embalado > 0
  const enPantallaCompleta = typeof document !== 'undefined' && Boolean(document.fullscreenElement)

  const pantallaCompleta = () => {
    if (document.fullscreenElement) document.exitFullscreen?.()
    else document.documentElement.requestFullscreen?.().catch(() => {})
  }

  const paginaActual = paginas[Math.min(pagina, paginas.length - 1)] ?? []
  const areasEnPagina = [...new Set(paginaActual.map(g => g.areaNombre))]

  return (
    <div
      className="min-h-[100dvh] flex flex-col overflow-hidden"
      style={{ background: '#101318', color: '#F2F3F5' }}
      onMouseMove={() => { setControles(true); }}
      onMouseLeave={() => setControles(false)}
    >
      {/* Margen de seguridad: muchos televisores recortan el borde */}
      <div className="flex-1 flex flex-col" style={{ padding: `${1.6 * e}rem ${2.2 * e}rem` }}>

        <header className="flex items-center gap-8 shrink-0">
          <div className="min-w-0 flex-1">
            <h1
              className="font-display font-extrabold leading-none truncate"
              style={{ fontSize: `${3.4 * e}rem` }}
            >
              {proyecto?.nombre ?? 'Panel de despacho'}
            </h1>
            <p className="text-white/45 mt-2 truncate" style={{ fontSize: `${1.15 * e}rem` }}>
              {proyecto?.cliente ? `${proyecto.cliente} · ` : ''}
              Despacho {fechaCorta(proyecto?.fecha_despacho)}
              {areasEnPagina.length > 0 && ` · ${areasEnPagina.join(' · ')}`}
            </p>
          </div>

          <div className="flex items-end shrink-0" style={{ gap: `${2.6 * e}rem` }}>
            <Cifra e={e} valor={total.pendiente} etiqueta="Pendientes" color="#9AA0AA" />
            <Cifra e={e} valor={total.embalado} etiqueta="Embalados" color={ESTADOS.embalado.hex} />
            <Cifra e={e} valor={total.cargado} etiqueta="Cargados" color={ESTADOS.cargado.hex} />
            <Cifra e={e} valor={total.total} etiqueta="Bultos" color="#FFFFFF" />
          </div>
        </header>

        {/* Barra de avance: la lectura más rápida de todas */}
        {total.total > 0 && (
          <div
            className="flex shrink-0 overflow-hidden"
            style={{ height: `${1.1 * e}rem`, marginTop: `${1.1 * e}rem`, background: '#1B1F26' }}
          >
            <div style={{ width: `${(total.cargado / total.total) * 100}%`, background: ESTADOS.cargado.hex }} />
            <div style={{ width: `${(total.embalado / total.total) * 100}%`, background: ESTADOS.embalado.hex }} />
          </div>
        )}

        {alerta && (
          <div
            className="shrink-0 font-display font-bold uppercase tracking-wide"
            style={{
              background: '#C42B2B', color: '#fff',
              marginTop: `${1 * e}rem`,
              padding: `${0.7 * e}rem ${1.2 * e}rem`,
              fontSize: `${1.6 * e}rem`
            }}
          >
            Sale hoy · quedan {total.embalado} bultos embalados sin cargar
          </div>
        )}

        <main className="flex-1 min-h-0" style={{ marginTop: `${1.4 * e}rem` }}>
          {cargando && (
            <p className="text-white/40 text-center py-20" style={{ fontSize: `${1.6 * e}rem` }}>
              Conectando
            </p>
          )}

          {!cargando && !visibles.length && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <p className="font-display font-extrabold" style={{ fontSize: `${3.6 * e}rem`, color: ESTADOS.cargado.hex }}>
                {items.length ? 'Todo cargado' : 'Sin bultos en este proyecto'}
              </p>
              {items.length > 0 && (
                <p className="text-white/45 mt-3" style={{ fontSize: `${1.4 * e}rem` }}>
                  Los {total.total} bultos subieron al camión
                </p>
              )}
            </div>
          )}

          {visibles.length > 0 && (
            <div
              className="grid"
              style={{
                gap: `${0.6 * e}rem`,
                gridTemplateColumns: `repeat(auto-fill, minmax(${17 * e}rem, 1fr))`
              }}
            >
              {paginaActual.map(g => <Tarjeta key={g.grupo_id} grupo={g} e={e} />)}
            </div>
          )}
        </main>

        <footer
          className="shrink-0 flex flex-wrap items-center gap-x-8 gap-y-2 border-t border-white/10"
          style={{ marginTop: `${1.2 * e}rem`, paddingTop: `${0.9 * e}rem`, fontSize: `${1.1 * e}rem` }}
        >
          <span className="text-white/40 font-display uppercase tracking-[0.16em]"
                style={{ fontSize: `${0.85 * e}rem` }}>
            Último
          </span>
          {ultimoLocal ? (
            <span>
              <span className="font-codigo">{ultimoLocal.codigo}</span>
              <span className="text-white/50"> · {ultimoLocal.titulo} · {hora(ultimoLocal.cuando)}</span>
            </span>
          ) : ultimoEscaneo ? (
            <span>
              <span className="font-codigo">{ultimoEscaneo.codigo}</span>
              <span className="text-white/50"> · {ultimoEscaneo.accion} · {hora(ultimoEscaneo.created_at)}</span>
            </span>
          ) : (
            <span className="text-white/35">Sin movimientos todavía</span>
          )}

          {viaje && (
            <span className="text-white/60">
              Cargando en <strong className="text-white">{viaje.camion_codigo}</strong> · {viaje.codigo}
            </span>
          )}

          {paginas.length > 1 && (
            <span className="flex items-center gap-2 ml-auto">
              {paginas.map((_, i) => (
                <span key={i} className="rounded-full" style={{
                  width: `${0.55 * e}rem`, height: `${0.55 * e}rem`,
                  background: i === pagina ? '#F2F3F5' : 'rgba(255,255,255,.22)'
                }} />
              ))}
              <span className="text-white/40 ml-2" style={{ fontSize: `${0.9 * e}rem` }}>
                {pagina + 1}/{paginas.length}
              </span>
            </span>
          )}

          <span
            className={`font-codigo tabular-nums text-white/50 ${paginas.length > 1 ? '' : 'ml-auto'}`}
            title="Si este reloj se detiene, la app dejó de correr"
          >
            {reloj.toLocaleTimeString('es-VE', { hour12: false })}
          </span>
        </footer>
      </div>

      {/* Controles. Aparecen al mover el ratón y se van solos: en la pared no
          deben verse, pero alguien tiene que poder ajustar el tamaño. */}
      <div
        className={`fixed top-0 inset-x-0 z-50 transition-opacity duration-300 ${controles ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(10,12,15,.94)' }}
      >
        <div className="flex flex-wrap items-center gap-3 px-5 py-3 text-[14px]">
          <button onClick={onSalir}
            className="min-h-[44px] px-4 border border-white/25 text-white/80 hover:text-white
                       hover:border-white/60 font-display uppercase tracking-wide text-[13px]">
            ← Salir del panel
          </button>

          <select
            value={proyectoId ?? ''}
            onChange={(ev) => onCambiarProyecto(ev.target.value)}
            className="bg-[#1B1F26] text-white border border-white/20 min-h-[44px] px-3 text-[14px]"
          >
            {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>

          <div className="flex items-center gap-2 text-white/60">
            <span className="font-display uppercase tracking-wide text-[12px]">Tamaño</span>
            {[0.8, 1, 1.25, 1.5].map(v => (
              <button key={v} onClick={() => guardar({ escala: v })}
                className={`min-h-[44px] px-3 border text-[13px] ${
                  e === v ? 'bg-white text-tinta border-white' : 'border-white/25 text-white/70 hover:text-white'}`}>
                {v === 0.8 ? 'S' : v === 1 ? 'M' : v === 1.25 ? 'L' : 'XL'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-white/60">
            <span className="font-display uppercase tracking-wide text-[12px]">Por pantalla</span>
            {[12, 20, 30, 42].map(v => (
              <button key={v} onClick={() => guardar({ porPagina: v })}
                className={`min-h-[44px] px-3 border text-[13px] ${
                  ajustes.porPagina === v ? 'bg-white text-tinta border-white' : 'border-white/25 text-white/70 hover:text-white'}`}>
                {v}
              </button>
            ))}
          </div>

          <button
            onClick={() => guardar({ soloPendientes: !ajustes.soloPendientes })}
            className={`min-h-[44px] px-4 border text-[13px] font-display uppercase tracking-wide ${
              ajustes.soloPendientes ? 'bg-white text-tinta border-white' : 'border-white/25 text-white/70 hover:text-white'}`}
          >
            {ajustes.soloPendientes ? 'Viendo lo que falta' : 'Ver solo lo que falta'}
          </button>

          <button onClick={pantallaCompleta}
            className="ml-auto min-h-[44px] px-4 border border-white/25 text-white/80 hover:text-white
                       hover:border-white/60 font-display uppercase tracking-wide text-[13px]">
            {enPantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'}
          </button>
        </div>
      </div>
    </div>
  )
}
