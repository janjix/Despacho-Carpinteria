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
 * Abre el documento una sola vez y lo deja disponible para leer texto o
 * rasterizar páginas. Guardarlo evita reprocesar el archivo dos veces.
 */
export async function abrirPdf(archivo) {
  const pdfjs = await cargarPdfjs()
  const datos = new Uint8Array(await archivo.arrayBuffer())
  const doc = await pdfjs.getDocument({ data: datos, isEvalSupported: false }).promise
  return { pdfjs, doc }
}

/**
 * Cuenta qué hay dentro del PDF antes de intentar nada.
 * Sirve para distinguir tres casos que se parecen desde afuera:
 * un PDF con texto, un escaneo, y un fallo al cargar pdf.js.
 */
export async function diagnosticarPdf(doc, pdfjs) {
  let fragmentos = 0
  let imagenes = 0

  for (let p = 1; p <= Math.min(doc.numPages, 3); p++) {
    const pagina = await doc.getPage(p)
    const contenido = await pagina.getTextContent()
    fragmentos += contenido.items.filter(i => (i.str ?? '').trim()).length

    try {
      const ops = await pagina.getOperatorList()
      const dibujaImagen = new Set([
        pdfjs.OPS.paintImageXObject,
        pdfjs.OPS.paintInlineImageXObject,
        pdfjs.OPS.paintImageMaskXObject,
        pdfjs.OPS.paintJpegXObject
      ].filter(v => v !== undefined))
      imagenes += ops.fnArray.filter(fn => dibujaImagen.has(fn)).length
    } catch { /* si falla el conteo de imágenes, no es grave */ }
  }

  return { paginas: doc.numPages, fragmentos, imagenes }
}

/**
 * @returns {Promise<{columnas: number, filas: string[][], paginas: number, hayTexto: boolean}>}
 */
export async function extraerTabla(doc) {
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

// Tope de superficie del canvas. Chrome de escritorio aguanta mucho más,
// pero Safari de iPhone corta alrededor de los 17 megapíxeles y el canvas
// vuelve en blanco sin avisar. Bajamos los dpi antes de llegar ahí.
const MEGAPIXELES_MAXIMOS = 30

/**
 * Dibuja una página en un canvas a los puntos por pulgada indicados.
 *
 * 500 dpi es el punto donde el OCR acertó los 60 nombres del listado real.
 * A 400 falla uno, a 300 falla cinco, y a 600 no mejora pero pesa 40% más.
 * El PDF de origen tiene 150 dpi: por encima de eso el rasterizador
 * interpola, y esa interpolación es justamente lo que ayuda a Tesseract con
 * letras que a tamaño original quedan dentadas.
 */
export async function rasterizarCanvas(doc, numero, dpi = 500) {
  const pagina = await doc.getPage(numero)

  let escala = dpi / 72
  const base = pagina.getViewport({ scale: 1 })
  const mp = (base.width * escala * base.height * escala) / 1e6
  if (mp > MEGAPIXELES_MAXIMOS) {
    escala *= Math.sqrt(MEGAPIXELES_MAXIMOS / mp)
  }

  const viewport = pagina.getViewport({ scale: escala })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await pagina.render({ canvasContext: ctx, viewport }).promise
  canvas.dpiReal = Math.round(escala * 72)
  return canvas
}

/**
 * Dibuja una página en un canvas y la devuelve como JPEG en base64.
 * Es el camino para los PDF escaneados: se convierte a imagen y se manda al
 * mismo lector de fotos, sin que nadie tenga que exportar nada a mano.
 */
export async function rasterizarPagina(doc, numero, anchoMax = 1600) {
  const pagina = await doc.getPage(numero)
  const base = pagina.getViewport({ scale: 1 })
  const escala = Math.min(2.5, anchoMax / base.width)
  const viewport = pagina.getViewport({ scale: escala })

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  await pagina.render({ canvasContext: ctx, viewport }).promise
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
}

/** Compatibilidad: abre, diagnostica y extrae en un solo paso. */
export async function leerTablaPdf(archivo) {
  const { doc } = await abrirPdf(archivo)
  return extraerTabla(doc)
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
