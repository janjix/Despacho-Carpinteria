// Todas las consultas viven aquí. Ningún componente habla directo con Supabase.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'


// ---------------------------------------------------------------------
// Proyectos
// ---------------------------------------------------------------------

export function useProyectos() {
  const [proyectos, setProyectos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    const { data, error } = await supabase
      .from('proyectos')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else { setProyectos(data ?? []); setError(null) }
    setCargando(false)
  }, [])

  useEffect(() => { recargar() }, [recargar])

  // El código corto lo asigna la base, que es donde puede comprobarse que
  // nadie más lo tiene. Calcularlo aquí producía colisiones invisibles entre
  // proyectos que empiezan igual.
  const crear = useCallback(async ({ nombre, cliente, fecha_despacho }) => {
    const { data, error } = await supabase.rpc('crear_proyecto', {
      p_nombre: nombre.trim(),
      p_cliente: cliente?.trim() || null,
      p_fecha: fecha_despacho || null
    })
    if (error) throw new Error(error.message)
    await recargar()
    return Array.isArray(data) ? data[0] : data
  }, [recargar])

  const actualizar = useCallback(async (id, campos) => {
    // El código corto nunca cambia: ya está impreso en las etiquetas
    const { codigo_corto, ...parche } = campos
    const { error } = await supabase.from('proyectos').update(parche).eq('id', id)
    if (error) throw new Error(error.message)
    await recargar()
  }, [recargar])

  const borrar = useCallback(async (id) => {
    const { error } = await supabase
      .from('proyectos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(error.message)
    await recargar()
  }, [recargar])

  return { proyectos, cargando, error, recargar, crear, actualizar, borrar }
}

// ---------------------------------------------------------------------
// Un proyecto con sus áreas e ítems, en vivo
// ---------------------------------------------------------------------

