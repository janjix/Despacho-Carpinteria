// Escaneo global.
//
// El lector escribe contra la laptop desde el otro extremo del taller y nadie
// está frente a la pantalla. De ahí salen las dos decisiones de este módulo:
//
//   1. La escucha vive aquí arriba, en la app entera, no en una pantalla. Da
//      igual en qué apartado esté abierta: si llega una lectura, se registra.
//   2. No hay modo. La primera lectura de una etiqueta significa embalado y
//      la segunda significa cargado. El estado del bulto ya lo sabe.
//
// El viaje activo se recuerda entre recargas porque un camión se carga en
// varias tandas y volver a elegirlo cada vez era una invitación a olvidarlo.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useEscaner } from './useEscaner'
import { activarViaje, anularEscaneo, registrarEscaneo, useViajesAbiertos } from './useSupabase'
import { hoyVenezuela } from '../lib/codigos'
import { despertarAudio, sonar, vibrar } from '../lib/sonido'

const Contexto = createContext(null)

export function useEscaneoGlobal() {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useEscaneoGlobal fuera de EscaneoProvider')
  return ctx
}

function mensaje(r, item) {
  const nombre = item?.nombre ?? ''
  if (r.resultado === 'no_encontrado') {
    return {
      titulo: 'Código no encontrado',
      detalle: 'La etiqueta no pertenece a ningún proyecto cargado',
      tono: 'alerta'
    }
  }
  if (r.resultado === 'fuera_de_orden') {
    return { titulo: 'Fuera de orden', detalle: nombre, tono: 'alerta' }
  }
  if (r.resultado === 'sin_viaje') {
    return {
      titulo: 'Elige un viaje primero',
      detalle: 'Hay que decir a qué camión sube el bulto',
      tono: 'alerta'
    }
  }
  if (r.resultado === 'duplicado') {
    return {
      titulo: r.accion === 'carga' ? 'Ya estaba cargado' : 'Ya estaba embalado',
      detalle: `${nombre} se leyó antes`,
      tono: 'aviso'
    }
  }
  if (r.accion === 'embalaje') {
    return { titulo: 'Embalado', detalle: nombre, tono: 'embalado' }
  }
  return {
    titulo: 'Cargado',
    detalle: r.sin_viaje ? `${nombre} · sin viaje asignado` : nombre,
    tono: r.sin_viaje ? 'aviso' : 'cargado'
  }
}

export function EscaneoProvider({ children, activo = true }) {
  const [ultimo, setUltimo] = useState(null)
  const [historial, setHistorial] = useState([])
  const [contador, setContador] = useState({ embalados: 0, cargados: 0, rechazados: 0, dia: hoyVenezuela() })
  const [ocupado, setOcupado] = useState(false)
  const [audioListo, setAudioListo] = useState(false)
  const contadorClave = useRef(0)

  // El viaje activo vive en la base, no en este navegador. Se abre en la
  // laptop y el televisor del galpón carga contra él sin configurar nada.
  const { viajes, activo: viajeActivo } = useViajesAbiertos()
  const viaje = viajeActivo
  const viajeId = viajeActivo?.id ?? null

  const setViajeId = useCallback(async (id) => {
    await activarViaje(id || null)
  }, [])

  const procesar = useCallback(async (codigo) => {
    if (!codigo || ocupado) return
    setOcupado(true)
    try {
      // Sin viaje explícito la base usa el activo. Se manda null a propósito
      // para que un dispositivo con datos viejos en pantalla no cargue contra
      // un camión que ya cambió.
      const r = await registrarEscaneo(codigo, 'auto', null)
      const item = r.item ?? null
      const m = mensaje(r, item)
      const registro = {
        clave: ++contadorClave.current,
        codigo: item?.codigo ?? r.codigo ?? codigo,
        itemId: item?.id ?? null,
        resultado: r.resultado,
        accion: r.accion ?? null,
        sinViaje: Boolean(r.sin_viaje),
        cuando: new Date().toISOString(),
        ...m
      }
      setUltimo(registro)
      setHistorial(prev => [registro, ...prev].slice(0, 40))
      setContador(prev => {
        const dia = hoyVenezuela()
        const base = prev.dia === dia ? prev : { embalados: 0, cargados: 0, rechazados: 0, dia }
        if (r.resultado !== 'ok') return { ...base, rechazados: base.rechazados + 1 }
        if (r.accion === 'embalaje') return { ...base, embalados: base.embalados + 1 }
        return { ...base, cargados: base.cargados + 1 }
      })
      const tono = m.tono === 'alerta' ? 'alerta' : m.tono === 'aviso' ? 'aviso' : 'ok'
      sonar(tono)
      vibrar(tono)
      return registro
    } catch (e) {
      const registro = {
        clave: ++contadorClave.current,
        codigo,
        resultado: 'error',
        titulo: 'No se pudo registrar',
        detalle: e.message,
        tono: 'alerta',
        cuando: new Date().toISOString()
      }
      setUltimo(registro)
      setHistorial(prev => [registro, ...prev].slice(0, 40))
      setContador(prev => ({ ...prev, rechazados: prev.rechazados + 1 }))
      sonar('alerta')
      return registro
    } finally {
      setOcupado(false)
    }
  }, [ocupado])

  // La escucha del lector vive aquí: funciona en cualquier pantalla
  useEscaner(procesar, { activo })

  const anular = useCallback(async (registro, motivo) => {
    await anularEscaneo(registro.itemId, motivo, false)
    setHistorial(prev => prev.map(h => (h.clave === registro.clave ? { ...h, anulado: true } : h)))
    setUltimo(prev => (prev?.clave === registro.clave
      ? { ...prev, titulo: 'Escaneo anulado', detalle: motivo || 'sin motivo', tono: 'aviso', resultado: 'anulado' }
      : prev))
    sonar('aviso')
  }, [])

  // El audio necesita un gesto del usuario. Se arma en el primer clic.
  useEffect(() => {
    const abrir = () => { despertarAudio(); setAudioListo(true) }
    window.addEventListener('pointerdown', abrir, { once: true })
    window.addEventListener('keydown', abrir, { once: true })
    return () => {
      window.removeEventListener('pointerdown', abrir)
      window.removeEventListener('keydown', abrir)
    }
  }, [])

  // Bloqueo de suspensión: una laptop dormida no recibe teclas, y el lector
  // pita igual, así que el operario creería que registró
  useEffect(() => {
    let bloqueo = null
    let vivo = true
    const pedir = async () => {
      try {
        if ('wakeLock' in navigator) bloqueo = await navigator.wakeLock.request('screen')
      } catch { /* el navegador puede negarlo; no es crítico */ }
    }
    pedir()
    const alVolver = () => { if (vivo && document.visibilityState === 'visible') pedir() }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      vivo = false
      document.removeEventListener('visibilitychange', alVolver)
      bloqueo?.release?.().catch(() => {})
    }
  }, [])

  const valor = {
    viajes, viaje, viajeId, setViajeId,
    ultimo, historial, contador, ocupado, audioListo,
    procesar, anular,
    limpiarHistorial: () => { setHistorial([]); setUltimo(null) }
  }

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}
