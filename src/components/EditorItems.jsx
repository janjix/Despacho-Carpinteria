// Tabla editable donde se arma la lista antes de crear las etiquetas.
// Todo lo que entra por foto pasa por aquí. Nada se guarda sin revisión.

import { useRef, useState } from 'react'
import { Aviso, Boton, Modal } from './ui'
import { LARGO_MAXIMO_CODIGO, abreviar, armarCodigo } from '../lib/codigos'
import { parsearLista, resumenParseo } from '../lib/parsearLista'
import ImportarPdf from './ImportarPdf'

const FILA_VACIA = { nombre: '', medidas: '', material: '', cantidad: 1, descripcion: '' }

function comprimir(archivo, ladoMax = 1600, calidad = 0.82) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader()
    lector.onload = () => {
      const img = new Image()
      img.onload = () => {
        const escala = Math.min(1, ladoMax / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * escala)
        canvas.height = Math.round(img.height * escala)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        const url = canvas.toDataURL('image/jpeg', calidad)
        resolver({ base64: url.split(',')[1], tipo: 'image/jpeg', vista: url })
      }
      img.onerror = () => rechazar(new Error('No se pudo leer el archivo como imagen'))
      img.src = lector.result
    }
    lector.onerror = () => rechazar(new Error('No se pudo abrir el archivo'))
    lector.readAsDataURL(archivo)
  })
}

