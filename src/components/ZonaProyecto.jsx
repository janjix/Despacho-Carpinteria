// Una zona del panel: un proyecto con su cabecera, su rejilla y su propia
// paginación.
//
// Con dos obras embalándose a la vez, mezclar sus tarjetas en una sola lista
// obliga a leer el nombre de cada una para saber cuál es cuál. Con la pantalla
// dividida, cada obra tiene su sitio fijo y el ojo va directo.
//
// Cada zona mide su propio espacio y calcula cuántas tarjetas caben ahí
// dentro: una columna estrecha admite menos que la pantalla entera, y el
// número tiene que salir de la medida real, no de un ajuste global.

import { useEffect, useMemo, useRef, useState } from 'react'
import { ESTADOS, esHoy, fechaCorta, resumir } from '../lib/codigos'

const SEGUNDOS_POR_PAGINA = 12

export const MEDIDAS = {
  altoTarjeta: 7.6,
  anchoTarjeta: 15.5,
  anchoTarjetaVertical: 20,
  hueco: 0.5
}

function rem() {
  if (typeof document === 'undefined') return 16
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

export default function ZonaProyecto({
  proyecto, grupos, e, vertical, resaltado, Tarjeta, conCabecera, apretada
}) {
  const zona = useRef(null)
  const [espacio, setEspacio] = useState({ ancho: 0, alto: 0 })
  const [pagina, setPagina] = useState(0)
  const [reinicio, setReinicio] = useState(0)

  useEffect(() => {
    const nodo = zona.current
    if (!nodo) return
    const medir = () => setEspacio({ ancho: nodo.clientWidth, alto: nodo.clientHeight })
    medir()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', medir)
      return () => window.removeEventListener('resize', medir)
    }
    const obs = new ResizeObserver(medir)
    obs.observe(nodo)
    return () => obs.disconnect()
  }, [])

  // Si con el tamaño elegido no entra ni una fila, se reduce hasta que quepa.
  // Letra algo menor es mejor que una tarjeta cortada.
  const escala = useMemo(() => {
    if (!espacio.alto) return e
    const px = rem()
    let u = e
    while (u > 0.4 && MEDIDAS.altoTarjeta * u * px > espacio.alto) u -= 0.05
    return Math.round(u * 100) / 100
  }, [espacio.alto, e])

  const capacidad = useMemo(() => {
    if (!espacio.ancho || !espacio.alto) return null
    const px = rem()
    const anchoMin = (vertical ? MEDIDAS.anchoTarjetaVertical : MEDIDAS.anchoTarjeta) * escala * px
    const alto = MEDIDAS.altoTarjeta * escala * px
    const hueco = MEDIDAS.hueco * escala * px
    const columnas = Math.max(1, Math.floor((espacio.ancho + hueco) / (anchoMin + hueco)))
    const filas = Math.max(1, Math.floor((espacio.alto + hueco) / (alto + hueco)))
    return columnas * filas
  }, [espacio, escala, vertical])

  const paginas = useMemo(() => {
    const n = Math.max(1, capacidad ?? 12)
    const trozos = []
    for (let i = 0; i < grupos.length; i += n) trozos.push(grupos.slice(i, i + n))
    return trozos.length ? trozos : [[]]
  }, [grupos, capacidad])

  useEffect(() => { setPagina(p => (p >= paginas.length ? 0 : p)) }, [paginas.length])

  const paginasRef = useRef(paginas)
  useEffect(() => { paginasRef.current = paginas }, [paginas])

  // La rotación se reinicia al saltar: si no, la página que acaba de aparecer
  // podría cambiar un segundo después y nadie vería nada.
  useEffect(() => {
    if (paginas.length < 2) return
    const t = setInterval(
      () => setPagina(p => (p + 1) % paginas.length),
      SEGUNDOS_POR_PAGINA * 1000
    )
    return () => clearInterval(t)
  }, [paginas.length, reinicio])

  // Si el bulto recién escaneado está en esta zona, se salta a su página.
  // Las demás zonas siguen a lo suyo.
  useEffect(() => {
    if (!resaltado || resaltado === '—') return
    const actuales = paginasRef.current
    for (let p = 0; p < actuales.length; p++) {
      const hay = actuales[p].some(g => g.items.some(
        i => i.codigo.toUpperCase().replace(/[^A-Z0-9]/g, '') === resaltado))
      if (hay) {
        setPagina(p)
        setReinicio(r => r + 1)
        return
      }
    }
  }, [resaltado])

  const total = resumir(grupos.flatMap(g => g.items))
  const actual = paginas[Math.min(pagina, paginas.length - 1)] ?? []
  const areas = [...new Set(actual.map(g => g.areaNombre))]
  const alerta = proyecto && esHoy(proyecto.fecha_despacho) && total.embalado > 0

  return (
    <section className="flex flex-col min-h-0 min-w-0">
      {conCabecera && (
        <header
          className="shrink-0 flex items-baseline gap-x-4 gap-y-1 flex-wrap"
          style={{ marginBottom: `${0.4 * e}rem` }}
        >
          <h2
            className="font-display font-extrabold leading-none truncate"
            style={{ fontSize: `${(apretada ? 1.5 : 1.9) * e}rem` }}
          >
            {proyecto?.nombre ?? 'Sin proyecto'}
          </h2>
          {alerta && (
            <span
              className="font-display font-bold uppercase tracking-wide px-2 py-0.5"
              style={{ background: '#C42B2B', color: '#fff', fontSize: `${0.8 * e}rem` }}
            >
              Sale hoy
            </span>
          )}
          <span className="text-white/45 truncate" style={{ fontSize: `${0.85 * e}rem` }}>
            {fechaCorta(proyecto?.fecha_despacho)}
            {areas.length > 0 && ` · ${areas.join(' · ')}`}
          </span>

          <span className="ml-auto flex items-baseline gap-3 shrink-0 tabular-nums"
                style={{ fontSize: `${0.95 * e}rem` }}>
            <span style={{ color: '#9AA0AA' }}>{total.pendiente}</span>
            <span style={{ color: ESTADOS.embalado.hex }}>{total.embalado}</span>
            <span style={{ color: ESTADOS.cargado.hex }}>{total.cargado}</span>
            <span className="text-white/35">de {total.total}</span>
          </span>
        </header>
      )}

      {/* Barra de avance de la zona */}
      {conCabecera && total.total > 0 && (
        <div className="flex shrink-0 overflow-hidden"
             style={{ height: `${0.35 * e}rem`, marginBottom: `${0.5 * e}rem`, background: '#1B1F26' }}>
          <div style={{ width: `${(total.cargado / total.total) * 100}%`, background: ESTADOS.cargado.hex }} />
          <div style={{ width: `${(total.embalado / total.total) * 100}%`, background: ESTADOS.embalado.hex }} />
        </div>
      )}

      <div ref={zona} className="flex-1 min-h-0 overflow-hidden">
        {!grupos.length ? (
          <div className="h-full flex items-center justify-center text-center px-4">
            <p className="font-display font-extrabold"
               style={{ fontSize: `${1.6 * e}rem`, color: ESTADOS.cargado.hex }}>
              Nada pendiente
            </p>
          </div>
        ) : (
          <div
            className="grid"
            style={{
              gap: `${MEDIDAS.hueco * escala}rem`,
              gridTemplateColumns: `repeat(auto-fill, minmax(${
                (vertical ? MEDIDAS.anchoTarjetaVertical : MEDIDAS.anchoTarjeta) * escala}rem, 1fr))`,
              gridAutoRows: `${MEDIDAS.altoTarjeta * escala}rem`
            }}
          >
            {actual.map(g => (
              <Tarjeta
                key={g.grupo_id}
                grupo={g}
                e={escala}
                resaltada={Boolean(resaltado) && resaltado !== '—' && g.items.some(
                  i => i.codigo.toUpperCase().replace(/[^A-Z0-9]/g, '') === resaltado)}
                mostrarProyecto={false}
              />
            ))}
          </div>
        )}
      </div>

      {paginas.length > 1 && (
        <div className="shrink-0 flex items-center gap-2"
             style={{ marginTop: `${0.35 * e}rem` }}>
          {paginas.map((_, i) => (
            <span key={i} className="rounded-full" style={{
              width: `${0.45 * e}rem`, height: `${0.45 * e}rem`,
              background: i === pagina ? '#F2F3F5' : 'rgba(255,255,255,.22)'
            }} />
          ))}
          <span className="text-white/35" style={{ fontSize: `${0.75 * e}rem` }}>
            {pagina + 1}/{paginas.length}
          </span>
        </div>
      )}
    </section>
  )
}
