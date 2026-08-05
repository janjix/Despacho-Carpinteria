// Lectura de la tabla directamente del PDF.
//
// Un PDF generado por software lleva el texto adentro con sus coordenadas.
// No hace falta OCR ni modelo: se agrupan los fragmentos por su posición
// vertical para formar filas, y por su posición horizontal para formar
// columnas. Es exacto, gratis y corre entero en el navegador.
//
// Si el PDF es un escaneo, no hay capa de texto y esto devuelve vacío. Ese
// caso sí necesita leer la imagen.

const TOLERANCIA_FILA = 4      // puntos de diferencia vertical dentro de una fila
const SEPARACION_COLUMNA = 14  // hueco horizontal que separa dos columnas

/** Agrupa valores en cúmulos separados por un hueco mínimo. */
function agrupar(valores, hueco) {
  const orden = [...valores].sort((a, b) => a - b)
  const cumulos = []
  let actual = [orden[0]]
  for (let i = 1; i < orden.length; i++) {
    if (orden[i] - orden[i - 1] > hueco) {
      cumulos.push(actual)
      actual = []
    }
    actual.push(orden[i])
  }
  if (actual.length) cumulos.push(actual)
  return cumulos.map(c => Math.min(...c))
}

async function cargarPdfjs() {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

/**
 * @returns {Promise<{columnas: number, filas: string[][], paginas: number, hayTexto: boolean}>}
 */
export async function leerTablaPdf(archivo) {
  const pdfjs = await cargarPdfjs()
  const datos = new Uint8Array(await archivo.arrayBuffer())
  const doc = await pdfjs.getDocument({ data: datos, isEvalSupported: false }).promise

  const fragmentos = []
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p)
    const contenido = await pagina.getTextContent()
    for (const item of contenido.items) {
      const texto = (item.str ?? '').replace(/\u00a0/g, ' ').trim()
      if (!texto) continue
      fragmentos.push({
        texto,
        x: item.transform[4],
        // La y del PDF crece hacia arriba. Se invierte por página para que el
        // orden de lectura quede de arriba abajo y las páginas no se mezclen.
        y: p * 100000 - item.transform[5]
      })
    }
  }

  return construirTabla(fragmentos, doc.numPages)
}

/**
 * Agrupa fragmentos sueltos en filas y columnas.
 * Separada de la lectura del archivo para poder probarla sin navegador.
 */
export function construirTabla(fragmentos, paginas = 1) {
  if (!fragmentos.length) {
    return { columnas: 0, filas: [], paginas, hayTexto: false }
  }

  // Filas: fragmentos que comparten línea base
  fragmentos.sort((a, b) => a.y - b.y || a.x - b.x)
  const lineas = []
  let linea = [fragmentos[0]]
  for (let i = 1; i < fragmentos.length; i++) {
    if (Math.abs(fragmentos[i].y - linea[0].y) <= TOLERANCIA_FILA) linea.push(fragmentos[i])
    else { lineas.push(linea); linea = [fragmentos[i]] }
  }
  lineas.push(linea)

  // Columnas: cúmulos de posiciones horizontales en todo el documento
  const bordes = agrupar(fragmentos.map(f => f.x), SEPARACION_COLUMNA)

  const filas = lineas.map(l => {
    const celdas = new Array(bordes.length).fill('')
    for (const frag of l.sort((a, b) => a.x - b.x)) {
      // La celda es el último borde que queda a la izquierda del fragmento
      let k = 0
      for (let i = 0; i < bordes.length; i++) {
        if (frag.x >= bordes[i] - 1) k = i
      }
      celdas[k] = celdas[k] ? `${celdas[k]} ${frag.texto}` : frag.texto
    }
    return celdas
  }).filter(f => f.some(c => c.trim()))

  return { columnas: bordes.length, filas, paginas, hayTexto: true }
}

// ---------------------------------------------------------------------
// Adivinar qué es cada columna
// ---------------------------------------------------------------------

