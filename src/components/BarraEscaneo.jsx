// Barra de escaneo. Vive fija abajo en todas las pantallas menos la de
// escaneo, que ya muestra lo mismo en grande, y el panel del televisor.
//
// Su trabajo no es bonito: es que cualquiera que pase frente a la laptop vea
// de un golpe que la app está despierta y qué fue lo último que entró. Un
// reloj detenido se nota; una pantalla en blanco no.

import { useEffect, useState } from 'react'
import { useEscaneoGlobal } from '../hooks/useEscaneoGlobal'
import { ESTADOS, hora } from '../lib/codigos'

const COLOR = {
  embalado: ESTADOS.embalado.hex,
  cargado: ESTADOS.cargado.hex,
  aviso: '#6E6A63',
  alerta: '#C42B2B'
}

export default function BarraEscaneo({ onAbrirEscaneo }) {
  const { ultimo, contador, viaje, viajes } = useEscaneoGlobal()
  const [reloj, setReloj] = useState(() => new Date())

  // Latido visible: si esto se congela, la app dejó de correr
  useEffect(() => {
    const t = setInterval(() => setReloj(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const color = ultimo ? COLOR[ultimo.tono] ?? '#C42B2B' : '#2A2D33'

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-tinta text-papel border-t-2 border-papel/10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center gap-x-5 gap-y-1">
        <span className="w-3 h-8 shrink-0" style={{ background: color }} />

        <button
          onClick={onAbrirEscaneo}
          className="flex-1 min-w-[180px] text-left min-h-[44px]"
          title="Abrir la pantalla de escaneo"
        >
          {ultimo ? (
            <>
              <span className="block font-display font-bold uppercase text-[15px] leading-tight truncate">
                {ultimo.titulo}
                {ultimo.anulado && <span className="ml-2 text-alerta">· anulado</span>}
              </span>
              <span className="block text-[12px] text-papel/55 truncate">
                <span className="font-codigo">{ultimo.codigo}</span>
                {ultimo.detalle ? ` · ${ultimo.detalle}` : ''} · {hora(ultimo.cuando)}
              </span>
            </>
          ) : (
            <>
              <span className="block font-display font-bold uppercase text-[15px] text-papel/70">
                Escuchando el lector
              </span>
              <span className="block text-[12px] text-papel/45">
                Funciona en cualquier pantalla de la app
              </span>
            </>
          )}
        </button>

        <div className="flex items-center gap-4 text-[12px]">
          <span title="Embalados en esta sesión">
            <strong className="text-[15px]" style={{ color: ESTADOS.embalado.hex }}>
              {contador.embalados}
            </strong>
            <span className="text-papel/50"> emb.</span>
          </span>
          <span title="Cargados en esta sesión">
            <strong className="text-[15px]" style={{ color: ESTADOS.cargado.hex }}>
              {contador.cargados}
            </strong>
            <span className="text-papel/50"> carg.</span>
          </span>
          {contador.rechazados > 0 && (
            <span title="Lecturas rechazadas">
              <strong className="text-[15px] text-alerta">{contador.rechazados}</strong>
              <span className="text-papel/50"> rech.</span>
            </span>
          )}
        </div>

        <span className="text-[12px] text-papel/60 truncate max-w-[220px]">
          {viaje
            ? <>Camión <strong className="text-papel">{viaje.camion_codigo}</strong> · {viaje.codigo}</>
            : viajes.length
              ? <span className="text-embalado">Sin viaje activo</span>
              : <span className="text-papel/40">Sin viajes abiertos</span>}
        </span>

        <span className="font-codigo text-[13px] text-papel/70 tabular-nums" title="Latido de la app">
          {reloj.toLocaleTimeString('es-VE', { hour12: false })}
        </span>
      </div>
    </div>
  )
}
