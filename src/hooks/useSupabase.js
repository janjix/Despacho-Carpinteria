// Todas las consultas viven aquí. Ningún componente habla directo con Supabase.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { abreviar, armarCodigo } from '../lib/codigos'

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

  const crear = useCallback(async ({ nombre, cliente, fecha_despacho }) => {
    const { data, error } = await supabase
      .from('proyectos')
      .insert({
        nombre: nombre.trim(),
        cliente: cliente?.trim() || null,
        codigo_corto: abreviar(nombre, 5),
        fecha_despacho: fecha_despacho || null
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    await recargar()
    return data
  }, [recargar])

  const actualizar = useCallback(async (id, campos) => {
    const parche = { ...campos }
    if (campos.nombre) parche.codigo_corto = abreviar(campos.nombre, 5)
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
      else setItems(data ?? [])
    } else {
      setItems([])
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

  return { proyecto, areas, items, indice, cargando, error, recargar, setItems }
}

// ---------------------------------------------------------------------
// Áreas
// ---------------------------------------------------------------------

export async function crearArea(proyectoId, nombre, orden = 0) {
  const { data, error } = await supabase
    .from('areas')
    .insert({
      proyecto_id: proyectoId,
      nombre: nombre.trim(),
      codigo_corto: abreviar(nombre, 3),
      orden
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
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
  if (filas.length) await crearItems(nueva, filas, proyectoCorto)
  return nueva
}

// ---------------------------------------------------------------------
// Ítems
// Una fila por etiqueta. cantidad 3 crea tres filas del mismo grupo.
// ---------------------------------------------------------------------

export async function crearItems(area, filas, proyectoCorto) {
  const corto = proyectoCorto ?? area.codigo_proyecto_corto
  if (!corto) throw new Error('Falta el código corto del proyecto')

  const totalEtiquetas = filas.reduce((s, f) => s + Math.max(1, Number(f.cantidad) || 1), 0)
  if (!totalEtiquetas) return []

  const { data: inicio, error: eNum } = await supabase.rpc('reservar_correlativo', {
    p_area: area.id,
    p_cantidad: totalEtiquetas
  })
  if (eNum) throw new Error(eNum.message)

  let n = inicio
  const registros = []
  for (const fila of filas) {
    const cantidad = Math.max(1, Number(fila.cantidad) || 1)
    const grupo = crypto.randomUUID()
    for (let i = 1; i <= cantidad; i++) {
      registros.push({
        area_id: area.id,
        grupo_id: grupo,
        codigo: armarCodigo(corto, area.codigo_corto, n++),
        nombre: (fila.nombre ?? '').trim() || 'Sin nombre',
        descripcion: fila.descripcion?.trim() || null,
        medidas: fila.medidas?.trim() || null,
        material: fila.material?.trim() || null,
        notas: fila.notas?.trim() || null,
        cantidad,
        indice: i
      })
    }
  }

  const { data, error } = await supabase.from('items').insert(registros).select()
  if (error) throw new Error(error.message)
  return data
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
    const { data: inicio, error } = await supabase.rpc('reservar_correlativo', {
      p_area: area.id, p_cantidad: delta
    })
    if (error) throw new Error(error.message)
    const base = actuales[0]
    let n = inicio
    const nuevos = []
    for (let i = actuales.length + 1; i <= objetivo; i++) {
      nuevos.push({
        area_id: area.id,
        grupo_id: base.grupo_id,
        codigo: armarCodigo(proyectoCorto, area.codigo_corto, n++),
        nombre: base.nombre,
        descripcion: base.descripcion,
        medidas: base.medidas,
        material: base.material,
        notas: base.notas,
        cantidad: objetivo,
        indice: i
      })
    }
    const { error: eIns } = await supabase.from('items').insert(nuevos)
    if (eIns) throw new Error(eIns.message)
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

export async function registrarEscaneo(codigo, modo) {
  const { data, error } = await supabase.rpc('escanear', { p_codigo: codigo, p_modo: modo })
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
