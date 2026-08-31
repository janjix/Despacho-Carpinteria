// OCR local para PDF sin capa de texto.
//
// El caso real de TECC: Spazio 3D imprime la lista como PDF de imágenes. Las
// palabras se ven pero ningún programa las lee. Tesseract corre entero en el
// navegador, sin clave y sin costo.
//
// Tres cosas decidieron que funcionara, todas medidas contra el PDF real de
// 60 muebles:
//
//   1. Rasterizar a 500 dpi. Medido contra el listado real: 300 dpi acierta 55
//      nombres de 60, 400 dpi acierta 59, 500 dpi acierta los 60, y 600 no
//      mejora pero pesa 40% más.
//   2. Detectar las columnas por los bordes dibujados de la tabla, no por la
//      posición de las palabras. Agrupar por palabras genera columnas fantasma
//      cada vez que un nombre tiene varias palabras.
//   3. Restringir el alfabeto. Sin lista blanca aparecen símbolos donde el OCR
//      duda, y esos símbolos ensucian los nombres.
//
// Aun así quedan errores. La tabla de revisión existe para eso: nadie debería
// imprimir 60 etiquetas sin mirarlas antes.

const IDIOMA = 'spa'
const CONFIANZA_MINIMA = 35
const ALFABETO =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' +
  'ÁÉÍÓÚÑáéíóúñ0123456789 .,-/:'

// ---------------------------------------------------------------------
// Rejilla de la tabla
// ---------------------------------------------------------------------

/**
 * Encuentra las líneas verticales midiendo cuánta tinta hay en cada columna
 * de píxeles. Un borde dibujado deja la columna casi entera oscura; el texto
 * no llega ni cerca.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {number[]} posiciones x de los cortes, de izquierda a derecha
 */
export function detectarColumnas(canvas, { anchoMinimo } = {}) {
  const factor = (canvas.dpiReal ?? 500) / 400
  const minimo = anchoMinimo ?? Math.round(100 * factor)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)

  const tinta = new Float32Array(width)
  for (let y = 0; y < height; y++) {
    const base = y * width * 4
    for (let x = 0; x < width; x++) {
      const i = base + x * 4
      const gris = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000
      if (gris < 128) tinta[x]++
    }
  }

  let maximo = 0
  for (let x = 0; x < width; x++) {
    const d = tinta[x] / height
    if (d > maximo) maximo = d
  }
  // Umbral relativo: si la tabla ocupa solo el tercio superior, un borde real
  // nunca alcanza un porcentaje alto de la altura total de la página.
  const umbral = Math.max(0.08, maximo * 0.45)

  const crudas = []
  let grupo = []
  const cerrar = () => {
    if (grupo.length) {
      crudas.push(Math.round(grupo.reduce((a, b) => a + b, 0) / grupo.length))
      grupo = []
    }
  }
  for (let x = 0; x < width; x++) {
    if (tinta[x] / height > umbral) grupo.push(x)
    else cerrar()
  }
  cerrar()

  // Descarta líneas demasiado juntas: recuadros de logo, bordes dobles
  const limpias = []
  for (const x of crudas) {
    if (!limpias.length || x - limpias[limpias.length - 1] >= minimo) limpias.push(x)
  }
  return limpias
}

// ---------------------------------------------------------------------
// Agrupación
// ---------------------------------------------------------------------

function agruparEnLineas(palabras, tolerancia) {
  if (!palabras.length) return []
  const orden = [...palabras].sort((a, b) => a.y0 - b.y0)
  const grupos = []
  let actual = [orden[0]]
  for (let i = 1; i < orden.length; i++) {
    const centro = actual.reduce((s, p) => s + (p.y0 + p.y1) / 2, 0) / actual.length
    if (Math.abs((orden[i].y0 + orden[i].y1) / 2 - centro) <= tolerancia) actual.push(orden[i])
    else { grupos.push(actual); actual = [orden[i]] }
  }
  grupos.push(actual)
  return grupos.map(g => ({
    y: g.reduce((s, p) => s + (p.y0 + p.y1) / 2, 0) / g.length,
    texto: g.sort((a, b) => a.x0 - b.x0).map(p => p.texto).join(' ')
  }))
}

