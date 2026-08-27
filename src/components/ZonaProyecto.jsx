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

// Medidas en rem, antes de aplicar la escala.
//
// La altura sale de la cuenta, no del ojo: padding 1.1 + nombre a dos líneas
// 3.5 + área 0.95 + pie 1.05 = 6.6. Antes eran 7.6 reservando tres líneas de
// nombre que casi nunca se usan, y eso desperdiciaba 37 px por tarjeta cuando
// el nombre cabía en una.
export const MEDIDAS = {
  altoTarjeta: 6.2,
  altoTarjetaComoda: 7.6,
  anchoTarjeta: 13.5,
  anchoTarjetaVertical: 17,
  hueco: 0.4
}

function rem() {
  if (typeof document === 'undefined') return 16
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

export default function ZonaProyecto({
  proyecto, grupos, e, vertical, resaltado, Tarjeta, conCabecera, apretada, comoda
}) {
  const altoTarjeta = comoda ? MEDIDAS.altoTarjetaComoda : MEDIDAS.altoTarjeta
  const zona = useRef(null)
  const [espacio, setEspacio] = useState({ ancho: 0, alto: 0 })
  const [pagina, setPagina] = useState(0)
  const [reinicio, setReinicio] = useState(0)

  // Medición del espacio disponible.
  //
  // El navegador de los televisores Samsung no trae ResizeObserver, así que
  // ahí solo se medía una vez al montar, cuando el layout todavía no está
  // resuelto y el contenedor mide casi nada. Resultado: capacidad para una
  // fila y decenas de páginas, con la pantalla vacía.
  //
  // La solución no es una sola medida, sino insistir: unos reintentos al
  // arrancar, y luego un latido lento que solo actualiza si el número cambió
  // de verdad. Cuesta nada y funciona en cualquier navegador.
  useEffect(() => {
    let vivo = true
    const tiempos = []

    const medir = () => {
      const nodo = zona.current
      if (!nodo || !vivo) return

      // Varias fuentes por orden de fiabilidad. El navegador de los Samsung
      // devuelve cero en algunas de ellas, así que se prueba la siguiente en
      // lugar de rendirse: quedarse en cero deja la pantalla vacía.
      const caja = nodo.getBoundingClientRect?.() ?? {}
      const ancho = nodo.clientWidth || Math.round(caja.width) ||
                    nodo.offsetWidth || 0
      let alto = nodo.clientHeight || Math.round(caja.height) ||
                 nodo.offsetHeight || 0

      // Último recurso: el hueco entre donde empieza el contenedor y el fondo
      // de la ventana. Basto pero mejor que cero.
      if (!alto) {
        const desde = caja.top ?? 0
        const ventana = document.documentElement?.clientHeight || window.innerHeight || 0
        if (ventana > desde) alto = Math.round(ventana - desde - 8)
      }

      if (!ancho || !alto) return
      setEspacio(prev => (
        Math.abs(prev.ancho - ancho) < 2 && Math.abs(prev.alto - alto) < 2
          ? prev
          : { ancho, alto }
      ))
    }

    medir()
    // El layout de un televisor tarda más en asentarse que el de una laptop
    for (const ms of [0, 60, 200, 600, 1500, 3000]) {
      tiempos.push(setTimeout(medir, ms))
    }
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(medir)

    window.addEventListener('resize', medir)
    window.addEventListener('orientationchange', medir)

    let obs = null
    if (typeof ResizeObserver !== 'undefined') {
      obs = new ResizeObserver(medir)
      obs.observe(zona.current)
    }

    // Latido de respaldo: sin ResizeObserver es lo único que detecta un
    // cambio de tamaño provocado por la propia interfaz (barra del navegador
    // que aparece, teclado, pantalla completa)
    const latido = setInterval(medir, obs ? 5000 : 1500)

    return () => {
      vivo = false
      tiempos.forEach(clearTimeout)
      clearInterval(latido)
      window.removeEventListener('resize', medir)
      window.removeEventListener('orientationchange', medir)
      obs?.disconnect()
    }
  }, [])

  // Escala y capacidad, decididas juntas.
  //
  // Con una escala fija el sobrante se queda en blanco: si faltan veinte
  // píxeles para otra fila, se pierden noventa. Aquí se prueban escalas desde
  // la elegida hacia abajo y se elige la que entra más tarjetas, siempre que
  // el ajuste sea pequeño: encoger un 3% para ganar una fila entera vale la
  // pena, encogerlo a la mitad no.
  const { escala, capacidad } = useMemo(() => {
    if (!espacio.ancho || !espacio.alto) return { escala: e, capacidad: null }
    const px = rem()
    const anchoBase = vertical ? MEDIDAS.anchoTarjetaVertical : MEDIDAS.anchoTarjeta

    const cabenCon = (u) => {
      const columnas = Math.max(1, Math.floor(
        (espacio.ancho + MEDIDAS.hueco * u * px) / ((anchoBase + MEDIDAS.hueco) * u * px)))
      const filas = Math.max(1, Math.floor(
        (espacio.alto + MEDIDAS.hueco * u * px) / ((altoTarjeta + MEDIDAS.hueco) * u * px)))
      const cabeUnaFila = altoTarjeta * u * px <= espacio.alto
      return { columnas, filas, total: columnas * filas, cabeUnaFila }
    }

    // Nunca por debajo del 78% de lo elegido: el operario eligió ese tamaño
    // por algo, y una letra que no se lee no sirve por muchas que quepan.
    const minimo = Math.max(0.4, e * 0.78)
    let mejor = { u: e, ...cabenCon(e) }
    for (let u = e; u >= minimo - 1e-9; u -= 0.01) {
      const r = cabenCon(u)
      if (!r.cabeUnaFila) continue
      if (r.total > mejor.total || !mejor.cabeUnaFila) mejor = { u, ...r }
    }

    // Si ni al mínimo entra una fila (pantalla diminuta), se sigue bajando
    if (!mejor.cabeUnaFila) {
      let u = minimo
      while (u > 0.35 && altoTarjeta * u * px > espacio.alto) u -= 0.02
      mejor = { u, ...cabenCon(u) }
    }

    return { escala: Math.round(mejor.u * 100) / 100, capacidad: mejor.total }
  }, [espacio, e, vertical, altoTarjeta])

  const paginas = useMemo(() => {
    // Si la medición devuelve algo absurdo (el contenedor aún no tiene
    // tamaño, un navegador que no reporta bien), es preferible una sola
    // página larga a cincuenta de una tarjeta.
    const n = capacidad && capacidad > 0 ? capacidad : grupos.length || 1
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

  // Si no se pudo medir, el grid se dibuja en flujo normal: es preferible que
  // desborde un poco a que la pantalla quede en blanco.
  const medido = espacio.ancho > 0 && espacio.alto > 0

  const total = resumir(grupos.flatMap(g => g.items))
  const actual = paginas[Math.min(pagina, paginas.length - 1)] ?? []
  const areas = [...new Set(actual.map(g => g.areaNombre))]
  const alerta = proyecto && esHoy(proyecto.fecha_despacho) && total.embalado > 0

  return (
    <section className="flex flex-col min-h-0 min-w-0 h-full">
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

      {/* Contenedor medido.
          El contenido va en capa absoluta, no dentro del flujo. Si el grid
          pudiera empujar este div, cada medida cambiaría su propio resultado:
          mide → calcula menos tarjetas → el contenido encoge → mide menos →
          menos tarjetas. Ese bucle es lo que hacía que las tarjetas fueran
          achicándose escaneo tras escaneo hasta quedar una sola fila.
          Con inset-0 la altura la manda el flex y el contenido no opina. */}
      <div ref={zona} className="flex-1 min-h-0 overflow-hidden relative">
        {!grupos.length ? (
          <div className="absolute inset-0 flex items-center justify-center text-center px-4">
            <p className="font-display font-extrabold"
               style={{ fontSize: `${1.6 * e}rem`, color: ESTADOS.cargado.hex }}>
              Nada pendiente
            </p>
          </div>
        ) : (
          <div
            className={medido ? 'grid absolute inset-0 content-start' : 'grid content-start'}
            style={{
              gap: `${MEDIDAS.hueco * escala}rem`,
              gridTemplateColumns: `repeat(auto-fill, minmax(${
                (vertical ? MEDIDAS.anchoTarjetaVertical : MEDIDAS.anchoTarjeta) * escala}rem, 1fr))`,
              gridAutoRows: `${altoTarjeta * escala}rem`
            }}
          >
            {actual.map(g => (
              <Tarjeta
                key={g.grupo_id}
                grupo={g}
                e={escala}
                alto={altoTarjeta}
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
