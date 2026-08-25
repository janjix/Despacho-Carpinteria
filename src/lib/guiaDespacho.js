// Guía de despacho.
//
// Se imprime al cerrar la carga de un camión y viaja con el chofer. Cumple
// tres funciones distintas y por eso tiene tres partes:
//
//   1. Comprobante de entrega: el chofer firma que recibió N bultos.
//   2. Lista de verificación en obra: quien recibe tacha lo que baja.
//   3. Respaldo del taller: si falta algo, el papel dice qué subió y a qué
//      hora se escaneó cada bulto.
//
// De ahí las decisiones: casillas de verificación a la izquierda de cada
// renglón, el conteo grande arriba, y el bloque de firmas siempre en la
// misma página que el total.

import { ESTADOS, fechaCorta, fechaHora, hora } from './codigos'

const MARGEN = 14
const RGB_CABECERA = [22, 24, 28]

async function cargarLibrerias() {
  const [pdf, tabla] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable')
  ])
  // Según cómo empaquete el entorno, el constructor llega como default o
  // como named. Se elige el que de verdad sea una función en lugar de
  // asumir una de las dos formas.
  const elegir = (...candidatos) => candidatos.find(c => typeof c === 'function')
  return {
    jsPDF: elegir(pdf.default, pdf.jsPDF, pdf.default?.jsPDF),
    autoTable: elegir(tabla.default, tabla.autoTable, tabla.default?.default)
  }
}

// Alto que ocupaba el membrete. Se conserva como espacio en blanco para que
// el papel preimpreso caiga donde debe y la tabla arranque a la misma altura
// que en la versión con membrete.
const ALTO_MEMBRETE = 17

function encabezado(doc, viaje) {
  // Sin membrete: solo se reserva el espacio.
  // Los datos del viaje (código, camión, conductor, fecha) no se pierden,
  // viven en el bloque gris de abajo y en el pie de cada página.
  return MARGEN + ALTO_MEMBRETE
}

