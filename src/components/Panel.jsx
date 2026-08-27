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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePanelDatos, useUltimosEscaneos } from '../hooks/useSupabase'
import { useEscaneoGlobal } from '../hooks/useEscaneoGlobal'
import ZonaProyecto from './ZonaProyecto'
import { ESTADOS, esHoy, fechaCorta, hora, resumir } from '../lib/codigos'

const SEGUNDOS_POR_PAGINA = 12
const CLAVE_AJUSTES = 'tecc.panel'

// Medidas de la rejilla, en rem antes de aplicar la escala. La altura es
// exacta y no mínima: si una tarjeta creciera con un nombre largo, el número
// de filas dejaría de ser predecible y volveríamos a cortar la última.
const ALTO_TARJETA = 7.6
const ANCHO_TARJETA = 15.5
const ANCHO_TARJETA_VERTICAL = 20
const HUECO = 0.5

const AJUSTES_INICIALES = {
  escala: 1,
  soloPendientes: false,
  vertical: false,
  comoda: false,
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
        style={{ color, fontSize: `${3.4 * e}rem` }}
      >
        {valor}
      </div>
      <div
        className="font-display uppercase tracking-[0.16em] text-white/45"
        style={{ fontSize: `${0.75 * e}rem` }}
      >
        {etiqueta}
      </div>
    </div>
  )
}

/**
 * Color de cada barrita de la tira de progreso.
 *
 * La tira dice cuántos bultos del mueble ya se escanearon. Como se dibuja
 * sobre dos fondos distintos (gris cuando el mueble está pendiente, amarillo
 * cuando está embalado), el hueco cambia de tono para que el avance se vea
 * en los dos casos.
 */
function colorBarrita(estadoItem, estadoGrupo) {
  if (estadoItem === 'cargado') return ESTADOS.cargado.hex
  if (estadoItem === 'embalado') {
    // Sobre fondo amarillo el amarillo no se distingue: se oscurece
    return estadoGrupo === 'embalado' ? '#8A6200' : ESTADOS.embalado.hex
  }
  return estadoGrupo === 'embalado' ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.15)'
}

