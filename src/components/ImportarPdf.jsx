// Subida del PDF y asignación de columnas.
//
// La app propone qué es cada columna y el usuario corrige con un selector.
// Así se descartan descripción y material sin tener que copiar nada a mano.

import { useRef, useState } from 'react'
import {
  abrirPdf, adivinarRoles, diagnosticarPdf, extraerTabla,
  rasterizarCanvas, rasterizarPagina, tablaAFilas
} from '../lib/leerPdf'
import { reconocerTabla } from '../lib/ocr'
import { Aviso, Boton } from './ui'
import RevisionLista from './RevisionLista'

const ROLES = [
  { id: 'ignorar', texto: 'No usar' },
  { id: 'cantidad', texto: 'Cantidad' },
  { id: 'nombre', texto: 'Nombre del ítem' },
  { id: 'medidas', texto: 'Medidas' },
  { id: 'material', texto: 'Material' }
]

export default function ImportarPdf({ onFilas }) {
  const input = useRef(null)
  const [tabla, setTabla] = useState(null)
  const [roles, setRoles] = useState([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [diagnostico, setDiagnostico] = useState(null)
  const [doc, setDoc] = useState(null)
  const [leyendoIA, setLeyendoIA] = useState(0)
  const [ocr, setOcr] = useState(null)     // {etapa, pagina, total, avance}
  const [origen, setOrigen] = useState('pdf')

  const abrir = async (archivo) => {
    if (!archivo) return
    setError(null)
    setCargando(true)
    setNombreArchivo(archivo.name)
    setOrigen('pdf')
    setDiagnostico(null)
    try {
      const { doc: abierto, pdfjs } = await abrirPdf(archivo)
      setDoc(abierto)

      const d = await diagnosticarPdf(abierto, pdfjs)
      setDiagnostico(d)

      if (d.fragmentos === 0) {
        setTabla(null)
        return // el panel de diagnóstico explica qué pasó
      }

      const leida = await extraerTabla(abierto)
      if (!leida.filas.length) { setTabla(null); return }
      setTabla(leida)
      setRoles(adivinarRoles(leida))
    } catch (e) {
      setTabla(null)
      setDoc(null)
      setError(
        `No se pudo abrir el PDF: ${e.message}. ` +
        'Si el archivo está protegido con contraseña, quítasela y vuelve a intentar.'
      )
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

      {error && <Aviso tono="alerta">{error}</Aviso>}

      {diagnostico && !tabla && !error && (
        <Aviso tono="alerta">
          <p className="font-semibold mb-2">
            Este PDF no tiene texto: las palabras son parte de una imagen.
          </p>
          <p className="mb-3 text-[13.5px]">
            Encontré {diagnostico.paginas}{' '}
            {diagnostico.paginas === 1 ? 'página' : 'páginas'},{' '}
            <strong>{diagnostico.fragmentos} fragmentos de texto</strong> y{' '}
            {diagnostico.imagenes} imágenes.
            {diagnostico.fragmentos === 0 && diagnostico.imagenes > 0 &&
              ' Ese patrón es el de un escaneo o de una exportación a imagen.'}
          </p>
          <p className="mb-3 text-[13.5px]">
            Compruébalo en tu visor: abre el PDF e intenta seleccionar una
            palabra con el cursor, o busca con Ctrl+F. Si no puedes
            seleccionarla, no hay texto que leer.
          </p>
          <div className="flex flex-wrap gap-3 mb-3">
            <Boton
              variante="solido"
              disabled={Boolean(ocr) || leyendoIA > 0}
              onClick={async () => {
                setError(null)
                try {
                  const total = Math.min(doc.numPages, 12)
                  setOcr({ etapa: 'preparando', pagina: 0, total, avance: 0 })
                  const canvases = []
                  for (let p = 1; p <= total; p++) {
                    setOcr({ etapa: 'dibujando', pagina: p, total, avance: 0 })
                    canvases.push(await rasterizarCanvas(doc, p, 500))
                  }
                  const leida = await reconocerTabla(canvases, (e) =>
                    setOcr(prev => ({ ...prev, ...e, total })))
                  if (!leida.filas.length) {
                    setError('El OCR no encontró una tabla en estas páginas.')
                  } else {
                    setOrigen('ocr')
                    setTabla(leida)
                    setRoles(adivinarRoles(leida))
                    setDiagnostico(null)
                  }
                } catch (e) {
                  setError(`El OCR falló: ${e.message}`)
                } finally {
                  setOcr(null)
                }
              }}
            >
              {ocr
                ? ocr.etapa === 'dibujando'
                  ? `Dibujando página ${ocr.pagina} de ${ocr.total}`
                  : ocr.etapa === 'preparando'
                    ? 'Descargando el motor de OCR'
                    : `Leyendo página ${ocr.pagina ?? 1}: ${Math.round((ocr.avance ?? 0) * 100)}%`
                : 'Leer con OCR aquí mismo (gratis)'}
            </Boton>
          </div>

          <p className="mb-4 text-[12.5px]">
            El OCR corre dentro del navegador, sin clave y sin costo. La primera
            vez descarga unos 15 MB de motor e idioma y queda en caché. Tarda
            cerca de un minuto por página. Revisa la tabla antes de crear
            etiquetas.
          </p>

          <Boton
            disabled={leyendoIA > 0 || Boolean(ocr)}
            onClick={async () => {
              setError(null)
              try {
                const acumulado = []
                const total = Math.min(doc.numPages, 10)
                for (let p = 1; p <= total; p++) {
                  setLeyendoIA(p)
                  const imagen = await rasterizarPagina(doc, p)
                  const r = await fetch('/api/extraer', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ imagen, tipo: 'image/jpeg' })
                  })
                  const datos = await r.json()
                  if (!r.ok) throw new Error(datos.error ?? 'La lectura falló')
                  acumulado.push(...(datos.items ?? []))
                }
                if (!acumulado.length) {
                  setError('No se reconoció ninguna lista en las páginas del PDF.')
                } else {
                  onFilas(acumulado)
                }
              } catch (e) {
                setError(e.message)
              } finally {
                setLeyendoIA(0)
              }
            }}
          >
            {leyendoIA
              ? `Leyendo página ${leyendoIA}`
              : 'Leer con IA (más preciso)'}
          </Boton>
          <p className="mt-2 text-[12.5px]">
            Manda cada página al lector de imágenes. Más rápido y más exacto que
            el OCR, pero requiere la clave de Anthropic en el servidor.
          </p>
        </Aviso>
      )}

      {tabla && (
        <>
          {origen === 'ocr' && (
            <Aviso tono="alerta">
              Esta tabla salió de un OCR, no del texto del PDF. Revisa los
              nombres antes de crear las etiquetas. En la prueba contra un
              listado de 60 muebles acertó los 60, pero eso fue con un PDF
              limpio y bien alineado.
            </Aviso>
          )}

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
            <div className="space-y-4">
              <RevisionLista filas={resultado} onCambiar={onFilas} />
              <div className="flex justify-end">
              <Boton
                variante="solido"
                disabled={!resultado.length}
                onClick={() => onFilas(resultado)}
              >
                Pasar {etiquetas} etiquetas a la tabla
              </Boton>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
