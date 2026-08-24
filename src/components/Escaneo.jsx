// Pantalla de escaneo.
//
// Ya no elige el modo: la primera lectura de una etiqueta embala y la segunda
// carga. Lo único que hay que decidir aquí es a qué viaje sube lo que se
// cargue, y eso se elige una vez y se recuerda.
//
// La escucha del lector no vive en esta pantalla sino en el proveedor global,
// así que cerrarla no interrumpe nada.

import { useState } from 'react'
import { useEscaneoGlobal } from '../hooks/useEscaneoGlobal'
import { ESTADOS, hora } from '../lib/codigos'
import { despertarAudio } from '../lib/sonido'
import { Boton, Modal } from './ui'
import LectorCamara from './LectorCamara'

const COLOR = {
  embalado: ESTADOS.embalado.hex,
  cargado: ESTADOS.cargado.hex,
  aviso: '#6E6A63',
  alerta: '#C42B2B'
}

export default function Escaneo({ onIrACamiones }) {
  const {
    ultimo, historial, contador, viaje, viajes, viajeId, setViajeId, procesar, anular
  } = useEscaneoGlobal()

  const [manual, setManual] = useState('')
  const [camara, setCamara] = useState(false)
  const [anulando, setAnulando] = useState(null)
  const [motivo, setMotivo] = useState('')

  const color = ultimo ? COLOR[ultimo.tono] ?? '#C42B2B' : null

  const registrarManual = () => {
    const c = manual.trim().toUpperCase()
    setManual('')
    if (c) procesar(c)
  }

  return (
    <div
      className="flex flex-col"
      style={{ minHeight: 'calc(100vh - 48px)' }}
      onClick={despertarAudio}
    >
      {ultimo && (
        <div
          key={ultimo.clave}
          className="destello fixed inset-0 z-40 pointer-events-none"
          style={{ background: color }}
        />
      )}

      {/* Viaje activo. Se elige una vez y queda: un camión se carga en varias
          tandas y volver a elegirlo cada rato era pedir que se olvidara. */}
      <div className={`shrink-0 px-4 sm:px-6 py-3 border-b ${viaje ? 'border-borde bg-white' : 'border-embalado bg-[#FDF3D8]'}`}>
        {!viajes.length ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[14px] text-[#5C4300] flex-1 min-w-[220px]">
              No hay ningún viaje abierto. Lo que se cargue va a quedar sin camión
              asignado hasta que abras uno.
            </p>
            <Boton onClick={onIrACamiones}>Abrir un viaje</Boton>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="etiqueta-campo !mb-0">Lo que se cargue sube a</span>
            <select
              value={viajeId ?? ''}
              onChange={(e) => setViajeId(e.target.value || null)}
              className="campo !min-h-[52px] max-w-full sm:max-w-lg font-display font-semibold text-[17px]"
            >
              <option value="">Sin viaje asignado</option>
              {viajes.filter(v => v.estado === 'cargando').map(v => (
                <option key={v.id} value={v.id}>
                  {v.camion_codigo} · {v.codigo}
                  {v.destino ? ` → ${v.destino}` : ''} · {v.bultos} bultos
                </option>
              ))}
            </select>
            {viaje && (
              <span className="text-[13px] text-tenue">
                {[viaje.placa, viaje.conductor].filter(Boolean).join(' · ')}
              </span>
            )}
            <span className="text-[12.5px] text-tenue w-full">
              El camión es el mismo para todos los dispositivos. Si escaneas
              desde el televisor, también va a este.
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-5 py-10 text-center relative z-40">
        {!ultimo ? (
          <>
            <p className="font-display uppercase tracking-[0.2em] text-tenue text-sm">
              Escuchando el lector
            </p>
            <p className="mt-3 text-3xl sm:text-5xl font-display font-extrabold max-w-2xl leading-tight">
              Primera lectura embala, segunda carga
            </p>
            <p className="mt-4 text-tenue text-[15px] max-w-lg">
              No hay que elegir nada. El bulto sabe en qué etapa va, y la app
              sigue registrando aunque estés en otra pantalla.
            </p>
          </>
        ) : (
          <>
            <p className="font-display uppercase tracking-[0.2em] text-sm" style={{ color }}>
              {hora(ultimo.cuando)} · {ultimo.codigo}
            </p>
            <p className="mt-3 text-4xl sm:text-6xl font-display font-extrabold leading-none max-w-3xl">
              {ultimo.titulo}
            </p>
            <p className="mt-4 text-lg sm:text-2xl max-w-2xl">{ultimo.detalle}</p>
            {ultimo.resultado === 'ok' && ultimo.itemId && !ultimo.anulado && (
              <button
                onClick={() => { setAnulando(ultimo); setMotivo('') }}
                className="mt-5 min-h-[44px] px-4 border border-alerta text-alerta
                           font-display uppercase tracking-wide text-[13px] hover:bg-alerta hover:text-white"
              >
                Anular este escaneo
              </button>
            )}
          </>
        )}

        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-[14px]">
          <span><strong className="text-2xl" style={{ color: ESTADOS.embalado.hex }}>{contador.embalados}</strong> embalados</span>
          <span><strong className="text-2xl" style={{ color: ESTADOS.cargado.hex }}>{contador.cargados}</strong> cargados</span>
          {contador.rechazados > 0 && (
            <span><strong className="text-2xl text-alerta">{contador.rechazados}</strong> rechazados</span>
          )}
        </div>

        <div className="mt-8">
          <Boton onClick={() => { despertarAudio(); setCamara(true) }}>
            Leer con la cámara
          </Boton>
        </div>

        <div className="mt-6 w-full max-w-md flex gap-2">
          <input
            className="campo font-codigo uppercase"
            placeholder="Teclear el código a mano"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') registrarManual() }}
          />
          <Boton variante="solido" onClick={registrarManual} disabled={!manual.trim()}>
            Registrar
          </Boton>
        </div>
      </div>

      <Modal
        abierto={Boolean(anulando)}
        titulo="Anular el escaneo"
        onCerrar={() => setAnulando(null)}
        ancho="max-w-lg"
      >
        {anulando && (
          <div className="space-y-4">
            <p className="text-[15px]">
              <span className="font-codigo text-[13px]">{anulando.codigo}</span>
              <br />{anulando.detalle}
            </p>
            <label className="block">
              <span className="etiqueta-campo">Motivo</span>
              <input
                autoFocus className="campo"
                placeholder="Se leyó el izquierdo y subió el derecho"
                value={motivo} onChange={(e) => setMotivo(e.target.value)}
              />
              <span className="block mt-1 text-[12px] text-tenue">
                Queda en la bitácora junto al estado del que venía. No se borra nada.
              </span>
            </label>
            <div className="flex justify-end gap-3">
              <Boton onClick={() => setAnulando(null)}>Cancelar</Boton>
              <Boton
                variante="alerta"
                onClick={async () => {
                  try { await anular(anulando, motivo) } finally { setAnulando(null) }
                }}
              >
                Anular escaneo
              </Boton>
            </div>
          </div>
        )}
      </Modal>

      <LectorCamara
        abierto={camara}
        onCerrar={() => setCamara(false)}
        onLeer={procesar}
        resultado={ultimo && { ...ultimo, color: COLOR[ultimo.tono] ?? '#C42B2B' }}
      />

      {historial.length > 0 && (
        <div className="shrink-0 border-t border-borde bg-white max-h-[34vh] overflow-y-auto relative z-40">
          <ul>
            {historial.map(h => (
              <li key={h.clave} className="flex items-center gap-3 px-4 py-2 border-b border-borde last:border-0">
                <span className="w-2 h-7 shrink-0" style={{ background: COLOR[h.tono] ?? '#C42B2B' }} />
                <span className="font-codigo text-[12.5px] shrink-0">{h.codigo}</span>
                <span className="text-[13.5px] truncate">
                  {h.titulo}{h.detalle ? ` · ${h.detalle}` : ''}
                </span>
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