function bloqueDatos(doc, viaje, contenido, y) {
  const ancho = doc.internal.pageSize.getWidth()
  const util = ancho - MARGEN * 2
  const arriba = y + 7

  doc.setFillColor(240, 238, 234)
  doc.rect(MARGEN, arriba, util, 22, 'F')

  // Conteo grande: el número que se cuenta en el portón antes de arrancar.
  // Se mide el ancho real del número para colocar la palabra al lado, porque
  // con dos o tres cifras una posición fija se solapa.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(28)
  doc.setTextColor(0)
  const cifra = String(contenido.length)
  doc.text(cifra, MARGEN + 8, arriba + 16)
  const anchoCifra = doc.getTextWidth(cifra)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(70)
  doc.text('BULTOS', MARGEN + 12 + anchoCifra, arriba + 16)

  const columna = MARGEN + 20 + anchoCifra + doc.getTextWidth('BULTOS')
  const proyectos = [...new Set(contenido.map(c => c.proyecto).filter(Boolean))]
  const anchoTexto = ancho - MARGEN - columna - 52

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(40)
  doc.text(`Destino: ${viaje.destino || 'sin especificar'}`, columna, arriba + 7,
    { maxWidth: anchoTexto })
  doc.text(
    `Proyecto${proyectos.length > 1 ? 's' : ''}: ${proyectos.join(' · ') || 'sin proyecto'}`,
    columna, arriba + 13.5, { maxWidth: anchoTexto }
  )
  doc.setFontSize(8.5)
  doc.setTextColor(80)
  doc.text(
    `${viaje.camion_codigo}${viaje.placa ? ` · ${viaje.placa}` : ''}` +
    `${viaje.conductor ? ` · ${viaje.conductor}` : ''}`,
    columna, arriba + 20, { maxWidth: anchoTexto }
  )

  // Código del viaje y fecha, que antes vivían en el membrete. Es lo que se
  // busca cuando llaman desde la obra preguntando por una carga.
  doc.setFont('courier', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(0)
  doc.text(viaje.codigo, ancho - MARGEN - 6, arriba + 11, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(90)
  doc.text(fechaHora(new Date().toISOString()), ancho - MARGEN - 6, arriba + 17,
    { align: 'right' })

  return arriba + 26
}

function tabla(autoTable, doc, contenido, y, herrajes = {}) {
  // Agrupa por proyecto y área para que en obra se baje por ambientes
  const grupos = new Map()
  for (const c of contenido) {
    const clave = `${c.proyecto ?? 'Sin proyecto'}||${c.area ?? ''}`
    if (!grupos.has(clave)) grupos.set(clave, [])
    grupos.get(clave).push(c)
  }

  const alto = doc.internal.pageSize.getHeight()
  let cursor = y
  for (const [clave, lista] of grupos) {
    const [proyecto, area] = clave.split('||')

    // Un título de sección con su cabecera de columnas y ninguna fila debajo
    // deja al que verifica buscando en la página siguiente. Si no caben al
    // menos dos renglones, la sección entera empieza en la próxima hoja.
    const necesario = 8 + 7 + 7 * 2
    if (cursor + necesario > alto - 20) {
      doc.addPage()
      cursor = MARGEN
    }

    autoTable(doc, {
      startY: cursor + 4,
      margin: { left: MARGEN, right: MARGEN },
      head: [[
        `${proyecto}${area ? ` · ${area}` : ''}`.toUpperCase(),
        `${lista.length} bultos`, '', '', ''
      ]],
      body: [],
      styles: { fontSize: 9 },
      headStyles: {
        fillColor: RGB_CABECERA, textColor: 255, fontSize: 9.5,
        halign: 'left', cellPadding: 2
      },
      columnStyles: { 1: { halign: 'right' } }
    })

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY,
      margin: { left: MARGEN, right: MARGEN },
      head: [['', 'Código', 'Ítem', 'Medidas', 'N.º', 'Cargado']],
      // Un bulto de herrajes ocupa una fila como cualquier otro, pero debajo
      // se lista lo que lleva dentro: en obra hay que poder comprobar que las
      // veinticuatro bisagras están ahí sin abrir otro papel.
      body: lista.flatMap(c => {
        const fila = [
          '', c.item_codigo, c.item, c.medidas ?? '',
          c.cantidad > 1 ? `${c.indice}/${c.cantidad}` : '',
          hora(c.cargado_at)
        ]
        const dentro = herrajes[c.item_id]
        if (!dentro?.length) return [fila]
        const detalle = dentro
          .map(h => `· ${h.linea}${h.nota ? ` (${h.nota})` : ''}`)
          .join('\n')
        return [fila, [
          { content: '', styles: { fillColor: [248, 247, 245] } },
          {
            content: detalle,
            colSpan: 5,
            styles: {
              fontSize: 8, textColor: 55, fillColor: [248, 247, 245],
              halign: 'left', valign: 'top',
              cellPadding: { top: 1, bottom: 2.5, left: 3, right: 2 }
            }
          }
        ]]
      }),
      styles: {
        fontSize: 9, cellPadding: 2.2,
        lineColor: [190, 190, 190], lineWidth: 0.1,
        minCellHeight: 7
      },
      headStyles: { fillColor: [235, 233, 229], textColor: 30, fontSize: 8, halign: 'left' },
      columnStyles: {
        // Casilla para tachar en obra
        0: { cellWidth: 9, halign: 'center' },
        1: { cellWidth: 42, font: 'courier', fontSize: 8 },
        2: { cellWidth: 'auto', fontStyle: 'bold' },
        3: { cellWidth: 26 },
        4: { cellWidth: 12, halign: 'center' },
        5: { cellWidth: 18, halign: 'center' }
      },
      didDrawCell: (datos) => {
        // Cuadrito de verificación, solo en las filas que son un bulto.
        // Las filas de detalle de herrajes no se tachan: lo que se cuenta en
        // el portón son bultos, no bisagras.
        if (datos.section !== 'body' || datos.column.index !== 0) return
        const fila = datos.row.raw
        const esDetalle = Array.isArray(fila) && fila.length === 2 &&
                          typeof fila[1] === 'object' && fila[1]?.colSpan === 5
        if (esDetalle) return
        const { x, y: cy, height } = datos.cell
        doc.setDrawColor(90)
        doc.setLineWidth(0.3)
        doc.rect(x + 2.2, cy + (height - 4) / 2, 4, 4)
      }
    })
    cursor = doc.lastAutoTable.finalY
  }
  return cursor
}