/** Quita los bordes de la tabla que el OCR lee como | l I sueltos. */
function limpiarCelda(texto) {
  return texto.replace(/^[|[\]lI]\s+/, '').replace(/\s+[|[\]]$/, '').trim()
}

/**
 * Arma las filas de una página a partir de sus palabras y de la rejilla.
 * Toma como ancla la columna con más líneas, que siempre es una de texto, y
 * cuelga de ella las demás por cercanía vertical.
 */
export function armarFilas(palabras, cortes, { toleranciaLinea = 26 } = {}) {
  const columnas = Math.max(0, cortes.length - 1)
  if (columnas < 2 || !palabras.length) return []

  const porColumna = Array.from({ length: columnas }, () => [])
  for (const p of palabras) {
    const centro = (p.x0 + p.x1) / 2
    for (let i = 0; i < columnas; i++) {
      if (centro >= cortes[i] && centro < cortes[i + 1]) { porColumna[i].push(p); break }
    }
  }

  const lineas = porColumna.map(c => agruparEnLineas(c, toleranciaLinea))
  let ancla = 0
  for (let i = 1; i < lineas.length; i++) {
    if (lineas[i].length > lineas[ancla].length) ancla = i
  }

  return lineas[ancla].map(base => {
    const fila = new Array(columnas).fill('')
    fila[ancla] = limpiarCelda(base.texto)
    for (let i = 0; i < columnas; i++) {
      if (i === ancla) continue
      const cerca = lineas[i].find(l => Math.abs(l.y - base.y) <= toleranciaLinea + 3)
      if (cerca) fila[i] = limpiarCelda(cerca.texto)
    }
    return fila
  })
}

// ---------------------------------------------------------------------
// Reconocimiento
// ---------------------------------------------------------------------

function extraerPalabras(datos) {
  const palabras = []
  for (const bloque of datos.blocks ?? [])
    for (const parrafo of bloque.paragraphs ?? [])
      for (const linea of parrafo.lines ?? [])
        for (const p of linea.words ?? []) {
          const texto = (p.text ?? '').trim()
          if (!texto || p.confidence < CONFIANZA_MINIMA) continue
          palabras.push({ texto, x0: p.bbox.x0, x1: p.bbox.x1, y0: p.bbox.y0, y1: p.bbox.y1 })
        }
  return palabras
}

/**
 * Reconoce las páginas ya rasterizadas y devuelve la tabla completa, con la
 * misma forma que devuelve la lectura de un PDF con texto.
 *
 * @param {HTMLCanvasElement[]} canvases
 * @param {(e:{etapa:string,pagina?:number,total?:number,avance?:number})=>void} alAvanzar
 */
export async function reconocerTabla(canvases, alAvanzar) {
  const { createWorker } = await import('tesseract.js')

  alAvanzar?.({ etapa: 'preparando', pagina: 0, total: canvases.length, avance: 0 })
  const worker = await createWorker(IDIOMA, 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') alAvanzar?.({ etapa: 'leyendo', avance: m.progress })
    }
  })
  await worker.setParameters({
    tessedit_pageseg_mode: '3',   // automático: el que mejor lee esta tabla
    tessedit_char_whitelist: ALFABETO
  })

  const filas = []
  let columnas = 0
  try {
    for (let i = 0; i < canvases.length; i++) {
      alAvanzar?.({ etapa: 'leyendo', pagina: i + 1, total: canvases.length, avance: 0 })
      const canvas = canvases[i]
      const factor = (canvas.dpiReal ?? 500) / 400
      const cortes = detectarColumnas(canvas)
      const { data } = await worker.recognize(canvas, {}, { blocks: true })
      const dePagina = armarFilas(extraerPalabras(data), cortes, {
        toleranciaLinea: Math.round(21 * factor)
      })
      if (dePagina.length) {
        columnas = Math.max(columnas, cortes.length - 1)
        filas.push(...dePagina)
      }
    }
  } finally {
    await worker.terminate()
  }

  const iguales = filas.map(f => {
    const copia = new Array(columnas).fill('')
    f.forEach((c, i) => { if (i < columnas) copia[i] = c })
    return copia
  })

  return { columnas, filas: iguales, paginas: canvases.length, hayTexto: iguales.length > 0 }
}
