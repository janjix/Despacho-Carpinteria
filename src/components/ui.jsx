import { useEffect, useState } from 'react'
import { ESTADOS } from '../lib/codigos'

export function Boton({ variante = 'linea', className = '', ...props }) {
  const clase = {
    solido: 'btn btn-solido',
    linea: 'btn btn-linea',
    alerta: 'btn btn-alerta'
  }[variante]
  return <button className={`${clase} ${className}`} {...props} />
}

export function Campo({ etiqueta, ayuda, className = '', ...props }) {
  return (
    <label className={`block ${className}`}>
      {etiqueta && <span className="etiqueta-campo">{etiqueta}</span>}
      <input className="campo" {...props} />
      {ayuda && <span className="block mt-1 text-[12px] text-tenue">{ayuda}</span>}
    </label>
  )
}

export function Insignia({ estado }) {
  const e = ESTADOS[estado]
  return (
    <span
      className="inline-flex items-center px-2 py-1 text-[11px] font-display font-semibold uppercase tracking-wider"
      style={{ background: e.fondo, color: e.texto }}
    >
      {e.nombre}
    </span>
  )
}

export function Riel({ estado }) {
  return <span className="riel" style={{ background: ESTADOS[estado].hex }} />
}

/** Barra de avance de tres tramos. Es el resumen que se lee de un vistazo. */
export function BarraAvance({ resumen, alto = 'h-3' }) {
  const total = Math.max(1, resumen.total)
  const tramo = (n) => `${(n / total) * 100}%`
  return (
    <div className={`flex w-full ${alto} bg-borde overflow-hidden`}>
      <div style={{ width: tramo(resumen.cargado), background: ESTADOS.cargado.hex }} />
      <div style={{ width: tramo(resumen.embalado), background: ESTADOS.embalado.hex }} />
      <div style={{ width: tramo(resumen.pendiente), background: ESTADOS.pendiente.hex }} />
    </div>
  )
}

export function Modal({ abierto, titulo, onCerrar, children, ancho = 'max-w-2xl' }) {
  useEffect(() => {
    if (!abierto) return
    const esc = (e) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', esc)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', esc)
      document.body.style.overflow = ''
    }
  }, [abierto, onCerrar])

  if (!abierto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-6">
      <div className={`w-full ${ancho} bg-white border border-tinta max-h-[92vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-borde sticky top-0 bg-white z-10">
          <h2 className="text-xl font-bold">{titulo}</h2>
          <button
            onClick={onCerrar}
            className="min-h-[44px] min-w-[44px] text-2xl leading-none text-tenue hover:text-tinta"
            aria-label="Cerrar"
          >×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Confirmar({ abierto, titulo, mensaje, textoAccion = 'Borrar', onConfirmar, onCerrar }) {
  return (
    <Modal abierto={abierto} titulo={titulo} onCerrar={onCerrar} ancho="max-w-lg">
      <p className="text-[15px] leading-relaxed mb-6">{mensaje}</p>
      <div className="flex gap-3 justify-end">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="alerta" onClick={() => { onConfirmar(); onCerrar() }}>{textoAccion}</Boton>
      </div>
    </Modal>
  )
}

export function Vacio({ titulo, mensaje, accion }) {
  return (
    <div className="border border-dashed border-borde bg-white px-6 py-12 text-center">
      <h3 className="text-lg font-bold mb-2">{titulo}</h3>
      <p className="text-[14px] text-tenue max-w-md mx-auto mb-5">{mensaje}</p>
      {accion}
    </div>
  )
}

export function Aviso({ tono = 'info', children }) {
  const estilos = {
    info: 'bg-white border-borde text-tinta',
    alerta: 'bg-[#FBEAEA] border-alerta text-[#7A1B1B]',
    ok: 'bg-[#DDF2E6] border-cargado text-[#0E4B29]'
  }[tono]
  return (
    <div className={`border-l-4 border px-4 py-3 text-[14px] leading-relaxed ${estilos}`}>
      {children}
    </div>
  )
}

export function Cargando({ texto = 'Cargando' }) {
  const [puntos, setPuntos] = useState('')
  useEffect(() => {
    const t = setInterval(() => setPuntos(p => (p.length >= 3 ? '' : p + '.')), 400)
    return () => clearInterval(t)
  }, [])
  return (
    <p className="py-10 text-center font-display uppercase tracking-widest text-tenue">
      {texto}{puntos}
    </p>
  )
}
