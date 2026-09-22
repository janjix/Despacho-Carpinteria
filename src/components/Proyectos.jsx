import { useState } from 'react'
import { useProyectos } from '../hooks/useSupabase'
import { Aviso, Boton, Campo, Cargando, Confirmar, Modal, Vacio } from './ui'
import { esHoy, fechaCorta } from '../lib/codigos'

function FormularioProyecto({ abierto, onCerrar, inicial, onGuardar }) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [cliente, setCliente] = useState(inicial?.cliente ?? '')
  const [fecha, setFecha] = useState(inicial?.fecha_despacho ?? '')
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const enviar = async () => {
    if (!nombre.trim()) { setError('El proyecto necesita un nombre'); return }
    setGuardando(true); setError(null)
    try {
      await onGuardar({ nombre, cliente, fecha_despacho: fecha || null })
      onCerrar()
    } catch (e) { setError(e.message) } finally { setGuardando(false) }
  }

  return (
    <Modal abierto={abierto} titulo={inicial ? 'Editar proyecto' : 'Nuevo proyecto'} onCerrar={onCerrar} ancho="max-w-lg">
      <div className="space-y-4">
        <Campo
          etiqueta="Nombre del proyecto"
          placeholder="Casa Montaña 12"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          ayuda="Las primeras cinco letras entran en el código de barras"
        />
        <Campo etiqueta="Cliente" placeholder="MS Arquitectura" value={cliente} onChange={(e) => setCliente(e.target.value)} />
        <Campo etiqueta="Fecha de despacho" type="date" value={fecha ?? ''} onChange={(e) => setFecha(e.target.value)} />
        {error && <Aviso tono="alerta">{error}</Aviso>}
        <div className="flex justify-end gap-3 pt-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="solido" onClick={enviar} disabled={guardando}>
            {guardando ? 'Guardando' : 'Guardar proyecto'}
          </Boton>
        </div>
      </div>
    </Modal>
  )
}

export default function Proyectos({ onAbrir }) {
  const { proyectos, cargando, error, crear, actualizar, borrar } = useProyectos()
  const [nuevo, setNuevo] = useState(false)
  const [editando, setEditando] = useState(null)
  const [borrando, setBorrando] = useState(null)

  if (cargando) return <Cargando texto="Buscando proyectos" />

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold">Proyectos</h1>
          <p className="text-tenue text-[14px] mt-1">
            Cada proyecto agrupa sus áreas, sus etiquetas y sus dos listas.
          </p>
        </div>
        <Boton variante="solido" onClick={() => setNuevo(true)}>Nuevo proyecto</Boton>
      </div>

      {error && <div className="mb-6"><Aviso tono="alerta">{error}</Aviso></div>}

      {!proyectos.length ? (
        <Vacio
          titulo="Todavía no hay proyectos"
          mensaje="Crea el primero para empezar a cargar áreas, generar etiquetas y controlar el despacho."
          accion={<Boton variante="solido" onClick={() => setNuevo(true)}>Crear el primer proyecto</Boton>}
        />
      ) : (
        <ul className="grid gap-3">
          {proyectos.map(p => (
            <li key={p.id} className="tarjeta flex items-stretch">
              <span
                className="riel"
                style={{ background: esHoy(p.fecha_despacho) ? '#C42B2B' : '#16181C' }}
              />
              <button
                onClick={() => onAbrir(p.id)}
                className="flex-1 text-left px-4 sm:px-5 py-4 hover:bg-papel min-h-[48px]"
              >
                <span className="block text-lg font-display font-bold">{p.nombre}</span>
                <span className="block text-[13px] text-tenue mt-0.5">
                  {p.cliente ? `${p.cliente} · ` : ''}
                  Despacho {fechaCorta(p.fecha_despacho)}
                  {esHoy(p.fecha_despacho) && (
                    <span className="ml-2 font-semibold text-alerta uppercase">Sale hoy</span>
                  )}
                </span>
              </button>
              <div className="flex items-center gap-1 pr-3">
                <button
                  onClick={() => setEditando(p)}
                  className="min-h-[44px] px-3 text-[13px] font-display uppercase tracking-wide text-tenue hover:text-tinta"
                >Editar</button>
                <button
                  onClick={() => setBorrando(p)}
                  className="min-h-[44px] px-3 text-[13px] font-display uppercase tracking-wide text-tenue hover:text-alerta"
                >Borrar</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <FormularioProyecto abierto={nuevo} onCerrar={() => setNuevo(false)} onGuardar={crear} />
      <FormularioProyecto
        key={editando?.id ?? 'sin'}
        abierto={Boolean(editando)}
        inicial={editando}
        onCerrar={() => setEditando(null)}
        onGuardar={(campos) => actualizar(editando.id, campos)}
      />
      <Confirmar
        abierto={Boolean(borrando)}
        titulo="Borrar el proyecto"
        mensaje={`Se borran también las áreas y todas las etiquetas de ${borrando?.nombre ?? ''}. Los registros quedan archivados en la base de datos, pero desaparecen de la app.`}
        textoAccion="Borrar proyecto"
        onConfirmar={() => borrar(borrando.id)}
        onCerrar={() => setBorrando(null)}
      />
    </div>
  )
}
