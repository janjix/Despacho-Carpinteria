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

const AJUSTES_INICIALES = {
  escala: 1,
  porPagina: 20,
  soloPendientes: false,
  vertical: false,
  ocultarDespachados: true
}

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
      <div>
        <span
          className="font-display font-bold leading-[1.1] block"
          style={{ fontSize: `${1.85 * e}rem` }}
        >
          {grupo.base.nombre}
        </span>
        {/* El área va debajo y más chica: identifica sin competir con el
            nombre, que es lo que el operario busca primero */}
        <span
          className="font-display font-semibold uppercase tracking-[0.1em] block opacity-70"
          style={{ fontSize: `${0.95 * e}rem`, marginTop: `${0.25 * e}rem` }}
        >
          {grupo.areaNombre}
        </span>
      </div>

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
  const [despachados, setDespachados] = useState(new Set())

  const [ajustes, setAjustes] = useState(() => {
    try { return { ...AJUSTES_INICIALES, ...JSON.parse(localStorage.getItem(CLAVE_AJUSTES) ?? '{}') } }
    catch { return AJUSTES_INICIALES }
  })
  const [pagina, setPagina] = useState(0)
  const [reloj, setReloj] = useState(() => new Date())
  const [controles, setControles] = useState(false)

  const e = ajustes.escala
  const vertical = Boolean(ajustes.vertical)
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

  // El fondo oscuro se aplica al documento entero, no solo a esta vista.
  // Si vive únicamente en el contenedor, cualquier hueco que quede por debajo
  // (contenido corto, altura mal calculada por el navegador del televisor,
  // rebote del scroll) deja ver el blanco del documento.
  useEffect(() => {
    const raiz = document.documentElement
    raiz.classList.add('panel-oscuro')
    const meta = document.querySelector('meta[name="theme-color"]')
    const antes = meta?.getAttribute('content')
    meta?.setAttribute('content', '#101318')
    return () => {
      raiz.classList.remove('panel-oscuro')
      if (antes) meta?.setAttribute('content', antes)
    }
  }, [])

  // Viajes que ya salieron del taller. Su carga sale del panel: lo que va
  // camino a la obra no aporta nada en la pared y solo ocupa sitio.
  const cargarDespachados = useCallback(async () => {
    const { data } = await supabase
      .from('viajes').select('id')
      .in('estado', ['despachado', 'entregado'])
      .is('deleted_at', null)
    setDespachados(new Set((data ?? []).map(v => v.id)))
  }, [])

  useEffect(() => { cargarDespachados() }, [cargarDespachados])

  useEffect(() => {
    const canal = supabase
      .channel('panel-viajes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' },
        cargarDespachados)
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [cargarDespachados])

  // Lo despachado desaparece del panel, no de la base
  const enTaller = useMemo(() => (
    ajustes.ocultarDespachados
      ? items.filter(i => !(i.viaje_id && despachados.has(i.viaje_id)))
      : items
  ), [items, despachados, ajustes.ocultarDespachados])

  const total = resumir(enTaller)
  const fuera = items.length - enTaller.length

  // Grupos, respetando el orden de las áreas
  const grupos = useMemo(() => {
    const porArea = new Map(areas.map(a => [a.id, []]))
    const mapa = new Map()
    for (const it of enTaller) {
      if (!mapa.has(it.grupo_id)) {
        const g = { grupo_id: it.grupo_id, base: it, area: it.area_id, items: [] }
        mapa.set(it.grupo_id, g)
        porArea.get(it.area_id)?.push(g)
      }
      mapa.get(it.grupo_id).items.push(it)
    }
    // Seguidilla por área: sin encabezados de sección, los grupos de un área
    // salen juntos y el cambio se nota por la etiqueta de cada tarjeta
    return areas.flatMap(a => (porArea.get(a.id) ?? []).map(g => ({ ...g, areaNombre: a.nombre })))
  }, [areas, enTaller])

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
      className="flex flex-col overflow-hidden"
      style={{
        background: '#101318',
        color: '#F2F3F5',
        // 100vh como respaldo para los navegadores de televisor que no
        // entienden dvh; el que sí lo entiende usa la segunda declaración
        minHeight: '100vh',
        height: '100dvh'
      }}
    >
      {/* Margen de seguridad: muchos televisores recortan el borde */}
      <div
        className="flex-1 flex flex-col"
        style={{ padding: vertical ? `${1.4 * e}rem ${1.2 * e}rem` : `${1.6 * e}rem ${2.2 * e}rem` }}
      >

        <header className={`shrink-0 ${vertical ? 'flex flex-col gap-4' : 'flex items-center gap-8'}`}>
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

          <div
            className={`flex items-end shrink-0 ${vertical ? 'justify-between w-full' : ''}`}
            style={{ gap: vertical ? `${1.2 * e}rem` : `${2.6 * e}rem` }}
          >
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
                {items.length ? 'Nada pendiente aquí' : 'Sin bultos en este proyecto'}
              </p>
              {fuera > 0 && (
                <p className="text-white/45 mt-3" style={{ fontSize: `${1.4 * e}rem` }}>
                  {fuera} bultos ya salieron del taller
                </p>
              )}
            </div>
          )}

          {visibles.length > 0 && (
            <div
              className="grid"
              style={{
                gap: `${0.6 * e}rem`,
                // En vertical la pantalla es angosta y alta: pocas columnas
                // anchas leen mejor que muchas estrechas
                gridTemplateColumns: vertical
                  ? `repeat(auto-fill, minmax(${22 * e}rem, 1fr))`
                  : `repeat(auto-fill, minmax(${17 * e}rem, 1fr))`
              }}
            >
              {paginaActual.map(g => <Tarjeta key={g.grupo_id} grupo={g} e={e} />)}
            </div>
          )}
        </main>

        <footer
          className={`shrink-0 flex flex-wrap gap-x-8 gap-y-2 border-t border-white/10 ${
            vertical ? 'flex-col items-start' : 'items-center'}`}
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

      {/* Controles en un cajón lateral. Antes eran una barra superior que
          tapaba la cabecera justo cuando alguien intentaba ajustarla. */}
      <button
        onClick={() => setControles(v => !v)}
        className={`fixed top-3 right-3 z-50 min-h-[44px] min-w-[44px] px-3 border
                    font-display uppercase tracking-wide text-[12px] transition-opacity
                    ${controles ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        style={{ background: 'rgba(10,12,15,.75)', borderColor: 'rgba(255,255,255,.25)', color: 'rgba(255,255,255,.65)' }}
        title="Ajustes del panel"
      >
        Ajustes
      </button>

      {controles && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,.45)' }}
          onClick={() => setControles(false)}
        />
      )}

      <div
        className={`fixed top-0 right-0 bottom-0 z-50 overflow-y-auto transition-transform duration-200
                    ${controles ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ background: 'rgba(10,12,15,.98)', width: 'min(360px, 92vw)',
                 borderLeft: '1px solid rgba(255,255,255,.15)' }}
      >
        <div className="flex flex-col gap-4 p-5 text-[14px]">
          <div className="flex items-center justify-between">
            <span className="font-display uppercase tracking-[0.16em] text-white/45 text-[12px]">
              Ajustes del panel
            </span>
            <button
              onClick={() => setControles(false)}
              className="min-h-[44px] min-w-[44px] text-2xl leading-none text-white/50 hover:text-white"
              aria-label="Cerrar"
            >×</button>
          </div>
          <label className="block">
            <span className="font-display uppercase tracking-wide text-[12px] text-white/50 block mb-2">
              Proyecto
            </span>
            <select
              value={proyectoId ?? ''}
              onChange={(ev) => onCambiarProyecto(ev.target.value)}
              className="w-full bg-[#1B1F26] text-white border border-white/20 min-h-[44px] px-3 text-[14px]"
            >
              {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>

          <div>
            <span className="font-display uppercase tracking-wide text-[12px] text-white/50 block mb-2">
              Tamaño de letra
            </span>
            <div className="grid grid-cols-4 gap-2">
              {[0.8, 1, 1.25, 1.5].map(v => (
                <button key={v} onClick={() => guardar({ escala: v })}
                  className={`min-h-[44px] border text-[13px] font-display ${
                    e === v ? 'bg-white text-tinta border-white' : 'border-white/25 text-white/70 hover:text-white'}`}>
                  {v === 0.8 ? 'S' : v === 1 ? 'M' : v === 1.25 ? 'L' : 'XL'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="font-display uppercase tracking-wide text-[12px] text-white/50 block mb-2">
              Tarjetas por pantalla
            </span>
            <div className="grid grid-cols-4 gap-2">
              {[12, 20, 30, 42].map(v => (
                <button key={v} onClick={() => guardar({ porPagina: v })}
                  className={`min-h-[44px] border text-[13px] font-display ${
                    ajustes.porPagina === v ? 'bg-white text-tinta border-white' : 'border-white/25 text-white/70 hover:text-white'}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="font-display uppercase tracking-wide text-[12px] text-white/50 block mb-2">
              Orientación
            </span>
            <div className="grid grid-cols-2 gap-2">
              {[[false, 'Horizontal'], [true, 'Vertical']].map(([v, texto]) => (
                <button key={texto} onClick={() => guardar({ vertical: v })}
                  className={`min-h-[44px] border text-[13px] font-display uppercase tracking-wide ${
                    Boolean(ajustes.vertical) === v
                      ? 'bg-white text-tinta border-white'
                      : 'border-white/25 text-white/70 hover:text-white'}`}>
                  {texto}
                </button>
              ))}
            </div>
            <p className="text-[12px] text-white/35 mt-2 leading-relaxed">
              Vertical apila las tarjetas en una o dos columnas anchas, para un
              televisor montado de canto.
            </p>
          </div>

          <button
            onClick={() => guardar({ soloPendientes: !ajustes.soloPendientes })}
            className={`min-h-[48px] px-4 border text-[13px] font-display uppercase tracking-wide ${
              ajustes.soloPendientes ? 'bg-white text-tinta border-white' : 'border-white/25 text-white/70 hover:text-white'}`}
          >
            {ajustes.soloPendientes ? 'Viendo solo lo que falta' : 'Ver solo lo que falta'}
          </button>

          <button
            onClick={() => guardar({ ocultarDespachados: !ajustes.ocultarDespachados })}
            className={`min-h-[48px] px-4 border text-[13px] font-display uppercase tracking-wide ${
              ajustes.ocultarDespachados ? 'bg-white text-tinta border-white' : 'border-white/25 text-white/70 hover:text-white'}`}
          >
            {ajustes.ocultarDespachados ? 'Ocultando lo despachado' : 'Mostrar todo'}
          </button>

          <button onClick={pantallaCompleta}
            className="min-h-[48px] px-4 border border-white/25 text-white/80 hover:text-white
                       hover:border-white/60 font-display uppercase tracking-wide text-[13px]">
            {enPantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'}
          </button>

          <button onClick={onSalir}
            className="min-h-[48px] px-4 border border-white/25 text-white/80 hover:text-white
                       hover:border-white/60 font-display uppercase tracking-wide text-[13px]">
            ← Salir del panel
          </button>
        </div>
      </div>
    </div>
  )
}
