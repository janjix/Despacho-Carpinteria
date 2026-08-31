import { useMemo, useState } from 'react'
import {
  borrarArea, borrarGrupo, borrarItem, cambiarCantidad, crearArea, crearItems,
  duplicarArea, editarGrupo, marcarImpresas, renombrarArea, anularEscaneo,
  cambiarEstadoItem, useProyecto
} from '../hooks/useSupabase'
import { abrirEtiquetas } from '../lib/etiquetas'
import { listaCarga, listaEmbalaje } from '../lib/listasPdf'
import { ESTADOS, ORDEN_ESTADO, abreviar, esHoy, fechaCorta, fechaHora, hora, resumir } from '../lib/codigos'
import { Aviso, BarraAvance, Boton, Campo, Cargando, Confirmar, Insignia, Modal, Riel, Vacio } from './ui'
import EditorItems from './EditorItems'
import EditorHerrajes from './EditorHerrajes'

// ---------------------------------------------------------------------

function agrupar(items) {
  const mapa = new Map()
  for (const it of items) {
    if (!mapa.has(it.grupo_id)) {
      mapa.set(it.grupo_id, { grupo_id: it.grupo_id, base: it, items: [] })
    }
    mapa.get(it.grupo_id).items.push(it)
  }
  return [...mapa.values()].map(g => ({
    ...g,
    items: g.items.sort((a, b) => a.indice - b.indice)
  })).sort((a, b) => a.items[0].codigo.localeCompare(b.items[0].codigo))
}

/** Estado del grupo: el más atrasado de sus etiquetas manda. */
function estadoGrupo(items) {
  if (items.every(i => i.estado === 'cargado')) return 'cargado'
  if (items.every(i => i.estado !== 'pendiente')) return 'embalado'
  return 'pendiente'
}

// ---------------------------------------------------------------------

