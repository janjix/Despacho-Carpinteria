// Armado de un bulto de herrajes.
//
// El bulto es un ítem con su etiqueta y sus dos escaneos. Aquí solo se decide
// qué va dentro. La cantidad es opcional a propósito: hay cosas que se cuentan
// (24 bisagras) y cosas que no (una bolsa de tornillos surtidos).

import { useEffect, useMemo, useState } from 'react'
import {
  actualizarBultoHerrajes, contenidoBultos, crearBultoHerrajes, useHerrajes
} from '../hooks/useSupabase'
import { Aviso, Boton, Campo, Modal, Vacio } from './ui'

export default function EditorHerrajes({ abierto, area, item, onCerrar, onListo }) {
  const { herrajes, cargando } = useHerrajes()
  const [nombre, setNombre] = useState('')
  const [notas, setNotas] = useState('')
  const [lineas, setLineas] = useState([])       // {herraje_id, cantidad, nota}
  const [busqueda, setBusqueda] = useState('')
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const editando = Boolean(item)

  // Al abrir sobre un bulto existente, se trae lo que ya tiene dentro
  useEffect(() => {
    if (!abierto) return
    setError(null)
    setBusqueda('')
    if (!item) {
      setNombre(area ? `Herrajes ${area.nombre.toLowerCase()}` : 'Herrajes')
      setNotas('')
      setLineas([])
      return
    }
    setNombre(item.nombre ?? 'Herrajes')
    setNotas(item.notas ?? '')
    contenidoBultos([item.id])
      .then(mapa => setLineas((mapa[item.id] ?? []).map(c => ({
        herraje_id: c.herraje_id,
        codigo: c.codigo,
        cantidad: c.cantidad ?? '',
        nota: c.nota ?? ''
      }))))
      .catch(e => setError(e.message))
  }, [abierto, item, area])

  const porId = useMemo(
    () => Object.fromEntries(herrajes.map(h => [h.id, h])),
    [herrajes]
  )

  const disponibles = useMemo(() => {
    const puestos = new Set(lineas.map(l => l.herraje_id))
    const q = busqueda.trim().toLowerCase()
    return herrajes
      .filter(h => !puestos.has(h.id))
      .filter(h => !q || [h.codigo, h.nombre, h.marca, h.medida]
        .filter(Boolean).some(t => t.toLowerCase().includes(q)))
  }, [herrajes, lineas, busqueda])

  const agregar = (h) => {
    setLineas(prev => [...prev, { herraje_id: h.id, codigo: h.codigo, cantidad: '', nota: '' }])
    setBusqueda('')
  }

  const cambiar = (i, campo, valor) =>
    setLineas(prev => prev.map((l, k) => (k === i ? { ...l, [campo]: valor } : l)))

  const quitar = (i) => setLineas(prev => prev.filter((_, k) => k !== i))

  const guardar = async () => {
    const contenido = lineas
      .filter(l => l.herraje_id)
      .map(l => ({
        herraje_id: l.herraje_id,
        cantidad: String(l.cantidad).trim() === '' ? null : Number(l.cantidad),
        nota: l.nota?.trim() || null
      }))

    if (!contenido.length) {
      setError('El bulto necesita al menos un herraje dentro.')
      return
    }

    setGuardando(true); setError(null)
    try {
      if (editando) await actualizarBultoHerrajes(item.id, contenido)
      else await crearBultoHerrajes(area.id, nombre, contenido, notas)
      await onListo()
      onCerrar()
    } catch (e) { setError(e.message) } finally { setGuardando(false) }
  }

  return (
    <Modal
      abierto={abierto}
      titulo={editando ? 'Editar bulto de herrajes' : `Bulto de herrajes en ${area?.nombre ?? ''}`}
      onCerrar={onCerrar}
      ancho="max-w-3xl"
    >
      <div className="space-y-5">
        {!editando && (
          <Campo
            etiqueta="Nombre del bulto"
            placeholder="Herrajes cocina"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            ayuda="Es lo que se lee grande en la etiqueta."
          />
        )}

        <div>
          <span className="etiqueta-campo">Contenido</span>
          {!lineas.length ? (
            <div className="border border-dashed border-borde bg-white px-4 py-6 text-center text-[14px] text-tenue">
              Todavía no hay nada dentro. Búscalo abajo y agrégalo.
            </div>
          ) : (
            <ul className="border border-borde bg-white divide-y divide-borde">
              {lineas.map((l, i) => {
                const h = porId[l.herraje_id]
                return (
                  <li key={l.herraje_id ?? i} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <span className="font-codigo text-[12px] text-tenue w-20 shrink-0">
                      {h?.codigo ?? l.codigo}
                    </span>
                    <span className="flex-1 min-w-[140px] text-[14px] font-semibold">
                      {h?.nombre ?? 'Herraje'}
                      {h?.medida && <span className="font-normal text-tenue"> · {h.medida}</span>}
                    </span>
                    <input
                      type="number" min="0" step="any"
                      className="w-20 min-h-[40px] px-2 border border-borde text-center text-[14px]"
                      placeholder="cant."
                      value={l.cantidad}
                      onChange={(e) => cambiar(i, 'cantidad', e.target.value)}
                    />
                    <span className="text-[12px] text-tenue w-12 shrink-0">
                      {h?.unidad ?? ''}
                    </span>
                    <input
                      className="w-36 min-h-[40px] px-2 border border-borde text-[13px]"
                      placeholder="nota"
                      value={l.nota}
                      onChange={(e) => cambiar(i, 'nota', e.target.value)}
                    />
                    <button
                      onClick={() => quitar(i)}
                      className="min-h-[40px] min-w-[40px] text-tenue hover:text-alerta text-xl"
                      aria-label="Quitar"
                    >×</button>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="text-[12.5px] text-tenue mt-2">
            La cantidad es opcional: hay cosas que se cuentan y cosas que no.
          </p>
        </div>

        <div>
          <Campo
            etiqueta="Agregar del catálogo"
            placeholder="Buscar por código, nombre, marca o medida"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          {cargando ? (
            <p className="text-[13px] text-tenue mt-2">Cargando el catálogo</p>
          ) : !herrajes.length ? (
            <div className="mt-2">
              <Aviso tono="alerta">
                El catálogo de herrajes está vacío. Cárgalo desde la pestaña
                Herrajes antes de armar bultos.
              </Aviso>
            </div>
          ) : (
            <ul className="mt-2 max-h-48 overflow-y-auto border border-borde bg-papel divide-y divide-borde">
              {disponibles.slice(0, 40).map(h => (
                <li key={h.id}>
                  <button
                    onClick={() => agregar(h)}
                    className="w-full text-left px-3 py-2 min-h-[44px] hover:bg-white flex flex-wrap gap-x-3 items-baseline"
                  >
                    <span className="font-codigo text-[12px] text-tenue w-20 shrink-0">{h.codigo}</span>
                    <span className="text-[14px] font-semibold">{h.nombre}</span>
                    <span className="text-[13px] text-tenue">
                      {[h.marca, h.medida].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
              {!disponibles.length && (
                <li className="px-3 py-3 text-[13px] text-tenue">
                  {busqueda ? 'Nada coincide con la búsqueda.' : 'Ya está todo el catálogo dentro del bulto.'}
                </li>
              )}
            </ul>
          )}
        </div>

        {error && <Aviso tono="alerta">{error}</Aviso>}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px] text-tenue">
            <strong className="text-tinta">{lineas.length}</strong> herrajes ·
            una sola etiqueta
          </p>
          <div className="flex gap-3">
            <Boton onClick={onCerrar}>Cancelar</Boton>
            <Boton variante="solido" onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando' : editando ? 'Guardar contenido' : 'Crear bulto'}
            </Boton>
          </div>
        </div>
      </div>
    </Modal>
  )
}