export function useProyecto(proyectoId) {
  const [proyecto, setProyecto] = useState(null)
  const [areas, setAreas] = useState([])
  const [items, setItems] = useState([])
  const [viajes, setViajes] = useState({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const recargar = useCallback(async () => {
    if (!proyectoId) return
    const [p, a] = await Promise.all([
      supabase.from('proyectos').select('*').eq('id', proyectoId).single(),
      supabase.from('areas').select('*').eq('proyecto_id', proyectoId)
        .is('deleted_at', null).order('orden')
    ])
    if (p.error) { setError(p.error.message); setCargando(false); return }
    setProyecto(p.data)
    const listaAreas = a.data ?? []
    setAreas(listaAreas)

    if (listaAreas.length) {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .in('area_id', listaAreas.map(x => x.id))
        .is('deleted_at', null)
        .order('codigo')
      if (error) setError(error.message)
      else {
        setItems(data ?? [])
        // Los viajes en los que subieron estos bultos, para poder decir en
        // qué camión fue cada uno sin abrir la pantalla de camiones
        const ids = [...new Set((data ?? []).map(i => i.viaje_id).filter(Boolean))]
        if (ids.length) {
          const { data: v } = await supabase
            .from('viaje_resumen').select('*').in('id', ids)
          setViajes(Object.fromEntries((v ?? []).map(x => [x.id, x])))
        } else {
          setViajes({})
        }
      }
    } else {
      setItems([])
      setViajes({})
    }
    setCargando(false)
  }, [proyectoId])

  useEffect(() => { setCargando(true); recargar() }, [recargar])

  // Realtime: cualquier escaneo en otro dispositivo se refleja aquí
  useEffect(() => {
    if (!proyectoId || !areas.length) return
    const idsArea = new Set(areas.map(a => a.id))
    const canal = supabase
      .channel(`items-${proyectoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, (payload) => {
        const fila = payload.new ?? payload.old
        if (!fila || !idsArea.has(fila.area_id)) return
        setItems(prev => {
          if (payload.eventType === 'INSERT') {
            return prev.some(i => i.id === fila.id) ? prev : [...prev, payload.new]
          }
          if (payload.eventType === 'DELETE') return prev.filter(i => i.id !== fila.id)
          if (payload.new.deleted_at) return prev.filter(i => i.id !== fila.id)
          return prev.map(i => (i.id === fila.id ? payload.new : i))
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [proyectoId, areas])

  const indice = useMemo(() => ({
    areas: Object.fromEntries(areas.map(a => [a.id, a])),
    proyectos: proyecto ? { [proyecto.id]: proyecto } : {}
  }), [areas, proyecto])

  return { proyecto, areas, items, viajes, indice, cargando, error, recargar, setItems }
}

// ---------------------------------------------------------------------
// Áreas
// ---------------------------------------------------------------------

export async function crearArea(proyectoId, nombre, orden = 0) {
  const { data, error } = await supabase.rpc('crear_area', {
    p_proyecto: proyectoId, p_nombre: nombre.trim(), p_orden: orden
  })
  if (error) throw new Error(error.message)
  return Array.isArray(data) ? data[0] : data
}

export async function renombrarArea(areaId, nombre) {
  const { error } = await supabase
    .from('areas')
    .update({ nombre: nombre.trim() })
    .eq('id', areaId)
  if (error) throw new Error(error.message)
}

export async function borrarArea(areaId) {
  const ahora = new Date().toISOString()
  const { error: e1 } = await supabase.from('items').update({ deleted_at: ahora }).eq('area_id', areaId)
  if (e1) throw new Error(e1.message)
  const { error: e2 } = await supabase.from('areas').update({ deleted_at: ahora }).eq('id', areaId)
  if (e2) throw new Error(e2.message)
}

/** Copia un área completa con sus ítems en estado pendiente. */
export async function duplicarArea(area, items, nombreNuevo, proyectoCorto) {
  const nueva = await crearArea(area.proyecto_id, nombreNuevo, (area.orden ?? 0) + 1)
  const grupos = new Map()
  for (const it of items) {
    if (!grupos.has(it.grupo_id)) grupos.set(it.grupo_id, it)
  }
  const filas = [...grupos.values()].map(it => ({
    nombre: it.nombre,
    descripcion: it.descripcion,
    medidas: it.medidas,
    material: it.material,
    cantidad: it.cantidad,
    notas: it.notas
  }))
  if (filas.length) await crearItems(nueva, filas)
  return nueva
}

// ---------------------------------------------------------------------
// Ítems
// Una fila por etiqueta. cantidad 3 crea tres filas del mismo grupo.
// ---------------------------------------------------------------------

/**
 * Crea los ítems y sus etiquetas.
 *
 * El código se arma dentro de la transacción que inserta, no aquí. Armarlo
 * en el navegador abreviando nombres hacía que dos áreas parecidas (Vestier
 * principal y Vestidor, ambas VES) produjeran el mismo código y el insert
 * fallara con un 409 sin explicación.
 */
export async function crearItems(area, filas) {
  const limpias = filas
    .filter(f => (f.nombre ?? '').trim())
    .map(f => ({
      nombre: f.nombre.trim(),
      descripcion: f.descripcion?.trim() || null,
      medidas: f.medidas?.trim() || null,
      material: f.material?.trim() || null,
      notas: f.notas?.trim() || null,
      cantidad: Math.max(1, Number(f.cantidad) || 1)
    }))
  if (!limpias.length) return []

  const { data, error } = await supabase.rpc('crear_items', {
    p_area: area.id, p_filas: limpias
  })
  if (error) throw new Error(traducirError(error))
  return data ?? []
}

/** Mensajes de Postgres que el usuario no debería tener que descifrar. */
function traducirError(error) {
  if (error.code === '23505') {
    return 'Ese código de etiqueta ya existe. Vuelve a intentar; si se repite, ' +
           'avisa para revisar los códigos del área.'
  }
  if (error.code === '23503') {
    return 'El área o el proyecto ya no existen. Recarga la página.'
  }
  return error.message
}

/** Edita los campos comunes de todas las etiquetas de un grupo. */
export async function editarGrupo(grupoId, campos) {
  const { error } = await supabase
    .from('items')
    .update({
      nombre: campos.nombre?.trim(),
      descripcion: campos.descripcion?.trim() || null,
      medidas: campos.medidas?.trim() || null,
      material: campos.material?.trim() || null,
      notas: campos.notas?.trim() || null
    })
    .eq('grupo_id', grupoId)
    .is('deleted_at', null)
  if (error) throw new Error(error.message)
}

/**
 * Cambia la cantidad de un grupo.
 * Agrega etiquetas nuevas o retira las sobrantes, siempre empezando por
 * las que todavía están pendientes. Nunca toca una ya escaneada.
 */
export async function cambiarCantidad(grupo, area, proyectoCorto, nueva) {
  const actuales = grupo.items.slice().sort((a, b) => a.indice - b.indice)
  const objetivo = Math.max(1, Number(nueva) || 1)
  const delta = objetivo - actuales.length

  if (delta > 0) {
    // Se crean como grupo aparte y luego se unen al original, para reutilizar
    // la generación de código que sí garantiza unicidad
    const base = actuales[0]
    const { data: nuevos, error } = await supabase.rpc('crear_items', {
      p_area: area.id,
      p_filas: [{
        nombre: base.nombre, descripcion: base.descripcion,
        medidas: base.medidas, material: base.material,
        notas: base.notas, cantidad: delta
      }]
    })
    if (error) throw new Error(traducirError(error))

    const ordenados = (nuevos ?? []).sort((a, b) => a.codigo.localeCompare(b.codigo))
    for (let k = 0; k < ordenados.length; k++) {
      const { error: eUp } = await supabase.from('items')
        .update({ grupo_id: base.grupo_id, indice: actuales.length + k + 1 })
        .eq('id', ordenados[k].id)
      if (eUp) throw new Error(eUp.message)
    }
  }

  if (delta < 0) {
    const candidatos = actuales
      .filter(i => i.estado === 'pendiente')
      .sort((a, b) => b.indice - a.indice)
      .slice(0, -delta)
    if (candidatos.length < -delta) {
      throw new Error(
        'No se puede reducir la cantidad: hay etiquetas ya escaneadas. ' +
        'Revierte su estado antes de retirarlas.'
      )
    }
    const { error } = await supabase
      .from('items')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', candidatos.map(c => c.id))
    if (error) throw new Error(error.message)
  }

  const { error: eTot } = await supabase
    .from('items')
    .update({ cantidad: objetivo })
    .eq('grupo_id', grupo.grupo_id)
    .is('deleted_at', null)
  if (eTot) throw new Error(eTot.message)
}

export async function borrarGrupo(grupoId) {
  const { error } = await supabase
    .from('items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('grupo_id', grupoId)
  if (error) throw new Error(error.message)
}

export async function borrarItem(itemId) {
  const { error } = await supabase
    .from('items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', itemId)
  if (error) throw new Error(error.message)
}

export async function marcarImpresas(ids) {
  if (!ids.length) return
  const { error } = await supabase
    .from('items')
    .update({ impresa_at: new Date().toISOString(), desactualizada: false })
    .in('id', ids)
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------
// Escaneo y reversión
// ---------------------------------------------------------------------

export async function registrarEscaneo(codigo, modo, viajeId = null) {
  const { data, error } = await supabase.rpc('escanear', {
    p_codigo: codigo, p_modo: modo, p_viaje: viajeId
  })
  if (error) throw new Error(error.message)
  return data
}

export async function revertirItem(itemId) {
  const { data, error } = await supabase.rpc('revertir_item', { p_item: itemId })
  if (error) throw new Error(error.message)
  return data
}

// ---------------------------------------------------------------------
// Bitácora
// ---------------------------------------------------------------------

export function useUltimosEscaneos(limite = 8) {
  const [escaneos, setEscaneos] = useState([])

  useEffect(() => {
    let vivo = true
    const cargar = async () => {
      const { data } = await supabase
        .from('escaneos').select('*')
        .order('created_at', { ascending: false }).limit(limite)
      if (vivo) setEscaneos(data ?? [])
    }
    cargar()
    const canal = supabase
      .channel('escaneos-vivo')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'escaneos' },
        ({ new: fila }) => setEscaneos(prev => [fila, ...prev].slice(0, limite)))
      .subscribe()
    return () => { vivo = false; supabase.removeChannel(canal) }
  }, [limite])

  return escaneos
}

// ---------------------------------------------------------------------
// Camiones y viajes
//
// El camión es el vehículo y existe entre viaje y viaje. El viaje es una
// carga concreta con su fecha y su contenido. Guardar el camión directo en
// el ítem habría perdido el historial: al segundo viaje ya no se sabría qué
// llevó el primero.
// ---------------------------------------------------------------------

export function useCamiones() {
  const [camiones, setCamiones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const recargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('camiones').select('*')
      .is('deleted_at', null)
      .order('codigo')
    if (error) setError(error.message)
    else { setCamiones(data ?? []); setError(null) }
    setCargando(false)
  }, [])

  useEffect(() => { recargar() }, [recargar])

  const crear = useCallback(async (campos) => {
    const { data, error } = await supabase.from('camiones').insert({
      codigo: campos.codigo.trim().toUpperCase(),
      nombre: campos.nombre?.trim() || null,
      placa: campos.placa?.trim().toUpperCase() || null,
      conductor: campos.conductor?.trim() || null,
      telefono: campos.telefono?.trim() || null,
      capacidad: campos.capacidad?.trim() || null,
      notas: campos.notas?.trim() || null
    }).select().single()
    if (error) {
      throw new Error(
        error.code === '23505'
          ? `Ya existe un camión con el código ${campos.codigo.toUpperCase()}`
          : error.message
      )
    }
    await recargar()
    return data
  }, [recargar])

  const actualizar = useCallback(async (id, campos) => {
    const { error } = await supabase.from('camiones').update(campos).eq('id', id)
    if (error) throw new Error(error.message)
    await recargar()
  }, [recargar])

  const borrar = useCallback(async (id) => {
    const { error } = await supabase.from('camiones')
      .update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) throw new Error(error.message)
    await recargar()
  }, [recargar])

  return { camiones, cargando, error, recargar, crear, actualizar, borrar }
}

/** Resumen de viajes, opcionalmente filtrado por camión. */
export function useViajes(camionId = null) {
  const [viajes, setViajes] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    let consulta = supabase.from('viaje_resumen').select('*')
    if (camionId) consulta = consulta.eq('camion_id', camionId)
    const { data } = await consulta.order('created_at', { ascending: false })
    setViajes(data ?? [])
    setCargando(false)
  }, [camionId])

  useEffect(() => { recargar() }, [recargar])

  useEffect(() => {
    const canal = supabase
      .channel(`viajes-${camionId ?? 'todos'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' }, recargar)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'items' }, recargar)
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [camionId, recargar])

  return { viajes, cargando, recargar }
}

/** Viajes que todavía admiten carga. Es lo que ofrece la pantalla de escaneo. */
export function useViajesAbiertos() {
  const [viajes, setViajes] = useState([])

  const recargar = useCallback(async () => {
    const { data } = await supabase
      .from('viaje_resumen').select('*')
      .in('estado', ['cargando', 'despachado'])
      .order('created_at', { ascending: false })
    setViajes(data ?? [])
  }, [])

  useEffect(() => { recargar() }, [recargar])

  useEffect(() => {
    const canal = supabase
      .channel('viajes-abiertos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' }, recargar)
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [recargar])

  return { viajes, recargar }
}

export async function crearViaje(camionId, destino) {
  const { data: codigo, error: eCod } = await supabase.rpc('siguiente_codigo_viaje')
  if (eCod) throw new Error(eCod.message)
  const { data, error } = await supabase.from('viajes')
    .insert({ camion_id: camionId, codigo, destino: destino?.trim() || null })
    .select().single()
  if (error) throw new Error(error.message)
  return data
}

export async function cambiarEstadoViaje(viajeId, estado) {
  const parche = { estado }
  if (estado === 'despachado') parche.salida_at = new Date().toISOString()
  if (estado === 'entregado') parche.entrega_at = new Date().toISOString()
  const { error } = await supabase.from('viajes').update(parche).eq('id', viajeId)
  if (error) throw new Error(error.message)
}

export async function editarViaje(viajeId, campos) {
  const { error } = await supabase.from('viajes').update(campos).eq('id', viajeId)
  if (error) throw new Error(error.message)
}

export async function borrarViaje(viajeId) {
  // Los bultos vuelven a embalado: el viaje deja de existir, la carga no
  const { error: e1 } = await supabase
    .from('items')
    .update({ estado: 'embalado', cargado_at: null, viaje_id: null })
    .eq('viaje_id', viajeId)
  if (e1) throw new Error(e1.message)
  const { error } = await supabase.from('viajes')
    .update({ deleted_at: new Date().toISOString() }).eq('id', viajeId)
  if (error) throw new Error(error.message)
}

export async function contenidoViaje(viajeId) {
  const { data, error } = await supabase
    .from('viaje_contenido').select('*')
    .eq('viaje_id', viajeId)
    .not('item_id', 'is', null)
    .order('item_codigo')
  if (error) throw new Error(error.message)
  return data ?? []
}

// ---------------------------------------------------------------------
// Anulación de escaneos
// ---------------------------------------------------------------------

/**
 * Deshace un escaneo dejando constancia. No es una corrección silenciosa:
 * el motivo queda en la bitácora junto al estado del que venía.
 */
export async function anularEscaneo(itemId, motivo, hastaPendiente = false) {
  const { data, error } = await supabase.rpc('anular_escaneo', {
    p_item: itemId,
    p_motivo: motivo ?? null,
    p_todo: hastaPendiente
  })
  if (error) throw new Error(error.message)
  return data
}

// ---------------------------------------------------------------------
// Bultos cargados que quedaron sin camión
//
// Pasa cuando alguien escanea la segunda lectura sin viaje activo. La app no
// lo rechaza a propósito: el operario está lejos de la pantalla y no vería el
// rechazo, así que es mejor registrar el hecho y arreglar la asignación
// después que perder el escaneo entero.
// ---------------------------------------------------------------------

export function useItemsSinViaje() {
  const [items, setItems] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    const { data } = await supabase
      .from('items_sin_viaje').select('*')
      .order('cargado_at', { ascending: false })
    setItems(data ?? [])
    setCargando(false)
  }, [])

  useEffect(() => { recargar() }, [recargar])

  useEffect(() => {
    const canal = supabase
      .channel('sin-viaje')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'items' }, recargar)
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [recargar])

  return { items, cargando, recargar }
}

export async function asignarAViaje(viajeId, itemIds) {
  if (!itemIds.length) return 0
  const { data, error } = await supabase.rpc('asignar_a_viaje', {
    p_viaje: viajeId, p_items: itemIds
  })
  if (error) throw new Error(error.message)
  return data
}

/**
 * Lleva un ítem a cualquier estado, con motivo. Distinto de anularEscaneo,
 * que solo retrocede un paso. Queda en la bitácora igual que un escaneo:
 * la app no debería tener puertas traseras silenciosas.
 */
export async function cambiarEstadoItem(itemId, estado, motivo, viajeId = null) {
  const { data, error } = await supabase.rpc('cambiar_estado_item', {
    p_item: itemId, p_estado: estado,
    p_motivo: motivo ?? null, p_viaje: viajeId
  })
  if (error) throw new Error(error.message)
  return data
}