function firmas(doc, viaje, y) {
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  // El bloque completo ocupa unos 46 mm contando el aviso, el aire y las
  // líneas. Solo se pasa de página si de verdad no cabe: una hoja con tres
  // rayas sueltas invita a firmar sin haber visto la lista.
  const NECESARIO = 46
  let cursor = y + 14

  if (cursor + NECESARIO > alto - 16) { doc.addPage(); cursor = MARGEN + 16 }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(90)
  doc.text(
    'Quien recibe declara haber contado los bultos indicados y encontrarlos ' +
    'conformes en cantidad y estado exterior.',
    MARGEN, cursor, { maxWidth: ancho - MARGEN * 2 }
  )
  cursor += 22

  const col = (ancho - MARGEN * 2 - 20) / 3
  const bloques = [
    ['Despacha (taller)', ''],
    ['Transporta', viaje.conductor ?? ''],
    ['Recibe en obra', '']
  ]

  doc.setDrawColor(0)
  doc.setLineWidth(0.3)
  bloques.forEach(([titulo, nombre], i) => {
    const x = MARGEN + i * (col + 10)
    doc.line(x, cursor, x + col, cursor)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(0)
    doc.text(titulo, x, cursor + 5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(110)
    doc.text(nombre || 'Nombre, C.I. y fecha', x, cursor + 10)
  })

  return cursor
}

function pieDePagina(doc, viaje) {
  const paginas = doc.internal.getNumberOfPages()
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(`TECC Despacho · ${viaje.codigo}`, MARGEN, alto - 8)
    doc.text(`Página ${i} de ${paginas}`, ancho - MARGEN, alto - 8, { align: 'right' })
  }
}

/**
 * @param {object} viaje      fila de viaje_resumen
 * @param {Array}  contenido  filas de viaje_contenido
 * @param {number} copias     ejemplares idénticos (taller, chofer, obra)
 */
/**
 * @param {object} viaje      fila de viaje_resumen
 * @param {Array}  contenido  filas de viaje_contenido
 * @param {number} copias     ejemplares idénticos
 * @param {Object} herrajes   {item_id: [{linea, nota}]} contenido de los bultos
 */
export async function guiaDespacho(viaje, contenido, copias = 1, herrajes = {}) {
  const { jsPDF, autoTable } = await cargarLibrerias()
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })

  const ETIQUETAS = ['ORIGINAL · TALLER', 'COPIA · TRANSPORTE', 'COPIA · OBRA']

  for (let c = 0; c < Math.max(1, copias); c++) {
    if (c > 0) doc.addPage()

    let y = encabezado(doc, viaje)

    if (copias > 1) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(120)
      doc.text(ETIQUETAS[c] ?? `COPIA ${c + 1}`,
        doc.internal.pageSize.getWidth() - MARGEN, y + 4.5, { align: 'right' })
    }

    y = bloqueDatos(doc, viaje, contenido, y)

    if (!contenido.length) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)
      doc.setTextColor(120)
      doc.text('Este viaje no tiene bultos escaneados.', MARGEN, y + 12)
      y += 18
    } else {
      y = tabla(autoTable, doc, contenido, y, herrajes)
    }

    firmas(doc, viaje, y)
  }

  pieDePagina(doc, viaje)
  return doc
}

/** Nombre de archivo estable, fácil de buscar después. */
export function nombreGuia(viaje) {
  return `Guia ${viaje.codigo} ${viaje.camion_codigo}.pdf`
}