function Tarjeta({ grupo, e, resaltada, mostrarProyecto, alto = 6.2 }) {
  const estado = estadoGrupo(grupo.items)
  const info = ESTADOS[estado]
  const cargados = grupo.items.filter(i => i.estado === 'cargado').length
  const embalados = grupo.items.filter(i => i.estado !== 'pendiente').length

  const fondo = estado === 'pendiente' ? '#1B1F26' : info.hex
  const texto = estado === 'embalado' ? '#2E2200' : estado === 'cargado' ? '#FFFFFF' : '#C7CAD1'
  const borde = resaltada
    ? '3px solid #FFFFFF'
    : estado === 'pendiente' ? '2px solid #2E343E' : '2px solid transparent'

  return (
    <div
      className="flex flex-col justify-between overflow-hidden"
      style={{
        background: fondo, color: texto, border: borde,
        boxShadow: resaltada ? '0 0 0 3px rgba(255,255,255,.25)' : 'none',
        padding: `${0.5 * e}rem ${0.7 * e}rem`,
        height: `${alto * e}rem`
      }}
    >
      <div>
        <span
          className="font-display font-bold leading-[1.08] block overflow-hidden"
          style={{
            // Los nombres largos bajan de cuerpo en lugar de robar altura a
            // la tarjeta. Así el alto es fijo y el cálculo de filas exacto.
            fontSize: `${(grupo.base.nombre.length > 34 ? 1.15
                        : grupo.base.nombre.length > 22 ? 1.35
                        : 1.6) * e}rem`,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical'
          }}
        >
          {grupo.base.nombre}
        </span>
        {/* El área va debajo y más chica: identifica sin competir con el
            nombre, que es lo que el operario busca primero */}
        <span
          className="font-display font-semibold uppercase tracking-[0.1em] block opacity-70 truncate"
          style={{ fontSize: `${0.8 * e}rem`, marginTop: `${0.12 * e}rem` }}
        >
          {grupo.base.tipo === 'herrajes' && '◧ '}
          {mostrarProyecto && grupo.proyectoNombre
            ? `${grupo.proyectoNombre} · ${grupo.areaNombre}`
            : grupo.areaNombre}
        </span>
      </div>

      <div className="flex items-end justify-between gap-2" style={{ marginTop: `${0.3 * e}rem` }}>
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
        <div className="flex" style={{ height: `${0.35 * e}rem`, gap: '2px', marginTop: `${0.25 * e}rem` }}>
          {grupo.items.map(i => (
            <span key={i.id} className="flex-1" style={{ background: colorBarrita(i.estado, estado) }} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------

export default function Panel({ proyectoId, onCambiarProyecto, onSalir }) {
  const { proyectos, areas, items, cargando, todos } = usePanelDatos(proyectoId)
  const proyecto = todos ? null : proyectos[0] ?? null
  const [listaProyectos, setListaProyectos] = useState([])
  const escaneos = useUltimosEscaneos(1)
  const { viaje, variosAbiertos, ultimo: ultimoLocal } = useEscaneoGlobal()
  const [despachados, setDespachados] = useState(new Set())

  const [ajustes, setAjustes] = useState(() => {
    try { return { ...AJUSTES_INICIALES, ...JSON.parse(localStorage.getItem(CLAVE_AJUSTES) ?? '{}') } }
    catch { return AJUSTES_INICIALES }
  })
  const [resaltado, setResaltado] = useState(null)
  const [reloj, setReloj] = useState(() => new Date())
  const [medidas, setMedidas] = useState({ ancho: 0, alto: 0, dpr: 1, zoom: 100, perdido: 0 })
  const [controles, setControles] = useState(false)

  const e = ajustes.escala
  const vertical = Boolean(ajustes.vertical)

  // Lista para el selector. Es aparte de los datos que se muestran: el
  // selector tiene que ofrecer todos los proyectos activos aunque ahora mismo
  // se esté viendo uno solo.
  useEffect(() => {
    supabase.from('proyectos').select('id,nombre,fecha_despacho')
      .is('deleted_at', null)
      .neq('estado', 'archivado')
      .order('fecha_despacho', { ascending: true, nullsFirst: false })
      .then(({ data, error }) => {
        if (error) console.error('No se pudo cargar la lista de proyectos:', error)
        else setListaProyectos(data ?? [])
      })
  }, [])

  // Viajes que ya salieron del taller. Su carga sale del panel: lo que va
  // camino a la obra no aporta nada en la pared y solo ocupa sitio.
  const cargarDespachados = useCallback(async () => {
    const { data, error } = await supabase
      .from('viajes').select('id')
      .in('estado', ['despachado', 'entregado'])
      .is('deleted_at', null)
    if (error) {
      console.error('No se pudieron cargar los viajes despachados:', error)
      return
    }
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

  const guardar = useCallback((parche) => {
    setAjustes(prev => {
      const nuevo = { ...prev, ...parche }
      try { localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(nuevo)) } catch { /* da igual */ }
      return nuevo
    })
  }, [])

  // Lo despachado desaparece del panel, no de la base
  const enTaller = useMemo(() => (
    ajustes.ocultarDespachados
      ? items.filter(i => !(i.viaje_id && despachados.has(i.viaje_id)))
      : items
  ), [items, despachados, ajustes.ocultarDespachados])

  const total = resumir(enTaller)
  const fuera = items.length - enTaller.length

  // Grupos ordenados: áreas por proyecto, y dentro de cada área los muebles
  // en orden alfabético. Buscar un nombre en una pared es más rápido que
  // buscarlo en el orden en que se cargó la lista.
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

    const comparar = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })
    const areaDeProyecto = Object.fromEntries(areas.map(a => [a.id, a.proyecto_id]))

    return [...areas]
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      .flatMap(a =>
        (porArea.get(a.id) ?? [])
          .sort((x, y) => comparar.compare(x.base.nombre, y.base.nombre))
          .map(g => ({
            ...g,
            areaNombre: a.nombre,
            proyectoId: areaDeProyecto[a.id]
          }))
      )
  }, [areas, enTaller])

  const visibles = ajustes.soloPendientes
    ? grupos.filter(g => estadoGrupo(g.items) !== 'cargado')
    : grupos

  // El efecto del escaneo consulta la lista sin depender de ella, que si no
  // se dispararía en cada render
  const visiblesRef = useRef(visibles)
  useEffect(() => { visiblesRef.current = visibles }, [visibles])

  // Cada proyecto se pinta en su propia zona, y cada zona mide su espacio y
  // pagina por su cuenta. Aquí solo se reparten los grupos.
  const zonas = useMemo(() => {
    if (!todos) return [{ proyecto, grupos: visibles }]
    const porProyecto = new Map()
    for (const g of visibles) {
      if (!porProyecto.has(g.proyectoId)) porProyecto.set(g.proyectoId, [])
      porProyecto.get(g.proyectoId).push(g)
    }
    // Orden de proyectos: el más próximo a despacharse, primero
    return proyectos
      .map(pr => ({ proyecto: pr, grupos: porProyecto.get(pr.id) ?? [] }))
      .filter(z => z.grupos.length || proyectos.length === 1)
  }, [todos, proyecto, proyectos, visibles])

  // Al escanear se marca el bulto; cada zona decide si le toca saltar.
  useEffect(() => {
    if (!ultimoLocal?.codigo) return
    const buscado = String(ultimoLocal.codigo).toUpperCase().replace(/[^A-Z0-9]/g, '')
    const existe = visiblesRef.current.some(g =>
      g.items.some(i => i.codigo.toUpperCase().replace(/[^A-Z0-9]/g, '') === buscado))
    // Aunque el bulto no esté visible (filtros puestos, código desconocido)
    // el aviso se muestra igual: un rechazo hay que verlo
    setResaltado(existe ? buscado : '—')
    const t = setTimeout(() => setResaltado(null), 6000)
    return () => clearTimeout(t)
  }, [ultimoLocal?.clave])

  const ultimoEscaneo = escaneos[0]
  const saleHoy = todos
    ? proyectos.some(p => esHoy(p.fecha_despacho))
    : Boolean(proyecto && esHoy(proyecto.fecha_despacho))
  const alerta = saleHoy && total.embalado > 0
  const enPantallaCompleta = typeof document !== 'undefined' && Boolean(document.fullscreenElement)

  const pantallaCompleta = () => {
    if (document.fullscreenElement) document.exitFullscreen?.()
    else document.documentElement.requestFullscreen?.().catch(() => {})
  }

  // El aviso vive los mismos seis segundos que el resalte de la tarjeta
  const avisoEscaneo = useMemo(() => {
    if (!resaltado || !ultimoLocal) return null
    const tono = ultimoLocal.tono
    if (tono === 'embalado') return { fondo: ESTADOS.embalado.hex, texto: '#2E2200' }
    if (tono === 'cargado') return { fondo: ESTADOS.cargado.hex, texto: '#FFFFFF' }
    if (tono === 'aviso') return { fondo: '#3A3F49', texto: '#F2F3F5' }
    return { fondo: '#C42B2B', texto: '#FFFFFF' }
  }, [resaltado, ultimoLocal])


  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        background: '#101318',
        color: '#F2F3F5',
        // Fijo a la ventana en lugar de depender de vh.
        //
        // El navegador de los televisores Samsung llega a reportar la ventana
        // como 0x0, y con eso 100vh vale cero: la cadena de alturas colapsa
        // entera y no se dibuja nada. Con position fixed e inset 0 la altura
        // la da el propio hueco de la ventana, sin unidades de por medio.
        position: 'fixed',
        top: 0, right: 0, bottom: 0, left: 0,
        minHeight: '100vh'
      }}
    >
      {/* Resultado del último escaneo, a todo lo ancho y en el color del
          estado. En una pantalla a tres metros el borde blanco de la tarjeta
          se ve, pero un rechazo hay que poder leerlo sin buscarlo. */}
      {avisoEscaneo && (
        <div
          key={ultimoLocal.clave}
          className="shrink-0 flex items-center gap-4 font-display font-bold uppercase"
          style={{
            background: avisoEscaneo.fondo,
            color: avisoEscaneo.texto,
            padding: `${0.45 * e}rem ${1.2 * e}rem`,
            fontSize: `${1.25 * e}rem`,
            letterSpacing: '0.02em'
          }}
        >
          <span>{ultimoLocal.titulo}</span>
          <span className="font-codigo font-normal normal-case opacity-80 truncate"
                style={{ fontSize: `${1.1 * e}rem` }}>
            {ultimoLocal.codigo}
            {ultimoLocal.detalle ? ` · ${ultimoLocal.detalle}` : ''}
          </span>
          <span className="ml-auto font-codigo font-normal opacity-70 shrink-0"
                style={{ fontSize: `${1.1 * e}rem` }}>
            {hora(ultimoLocal.cuando)}
          </span>
        </div>
      )}

      {/* Margen de seguridad: muchos televisores recortan el borde */}
      <div
        className="flex-1 flex flex-col"
        style={{ padding: vertical ? `${0.9 * e}rem ${1 * e}rem` : `${1 * e}rem ${1.4 * e}rem` }}
      >

        <header className={`shrink-0 ${vertical ? 'flex flex-col gap-4' : 'flex items-center gap-8'}`}>
          <div className="min-w-0 flex-1">
            <h1
              className="font-display font-extrabold leading-none truncate"
              style={{ fontSize: `${2.4 * e}rem` }}
            >
              {todos
                ? (proyectos.length === 1 ? proyectos[0].nombre : `${proyectos.length} proyectos activos`)
                : (proyecto?.nombre ?? 'Panel de despacho')}
            </h1>
            <p className="text-white/45 mt-1 truncate" style={{ fontSize: `${0.95 * e}rem` }}>
              {todos
                ? proyectos.map(p => p.nombre).join(' · ')
                : `${proyecto?.cliente ? `${proyecto.cliente} · ` : ''}Despacho ${fechaCorta(proyecto?.fecha_despacho)}`}
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
            style={{ height: `${0.7 * e}rem`, marginTop: `${0.7 * e}rem`, background: '#1B1F26' }}
          >
            <div style={{ width: `${(total.cargado / total.total) * 100}%`, background: ESTADOS.cargado.hex }} />
            <div style={{ width: `${(total.embalado / total.total) * 100}%`, background: ESTADOS.embalado.hex }} />
          </div>
        )}

        {/* Los avisos van en una sola línea delgada. Antes eran dos bandas
            gruesas apiladas que se comían dos filas de tarjetas, y en una
            pantalla de taller el sitio se lo llevan las tarjetas. */}
        {(alerta || !viaje) && (
          <div
            className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1"
            style={{ marginTop: `${0.5 * e}rem` }}
          >
            {alerta && (
              <span
                className="font-display font-bold uppercase tracking-wide"
                style={{
                  background: '#C42B2B', color: '#fff',
                  padding: `${0.2 * e}rem ${0.7 * e}rem`,
                  fontSize: `${0.95 * e}rem`
                }}
              >
                Sale hoy · {total.embalado} embalados sin cargar
              </span>
            )}
            {!viaje && (
              <span
                className="font-display font-bold uppercase tracking-wide"
                style={{
                  background: ESTADOS.embalado.hex, color: '#2E2200',
                  padding: `${0.2 * e}rem ${0.7 * e}rem`,
                  fontSize: `${0.95 * e}rem`
                }}
              >
                Ningún camión abierto · lo que se cargue queda sin asignar
              </span>
            )}
          </div>
        )}

        <main
          className="flex-1 min-h-0 overflow-hidden"
          style={{ marginTop: `${0.8 * e}rem` }}
        >
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

          {/* Pantalla dividida: una zona por proyecto, cada una con su
              cabecera, su rejilla y su propia paginación. En horizontal se
              reparten en columnas; en vertical, apiladas. */}
          {visibles.length > 0 && (
            <div
              className="h-full grid min-h-0"
              style={{
                gap: `${1.2 * e}rem`,
                ...(zonas.length > 1
                  ? vertical
                    ? { gridTemplateRows: `repeat(${zonas.length}, minmax(0, 1fr))` }
                    : { gridTemplateColumns: `repeat(${zonas.length}, minmax(0, 1fr))` }
                  : {})
              }}
            >
              {zonas.map((z, i) => (
                <div
                  key={z.proyecto?.id ?? i}
                  className="flex flex-col min-h-0 min-w-0 h-full"
                  style={zonas.length > 1 && !vertical && i > 0
                    ? { borderLeft: '1px solid rgba(255,255,255,.12)', paddingLeft: `${1.2 * e}rem` }
                    : zonas.length > 1 && vertical && i > 0
                      ? { borderTop: '1px solid rgba(255,255,255,.12)', paddingTop: `${0.8 * e}rem` }
                      : undefined}
                >
                  <ZonaProyecto
                    proyecto={z.proyecto}
                    grupos={z.grupos}
                    e={e}
                    vertical={vertical}
                    resaltado={resaltado}
                    Tarjeta={Tarjeta}
                    conCabecera={zonas.length > 1}
                    apretada={zonas.length > 2}
                    comoda={Boolean(ajustes.comoda)}
                  />
                </div>
              ))}
            </div>
          )}
        </main>

        <footer
          className={`shrink-0 flex flex-wrap gap-x-8 gap-y-2 border-t border-white/10 ${
            vertical ? 'flex-col items-start' : 'items-center'}`}
          style={{ marginTop: `${0.7 * e}rem`, paddingTop: `${0.5 * e}rem`, fontSize: `${0.9 * e}rem` }}
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
            <span
              className="font-display font-bold uppercase tracking-wide"
              style={{
                background: ESTADOS.cargado.hex, color: '#fff',
                padding: `${0.25 * e}rem ${0.7 * e}rem`
              }}
            >
              Cargando {viaje.camion_codigo} · {viaje.codigo}
            </span>
          )}


          <span
            className="font-codigo tabular-nums text-white/50 ml-auto"
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

      {/* Cajón de ajustes.
          En un televisor no hay rueda de ratón: si el contenido no cabe, con
          el control remoto no hay forma de llegar abajo. Por eso el cajón
          ocupa todo el alto, el contenido tiene su propio scroll, y las
          flechas del control mueven el foco entre botones, que arrastra el
          scroll con él. */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 flex flex-col transition-transform duration-200
                    ${controles ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ background: 'rgba(10,12,15,.98)', width: 'min(420px, 96vw)',
                 borderLeft: '1px solid rgba(255,255,255,.15)' }}
      >
        <div className="shrink-0 flex items-center justify-between px-5 py-3
                        border-b border-white/10">
          <span className="font-display uppercase tracking-[0.16em] text-white/45 text-[12px]">
            Ajustes del panel
          </span>
          <button
            onClick={() => setControles(false)}
            className="min-h-[44px] min-w-[44px] text-2xl leading-none text-white/50 hover:text-white"
            aria-label="Cerrar"
          >×</button>
        </div>

        <div
          className="flex-1 overflow-y-auto flex flex-col gap-4 p-5 text-[14px]"
          style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
        >
          <label className="block">
            <span className="font-display uppercase tracking-wide text-[12px] text-white/50 block mb-2">
              Proyecto
            </span>
            <select
              value={proyectoId ?? ''}
              onChange={(ev) => onCambiarProyecto(ev.target.value)}
              className="w-full bg-[#1B1F26] text-white border border-white/20 min-h-[44px] px-3 text-[14px]"
            >
              <option value="todos">Todos los proyectos activos</option>
            {listaProyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>

          {/* El camión no se elige aquí. En el taller se carga uno a la vez,
              así que el activo es el viaje que esté abierto y vale igual para
              esta pantalla y para la laptop. */}
          <div>
            <span className="font-display uppercase tracking-wide text-[12px] text-white/50 block mb-2">
              Cargando en
            </span>
            {viaje ? (
              <p className="text-[15px]">
                <strong>{viaje.camion_codigo}</strong>{' '}
                <span className="font-codigo text-white/60">{viaje.codigo}</span>
                {viaje.destino && <span className="text-white/50"> → {viaje.destino}</span>}
                {variosAbiertos && (
                  <span className="block text-[12px] text-white/40 mt-2 leading-relaxed">
                    Hay más de un viaje abierto. Se está usando el más reciente;
                    cierra los demás desde Camiones.
                  </span>
                )}
              </p>
            ) : (
              <p className="text-[13px] text-white/40 leading-relaxed">
                Ningún camión abierto. Abre un viaje desde Camiones en cualquier
                dispositivo y esta pantalla carga contra él.
              </p>
            )}
          </div>

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

          {/* Lo que la app ve de verdad. En un televisor no hay consola, y sin
              este dato no hay forma de saber si el problema es la resolución,
              el zoom del navegador o la barra de direcciones. */}
          <div className="border border-white/15 p-3">
            <span className="font-display uppercase tracking-wide text-[12px] text-white/50 block mb-2">
              Esta pantalla
            </span>
            <p className="text-[13px] text-white/70 font-codigo leading-relaxed">
              {medidas.ancho && medidas.alto
                ? `${medidas.ancho} × ${medidas.alto}`
                : 'este navegador no reporta el tamaño de la ventana'}
              {medidas.dpr !== 1 && ` · dpr ${medidas.dpr}`}
              <br />
              {medidas.zoom !== 100 && (
                <span className="text-embalado">Zoom del navegador al {medidas.zoom}%<br /></span>
              )}
              {medidas.perdido > 60 && (
                <span className="text-embalado">
                  La barra del navegador se lleva {medidas.perdido}px de alto
                </span>
              )}
            </p>
            {medidas.perdido > 60 && (
              <button onClick={pantallaCompleta}
                className="mt-3 w-full min-h-[44px] px-4 bg-white text-tinta border border-white
                           font-display uppercase tracking-wide text-[13px]">
                Recuperar ese espacio
              </button>
            )}
          </div>

          <div>
            <span className="font-display uppercase tracking-wide text-[12px] text-white/50 block mb-2">
              Densidad
            </span>
            <div className="grid grid-cols-2 gap-2">
              {[[false, 'Compacta'], [true, 'Cómoda']].map(([v, texto]) => (
                <button key={texto} onClick={() => guardar({ comoda: v })}
                  className={`min-h-[44px] border text-[13px] font-display uppercase tracking-wide ${
                    Boolean(ajustes.comoda) === v
                      ? 'bg-white text-tinta border-white'
                      : 'border-white/25 text-white/70 hover:text-white'}`}>
                  {texto}
                </button>
              ))}
            </div>
            <p className="text-[12px] text-white/35 mt-2 leading-relaxed">
              Compacta entra cerca de un 40% más de tarjetas con la misma letra.
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

          {/* Colchón al final: en algunos televisores la última fila queda
              pegada al borde inferior y el foco no la alcanza */}
          <div className="h-8 shrink-0" />
        </div>
      </div>
    </div>
  )
}
