// Lectura por cámara. Es el respaldo para cuando la pistola se queda sin
// batería o alguien se la llevó a otra mesa, no el método principal: es más
// lenta y sufre con la luz directa del mediodía en el portón.
//
// Dos motores:
//   1. BarcodeDetector, nativo en Chrome de Android. Rápido y sin descargas.
//   2. ZXing, que se carga solo si el navegador no trae el primero. Cubre
//      Safari de iPhone y los Chrome viejos.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Boton } from './ui'

const ESPERA_MISMO_CODIGO = 2500 // ms antes de volver a aceptar el mismo código

export default function LectorCamara({ abierto, onLeer, onCerrar, resultado }) {
  const video = useRef(null)
  const flujo = useRef(null)
  const detener = useRef(null)
  const ultimos = useRef(new Map())
  const [estado, setEstado] = useState('iniciando')
  const [error, setError] = useState(null)
  const [motor, setMotor] = useState(null)
  const [linterna, setLinterna] = useState(false)
  const [hayLinterna, setHayLinterna] = useState(false)

  const aceptar = useCallback((texto) => {
    if (!texto) return
    const ahora = Date.now()
    const previo = ultimos.current.get(texto) ?? 0
    if (ahora - previo < ESPERA_MISMO_CODIGO) return
    ultimos.current.set(texto, ahora)
    if (navigator.vibrate) navigator.vibrate(35)
    onLeer(texto)
  }, [onLeer])

  useEffect(() => {
    if (!abierto) return
    let vivo = true

    const arrancar = async () => {
      setError(null)
      setEstado('iniciando')

      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador no da acceso a la cámara. Usa el lector o teclea el código.')
        setEstado('falla')
        return
      }

      try {
        flujo.current = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        })
      } catch (e) {
        setError(
          e.name === 'NotAllowedError'
            ? 'El navegador bloqueó la cámara. Actívala en los permisos del sitio y vuelve a intentar.'
            : 'No se pudo abrir la cámara. Revisa que ninguna otra app la esté usando.'
        )
        setEstado('falla')
        return
      }

      if (!vivo) { flujo.current.getTracks().forEach(t => t.stop()); return }

      const pista = flujo.current.getVideoTracks()[0]
      setHayLinterna(Boolean(pista.getCapabilities?.().torch))

      if (video.current) {
        video.current.srcObject = flujo.current
        await video.current.play().catch(() => {})
      }

      // Motor 1: el nativo
      if ('BarcodeDetector' in window) {
        try {
          const formatos = await window.BarcodeDetector.getSupportedFormats()
          if (formatos.includes('code_128')) {
            const detector = new window.BarcodeDetector({ formats: ['code_128'] })
            const t = setInterval(async () => {
              if (!video.current || video.current.readyState < 2) return
              try {
                const encontrados = await detector.detect(video.current)
                if (encontrados.length) aceptar(encontrados[0].rawValue)
              } catch { /* fotograma suelto que falla, no importa */ }
            }, 180)
            detener.current = () => clearInterval(t)
            setMotor('nativo')
            setEstado('leyendo')
            return
          }
        } catch { /* cae al motor 2 */ }
      }

      // Motor 2: ZXing, solo si hizo falta
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (!vivo) return
        const lector = new BrowserMultiFormatReader()
        const control = await lector.decodeFromVideoElement(video.current, (r) => {
          if (r) aceptar(r.getText())
        })
        detener.current = () => control.stop()
        setMotor('zxing')
        setEstado('leyendo')
      } catch {
        setError('No se pudo iniciar la lectura de códigos en este navegador.')
        setEstado('falla')
      }
    }

    arrancar()

    return () => {
      vivo = false
      detener.current?.()
      detener.current = null
      flujo.current?.getTracks().forEach(t => t.stop())
      flujo.current = null
      ultimos.current.clear()
    }
  }, [abierto, aceptar])

  const cambiarLinterna = async () => {
    const pista = flujo.current?.getVideoTracks()[0]
    if (!pista) return
    try {
      await pista.applyConstraints({ advanced: [{ torch: !linterna }] })
      setLinterna(v => !v)
    } catch {
      setHayLinterna(false)
    }
  }

  if (!abierto) return null

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* El resultado se repite aquí porque el video tapa la pantalla */}
      {resultado && (
        <div
          className="shrink-0 px-4 py-3"
          style={{
            background: resultado.color,
            color: resultado.tono === 'embalado' ? '#3A2B00' : '#FFFFFF'
          }}
        >
          <p className="font-display font-extrabold uppercase text-xl leading-tight">
            {resultado.titulo}
          </p>
          <p className="text-[13.5px] mt-0.5 opacity-90">
            <span className="font-codigo">{resultado.codigo}</span>
            {resultado.detalle ? ` · ${resultado.detalle}` : ''}
          </p>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        <video
          ref={video}
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Guía de encuadre. El Code 128 es ancho y bajo: el marco lo dice. */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[84%] max-w-[420px] aspect-[5/1] border-2 border-white/90 relative">
            <span className="absolute -top-7 left-0 text-white/80 text-[12px] font-display uppercase tracking-[0.16em]">
              Encuadra el código de barras
            </span>
          </div>
        </div>

        {estado === 'iniciando' && (
          <p className="absolute inset-x-0 bottom-24 text-center text-white/80 text-[15px]">
            Abriendo la cámara
          </p>
        )}

        {error && (
          <div className="absolute inset-x-4 bottom-24 bg-white border-l-4 border-alerta px-4 py-3 text-[14px]">
            {error}
          </div>
        )}
      </div>

      <div className="shrink-0 bg-black px-4 py-4 flex items-center gap-3">
        <Boton variante="solido" onClick={onCerrar} className="!bg-white !text-tinta !border-white">
          Cerrar cámara
        </Boton>
        {hayLinterna && (
          <Boton
            onClick={cambiarLinterna}
            className="!bg-transparent !text-white !border-white/60"
          >
            {linterna ? 'Apagar luz' : 'Encender luz'}
          </Boton>
        )}
        <span className="ml-auto text-white/45 text-[12px]">
          {estado === 'leyendo'
            ? (motor === 'nativo' ? 'Lectura nativa' : 'Lectura por respaldo')
            : ''}
        </span>
      </div>
    </div>
  )
}
