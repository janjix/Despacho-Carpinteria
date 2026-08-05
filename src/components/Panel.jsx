// Panel para el televisor del taller.
// Fondo oscuro, tipografía grande y sin scroll: se lee desde diez metros.
// Es la única vista con paleta invertida, y por eso los tres colores de
// estado saltan a la vista sin competir con nada más.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProyecto, useUltimosEscaneos } from '../hooks/useSupabase'
import { ESTADOS, esHoy, fechaCorta, hora, resumir } from '../lib/codigos'
import { Cargando } from './ui'

function estadoGrupo(items) {
  if (items.every(i => i.estado === 'cargado')) return 'cargado'
  if (items.every(i => i.estado !== 'pendiente')) return 'embalado'
  return 'pendiente'
}

function Cifra({ valor, etiqueta, color }) {
  return (
    <div>
      <div className="font-display font-extrabold leading-none text-5xl xl:text-7xl" style={{ color }}>
        {valor}
      </div>
      <div className="mt-1 font-display uppercase tracking-[0.18em] text-[11px] xl:text-[13px] text-white/45">
        {etiqueta}
      </div>
    </div>
  )
}

export default function Panel({ proyectoId, onCambiarProyecto }) {
  const [proyectos, setProyectos] = useState([])
  const { proyecto, areas, items, cargando } = useProyecto(proyectoId)
  const escaneos = useUltimosEscaneos(1)
  const ultimo = escaneos[0]

  useEffect(() => {
    supabase.from('proyectos').select('id,nombre,fecha_despacho')
      .is('deleted_at', null).eq('estado', 'activo')
      .order('fecha_despacho', { ascending: true, nullsFirst: false })
      .then(({ data }) => setProyectos(data ?? []))
  }, [])

  const total = resumir(items)

  const grupos = useMemo(() => {
    const mapa = new Map()
    for (const it of items) {
      if (!mapa.has(it.grupo_id)) mapa.set(it.grupo_id, { base: it, items: [], area: it.area_id })
      mapa.get(it.grupo_id).items.push(it)
    }
    return [...mapa.values()]
  }, [items])

  const porArea = useMemo(() => areas.map(a => {
    const suyos = items.filter(i => i.area_id === a.id)
    return { area: a, resumen: resumir(suyos), grupos: grupos.filter(g => g.area === a.id) }
  }), [areas, items, grupos])

  const alerta = proyecto && esHoy(proyecto.fecha_despacho) && total.embalado > 0

  return (
    <div className="min-h-[100dvh] bg-panel text-white panel-tv overflow-hidden flex flex-col">
      <header className="flex flex-wrap items-center gap-x-8 gap-y-3 px-6 xl:px-10 py-5 border-b border-white/10">
        <div className="min-w-0">
          <h1 className="font-display font-extrabold text-3xl xl:text-5xl truncate">
            {proyecto?.nombre ?? 'Panel de despacho'}
          </h1>
          <p className="text-white/50 text-[13px] xl:text-base mt-1">
            {proyecto?.cliente ? `${proyecto.cliente} · ` : ''}
            Despacho {fechaCorta(proyecto?.fecha_despacho)}
          </p>
        </div>

        <div className="ml-auto flex items-end gap-8 xl:gap-12">
          <Cifra valor={total.pendiente} etiqueta="Pendientes" color={ESTADOS.pendiente.hex} />
          <Cifra valor={total.embalado} etiqueta="Embalados" color={ESTADOS.embalado.hex} />
          <Cifra valor={total.cargado} etiqueta="Cargados" color={ESTADOS.cargado.hex} />
          <Cifra valor={total.total} etiqueta="Bultos" color="#FFFFFF" />
        </div>
      </header>

      {alerta && (
        <div className="bg-alerta px-6 xl:px-10 py-3 font-display font-bold uppercase tracking-wide text-lg xl:text-2xl">
          Sale hoy · quedan {total.embalado} bultos embalados sin cargar
        </div>
      )}

      {/* Barra de avance del proyecto completo */}
      {total.total > 0 && (
        <div className="flex h-3 shrink-0">
          <div style={{ width: `${(total.cargado / total.total) * 100}%`, background: ESTADOS.cargado.hex }} />
          <div style={{ width: `${(total.embalado / total.total) * 100}%`, background: ESTADOS.embalado.hex }} />
          <div style={{ width: `${(total.pendiente / total.total) * 100}%`, background: ESTADOS.pendiente.hex }} />
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-6 xl:px-10 py-6 space-y-7">
        {cargando && <Cargando texto="Conectando" />}

        {!cargando && !items.length && (
          <p className="text-white/50 text-xl py-16 text-center">
            Este proyecto todavía no tiene bultos cargados.
          </p>
        )}

        {porArea.map(({ area, resumen: r, grupos: g }) => (
          <section key={area.id}>
            <div className="flex items-baseline gap-4 mb-3">
              <h2 className="font-display font-bold uppercase text-xl xl:text-3xl">{area.nombre}</h2>
              <span className="text-white/45 text-[13px] xl:text-lg">
                {r.cargado} de {r.total} cargados
              </span>
            </div>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {g.map(grupo => {
                const estado = estadoGrupo(grupo.items)
                const e = ESTADOS[estado]
                return (
                  <div
                    key={grupo.base.grupo_id}
                    className="px-3 py-3 min-h-[76px] flex flex-col justify-between"
                    style={{
                      background: estado === 'pendiente' ? '#1E222A' : e.hex,
                      color: estado === 'embalado' ? '#3A2B00' : estado === 'cargado' ? '#FFFFFF' : '#C9CBD1'
                    }}
                  >
                    <span className="font-display font-bold leading-tight text-[15px] xl:text-xl">
                      {grupo.base.nombre}
                    </span>
                    <span className="text-[11px] xl:text-[13px] opacity-80 mt-2">
                      {grupo.items.length > 1
                        ? `${grupo.items.filter(i => i.estado === 'cargado').length}/${grupo.items.length} bultos`
                        : grupo.base.codigo.split('-').slice(-1)[0]}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </main>

      <footer className="shrink-0 border-t border-white/10 px-6 xl:px-10 py-3 flex flex-wrap items-center gap-4">
        <span className="font-display uppercase tracking-[0.18em] text-[11px] text-white/40">
          Último escaneo
        </span>
        {ultimo ? (
          <span className="text-[14px] xl:text-lg">
            <span className="font-codigo">{ultimo.codigo}</span>
            <span className="text-white/50"> · {ultimo.accion} · {ultimo.resultado} · {hora(ultimo.created_at)}</span>
          </span>
        ) : (
          <span className="text-white/40 text-[14px]">Sin movimientos todavía</span>
        )}

        <select
          value={proyectoId ?? ''}
          onChange={(e) => onCambiarProyecto(e.target.value)}
          className="ml-auto bg-panelsup text-white border border-white/20 min-h-[44px] px-3 text-[14px]"
        >
          {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </footer>
    </div>
  )
}
