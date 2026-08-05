// Subida del PDF y asignación de columnas.
//
// La app propone qué es cada columna y el usuario corrige con un selector.
// Así se descartan descripción y material sin tener que copiar nada a mano.

import { useRef, useState } from 'react'
import { adivinarRoles, leerTablaPdf, tablaAFilas } from '../lib/leerPdf'
import { Aviso, Boton } from './ui'

const ROLES = [
  { id: 'ignorar', texto: 'No usar' },
  { id: 'cantidad', texto: 'Cantidad' },
  { id: 'nombre', texto: 'Nombre del ítem' },
  { id: 'medidas', texto: 'Medidas' },
  { id: 'material', texto: 'Material' }
]

export default function ImportarPdf({ onFilas, onPedirFoto }) {
  const input = useRef(null)
  const [tabla, setTabla] = useState(null)
  const [roles, setRoles] = useState([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [nombreArchivo, setNombreArchivo] = useState('')

  const abrir = async (archivo) => {
    if (!archivo) return
    setError(null)
    setCargando(true)
    setNombreArchivo(archivo.name)
    try {
      const leida = await leerTablaPdf(archivo)
      if (!leida.hayTexto || !leida.filas.length) {
        setTabla(null)
        setError(
          'Este PDF no tiene texto seleccionable: es un escaneo o una imagen. ' +
          'Se puede leer con la cámara o subiendo una foto de la página.'
        )
        return
      }
      setTabla(leida)
      setRoles(adivinarRoles(leida))
    } catch (e) {
      setTabla(null)
      setError(`No se pudo abrir el PDF. ${e.message}`)
    } finally {
      setCargando(false)
      if (input.current) input.current.value = ''
    }
  }

  const cambiarRol = (indice, rol) => {
    setRoles(prev => prev.map((r, i) => {
      if (i === indice) return rol
      // Un rol distinto de "ignorar" solo puede estar en una columna
      if (rol !== 'ignorar' && r === rol) return 'ignorar'
      return r
    }))
  }

  const resultado = tabla ? tablaAFilas(tabla.filas, roles) : []
  const etiquetas = resultado.reduce((s, f) => s + f.cantidad, 0)
  const faltaNombre = tabla && !roles.includes('nombre')

  return (
    <div className="space-y-4">
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => abrir(e.target.files?.[0])}
      />

      {!tabla && (
        <div className="border border-dashed border-borde bg-white px-6 py-10 text-center">
          <p className="text-[15px] mb-1">Sube el PDF de la lista</p>
          <p className="text-[13px] text-tenue max-w-md mx-auto mb-5">
            Se lee el texto sin salir del navegador. Después eliges qué columnas
            usar y cuáles descartar.
          </p>
          <Boton variante="solido" onClick={() => input.current?.click()} disabled={cargando}>
            {cargando ? 'Leyendo el PDF' : 'Elegir archivo PDF'}
          </Boton>
        </div>
      )}

      {error && (
        <Aviso tono="alerta">
          <p className="mb-3">{error}</p>
          {onPedirFoto && (
            <Boton onClick={onPedirFoto}>Leer desde una foto</Boton>
          )}
        </Aviso>
      )}

      {tabla && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-tenue">
              <span className="font-codigo">{nombreArchivo}</span> ·{' '}
              {tabla.paginas} {tabla.paginas === 1 ? 'página' : 'páginas'} ·{' '}
              {tabla.filas.length} filas · {tabla.columnas} columnas
            </p>
            <button
              className="link"
              onClick={() => { setTabla(null); setError(null) }}
            >
              Cambiar archivo
            </button>
          </div>

          <div className="overflow-x-auto border border-borde bg-white">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  {roles.map((rol, i) => (
                    <th key={i} className="p-2 align-top border-b border-borde bg-papel">
                      <select
                        value={rol}
                        onChange={(e) => cambiarRol(i, e.target.value)}
                        className="w-full min-h-[40px] px-2 bg-white border border-borde text-[13px]"
                      >
                        {ROLES.map(r => (
                          <option key={r.id} value={r.id}>{r.texto}</option>
                        ))}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tabla.filas.slice(0, 8).map((fila, i) => (
                  <tr key={i} className="border-b border-borde last:border-0">
                    {roles.map((rol, c) => (
                      <td
                        key={c}
                        className={`px-2 py-1.5 ${rol === 'ignorar' ? 'text-borde line-through' : ''}`}
                      >
                        {fila[c] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {tabla.filas.length > 8 && (
              <p className="px-2 py-1.5 text-[12px] text-tenue border-t border-borde">
                y {tabla.filas.length - 8} filas más
              </p>
            )}
          </div>

          {faltaNombre ? (
            <Aviso tono="alerta">
              Marca cuál columna tiene el nombre del ítem. Sin eso no se pueden
              generar etiquetas.
            </Aviso>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[14px]">
                <strong>{resultado.length}</strong> ítems ·{' '}
                <strong>{etiquetas}</strong> etiquetas
              </p>
              <Boton
                variante="solido"
                disabled={!resultado.length}
                onClick={() => onFilas(resultado)}
              >
                Pasar a la tabla
              </Boton>
            </div>
          )}
        </>
      )}
    </div>
  )
}
