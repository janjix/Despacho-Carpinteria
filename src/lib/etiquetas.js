// Etiquetas de 101 mm x 59 mm para impresora térmica de rollo.
// Una etiqueta por página. Las medidas son fijas: la impresora del taller
// usa ese rollo y no hay otro.

// jsPDF y JsBarcode se cargan solo cuando alguien imprime. La pantalla de
// escaneo, que es la que corre todo el día en la tablet, no los descarga.
import { aPlano } from './codigos'

async function cargarLibrerias() {
  const [{ default: jsPDF }, { default: JsBarcode }] = await Promise.all([
    import('jspdf'),
    import('jsbarcode')
  ])
  return { jsPDF, JsBarcode }
}

const ANCHO = 101
const ALTO = 59
const MARGEN = 3

// Zona del código de barras
const BC_ANCHO = 88
const BC_ALTO = 16
const BC_X = (ANCHO - BC_ANCHO) / 2
const BC_Y = 34

/**
 * Dibuja el Code 128 en un canvas fuera de pantalla y devuelve un PNG.
 * width: 2 da ~2.3 puntos de impresora por módulo a 203 dpi, suficiente
 * para que cualquier lector láser lo tome al vuelo.
 */
function barcodePng(JsBarcode, codigo) {
  const canvas = document.createElement('canvas')
  JsBarcode(canvas, codigo, {
    format: 'CODE128',
    width: 2,
    height: 110,
    displayValue: false,
    margin: 0,
    background: '#FFFFFF',
    lineColor: '#000000'
  })
  return canvas.toDataURL('image/png')
}

/** Corta el nombre en un máximo de dos líneas y agrega puntos si sobra. */
function partirNombre(doc, nombre, anchoMax) {
  const lineas = doc.splitTextToSize(nombre, anchoMax)
  if (lineas.length <= 2) return lineas
  const segunda = lineas[1].replace(/\s+\S*$/, '') + '…'
  return [lineas[0], segunda]
}

function dibujarEtiqueta(doc, item, ctx) {
  const { proyecto, area } = ctx
  const derecha = ANCHO - MARGEN
  const hayContador = item.cantidad > 1
  const anchoNombre = hayContador ? 72 : 95

  // Franja superior: de dónde viene este bulto.
  // Centrada y en 12 pt porque es lo que el operario busca primero cuando
  // tiene veinte bultos apilados de tres proyectos distintos.
  const centro = ANCHO / 2
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(0)

  const cabecera = `${proyecto.nombre} · ${area.nombre}`.toUpperCase()
  const anchoCabecera = doc.getTextWidth(cabecera)
  const disponible = ANCHO - MARGEN * 2
  // Si no cabe en una línea, se reparte en dos antes que encogerla
  if (anchoCabecera <= disponible) {
    doc.text(cabecera, centro, 7, { align: 'center' })
  } else {
    doc.setFontSize(11)
    doc.text(proyecto.nombre.toUpperCase(), centro, 5.6, { align: 'center' })
    doc.setFontSize(10)
    doc.text(area.nombre.toUpperCase(), centro, 9.4, { align: 'center' })
  }

  const yLinea = anchoCabecera <= disponible ? 9.5 : 11.5
  doc.setDrawColor(120)
  doc.setLineWidth(0.3)
  doc.line(MARGEN, yLinea, derecha, yLinea)

  if (item.tipo === 'herrajes') {
    doc.setFillColor(0, 0, 0)
    doc.rect(MARGEN, yLinea + 1.5, 26, 5.5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(255)
    doc.text('HERRAJES', MARGEN + 13, yLinea + 5.4, { align: 'center' })
    doc.setTextColor(0)
  }

  // Nombre del ítem: lo primero que lee el operario a un metro de distancia
  doc.setTextColor(0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  const lineas = partirNombre(doc, item.nombre, anchoNombre)
  let y = yLinea + (item.tipo === 'herrajes' ? 12 : 6)
  for (const linea of lineas) {
    doc.text(linea, MARGEN, y)
    y += 6.4
  }

  // Medidas y material, o el contenido si es un bulto de herrajes.
  //
  // En herrajes la etiqueta no lleva la lista completa: no cabe y no hace
  // falta. Dice cuántas piezas distintas van dentro, y el detalle vive en la
  // guía de despacho, que es donde se comprueba.
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(40)
  const detalle = item.tipo === 'herrajes'
    ? (item.piezas
        ? `${item.piezas} ${item.piezas === 1 ? 'herraje distinto' : 'herrajes distintos'} · ver guía`
        : 'Bulto de herrajes')
    : [item.medidas, item.material].filter(Boolean).join('  ·  ')
  if (detalle) doc.text(detalle, MARGEN, Math.max(y + 0.5, 29))

  // Contador de bultos, solo cuando el grupo tiene más de uno
  if (hayContador) {
    doc.setDrawColor(0)
    doc.setLineWidth(0.4)
    doc.rect(derecha - 20, yLinea + 2, 20, 13)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(0)
    doc.text(`${item.indice} / ${item.cantidad}`, derecha - 10, yLinea + 10.5, { align: 'center' })
  }

  // Código de barras
  // El símbolo lleva la versión sin guiones; el texto de abajo, la legible
  doc.addImage(barcodePng(ctx.JsBarcode, aPlano(item.codigo)), 'PNG', BC_X, BC_Y, BC_ANCHO, BC_ALTO, undefined, 'FAST')

  // Código legible, por si el lector falla y hay que teclearlo
  doc.setFont('courier', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(0)
  doc.text(item.codigo, ANCHO / 2, BC_Y + BC_ALTO + 4.2, { align: 'center' })

  if (proyecto.cliente) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(90)
    doc.text(proyecto.cliente.toUpperCase(), derecha, BC_Y - 1.5, { align: 'right' })
  }
}

/**
 * Genera el PDF de etiquetas.
 * @param {Array} items    ítems ya ordenados
 * @param {Object} indice  { proyectos: {id: proyecto}, areas: {id: area} }
 */
export async function generarEtiquetas(items, indice) {
  if (!items.length) throw new Error('No hay etiquetas para imprimir')

  const { jsPDF, JsBarcode } = await cargarLibrerias()
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [ANCHO, ALTO] })

  items.forEach((item, i) => {
    if (i > 0) doc.addPage([ANCHO, ALTO], 'landscape')
    const area = indice.areas[item.area_id]
    const proyecto = indice.proyectos[area?.proyecto_id]
    dibujarEtiqueta(doc, item, {
      JsBarcode,
      area: area ?? { nombre: '' },
      proyecto: proyecto ?? { nombre: '', cliente: '' }
    })
  })

  return doc
}

export async function abrirEtiquetas(items, indice) {
  const doc = await generarEtiquetas(items, indice)
  doc.autoPrint()
  const url = doc.output('bloburl')
  window.open(url, '_blank')
}

export async function descargarEtiquetas(items, indice, nombreArchivo) {
  const doc = await generarEtiquetas(items, indice)
  doc.save(nombreArchivo)
}