function FilaGrupo({ grupo, viajes, onImprimir, onEditar, onEditarHerrajes, onBorrar, onCambiarEstado }) {
  const [abierto, setAbierto] = useState(false)
  const base = grupo.base
  const estado = estadoGrupo(grupo.items)
  const r = resumir(grupo.items)
  const multiple = grupo.items.length > 1
  const desactualizada = grupo.items.some(i => i.desactualizada)

  return (
    <li className="tarjeta flex items-stretch">
      <Riel estado={estado} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <button
            className="flex-1 min-w-[200px] text-left min-h-[44px]"
            onClick={() => multiple && setAbierto(v => !v)}
          >
            <span className="block font-display font-bold text-[17px] truncate">
              {base.tipo === 'herrajes' && (
                <span className="inline-block mr-2 px-1.5 py-0.5 align-middle bg-tinta text-papel
                                 text-[10px] font-display uppercase tracking-wider">
                  Herrajes
                </span>
              )}
              {base.nombre}
            </span>
            <span className="block font-codigo text-[12px] text-tenue mt-0.5">
              {multiple
                ? `${base.items?.length ?? grupo.items.length} bultos · ${grupo.items[0].codigo} …`
                : grupo.items[0].codigo}
              {base.medidas && ` · ${base.medidas}`}
              {base.material && ` · ${base.material}`}
            </span>
          </button>

          <div className="flex items-center gap-2">
            {multiple && (
              <span className="text-[12px] text-tenue font-codigo">
                {r.cargado}/{grupo.items.length} cargados
              </span>
            )}
            <Insignia estado={estado} />
          </div>

          <div className="flex items-center gap-1">
            <button onClick={() => onImprimir(grupo.items)}
              className="min-h-[44px] px-2 text-[13px] font-display uppercase tracking-wide text-tenue hover:text-tinta">
              Imprimir
            </button>
            <button
              onClick={() => (base.tipo === 'herrajes' ? onEditarHerrajes(grupo) : onEditar(grupo))}
              className="min-h-[44px] px-2 text-[13px] font-display uppercase tracking-wide text-tenue hover:text-tinta">
              {base.tipo === 'herrajes' ? 'Contenido' : 'Editar'}
            </button>
            {!multiple && (
              <button onClick={() => onCambiarEstado(grupo.items[0])}
                className="min-h-[44px] px-2 text-[13px] font-display uppercase tracking-wide text-tenue hover:text-tinta">
                Estado
              </button>
            )}
            <button onClick={() => onBorrar(grupo)}
              className="min-h-[44px] px-2 text-[13px] font-display uppercase tracking-wide text-tenue hover:text-alerta">
              Borrar
            </button>
          </div>
        </div>

        {desactualizada && (
          <p className="px-4 pb-3 text-[12.5px] text-alerta">
            La etiqueta impresa ya no coincide con estos datos. Vuelve a imprimirla.
          </p>
        )}

        {abierto && multiple && (
          <ul className="border-t border-borde">
            {grupo.items.map(it => (
              <li key={it.id} className="flex items-center gap-3 px-4 py-2 border-b border-borde last:border-0">
                <span className="w-2 h-6" style={{ background: ESTADOS[it.estado].hex }} />
                <span className="font-codigo text-[12.5px]">{it.codigo}</span>
                <span className="text-[13px] text-tenue">{it.indice} de {it.cantidad}</span>
                <span className="text-[12px] text-tenue ml-auto">
                  {it.embalado_at && `Embalado ${hora(it.embalado_at)}`}
                  {it.cargado_at && ` · Cargado ${hora(it.cargado_at)}`}
                  {viajes?.[it.viaje_id] && (
                    <span className="ml-2 font-codigo text-tinta">
                      {viajes[it.viaje_id].camion_codigo} · {viajes[it.viaje_id].codigo}
                    </span>
                  )}
                </span>
                <button
                  onClick={() => onCambiarEstado(it)}
                  className="min-h-[40px] px-2 text-[12px] font-display uppercase
                             tracking-wide text-tenue hover:text-tinta"
                  title="Cambiar el estado a mano"
                >
                  Estado
                </button>
                <button onClick={() => onBorrar({ ...grupo, soloItem: it })}
                  className="min-h-[40px] px-2 text-tenue hover:text-alerta">×</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------

function EditorGrupo({ abierto, grupo, area, proyecto, onCerrar, onListo }) {
  const base = grupo?.base
  const [campos, setCampos] = useState({})
  const [cantidad, setCantidad] = useState(grupo?.items.length ?? 1)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  if (!grupo) return null
  const v = (k) => campos[k] ?? base[k] ?? ''

  const guardar = async () => {
    setGuardando(true); setError(null)
    try {
      await editarGrupo(grupo.grupo_id, {
        nombre: v('nombre'), descripcion: v('descripcion'),
        medidas: v('medidas'), material: v('material'), notas: v('notas')
      })
      if (Number(cantidad) !== grupo.items.length) {
        await cambiarCantidad(grupo, area, proyecto.codigo_corto, cantidad)
      }
      await onListo()
      onCerrar()
    } catch (e) { setError(e.message) } finally { setGuardando(false) }
  }

  return (
    <Modal abierto={abierto} titulo="Editar ítem" onCerrar={onCerrar} ancho="max-w-xl">
      <div className="space-y-4">
        <Campo etiqueta="Nombre" value={v('nombre')} onChange={(e) => setCampos({ ...campos, nombre: e.target.value })} />
        <div className="grid sm:grid-cols-2 gap-4">
          <Campo etiqueta="Medidas" value={v('medidas')} onChange={(e) => setCampos({ ...campos, medidas: e.target.value })} />
          <Campo etiqueta="Material" value={v('material')} onChange={(e) => setCampos({ ...campos, material: e.target.value })} />
        </div>
        <Campo etiqueta="Notas" value={v('notas')} onChange={(e) => setCampos({ ...campos, notas: e.target.value })} />
        <Campo
          etiqueta="Cantidad de bultos" type="number" min="1"
          value={cantidad} onChange={(e) => setCantidad(e.target.value)}
          ayuda="Al subirla se crean etiquetas nuevas. Al bajarla solo se retiran las que siguen pendientes."
        />
        {error && <Aviso tono="alerta">{error}</Aviso>}
        <Aviso>
          Si cambias nombre, medidas, material o cantidad, las etiquetas ya impresas
          quedan marcadas para reimprimir.
        </Aviso>
        <div className="flex justify-end gap-3">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="solido" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando' : 'Guardar cambios'}
          </Boton>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------

/**
 * Cambio manual de estado.
 *
 * Existe porque la realidad del taller no siempre pasa por el lector: una
 * etiqueta se moja, alguien sube un bulto sin escanearlo, se escanea el que
 * no era. Pide motivo y queda en la bitácora, igual que un escaneo.
 */
function CambiarEstado({ item, viajes, onCerrar, onListo }) {
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  if (!item) return null

  const aplicar = async (estado) => {
    setGuardando(true); setError(null)
    try {
      await cambiarEstadoItem(item.id, estado, motivo)
      await onListo()
      onCerrar()
    } catch (e) { setError(e.message) } finally { setGuardando(false) }
  }

  const viaje = viajes?.[item.viaje_id]

  return (
    <Modal abierto titulo="Cambiar el estado a mano" onCerrar={onCerrar} ancho="max-w-lg">
      <div className="space-y-4">
        <div>
          <p className="font-display font-bold text-lg">{item.nombre}</p>
          <p className="font-codigo text-[13px] text-tenue mt-0.5">
            {item.codigo}
            {item.cantidad > 1 && ` · bulto ${item.indice} de ${item.cantidad}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[14px]">
          <span className="etiqueta-campo !mb-0">Ahora está</span>
          <Insignia estado={item.estado} />
          {viaje && (
            <span className="text-[13px] text-tenue font-codigo">
              {viaje.camion_codigo} · {viaje.codigo}
            </span>
          )}
        </div>

        <Campo
          etiqueta="Motivo"
          autoFocus
          placeholder="La etiqueta se mojó y no leyó"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          ayuda="Queda en la bitácora junto al estado anterior."
        />

        {error && <Aviso tono="alerta">{error}</Aviso>}

        <div>
          <span className="etiqueta-campo">Pasar a</span>
          <div className="grid sm:grid-cols-3 gap-2">
            {ORDEN_ESTADO.map(estado => {
              const info = ESTADOS[estado]
              const actual = item.estado === estado
              return (
                <button
                  key={estado}
                  disabled={actual || guardando}
                  onClick={() => aplicar(estado)}
                  className="min-h-[52px] px-3 border font-display font-semibold uppercase
                             tracking-wide text-[14px] disabled:opacity-35 disabled:cursor-not-allowed"
                  style={{
                    background: actual ? info.fondo : '#FFFFFF',
                    borderColor: info.hex,
                    color: info.texto
                  }}
                >
                  {info.nombre}
                </button>
              )
            })}
          </div>
        </div>

        <Aviso>
          Pasar a cargado sin un viaje activo deja el bulto sin camión asignado.
          Se puede asignar después desde el detalle del viaje.
        </Aviso>
      </div>
    </Modal>
  )
}

export default function Proyecto({ proyectoId, onVolver }) {
  const { proyecto, areas, items, viajes, indice, cargando, error, recargar } = useProyecto(proyectoId)
  const [nuevaArea, setNuevaArea] = useState('')
  const [cargandoEn, setCargandoEn] = useState(null)
  const [editandoGrupo, setEditandoGrupo] = useState(null)
  const [borrando, setBorrando] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [cambiandoEstado, setCambiandoEstado] = useState(null)
  const [creandoArea, setCreandoArea] = useState(false)
  const [bultoHerrajes, setBultoHerrajes] = useState(null)   // {area, item?}
  const [verDespachados, setVerDespachados] = useState(false)

  // Lo que ya salió en un camión despachado se aparta.
  //
  // Sigue existiendo y sigue en la guía de su viaje, pero deja de mezclarse
  // con lo que queda por hacer: en un proyecto de 150 bultos, ver los 60 que
  // ya se fueron entorpece más de lo que informa.
  const { enTaller, despachados } = useMemo(() => {
    const dentro = []
    const fuera = []
    for (const it of items) {
      const v = viajes[it.viaje_id]
      if (v && (v.estado === 'despachado' || v.estado === 'entregado')) fuera.push(it)
      else dentro.push(it)
    }
    return { enTaller: dentro, despachados: fuera }
  }, [items, viajes])

  const porViajeDespachado = useMemo(() => {
    const mapa = new Map()
    for (const it of despachados) {
      if (!mapa.has(it.viaje_id)) mapa.set(it.viaje_id, [])
      mapa.get(it.viaje_id).push(it)
    }
    return [...mapa.entries()]
      .map(([id, lista]) => ({ viaje: viajes[id], items: lista.sort((a, b) => a.codigo.localeCompare(b.codigo)) }))
      .sort((a, b) => String(b.viaje?.salida_at ?? '').localeCompare(String(a.viaje?.salida_at ?? '')))
  }, [despachados, viajes])

  const porArea = useMemo(() => {
    const mapa = new Map(areas.map(a => [a.id, []]))
    for (const it of enTaller) {
      if (mapa.has(it.area_id)) mapa.get(it.area_id).push(it)
    }
    return mapa
  }, [areas, enTaller])

  const total = resumir(enTaller)

  if (cargando) return <Cargando texto="Abriendo el proyecto" />
  if (error) return <div className="p-6"><Aviso tono="alerta">{error}</Aviso></div>
  if (!proyecto) return null

  const imprimir = async (lista) => {
    if (!lista.length) { setAviso('No hay etiquetas para imprimir en esta selección.'); return }
    const ordenada = lista.slice().sort((a, b) => a.codigo.localeCompare(b.codigo))
    await abrirEtiquetas(ordenada, indice)
    await marcarImpresas(ordenada.map(i => i.id))
    await recargar()
  }

  // Nada de fallar en silencio: si el nombre está vacío se dice, si la
  // creación falla se dice, y mientras corre el botón lo indica.
  const agregarArea = async () => {
    const nombre = nuevaArea.trim()
    if (!nombre) {
      setAviso('Escribe el nombre del área antes de agregarla.')
      return
    }
    setAviso(null)
    setCreandoArea(true)
    try {
      await crearArea(proyectoId, nombre, areas.length)
      setNuevaArea('')
      await recargar()
    } catch (e) {
      setAviso(`No se pudo crear el área: ${e.message}`)
    } finally {
      setCreandoArea(false)
    }
  }

  const guardarItems = (area) => async (filas) => {
    await crearItems(area, filas)
    await recargar()
  }

  const confirmarBorrado = async () => {
    try {
      if (borrando.tipo === 'area') await borrarArea(borrando.id)
      else if (borrando.tipo === 'item') await borrarItem(borrando.id)
      else await borrarGrupo(borrando.id)
      await recargar()
    } catch (e) { setAviso(e.message) }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <button onClick={onVolver}
        className="min-h-[44px] font-display uppercase tracking-wide text-[13px] text-tenue hover:text-tinta">
        ← Todos los proyectos
      </button>

      <header className="mt-3 mb-7">
        <h1 className="text-3xl sm:text-4xl font-extrabold">{proyecto.nombre}</h1>
        <p className="text-tenue text-[14px] mt-1">
          {proyecto.cliente ? `${proyecto.cliente} · ` : ''}
          Despacho {fechaCorta(proyecto.fecha_despacho)} ·{' '}
          <span className="font-codigo">{proyecto.codigo_corto}</span>
        </p>

        {total.total > 0 && (
          <div className="mt-5">
            <BarraAvance resumen={total} alto="h-4" />
            <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-[13.5px]">
              <span><strong>{total.total}</strong> bultos</span>
              <span style={{ color: ESTADOS.pendiente.hex }}>{total.pendiente} pendientes</span>
              <span style={{ color: '#9A6E00' }}>{total.embalado} embalados</span>
              <span style={{ color: ESTADOS.cargado.hex }}>{total.cargado} cargados</span>
            </div>
          </div>
        )}

        {esHoy(proyecto.fecha_despacho) && total.embalado > 0 && (
          <div className="mt-4">
            <Aviso tono="alerta">
              Este proyecto sale hoy y quedan {total.embalado} bultos embalados sin cargar.
            </Aviso>
          </div>
        )}

        <div className="flex flex-wrap gap-3 mt-5">
          <Boton variante="solido" onClick={() => imprimir(items)}>
            Imprimir todas las etiquetas
          </Boton>
          <Boton onClick={async () => {
            const doc = await listaEmbalaje(proyecto, indice.areas, items)
            doc.save(`Embalaje ${proyecto.nombre}.pdf`)
          }}>
            Lista de embalaje PDF
          </Boton>
          <Boton onClick={async () => {
            const doc = await listaCarga(proyecto, indice.areas, items, viajes)
            doc.save(`Carga ${proyecto.nombre}.pdf`)
          }}>
            Lista de carga PDF
          </Boton>
        </div>
      </header>

      {aviso && <div className="mb-5"><Aviso tono="alerta">{aviso}</Aviso></div>}

      <div className="flex flex-wrap gap-2 items-end mb-6 pb-6 border-b border-borde">
        <Campo
          etiqueta="Nueva área"
          placeholder="Cocina"
          className="w-full sm:w-72"
          value={nuevaArea}
          onChange={(e) => setNuevaArea(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && agregarArea()}
          ayuda={nuevaArea ? `Se abreviará como ${abreviar(nuevaArea, 3)} en el código` : ' '}
        />
        <Boton
          variante="solido"
          onClick={agregarArea}
          disabled={creandoArea}
          className="mb-6"
        >
          {creandoArea ? 'Creando' : 'Agregar área'}
        </Boton>
      </div>

      {!areas.length ? (
        <Vacio
          titulo="Este proyecto no tiene áreas"
          mensaje="Crea al menos una. Si hay bultos que no pertenecen a ninguna área concreta, herrajes o zócalos por ejemplo, crea una llamada General."
        />
      ) : (
        <div className="space-y-8">
          {areas.map(area => {
            const itemsArea = porArea.get(area.id) ?? []
            const grupos = agrupar(itemsArea)
            const r = resumir(itemsArea)
            return (
              <section key={area.id}>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <h2 className="text-xl font-bold uppercase tracking-tight">{area.nombre}</h2>
                    <span className="text-[13px] text-tenue">
                      {r.total} bultos · {r.pendiente} pendientes · {r.embalado} embalados · {r.cargado} cargados
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setCargandoEn(area)}
                      className="min-h-[44px] px-3 text-[13px] font-display uppercase tracking-wide hover:underline">
                      Cargar ítems
                    </button>
                    <button onClick={() => setBultoHerrajes({ area })}
                      className="min-h-[44px] px-3 text-[13px] font-display uppercase tracking-wide hover:underline">
                      Bulto de herrajes
                    </button>
                    <button onClick={() => imprimir(itemsArea)}
                      className="min-h-[44px] px-3 text-[13px] font-display uppercase tracking-wide text-tenue hover:text-tinta">
                      Imprimir área
                    </button>
                    <button
                      onClick={async () => {
                        const nombre = prompt('Nombre del área nueva', `${area.nombre} 2`)
                        if (!nombre) return
                        try {
                          await duplicarArea(area, itemsArea, nombre, proyecto.codigo_corto)
                          await recargar()
                        } catch (e) { setAviso(e.message) }
                      }}
                      className="min-h-[44px] px-3 text-[13px] font-display uppercase tracking-wide text-tenue hover:text-tinta">
                      Duplicar
                    </button>
                    <button
                      onClick={async () => {
                        const nombre = prompt('Nuevo nombre del área', area.nombre)
                        if (!nombre) return
                        await renombrarArea(area.id, nombre)
                        await recargar()
                      }}
                      className="min-h-[44px] px-3 text-[13px] font-display uppercase tracking-wide text-tenue hover:text-tinta">
                      Renombrar
                    </button>
                    <button onClick={() => setBorrando({ tipo: 'area', id: area.id, nombre: area.nombre })}
                      className="min-h-[44px] px-3 text-[13px] font-display uppercase tracking-wide text-tenue hover:text-alerta">
                      Borrar
                    </button>
                  </div>
                </div>

                {r.total > 0 && <div className="mb-3"><BarraAvance resumen={r} /></div>}

                {!grupos.length ? (
                  <Vacio
                    titulo="Área sin ítems"
                    mensaje="Carga la lista con una foto del despiece o escríbela a mano."
                    accion={<Boton variante="solido" onClick={() => setCargandoEn(area)}>Cargar ítems</Boton>}
                  />
                ) : (
                  <ul className="grid gap-2">
                    {grupos.map(g => (
                      <FilaGrupo
                        key={g.grupo_id}
                        grupo={g}
                        viajes={viajes}
                        onImprimir={imprimir}
                        onEditar={(grupo) => setEditandoGrupo({ grupo, area })}
                        onEditarHerrajes={(grupo) => setBultoHerrajes({ area, item: grupo.base })}
                        onBorrar={(grupo) => setBorrando(
                          grupo.soloItem
                            ? { tipo: 'item', id: grupo.soloItem.id, nombre: grupo.soloItem.codigo }
                            : { tipo: 'grupo', id: grupo.grupo_id, nombre: grupo.base.nombre }
                        )}
                        onCambiarEstado={(it) => setCambiandoEstado(it)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}

      {/* Lo ya despachado, apartado al final y plegado.
          No se borra ni se pierde: sigue en la guía de su viaje y aquí se
          puede desplegar para consultar qué se fue y cuándo. */}
      {despachados.length > 0 && (
        <section className="mt-10 pt-6 border-t border-borde">
          <button
            onClick={() => setVerDespachados(v => !v)}
            className="flex flex-wrap items-center gap-3 min-h-[48px] w-full text-left"
          >
            <span className="text-tenue text-[15px]">{verDespachados ? '▾' : '▸'}</span>
            <h2 className="text-xl font-bold uppercase">Ya despachados</h2>
            <span className="text-[13px] text-tenue">
              {despachados.length} bultos en{' '}
              {porViajeDespachado.length}{' '}
              {porViajeDespachado.length === 1 ? 'viaje' : 'viajes'}
            </span>
          </button>

          {verDespachados && (
            <div className="mt-4 space-y-6">
              {porViajeDespachado.map(({ viaje, items: lista }) => (
                <div key={viaje?.id ?? 'sin'}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
                    <span className="font-display font-bold text-[16px]">
                      {viaje?.camion_codigo ?? 'Sin camión'}
                    </span>
                    <span className="font-codigo text-[13px] text-tenue">{viaje?.codigo}</span>
                    {viaje?.destino && (
                      <span className="text-[13px] text-tenue">→ {viaje.destino}</span>
                    )}
                    <span className="text-[13px] text-tenue">
                      {viaje?.salida_at ? `Salió ${fechaHora(viaje.salida_at)}` : 'Sin fecha de salida'}
                      {' · '}{lista.length} bultos
                    </span>
                  </div>
                  <ul className="border border-borde bg-white divide-y divide-borde">
                    {lista.map(it => (
                      <li key={it.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-[13.5px]">
                        <span className="font-codigo text-[12.5px] text-tenue">{it.codigo}</span>
                        <span className="font-semibold">{it.nombre}</span>
                        {it.cantidad > 1 && (
                          <span className="text-tenue">{it.indice}/{it.cantidad}</span>
                        )}
                        <span className="text-tenue">{indice.areas[it.area_id]?.nombre}</span>
                        <span className="ml-auto text-[12px] text-tenue">{hora(it.cargado_at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <EditorItems
        key={cargandoEn?.id ?? 'sin'}
        abierto={Boolean(cargandoEn)}
        area={cargandoEn}
        proyecto={proyecto}
        onCerrar={() => setCargandoEn(null)}
        onGuardar={cargandoEn ? guardarItems(cargandoEn) : async () => {}}
      />

      <EditorHerrajes
        key={bultoHerrajes?.item?.id ?? bultoHerrajes?.area?.id ?? 'sin'}
        abierto={Boolean(bultoHerrajes)}
        area={bultoHerrajes?.area}
        item={bultoHerrajes?.item}
        onCerrar={() => setBultoHerrajes(null)}
        onListo={recargar}
      />

      <EditorGrupo
        key={editandoGrupo?.grupo?.grupo_id ?? 'sing'}
        abierto={Boolean(editandoGrupo)}
        grupo={editandoGrupo?.grupo}
        area={editandoGrupo?.area}
        proyecto={proyecto}
        onCerrar={() => setEditandoGrupo(null)}
        onListo={recargar}
      />

      <CambiarEstado
        item={cambiandoEstado}
        viajes={viajes}
        onCerrar={() => setCambiandoEstado(null)}
        onListo={recargar}
      />

      <Confirmar
        abierto={Boolean(borrando)}
        titulo={borrando?.tipo === 'area' ? 'Borrar el área' : 'Borrar el ítem'}
        mensaje={
          borrando?.tipo === 'area'
            ? `Se borran todas las etiquetas de ${borrando?.nombre}. Los números de código no se reutilizan.`
            : `Se retira ${borrando?.nombre} de la lista. Si la etiqueta ya está impresa, deséchala.`
        }
        onConfirmar={confirmarBorrado}
        onCerrar={() => setBorrando(null)}
      />
    </div>
  )
}