const ENCABEZADO = {
  cantidad: /^(cant|cantidad|qty|q|cta|uds?|unidades)$/i,
  nombre: /^(nombre|descripci[oó]n|item|producto|mueble|pieza)$/i,
  medidas: /^(medidas?|dimensi[oó]n(es)?|tama[nñ]o|largo|ancho)$/i,
  material: /^(material|acabado|color|tablero)$/i
}

/**
 * Propone un rol para cada columna: cantidad, nombre, medidas, material o
 * ignorar. Primero mira el encabezado; si no lo hay, mira la forma de los
 * datos.
 */
export function adivinarRoles({ columnas, filas }) {
  const roles = new Array(columnas).fill('ignorar')
  if (!columnas) return roles

  // 1. Por encabezado, buscando en las tres primeras filas
  const cabecera = filas.slice(0, 3)
  for (let c = 0; c < columnas; c++) {
    for (const fila of cabecera) {
      const celda = (fila[c] ?? '').trim()
      for (const [rol, patron] of Object.entries(ENCABEZADO)) {
        if (patron.test(celda) && !roles.includes(rol)) roles[c] = rol
      }
    }
  }
  if (roles.includes('cantidad') && roles.includes('nombre')) return roles

  // 2. Por la forma de los datos
  const cuerpo = filas.slice(cabecera.length ? 1 : 0)
  const perfil = []
  for (let c = 0; c < columnas; c++) {
    const celdas = cuerpo.map(f => (f[c] ?? '').trim()).filter(Boolean)
    if (!celdas.length) { perfil.push({ c, enteros: 0, largo: 0, llenas: 0 }); continue }
    perfil.push({
      c,
      enteros: celdas.filter(v => /^\d{1,3}$/.test(v)).length / celdas.length,
      largo: celdas.reduce((s, v) => s + v.length, 0) / celdas.length,
      llenas: celdas.length / Math.max(1, cuerpo.length)
    })
  }

  if (!roles.includes('cantidad')) {
    // Cantidad: casi todo enteros cortos y bien poblada
    const cand = perfil
      .filter(p => roles[p.c] === 'ignorar' && p.enteros > 0.8 && p.largo <= 4 && p.llenas > 0.6)
      .sort((a, b) => b.enteros - a.enteros)[0]
    if (cand) roles[cand.c] = 'cantidad'
  }

  if (!roles.includes('nombre')) {
    // Nombre: la columna de texto más larga que quede
    const cand = perfil
      .filter(p => roles[p.c] === 'ignorar' && p.enteros < 0.5 && p.llenas > 0.6)
      .sort((a, b) => b.largo - a.largo)[0]
    if (cand) roles[cand.c] = 'nombre'
  }

  return roles
}

/** Convierte la tabla y el mapeo de roles en filas para el editor. */
export function tablaAFilas(filas, roles) {
  const iCantidad = roles.indexOf('cantidad')
  const iNombre = roles.indexOf('nombre')
  const iMedidas = roles.indexOf('medidas')
  const iMaterial = roles.indexOf('material')
  if (iNombre < 0) return []

  const salida = []
  const vistos = new Map()

  for (const fila of filas) {
    const nombre = (fila[iNombre] ?? '').trim()
    if (!nombre) continue
    // Descarta la fila de encabezado
    if (ENCABEZADO.nombre.test(nombre)) continue

    const bruto = iCantidad >= 0 ? (fila[iCantidad] ?? '').trim() : '1'
    if (iCantidad >= 0 && !/^\d{1,3}$/.test(bruto)) continue // encabezado o total
    const cantidad = Math.max(1, parseInt(bruto, 10) || 1)

    const clave = nombre.toUpperCase()
    if (vistos.has(clave)) { vistos.get(clave).cantidad += cantidad; continue }

    const registro = {
      nombre,
      cantidad,
      medidas: iMedidas >= 0 ? (fila[iMedidas] ?? '').trim() : '',
      material: iMaterial >= 0 ? (fila[iMaterial] ?? '').trim() : '',
      descripcion: ''
    }
    vistos.set(clave, registro)
    salida.push(registro)
  }

  return salida
}
