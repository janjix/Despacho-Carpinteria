// Revisión de la lista antes de generar etiquetas.
//
// Regla de fondo: una línea es una etiqueta. Nada se fusiona automáticamente.
//
// El motivo es concreto. En un listado de muebles los nombres se diferencian
// por partículas cortas: IZQ y DER, un número al final, un SUP o un INF. Si el
// programa junta dos filas porque le parecen iguales, el error no se ve: la
// cuenta de bultos sigue cuadrando y el mueble que falta aparece en obra.
//
// Aquí no se decide nada. Se marcan los casos dudosos y decide el usuario.

const OPUESTOS = [
  ['IZQ', 'DER'], ['IZQUIERDA', 'DERECHA'], ['IZQUIERDO', 'DERECHO'],
  ['SUP', 'INF'], ['SUPERIOR', 'INFERIOR'], ['ALTO', 'BAJO'],
  ['FRONTAL', 'POSTERIOR'], ['DELANTERO', 'TRASERO'],
  ['INTERNO', 'EXTERNO'], ['INTERIOR', 'EXTERIOR']
]

/** Solo para comparar: quita acentos y unifica mayúsculas y espacios. */
export function normalizar(texto) {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function fichas(nombre) {
  return normalizar(nombre).split(' ').filter(Boolean)
}

/**
 * Nombres que aparecen más de una vez, escritos exactamente igual.
 * Puede ser correcto: dos módulos gemelos suelen llamarse igual. También
 * puede ser una línea pegada dos veces. Por eso se muestra y no se resuelve.
 */
export function repetidos(filas) {
  const cuenta = new Map()
  filas.forEach((f, i) => {
    const clave = normalizar(f.nombre)
    if (!clave) return
    if (!cuenta.has(clave)) cuenta.set(clave, { nombre: f.nombre, lineas: [] })
    cuenta.get(clave).lineas.push(i)
  })
  return [...cuenta.values()]
    .filter(g => g.lineas.length > 1)
    .sort((a, b) => b.lineas.length - a.lineas.length)
}

/**
 * Pares de nombres que se distinguen por muy poco y conviene mirar dos veces.
 *
 * Tres formas:
 *   opuestos  IZQ contra DER, SUP contra INF
 *   extra     un nombre es otro más una palabra al final
 *   letra     una sola letra distinta, típico del OCR: ISLA leída SLA
 *
 * Las diferencias de puro número quedan fuera a propósito: MODULO 1 y
 * MODULO 2 son la norma en estos listados y marcarlas sería solo ruido.
 */
export function parecidos(filas) {
  const avisos = []
  // Un mismo par de nombres se avisa una sola vez, aunque se repita en varias
  // líneas. Repetir el aviso hace que se deje de leer.
  const yaVisto = new Set()
  const registrar = (aviso, nombreA, nombreB) => {
    const clave = [normalizar(nombreA), normalizar(nombreB)].sort().join('||')
    if (yaVisto.has(clave)) return
    yaVisto.add(clave)
    avisos.push(aviso)
  }
  const nombres = filas.map((f, i) => ({ i, nombre: f.nombre, fichas: fichas(f.nombre) }))

  for (let a = 0; a < nombres.length; a++) {
    for (let b = a + 1; b < nombres.length; b++) {
      const A = nombres[a]
      const B = nombres[b]
      if (!A.fichas.length || !B.fichas.length) continue

      // Opuestos: misma longitud y una sola ficha distinta, que además forma par
      if (A.fichas.length === B.fichas.length) {
        const distintas = A.fichas
          .map((t, k) => [t, B.fichas[k]])
          .filter(([x, y]) => x !== y)
        if (distintas.length === 1) {
          const [x, y] = distintas[0]
          const esPar = OPUESTOS.some(par => par.includes(x) && par.includes(y))
          if (esPar) {
            registrar({ tipo: 'opuestos', a: A.i, b: B.i, detalle: `${x} y ${y}` },
              A.nombre, B.nombre)
            continue
          }
          // Una sola letra de diferencia en palabras no numéricas
          if (!/^\d+$/.test(x) && !/^\d+$/.test(y) &&
              Math.abs(x.length - y.length) <= 1 && distanciaUno(x, y)) {
            registrar({ tipo: 'letra', a: A.i, b: B.i, detalle: `${x} y ${y}` },
              A.nombre, B.nombre)
          }
        }
        continue
      }

      // Uno contiene al otro más palabras al final
      const corto = A.fichas.length < B.fichas.length ? A : B
      const largo = corto === A ? B : A
      const esPrefijo = corto.fichas.every((t, k) => t === largo.fichas[k])
      if (esPrefijo) {
        const sobra = largo.fichas.slice(corto.fichas.length).join(' ')
        registrar({ tipo: 'extra', a: corto.i, b: largo.i, detalle: sobra },
          corto.nombre, largo.nombre)
      }
    }
  }

  return avisos
}

/** ¿Difieren en una sola operación de edición? */
function distanciaUno(x, y) {
  if (x === y) return false
  if (x.length === y.length) {
    let d = 0
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i] && ++d > 1) return false
    return d === 1
  }
  const corto = x.length < y.length ? x : y
  const largo = corto === x ? y : x
  let i = 0
  let j = 0
  let saltos = 0
  while (i < corto.length && j < largo.length) {
    if (corto[i] === largo[j]) { i++; j++ }
    else { j++; if (++saltos > 1) return false }
  }
  return true
}

/** Resumen para mostrar sobre la tabla de revisión. */
export function revisar(filas) {
  const rep = repetidos(filas)
  const par = parecidos(filas)
  return {
    filas: filas.length,
    etiquetas: filas.reduce((s, f) => s + (Number(f.cantidad) || 1), 0),
    repetidos: rep,
    parecidos: par,
    hayQueMirar: rep.length > 0 || par.length > 0
  }
}

/** Fusiona los repetidos exactos, solo cuando el usuario lo pide. */
export function fusionarRepetidos(filas) {
  const salida = []
  const vistos = new Map()
  for (const f of filas) {
    const clave = normalizar(f.nombre)
    if (vistos.has(clave)) {
      vistos.get(clave).cantidad += Number(f.cantidad) || 1
      continue
    }
    const copia = { ...f, cantidad: Number(f.cantidad) || 1 }
    vistos.set(clave, copia)
    salida.push(copia)
  }
  return salida
}
