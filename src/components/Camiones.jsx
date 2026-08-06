// Camiones y viajes.
//
// El camión es el vehículo; el viaje es una carga concreta. Por eso la vista
// de un camión es su historial: qué lleva ahora y qué llevó antes, cada carga
// con su fecha, su destino y sus bultos.

import { useEffect, useState } from 'react'
import {
  borrarViaje, cambiarEstadoViaje, contenidoViaje, crearViaje,
  useCamiones, useViajes
} from '../hooks/useSupabase'
import { fechaHora, hora } from '../lib/codigos'
import { Aviso, Boton, Campo, Cargando, Confirmar, Modal, Vacio } from './ui'

const ESTADO_VIAJE = {
  cargando:   { texto: 'Cargando',   fondo: '#FDF3D8', color: '#5C4300' },
  despachado: { texto: 'En camino',  fondo: '#E2ECF7', color: '#123A5E' },
  entregado:  { texto: 'Entregado',  fondo: '#DDF2E6', color: '#0E4B29' },
  anulado:    { texto: 'Anulado',    fondo: '#FBEAEA', color: '#7A1B1B' }
}

function Sello({ estado }) {
  const e = ESTADO_VIAJE[estado] ?? ESTADO_VIAJE.cargando
  return (
    <span
      className="inline-flex items-center px-2 py-1 text-[11px] font-display font-semibold uppercase tracking-wider"
      style={{ background: e.fondo, color: e.color }}
    >
      {e.texto}
    </span>
  )
}

// ---------------------------------------------------------------------

