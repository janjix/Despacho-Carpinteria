// La pantalla que vive en el taller.
// Un solo trabajo: escanear y decir en voz alta si entró o no.

import { useCallback, useRef, useState } from 'react'
import { useEscaner } from '../hooks/useEscaner'
import { anularEscaneo, registrarEscaneo, useViajesAbiertos } from '../hooks/useSupabase'
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
  const [viajeId, setViajeId] = useState(null)
  const [anulando, setAnulando] = useState(null)
  const [motivo, setMotivo] = useState('')
  const { viajes } = useViajesAbiertos()

  const viaje = viajes.find(v => v.id === viajeId) ?? null
  const contador = useRef(0)

  const procesar = useCallback(async (codigo) => {
    if (!codigo || ocupado) return
    setOcupado(true)
    try {
      const r = await registrarEscaneo(codigo, modo, modo === 'carga' ? viajeId : null)
      const item = r.item ?? null
      const msg = r.resultado === 'sin_viaje'
        ? {
            titulo: 'Elige un viaje primero',
            detalle: 'En modo Carga hay que decir a qué camión sube el bulto',
            tono: 'alerta'
          }
        : mensajeEscaneo(r.resultado, modo, item)
      const registro = {
        clave: ++contador.current,
        codigo: item?.codigo ?? codigo,
        itemId: item?.id ?? null,
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
  }, [modo, ocupado, viajeId])

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

      {/* Viaje activo. En modo Carga es obligatorio: sin él no se sabría a
          qué camión subió el bulto, y eso es justo lo que hay que registrar. */}
      {modo === 'carga' && (
        <div className={`shrink-0 px-4 py-3 border-b ${viaje ? 'border-borde bg-white' : 'border-alerta bg-[#FBEAEA]'}`}>
          {!viajes.length ? (
            <p className="text-[14px] text-[#7A1B1B]">
              No hay ningún viaje abierto. Ve a Camiones, elige el camión y abre
              un viaje antes de empezar a cargar.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className="etiqueta-campo !mb-0">Cargando en</span>
              <select
                value={viajeId ?? ''}
                onChange={(e) => setViajeId(e.target.value || null)}
                className="campo !min-h-[52px] max-w-full sm:max-w-md font-display font-semibold text-[17px]"
              >
                <option value="">Elige el viaje</option>
                {viajes.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.camion_codigo} · {v.codigo}
                    {v.destino ? ` → ${v.destino}` : ''} · {v.bultos} bultos
                  </option>
                ))}
              </select>
              {viaje && (
                <span className="text-[13px] text-tenue">
                  {viaje.placa ? `${viaje.placa} · ` : ''}
                  {viaje.conductor ?? ''}
                </span>
              )}
            </div>
          )}
        </div>
      )}

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
            {ultimo.resultado === 'ok' && ultimo.itemId && (
              <button
                onClick={() => { setAnulando(ultimo); setMotivo('') }}
                className="mt-4 min-h-[44px] px-4 border border-alerta text-alerta
                           font-display uppercase tracking-wide text-[13px] hover:bg-alerta hover:text-white"
              >
                Anular este escaneo
              </button>
            )}
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

      {/* Anulación. Se pide motivo a propósito: un escaneo deshecho sin
          explicación es indistinguible de un error de la app. */}
      {anulando && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-6">
          <div className="w-full max-w-lg bg-white border border-tinta">
            <div className="px-5 py-4 border-b border-borde">
              <h2 className="text-xl font-bold">Anular el escaneo</h2>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-[15px]">
                <span className="font-codigo text-[13px]">{anulando.codigo}</span>
                <br />
                {anulando.detalle}
              </p>
              <label className="block">
                <span className="etiqueta-campo">Motivo</span>
                <input
                  autoFocus
                  className="campo"
                  placeholder="Se leyó el izquierdo y subió el derecho"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setAnulando(null) }}
                />
                <span className="block mt-1 text-[12px] text-tenue">
                  Queda en la bitácora junto al estado del que venía. No se borra nada.
                </span>
              </label>
              <div className="flex flex-wrap justify-end gap-3">
                <Boton onClick={() => setAnulando(null)}>Cancelar</Boton>
                <Boton
                  variante="alerta"
                  onClick={async () => {
                    try {
                      await anularEscaneo(anulando.itemId, motivo, false)
                      setHistorial(prev => prev.map(h =>
                        h.clave === anulando.clave ? { ...h, anulado: true } : h))
                      if (ultimo?.clave === anulando.clave) {
                        setUltimo({
                          ...ultimo,
                          titulo: 'Escaneo anulado',
                          detalle: motivo || 'sin motivo',
                          tono: 'aviso',
                          resultado: 'anulado'
                        })
                      }
                      sonar('aviso')
                    } catch (e) {
                      setUltimo({
                        clave: Date.now(), codigo: anulando.codigo, resultado: 'error',
                        titulo: 'No se pudo anular', detalle: e.message,
                        tono: 'alerta', cuando: new Date().toISOString()
                      })
                    } finally {
                      setAnulando(null)
                    }
                  }}
                >
                  Anular escaneo
                </Boton>
              </div>
            </div>
          </div>
        </div>
      )}

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
                {h.resultado === 'ok' && h.itemId && !h.anulado && (
                  <button
                    onClick={() => { setAnulando(h); setMotivo('') }}
                    className="shrink-0 min-h-[40px] px-2 text-[12px] font-display uppercase
                               tracking-wide text-tenue hover:text-alerta"
                  >
                    Anular
                  </button>
                )}
                {h.anulado && (
                  <span className="shrink-0 text-[11px] font-display uppercase text-alerta">Anulado</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
