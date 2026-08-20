// Lectura de listas pegadas.
//
// Cubre el caso real de TECC: la lista sale de un PDF o de una hoja de
// cálculo, con la cantidad en la primera columna y el nombre en la segunda.
// Seleccionar, copiar y pegar es exacto y gratis. Leer una foto de algo que
// ya existe en texto es dar una vuelta larga para llegar peor.

// Encabezados y totales que aparecen al copiar una tabla completa
const RUIDO = /^(cant(idad)?|qty|q|desc(ripci[oó]n)?|item|nombre|producto|total(es)?|p[aá]g(ina)?\.?\s*\d*|hoja\s*\d*)$/i

/**
 * Separa una línea en cantidad y nombre.
 *
 * Cuidado con el caso "ZAPATERA 4": el número final es parte del nombre, no
 * una cantidad. Solo se lee como cantidad un número al principio de la línea
 * seguido de separador, o la primera celda cuando vienen tabulaciones.
 */
function partirLinea(linea, cantidadAlInicio) {
  // Copiado desde Excel o Google Sheets: las columnas llegan con tabulación
  if (linea.includes('\t')) {
    const celdas = linea.split('\t').map(c => c.trim()).filter(Boolean)
    if (celdas.length >= 2 && /^\d+([.,]\d+)?$/.test(celdas[0])) {
      return { cantidad: Math.max(1, Math.round(parseFloat(celdas[0].replace(',', '.')))), nombre: celdas.slice(1).join(' ') }
    }
    return { cantidad: 1, nombre: celdas.join(' ') }
  }

  // Copiado desde un PDF: "1 MODULO 1", "1) ZAPATERA 4", "1 | ISLA 1"
  if (cantidadAlInicio) {
    const m = linea.match(/^(\d{1,3})\s*[|)\].\-–:]?\s+(\S.*)$/)
    if (m) return { cantidad: Math.max(1, parseInt(m[1], 10)), nombre: m[2].trim() }
  }

  return { cantidad: 1, nombre: linea }
}

/**
 * Convierte texto pegado en filas listas para el editor.
 * @param {string} texto
 * @param {{cantidadAlInicio?: boolean}} opciones
 */
export function parsearLista(texto, { cantidadAlInicio = true } = {}) {
  const filas = []

  for (const cruda of (texto ?? '').split(/\r?\n/)) {
    // Normaliza espacios raros que traen los PDF
    const linea = cruda.replace(/\u00a0/g, ' ').replace(/\s{2,}/g, ' ').trim()
    if (!linea) continue
    if (RUIDO.test(linea)) continue
    // Líneas que son solo un número suelto: bordes de tabla mal copiados
    if (/^[\d\s|.\-–_]+$/.test(linea)) continue

    const { cantidad, nombre } = partirLinea(linea, cantidadAlInicio)
    const limpio = nombre.replace(/\s*[|]\s*$/, '').trim()
    if (!limpio || RUIDO.test(limpio)) continue
    // Encabezado de tabla: todas sus palabras son ruido ("CANT DESCRIPCION")
    if (limpio.split(/\s+/).every(pal => RUIDO.test(pal))) continue

    // Una línea es una etiqueta. Los nombres repetidos NO se fusionan:
    // dos muebles pueden llamarse igual y son dos bultos distintos.
    filas.push({ nombre: limpio, cantidad, medidas: '', material: '', descripcion: '' })
  }

  return filas
}

export function resumenParseo(filas) {
  const etiquetas = filas.reduce((s, f) => s + f.cantidad, 0)
  const conCantidad = filas.filter(f => f.cantidad > 1).length
  return { renglones: filas.length, etiquetas, conCantidad }
}