export default function EditorItems({ abierto, onCerrar, area, proyecto, onGuardar }) {
  const [filas, setFilas] = useState([{ ...FILA_VACIA }])
  const [leyendo, setLeyendo] = useState(false)
  const [error, setError] = useState(null)
  const [vista, setVista] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const inputArchivo = useRef(null)
  const [pegado, setPegado] = useState(null)   // null = panel cerrado
  const [cantidadAlInicio, setCantidadAlInicio] = useState(true)
  const [pdf, setPdf] = useState(false)

  const cambiar = (i, campo, valor) => {
    setFilas(prev => prev.map((f, k) => (k === i ? { ...f, [campo]: valor } : f)))
  }

  const agregar = () => setFilas(prev => [...prev, { ...FILA_VACIA }])
  const quitar = (i) => setFilas(prev => (prev.length === 1 ? [{ ...FILA_VACIA }] : prev.filter((_, k) => k !== i)))

  const leerImagen = async (archivo) => {
    if (!archivo) return
    setError(null)
    setLeyendo(true)
    try {
      const { base64, tipo, vista: previa } = await comprimir(archivo)
      setVista(previa)
      const r = await fetch('/api/extraer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imagen: base64, tipo })
      })
      const datos = await r.json()
      if (!r.ok) throw new Error(datos.error ?? 'La lectura falló')
      if (!datos.items?.length) {
        setError('No se reconoció ninguna lista en la imagen. Revisa que se lean los renglones o cárgala a mano.')
      } else {
        const limpias = filas.filter(f => f.nombre.trim())
        setFilas([...limpias, ...datos.items])
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLeyendo(false)
      if (inputArchivo.current) inputArchivo.current.value = ''
    }
  }

  const validas = filas.filter(f => f.nombre.trim())
  const totalEtiquetas = validas.reduce((s, f) => s + Math.max(1, Number(f.cantidad) || 1), 0)

  // Aviso temprano si el código va a quedar demasiado largo para el barcode
  const codigoMuestra = armarCodigo(
    proyecto?.codigo_corto ?? abreviar(proyecto?.nombre ?? '', 5),
    area?.codigo_corto ?? '',
    (area?.contador ?? 0) + 1
  )
  const codigoApretado = codigoMuestra.length > LARGO_MAXIMO_CODIGO

  const guardar = async () => {
    if (!validas.length) return
    setGuardando(true)
    setError(null)
    try {
      await onGuardar(validas)
      setFilas([{ ...FILA_VACIA }])
      setVista(null)
      onCerrar()
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto={abierto}
      titulo={`Cargar ítems en ${area?.nombre ?? ''}`}
      onCerrar={onCerrar}
      ancho="max-w-5xl"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputArchivo}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => leerImagen(e.target.files?.[0])}
          />
          <Boton variante="solido" onClick={() => { setPdf(true); setPegado(null) }}>
            Subir PDF
          </Boton>
          <Boton onClick={() => { setPegado(''); setPdf(false) }}>
            Pegar lista
          </Boton>
          <Boton onClick={() => inputArchivo.current?.click()} disabled={leyendo}>
            {leyendo ? 'Leyendo la imagen' : 'Leer desde una foto'}
          </Boton>
          <Boton onClick={agregar}>Agregar renglón</Boton>
          <span className="text-[13px] text-tenue font-codigo">
            Próximo código: {codigoMuestra}
          </span>
        </div>

        {pdf && (
          <div className="border border-tinta p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="etiqueta-campo !mb-0">Importar desde PDF</p>
              <button className="link" onClick={() => setPdf(false)}>Cerrar</button>
            </div>
            <ImportarPdf
              onPedirFoto={() => { setPdf(false); inputArchivo.current?.click() }}
              onFilas={(nuevas) => {
                const limpias = filas.filter(f => f.nombre.trim())
                setFilas([...limpias, ...nuevas])
                setPdf(false)
              }}
            />
          </div>
        )}

        {pegado !== null && (
          <div className="border border-tinta p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="etiqueta-campo !mb-0">Pegar la lista</p>
              <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                <input
                  type="checkbox"
                  className="w-5 h-5"
                  checked={cantidadAlInicio}
                  onChange={(e) => setCantidadAlInicio(e.target.checked)}
                />
                La primera columna es la cantidad
              </label>
            </div>

            <textarea
              autoFocus
              rows={8}
              className="w-full p-3 bg-white border border-borde font-codigo text-[13px] leading-relaxed"
              placeholder={'1  MODULO 1\n1  ZAPATERA 4\n1  TORRE LATERAL MODULO 8'}
              value={pegado}
              onChange={(e) => setPegado(e.target.value)}
            />

            {(() => {
              const leidas = parsearLista(pegado, { cantidadAlInicio })
              const r = resumenParseo(leidas)
              return (
                <>
                  <p className="text-[13px] text-tenue">
                    {r.renglones
                      ? `${r.renglones} renglones · ${r.etiquetas} etiquetas` +
                        (r.repetidos ? ` · ${r.repetidos} con cantidad mayor a uno` : '')
                      : 'Copia la lista desde el PDF o la hoja de cálculo y pégala aquí.'}
                  </p>
                  {r.renglones > 0 && (
                    <ul className="max-h-40 overflow-y-auto border border-borde bg-papel divide-y divide-borde">
                      {leidas.map((f, i) => (
                        <li key={i} className="flex gap-3 px-3 py-1.5 text-[13.5px]">
                          <span className="w-8 text-right text-tenue font-codigo">{f.cantidad}</span>
                          <span>{f.nombre}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-3 justify-end">
                    <Boton onClick={() => setPegado(null)}>Cancelar</Boton>
                    <Boton
                      variante="solido"
                      disabled={!r.renglones}
                      onClick={() => {
                        const limpias = filas.filter(f => f.nombre.trim())
                        setFilas([...limpias, ...leidas])
                        setPegado(null)
                      }}
                    >
                      Pasar {r.renglones} renglones a la tabla
                    </Boton>
                  </div>
                </>
              )
            })()}
          </div>
        )}

        {codigoApretado && (
          <Aviso tono="alerta">
            El código quedará en {codigoMuestra.length} caracteres y el código de barras
            perderá densidad. Acorta el nombre del proyecto o del área.
          </Aviso>
        )}

        {vista && (
          <div className="flex gap-4 items-start">
            <img src={vista} alt="Imagen leída" className="w-40 border border-borde" />
            <p className="text-[13px] text-tenue leading-relaxed max-w-md">
              Compara la foto con la tabla. Corrige lo que haga falta antes de crear
              las etiquetas. Los códigos se asignan al guardar y ya no cambian.
            </p>
          </div>
        )}

        {error && <Aviso tono="alerta">{error}</Aviso>}

        <div className="overflow-x-auto border border-borde">
          <table className="w-full text-[14px]">
            <thead className="bg-papel">
              <tr className="text-left">
                {['Nombre del ítem', 'Medidas', 'Material', 'Cant.', ''].map((h, i) => (
                  <th key={i} className="px-3 py-2 font-display text-[11px] uppercase tracking-wider text-tenue">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i} className="border-t border-borde">
                  <td className="p-1">
                    <input
                      className="w-full min-h-[44px] px-2 bg-transparent"
                      placeholder="Closet principal"
                      value={f.nombre}
                      onChange={(e) => cambiar(i, 'nombre', e.target.value)}
                    />
                  </td>
                  <td className="p-1 w-40">
                    <input
                      className="w-full min-h-[44px] px-2 bg-transparent"
                      placeholder="2400x600x18"
                      value={f.medidas}
                      onChange={(e) => cambiar(i, 'medidas', e.target.value)}
                    />
                  </td>
                  <td className="p-1 w-44">
                    <input
                      className="w-full min-h-[44px] px-2 bg-transparent"
                      placeholder="Melamina roble"
                      value={f.material}
                      onChange={(e) => cambiar(i, 'material', e.target.value)}
                    />
                  </td>
                  <td className="p-1 w-20">
                    <input
                      type="number" min="1"
                      className="w-full min-h-[44px] px-2 bg-transparent text-center"
                      value={f.cantidad}
                      onChange={(e) => cambiar(i, 'cantidad', e.target.value)}
                    />
                  </td>
                  <td className="p-1 w-12 text-center">
                    <button
                      onClick={() => quitar(i)}
                      className="min-h-[44px] min-w-[44px] text-tenue hover:text-alerta text-xl"
                      aria-label="Quitar renglón"
                    >×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-[14px]">
            <strong>{validas.length}</strong> renglones ·{' '}
            <strong>{totalEtiquetas}</strong> etiquetas a generar
          </p>
          <div className="flex gap-3">
            <Boton onClick={onCerrar}>Cancelar</Boton>
            <Boton variante="solido" onClick={guardar} disabled={!validas.length || guardando}>
              {guardando ? 'Creando etiquetas' : 'Crear etiquetas'}
            </Boton>
          </div>
        </div>
      </div>
    </Modal>
  )
}
