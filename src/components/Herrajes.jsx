// Catálogo de herrajes.
//
// Es global: se carga una vez y se reutiliza en todos los proyectos. Por eso
// vive en su propia pantalla y no dentro de un proyecto.

import { useMemo, useState } from 'react'
import { useHerrajes } from '../hooks/useSupabase'
import { Aviso, Boton, Campo, Cargando, Confirmar, Modal, Vacio } from './ui'

const UNIDADES = ['', 'par', 'juego', 'caja', 'metro', 'kilo', 'rollo']

function Formulario({ abierto, inicial, onCerrar, onGuardar }) {
  const [c, setC] = useState(inicial ?? {})
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const v = (k) => c[k] ?? ''

  const enviar = async () => {
    if (!v('codigo').trim()) { setError('El herraje necesita un código'); return }
    if (!v('nombre').trim()) { setError('El herraje necesita un nombre'); return }
    setGuardando(true); setError(null)
    try { await onGuardar(c); onCerrar() }
    catch (e) { setError(e.message) }
    finally { setGuardando(false) }
  }

  return (
    <Modal
      abierto={abierto}
      titulo={inicial ? 'Editar herraje' : 'Nuevo herraje'}
      onCerrar={onCerrar}
      ancho="max-w-lg"
    >
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Campo
            etiqueta="Código" placeholder="BIS-035"
            value={v('codigo')} onChange={(e) => setC({ ...c, codigo: e.target.value })}
            ayuda="Corto y fijo. Es como lo pide el taller."
          />
          <Campo etiqueta="Medida" placeholder="35 mm"
            value={v('medida')} onChange={(e) => setC({ ...c, medida: e.target.value })} />
        </div>
        <Campo etiqueta="Nombre" placeholder="Bisagra recta"
          value={v('nombre')} onChange={(e) => setC({ ...c, nombre: e.target.value })} />
        <div className="grid sm:grid-cols-2 gap-4">
          <Campo etiqueta="Marca" placeholder="Blum"
            value={v('marca')} onChange={(e) => setC({ ...c, marca: e.target.value })} />
          <label className="block">
            <span className="etiqueta-campo">Unidad</span>
            <select
              className="campo"
              value={v('unidad')}
              onChange={(e) => setC({ ...c, unidad: e.target.value })}
            >
              {UNIDADES.map(u => (
                <option key={u} value={u}>{u || 'unidad suelta'}</option>
              ))}
            </select>
            <span className="block mt-1 text-[12px] text-tenue">
              Cómo se cuenta. Vacío para piezas sueltas.
            </span>
          </label>
        </div>
        <Campo etiqueta="Notas" value={v('notas')}
          onChange={(e) => setC({ ...c, notas: e.target.value })} />
        {error && <Aviso tono="alerta">{error}</Aviso>}
        <div className="flex justify-end gap-3">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="solido" onClick={enviar} disabled={guardando}>
            {guardando ? 'Guardando' : 'Guardar herraje'}
          </Boton>
        </div>
      </div>
    </Modal>
  )
}

export default function Herrajes() {
  const { herrajes, cargando, error, crear, actualizar, borrar } = useHerrajes()
  const [nuevo, setNuevo] = useState(false)
  const [editando, setEditando] = useState(null)
  const [borrando, setBorrando] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [aviso, setAviso] = useState(null)

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return herrajes
    return herrajes.filter(h =>
      [h.codigo, h.nombre, h.marca, h.medida].filter(Boolean)
        .some(t => t.toLowerCase().includes(q)))
  }, [herrajes, busqueda])

  if (cargando) return <Cargando texto="Buscando herrajes" />

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold">Herrajes</h1>
          <p className="text-tenue text-[14px] mt-1">
            Catálogo común a todos los proyectos. Desde aquí se arman los bultos
            de herrajes dentro de cada área.
          </p>
        </div>
        <Boton variante="solido" onClick={() => setNuevo(true)}>Nuevo herraje</Boton>
      </div>

      {(error || aviso) && (
        <div className="mb-6"><Aviso tono="alerta">{error ?? aviso}</Aviso></div>
      )}

      {herrajes.length > 0 && (
        <Campo
          placeholder="Buscar por código, nombre, marca o medida"
          className="mb-5 max-w-md"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      )}

      {!herrajes.length ? (
        <Vacio
          titulo="El catálogo está vacío"
          mensaje="Carga los herrajes que usas normalmente. Se escriben una vez y se reutilizan en todos los proyectos."
          accion={<Boton variante="solido" onClick={() => setNuevo(true)}>Cargar el primero</Boton>}
        />
      ) : !visibles.length ? (
        <Vacio titulo="Sin resultados" mensaje={`Nada coincide con "${busqueda}".`} />
      ) : (
        <ul className="grid gap-2">
          {visibles.map(h => (
            <li key={h.id} className="tarjeta flex items-stretch">
              <span className="riel" style={{ background: '#16181C' }} />
              <div className="flex-1 min-w-0 px-4 py-3">
                <span className="block font-display font-bold text-[17px]">
                  {h.nombre}
                  {h.medida && <span className="text-tenue font-normal"> · {h.medida}</span>}
                </span>
                <span className="block font-codigo text-[12.5px] text-tenue mt-0.5">
                  {h.codigo}
                  {h.marca && ` · ${h.marca}`}
                  {h.unidad && ` · se cuenta por ${h.unidad}`}
                </span>
              </div>
              <div className="flex items-center pr-3">
                <button onClick={() => setEditando(h)} className="link">Editar</button>
                <button onClick={() => setBorrando(h)} className="link rojo">Borrar</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Formulario abierto={nuevo} onCerrar={() => setNuevo(false)} onGuardar={crear} />
      <Formulario
        key={editando?.id ?? 'sin'}
        abierto={Boolean(editando)} inicial={editando}
        onCerrar={() => setEditando(null)}
        onGuardar={(campos) => actualizar(editando.id, campos)}
      />
      <Confirmar
        abierto={Boolean(borrando)}
        titulo="Borrar el herraje"
        mensaje={`Se quita ${borrando?.nombre ?? ''} del catálogo. Si ya está dentro de algún bulto creado, la app no dejará borrarlo.`}
        textoAccion="Borrar herraje"
        onConfirmar={async () => {
          try { await borrar(borrando.id) } catch (e) { setAviso(e.message) }
        }}
        onCerrar={() => setBorrando(null)}
      />
    </div>
  )
}