function FormularioCamion({ abierto, inicial, onCerrar, onGuardar }) {
  const [c, setC] = useState(inicial ?? {})
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const v = (k) => c[k] ?? ''

  const enviar = async () => {
    if (!v('codigo').trim()) { setError('El camión necesita un código'); return }
    setGuardando(true); setError(null)
    try { await onGuardar(c); onCerrar() }
    catch (e) { setError(e.message) }
    finally { setGuardando(false) }
  }

  return (
    <Modal abierto={abierto} titulo={inicial ? 'Editar camión' : 'Nuevo camión'} onCerrar={onCerrar} ancho="max-w-lg">
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Campo
            etiqueta="Código" placeholder="CAM-01"
            value={v('codigo')} onChange={(e) => setC({ ...c, codigo: e.target.value })}
            ayuda="Corto y fijo. Es como lo va a nombrar el taller."
          />
          <Campo etiqueta="Placa" placeholder="A12BC3D"
            value={v('placa')} onChange={(e) => setC({ ...c, placa: e.target.value })} />
        </div>
        <Campo etiqueta="Descripción" placeholder="Ford 350 blanco, cava cerrada"
          value={v('nombre')} onChange={(e) => setC({ ...c, nombre: e.target.value })} />
        <div className="grid sm:grid-cols-2 gap-4">
          <Campo etiqueta="Conductor" value={v('conductor')}
            onChange={(e) => setC({ ...c, conductor: e.target.value })} />
          <Campo etiqueta="Teléfono" value={v('telefono')}
            onChange={(e) => setC({ ...c, telefono: e.target.value })} />
        </div>
        <Campo etiqueta="Capacidad" placeholder="3,5 toneladas"
          value={v('capacidad')} onChange={(e) => setC({ ...c, capacidad: e.target.value })} />
        {error && <Aviso tono="alerta">{error}</Aviso>}
        <div className="flex justify-end gap-3">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="solido" onClick={enviar} disabled={guardando}>
            {guardando ? 'Guardando' : 'Guardar camión'}
          </Boton>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------

function DetalleViaje({ viaje, onCerrar, onCambio }) {
  const [contenido, setContenido] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!viaje) return
    contenidoViaje(viaje.id).then(setContenido).catch(e => setError(e.message))
  }, [viaje])

  if (!viaje) return null

  const porProyecto = new Map()
  for (const c of contenido ?? []) {
    const clave = c.proyecto ?? 'Sin proyecto'
    if (!porProyecto.has(clave)) porProyecto.set(clave, [])
    porProyecto.get(clave).push(c)
  }

  return (
    <Modal abierto titulo={`Viaje ${viaje.codigo}`} onCerrar={onCerrar} ancho="max-w-3xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Sello estado={viaje.estado} />
          <span className="text-[14px]">
            {viaje.camion_codigo}
            {viaje.placa && <span className="text-tenue"> · {viaje.placa}</span>}
            {viaje.conductor && <span className="text-tenue"> · {viaje.conductor}</span>}
          </span>
          {viaje.destino && <span className="text-[14px] text-tenue">→ {viaje.destino}</span>}
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[13px]">
          <div><dt className="etiqueta-campo">Bultos</dt><dd className="text-lg font-bold">{viaje.bultos}</dd></div>
          <div><dt className="etiqueta-campo">Proyectos</dt><dd className="text-lg font-bold">{viaje.proyectos}</dd></div>
          <div><dt className="etiqueta-campo">Primer escaneo</dt><dd>{hora(viaje.primer_escaneo) || '—'}</dd></div>
          <div><dt className="etiqueta-campo">Salida</dt><dd>{viaje.salida_at ? fechaHora(viaje.salida_at) : '—'}</dd></div>
        </dl>

        <div className="flex flex-wrap gap-3">
          {viaje.estado === 'cargando' && (
            <Boton variante="solido" onClick={async () => {
              await cambiarEstadoViaje(viaje.id, 'despachado'); onCambio()
            }}>Marcar como despachado</Boton>
          )}
          {viaje.estado === 'despachado' && (
            <Boton variante="solido" onClick={async () => {
              await cambiarEstadoViaje(viaje.id, 'entregado'); onCambio()
            }}>Marcar como entregado</Boton>
          )}
          {viaje.estado === 'entregado' && (
            <Boton onClick={async () => {
              await cambiarEstadoViaje(viaje.id, 'despachado'); onCambio()
            }}>Reabrir como en camino</Boton>
          )}
        </div>

        {error && <Aviso tono="alerta">{error}</Aviso>}

        {contenido === null ? (
          <Cargando texto="Buscando la carga" />
        ) : !contenido.length ? (
          <Vacio
            titulo="Este viaje está vacío"
            mensaje="Todavía no se escaneó ningún bulto contra él. En la pantalla de escaneo, modo Carga, elige este viaje antes de leer las etiquetas."
          />
        ) : (
          <div className="space-y-4">
            {[...porProyecto.entries()].map(([proyecto, lista]) => (
              <section key={proyecto}>
                <h3 className="font-display font-bold uppercase text-[15px] mb-2">
                  {proyecto}
                  <span className="ml-2 text-tenue font-normal normal-case text-[13px]">
                    {lista.length} bultos
                  </span>
                </h3>
                <ul className="border border-borde bg-white divide-y divide-borde">
                  {lista.map(c => (
                    <li key={c.item_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-[13.5px]">
                      <span className="font-codigo text-[12.5px] text-tenue">{c.item_codigo}</span>
                      <span className="font-semibold">{c.item}</span>
                      {c.cantidad > 1 && <span className="text-tenue">{c.indice}/{c.cantidad}</span>}
                      {c.area && <span className="text-tenue">{c.area}</span>}
                      <span className="ml-auto text-[12px] text-tenue">{hora(c.cargado_at)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------

function Camion({ camion, onVolver, onEditar }) {
  const { viajes, cargando, recargar } = useViajes(camion.id)
  const [abierto, setAbierto] = useState(null)
  const [destino, setDestino] = useState('')
  const [borrando, setBorrando] = useState(null)
  const [error, setError] = useState(null)

  const enCurso = viajes.filter(v => v.estado === 'cargando' || v.estado === 'despachado')
  const cerrados = viajes.filter(v => v.estado === 'entregado' || v.estado === 'anulado')

  const nuevo = async () => {
    try { await crearViaje(camion.id, destino); setDestino(''); await recargar() }
    catch (e) { setError(e.message) }
  }

  const Fila = ({ v }) => (
    <li className="tarjeta flex items-stretch">
      <span className="riel" style={{ background: ESTADO_VIAJE[v.estado]?.color ?? '#8A857C' }} />
      <button onClick={() => setAbierto(v)} className="flex-1 text-left px-4 py-3 hover:bg-papel">
        <span className="flex flex-wrap items-center gap-3">
          <span className="font-codigo font-semibold">{v.codigo}</span>
          <Sello estado={v.estado} />
          <span className="text-[14px]">{v.bultos} bultos</span>
          {v.destino && <span className="text-[13px] text-tenue">→ {v.destino}</span>}
        </span>
        <span className="block text-[12.5px] text-tenue mt-1">
          Creado {fechaHora(v.created_at)}
          {v.salida_at && ` · salió ${fechaHora(v.salida_at)}`}
          {v.entrega_at && ` · entregado ${fechaHora(v.entrega_at)}`}
        </span>
      </button>
      <div className="flex items-center pr-3">
        <button onClick={() => setBorrando(v)}
          className="min-h-[44px] px-3 text-[13px] font-display uppercase tracking-wide text-tenue hover:text-alerta">
          Borrar
        </button>
      </div>
    </li>
  )

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <button onClick={onVolver} className="link" style={{ paddingLeft: 0 }}>← Todos los camiones</button>

      <header className="mt-3 mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold">{camion.codigo}</h1>
          <p className="text-tenue text-[14px] mt-1">
            {[camion.nombre, camion.placa, camion.conductor, camion.capacidad]
              .filter(Boolean).join(' · ') || 'Sin datos adicionales'}
          </p>
        </div>
        <Boton onClick={() => onEditar(camion)}>Editar camión</Boton>
      </header>

      <div className="flex flex-wrap gap-2 items-end pb-6 mb-6 border-b border-borde">
        <Campo
          etiqueta="Abrir un viaje nuevo" placeholder="Destino: Obra Cafetal"
          className="w-full sm:w-80" value={destino}
          onChange={(e) => setDestino(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && nuevo()}
        />
        <Boton variante="solido" onClick={nuevo} className="mb-1">Abrir viaje</Boton>
      </div>

      {error && <div className="mb-5"><Aviso tono="alerta">{error}</Aviso></div>}
      {cargando && <Cargando texto="Buscando viajes" />}

      {!cargando && !viajes.length && (
        <Vacio
          titulo="Este camión no ha hecho viajes"
          mensaje="Abre uno para poder escanear bultos contra él desde la pantalla de carga."
        />
      )}

      {enCurso.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-bold uppercase mb-3">Lleva ahora</h2>
          <ul className="grid gap-2">{enCurso.map(v => <Fila key={v.id} v={v} />)}</ul>
        </section>
      )}

      {cerrados.length > 0 && (
        <section>
          <h2 className="text-xl font-bold uppercase mb-3">Llevó antes</h2>
          <ul className="grid gap-2">{cerrados.map(v => <Fila key={v.id} v={v} />)}</ul>
        </section>
      )}

      {abierto && (
        <DetalleViaje
          viaje={abierto}
          onCerrar={() => setAbierto(null)}
          onCambio={async () => { await recargar(); setAbierto(null) }}
        />
      )}

      <Confirmar
        abierto={Boolean(borrando)}
        titulo="Borrar el viaje"
        mensaje={`Los ${borrando?.bultos ?? 0} bultos de ${borrando?.codigo ?? ''} vuelven a estado embalado y quedan libres para cargarse en otro viaje. El registro del viaje desaparece de la app.`}
        textoAccion="Borrar viaje"
        onConfirmar={async () => { await borrarViaje(borrando.id); await recargar() }}
        onCerrar={() => setBorrando(null)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------

export default function Camiones({ camionId, onAbrir, onVolver }) {
  const { camiones, cargando, error, crear, actualizar, borrar } = useCamiones()
  const [nuevo, setNuevo] = useState(false)
  const [editando, setEditando] = useState(null)
  const [borrando, setBorrando] = useState(null)

  if (cargando) return <Cargando texto="Buscando camiones" />

  const seleccionado = camiones.find(c => c.id === camionId)
  if (camionId && seleccionado) {
    return (
      <>
        <Camion camion={seleccionado} onVolver={onVolver} onEditar={setEditando} />
        <FormularioCamion
          key={editando?.id ?? 'sin'}
          abierto={Boolean(editando)} inicial={editando}
          onCerrar={() => setEditando(null)}
          onGuardar={(campos) => actualizar(editando.id, campos)}
        />
      </>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold">Camiones</h1>
          <p className="text-tenue text-[14px] mt-1">
            Cada camión guarda su historial de viajes con el contenido de cada carga.
          </p>
        </div>
        <Boton variante="solido" onClick={() => setNuevo(true)}>Nuevo camión</Boton>
      </div>

      {error && <div className="mb-6"><Aviso tono="alerta">{error}</Aviso></div>}

      {!camiones.length ? (
        <Vacio
          titulo="Todavía no hay camiones"
          mensaje="Registra al menos uno. Sin camión no se puede abrir un viaje, y sin viaje la pantalla de carga no deja escanear."
          accion={<Boton variante="solido" onClick={() => setNuevo(true)}>Registrar el primero</Boton>}
        />
      ) : (
        <ul className="grid gap-3">
          {camiones.map(c => (
            <li key={c.id} className="tarjeta flex items-stretch">
              <span className="riel" style={{ background: c.activo ? '#16181C' : '#8A857C' }} />
              <button onClick={() => onAbrir(c.id)} className="flex-1 text-left px-4 sm:px-5 py-4 hover:bg-papel">
                <span className="block text-lg font-display font-bold">
                  {c.codigo}
                  {c.placa && <span className="ml-3 font-codigo text-[13px] text-tenue">{c.placa}</span>}
                </span>
                <span className="block text-[13px] text-tenue mt-0.5">
                  {[c.nombre, c.conductor, c.capacidad].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
                </span>
              </button>
              <div className="flex items-center pr-3">
                <button onClick={() => setEditando(c)} className="link">Editar</button>
                <button onClick={() => setBorrando(c)} className="link rojo">Borrar</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <FormularioCamion abierto={nuevo} onCerrar={() => setNuevo(false)} onGuardar={crear} />
      <FormularioCamion
        key={editando?.id ?? 'sin'}
        abierto={Boolean(editando)} inicial={editando}
        onCerrar={() => setEditando(null)}
        onGuardar={(campos) => actualizar(editando.id, campos)}
      />
      <Confirmar
        abierto={Boolean(borrando)}
        titulo="Borrar el camión"
        mensaje={`Se borra ${borrando?.codigo ?? ''} junto con su historial de viajes. Los bultos que llevó conservan su estado, pero pierden el rastro de en qué camión subieron.`}
        textoAccion="Borrar camión"
        onConfirmar={() => borrar(borrando.id)}
        onCerrar={() => setBorrando(null)}
      />
    </div>
  )
}
