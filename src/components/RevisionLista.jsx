// Panel de revisión. Se muestra sobre la tabla, antes de crear etiquetas.
//
// No bloquea nada. Su trabajo es que un nombre mal leído o una línea pegada
// dos veces no pasen desapercibidos entre sesenta renglones iguales.

import { fusionarRepetidos, revisar } from '../lib/revisarFilas'
import { Boton } from './ui'

const TITULO_PARECIDO = {
  opuestos: 'Se diferencian por el lado',
  extra: 'Uno es el otro más una palabra',
  letra: 'Una sola letra de diferencia'
}

export default function RevisionLista({ filas, onCambiar }) {
  const r = revisar(filas)
  if (!r.filas) return null

  return (
    <div className="space-y-3">
      <p className="text-[14px]">
        <strong>{r.filas}</strong> renglones · <strong>{r.etiquetas}</strong> etiquetas
        {!r.hayQueMirar && (
          <span className="text-tenue"> · sin nombres repetidos ni parecidos</span>
        )}
      </p>

      {r.repetidos.length > 0 && (
        <div className="border border-borde border-l-4 border-l-embalado bg-white px-4 py-3">
          <p className="font-display font-semibold text-[13px] uppercase tracking-wide mb-2">
            Nombres repetidos
          </p>
          <ul className="text-[13.5px] space-y-1 mb-3">
            {r.repetidos.map((g, i) => (
              <li key={i}>
                <span className="font-semibold">{g.nombre}</span>
                <span className="text-tenue"> aparece {g.lineas.length} veces</span>
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-tenue mb-3">
            Se dejan tal cual: dos muebles pueden llamarse igual y son dos bultos
            distintos, cada uno con su etiqueta y su código. Únelos solo si sabes
            que la lista trae la línea duplicada por error.
          </p>
          <Boton onClick={() => onCambiar(fusionarRepetidos(filas))}>
            Unir los repetidos en un solo renglón
          </Boton>
        </div>
      )}

      {r.parecidos.length > 0 && (
        <div className="border border-borde border-l-4 border-l-alerta bg-white px-4 py-3">
          <p className="font-display font-semibold text-[13px] uppercase tracking-wide mb-2">
            Nombres parecidos, revísalos
          </p>
          <ul className="text-[13.5px] space-y-1.5">
            {r.parecidos.map((a, i) => (
              <li key={i}>
                <span className="font-semibold">{filas[a.a]?.nombre}</span>
                <span className="text-tenue"> contra </span>
                <span className="font-semibold">{filas[a.b]?.nombre}</span>
                <span className="block text-[12.5px] text-tenue">
                  {TITULO_PARECIDO[a.tipo]}: {a.detalle}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-tenue mt-3">
            Puede estar bien. Un lado izquierdo y uno derecho son dos muebles
            reales. Pero una letra de diferencia suele ser un error de lectura.
          </p>
        </div>
      )}
    </div>
  )
}
