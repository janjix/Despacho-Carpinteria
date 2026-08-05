// La pantalla que vive en el taller.
// Un solo trabajo: escanear y decir en voz alta si entró o no.

import { useCallback, useRef, useState } from 'react'
import { useEscaner } from '../hooks/useEscaner'
import { registrarEscaneo } from '../hooks/useSupabase'
import { ESTADOS, hora, mensajeEscaneo } from '../lib/codigos'
import { despertarAudio, sonar, vibrar } from '../lib/sonido'
import { Boton } from './ui'
import LectorCamara from './LectorCamara'

const COLOR_TONO = {
  embalado: ESTADOS.embalado.hex,
  cargado: ESTADOS.cargado.hex,
  aviso: '#6E6A63',
  alerta: '#C42B2B'
}

export default function Escaneo() {
  const [modo, setModo] = useState('embalaje')
  const [ultimo, setUltimo] = useState(null)
  const [historial, setHistorial] = useState([])
  const [manual, setManual] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [camara, setCamara] = useState(false)
  const contador = useRef(0)

  const procesar = useCallback(async (codigo) => {
    if (!codigo || ocupado) return
    setOcupado(true)
    try {
      const r = await registrarEscaneo(codigo, modo)
      const item = r.item ?? null
      const msg = mensajeEscaneo(r.resultado, modo, item)
      const registro = {
        clave: ++contador.current,
        codigo: item?.codigo ?? codigo,
        resultado: r.resultado,
        cuando: new Date().toISOString(),
        ...msg
      }
      setUltimo(registro)
      setHistorial(prev => [registro, ...prev].slice(0, 12))
      sonar(msg.tono === 'alerta' ? 'alerta' : msg.tono === 'aviso' ? 'aviso' : 'ok')
      vibrar(msg.tono === 'alerta' ? 'alerta' : msg.tono === 'aviso' ? 'aviso' : 'ok')
    } catch (e) {
      const registro = {
        clave: ++contador.current,
        codigo,
        resultado: 'error',
        titulo: 'No se pudo registrar',
        detalle: e.message,
        tono: 'alerta',
        cuando: new Date().toISOString()
      }
      setUltimo(registro)
      sonar('alerta')
    } finally {
      setOcupado(false)
    }
  }, [modo, ocupado])

  useEscaner(procesar)

  const cambiarModo = (nuevo) => {
    despertarAudio()
    setModo(nuevo)
    setUltimo(null)
  }

  const colorFondo = ultimo ? COLOR_TONO[ultimo.tono] ?? '#C42B2B' : null

  return (
    <div className="min-h-[100dvh] flex flex-col" onClick={despertarAudio}>
      {/* Destello a pantalla completa: el resultado se lee desde lejos */}
      {ultimo && (
        <div
          key={ultimo.clave}
          className="destello fixed inset-0 z-40 pointer-events-none"
          style={{ background: colorFondo }}
        />
      )}

      {/* Selector de modo. Define qué hace el próximo escaneo. */}
      <div className="grid grid-cols-2 border-b-2 border-tinta shrink-0">
        {[
          { id: 'embalaje', titulo: 'Embalaje', pie: 'Pega la etiqueta y escanea', color: ESTADOS.embalado.hex },
          { id: 'carga', titulo: 'Carga', pie: 'Escanea antes de subir al camión', color: ESTADOS.cargado.hex }
        ].map(m => {
          const activo = modo === m.id
          return (
            <button
              key={m.id}
              onClick={() => cambiarModo(m.id)}
              className="min-h-[92px] px-4 py-3 text-left transition-colors"
              style={{
                background: activo ? m.color : '#FFFFFF',
                color: activo ? (m.id === 'embalaje' ? '#3A2B00' : '#FFFFFF') : '#6E6A63'
              }}
            >
              <span className="block font-display font-extrabold uppercase tracking-tight text-2xl sm:text-3xl">
                {m.titulo}
              </span>
              <span className="block text-[12.5px] mt-1">{m.pie}</span>
            </button>
          )
        })}
      </div>

      {/* Resultado del último escaneo */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-8 text-center relative z-40">
        {!ultimo ? (
          <>
            <p className="font-display uppercase tracking-[0.2em] text-tenue text-sm">
              Modo {modo === 'embalaje' ? 'embalaje' : 'carga'}
            </p>
            <p className="mt-3 text-3xl sm:text-5xl font-display font-extrabold max-w-2xl leading-tight">
              Apunta el lector a la etiqueta
            </p>
            <p className="mt-4 text-tenue text-[15px] max-w-md">
              El lector escribe solo. No hace falta tocar la pantalla ni buscar un campo.
            </p>
          </>
        ) : (
          <>
            <p className="font-display uppercase tracking-[0.2em] text-sm"
               style={{ color: COLOR_TONO[ultimo.tono] }}>
              {hora(ultimo.cuando)} · {ultimo.codigo}
            </p>
            <p className="mt-3 text-4xl sm:text-6xl font-display font-extrabold leading-none max-w-3xl">
              {ultimo.titulo}
            </p>
            <p className="mt-4 text-lg sm:text-2xl max-w-2xl">{ultimo.detalle}</p>
          </>
        )}

        {/* Captura a mano cuando la etiqueta se rasga o se moja */}
        <div className="mt-8">
          <Boton onClick={() => { despertarAudio(); setCamara(true) }}>
            Leer con la cámara
          </Boton>
          <p className="mt-2 text-[12.5px] text-tenue max-w-xs mx-auto">
            Respaldo para cuando la pistola no está a mano. Más lento y sufre
            con la luz directa.
          </p>
        </div>

        <div className="mt-8 w-full max-w-md flex gap-2">
          <input
            className="campo font-codigo uppercase"
            placeholder="Teclear el código a mano"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { procesar(manual.trim().toUpperCase()); setManual('') }
            }}
          />
          <Boton
            variante="solido"
            onClick={() => { procesar(manual.trim().toUpperCase()); setManual('') }}
            disabled={!manual.trim()}
          >
            Registrar
          </Boton>
        </div>
      </div>

      <LectorCamara
        abierto={camara}
        onCerrar={() => setCamara(false)}
        onLeer={procesar}
        resultado={ultimo && {
          ...ultimo,
          color: COLOR_TONO[ultimo.tono] ?? '#C42B2B'
        }}
      />

      {/* Los últimos escaneos, para verificar sin salir de la pantalla */}
      {historial.length > 0 && (
        <div className="shrink-0 border-t border-borde bg-white max-h-[34vh] overflow-y-auto relative z-40">
          <ul>
            {historial.map(h => (
              <li key={h.clave} className="flex items-center gap-3 px-4 py-2 border-b border-borde last:border-0">
                <span className="w-2 h-7 shrink-0" style={{ background: COLOR_TONO[h.tono] ?? '#C42B2B' }} />
                <span className="font-codigo text-[12.5px] shrink-0">{h.codigo}</span>
                <span className="text-[13.5px] truncate">{h.titulo}{h.detalle ? ` · ${h.detalle}` : ''}</span>
                <span className="ml-auto text-[12px] text-tenue shrink-0">{hora(h.cuando)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
