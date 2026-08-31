// Las dos listas en PDF, tamaño carta.
// Lista de embalaje: todo lo que sale del taller.
// Lista de carga: lo que efectivamente subió al camión, más los faltantes.

// Igual que las etiquetas: jsPDF entra solo cuando se pide un PDF.
async function cargarLibrerias() {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable')
  ])
  return { jsPDF, autoTable }
}
import { ESTADOS, fechaCorta, fechaHora, hora, resumir } from './codigos'

const MARGEN = 14

const RGB = {
  pendiente: [240, 238, 234],
  embalado: [253, 243, 216],
  cargado: [221, 242, 230],
  faltante: [250, 226, 226]
}

function encabezado(doc, proyecto, titulo) {
  const ancho = doc.internal.pageSize.getWidth()

  doc.setFillColor(22, 24, 28)
  doc.rect(MARGEN, MARGEN, 26, 12, 'F')
  doc.setTextColor(255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('TECC', MARGEN + 13, MARGEN + 8.2, { align: 'center' })

  doc.setTextColor(0)
  doc.setFontSize(16)
  doc.text(titulo, MARGEN + 31, MARGEN + 6)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(70)
  doc.text(
    `${proyecto.nombre}${proyecto.cliente ? ` · ${proyecto.cliente}` : ''}`,
    MARGEN + 31, MARGEN + 11.5
  )

  doc.setFontSize(8.5)
  doc.text(`Despacho: ${fechaCorta(proyecto.fecha_despacho)}`, ancho - MARGEN, MARGEN + 4.5, { align: 'right' })
  doc.text(`Emitido: ${fechaHora(new Date().toISOString())}`, ancho - MARGEN, MARGEN + 9, { align: 'right' })

  doc.setDrawColor(180)
  doc.setLineWidth(0.3)
  doc.line(MARGEN, MARGEN + 16, ancho - MARGEN, MARGEN + 16)

  return MARGEN + 21
}

function pieDePagina(doc) {
  const paginas = doc.internal.getNumberOfPages()
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(`Página ${i} de ${paginas}`, ancho - MARGEN, alto - 8, { align: 'right' })
    doc.text('TECC Despacho', MARGEN, alto - 8)
  }
}

function agruparPorArea(items, areas) {
  const mapa = new Map()
  for (const it of items) {
    if (!mapa.has(it.area_id)) mapa.set(it.area_id, [])
    mapa.get(it.area_id).push(it)
  }
  return [...mapa.entries()]
    .map(([areaId, lista]) => ({
      area: areas[areaId] ?? { nombre: 'Sin área', orden: 999 },
      items: lista
    }))
    .sort((a, b) => (a.area.orden ?? 0) - (b.area.orden ?? 0))
}

function bloqueTitulo(doc, texto, y) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(0)
  doc.text(texto, MARGEN, y)
  return y + 2
}

// ---------------------------------------------------------------------
// Lista de embalaje
// ---------------------------------------------------------------------

export async function listaEmbalaje(proyecto, areas, items) {
  const { jsPDF, autoTable } = await cargarLibrerias()
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  let y = encabezado(doc, proyecto, 'Lista de embalaje')

  const grupos = agruparPorArea(items, areas)

  for (const grupo of grupos) {
    const r = resumir(grupo.items)
    y = bloqueTitulo(
      doc,
      `${grupo.area.nombre.toUpperCase()}   ${r.total} bultos   ` +
      `${r.pendiente} pendientes · ${r.embalado} embalados · ${r.cargado} cargados`,
      y + 4
    )

    autoTable(doc, {
      startY: y + 2,
      margin: { left: MARGEN, right: MARGEN },
      head: [['Código', 'Ítem', 'Medidas', 'Material', 'N.º', 'Estado', 'Embalado']],
      body: grupo.items.map(it => ([
        it.codigo,
        it.nombre,
        it.medidas ?? '',
        it.material ?? '',
        it.cantidad > 1 ? `${it.indice}/${it.cantidad}` : '',
        ESTADOS[it.estado].nombre,
        hora(it.embalado_at)
      ])),
      styles: { fontSize: 8, cellPadding: 1.6, lineColor: [210, 210, 210], lineWidth: 0.1 },
      headStyles: { fillColor: [22, 24, 28], textColor: 255, fontSize: 8, halign: 'left' },
      columnStyles: {
        0: { cellWidth: 34, font: 'courier' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 26 },
        3: { cellWidth: 24 },
        4: { cellWidth: 11, halign: 'center' },
        5: { cellWidth: 20 },
        6: { cellWidth: 17, halign: 'center' }
      },
      didParseCell: ({ row, section }) => {
        if (section !== 'body') return
        const it = grupo.items[row.index]
        row.cells && Object.values(row.cells).forEach(c => {
          c.styles.fillColor = RGB[it.estado]
        })
      }
    })
    y = doc.lastAutoTable.finalY
  }

  // Totales al pie
  const total = resumir(items)
  y += 8
  if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = MARGEN + 10 }
  doc.setDrawColor(0); doc.setLineWidth(0.4)
  doc.line(MARGEN, y, doc.internal.pageSize.getWidth() - MARGEN, y)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0)
  doc.text(`Total del proyecto: ${total.total} bultos`, MARGEN, y + 7)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5)
  doc.text(
    `${total.pendiente} pendientes   ${total.embalado} embalados   ${total.cargado} cargados`,
    MARGEN, y + 13
  )

  pieDePagina(doc)
  return doc
}

// ---------------------------------------------------------------------
// Lista de carga
// ---------------------------------------------------------------------

export async function listaCarga(proyecto, areas, items, viajes = {}) {
  const { jsPDF, autoTable } = await cargarLibrerias()
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  let y = encabezado(doc, proyecto, 'Lista de carga')

  const cargados = items.filter(i => i.estado === 'cargado')
  const faltantes = items.filter(i => i.estado !== 'cargado')

  if (!cargados.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90)
    doc.text('Ningún bulto se ha marcado como cargado todavía.', MARGEN, y + 8)
    y += 14
  }

  for (const grupo of agruparPorArea(cargados, areas)) {
    y = bloqueTitulo(doc, `${grupo.area.nombre.toUpperCase()}   ${grupo.items.length} bultos cargados`, y + 4)
    autoTable(doc, {
      startY: y + 2,
      margin: { left: MARGEN, right: MARGEN },
      head: [['Código', 'Ítem', 'Medidas', 'N.º', 'Camión y viaje', 'Cargado']],
      body: grupo.items.map(it => {
        const v = viajes[it.viaje_id]
        return [
          it.codigo, it.nombre, it.medidas ?? '',
          it.cantidad > 1 ? `${it.indice}/${it.cantidad}` : '',
          v ? `${v.camion_codigo} · ${v.codigo}` : 'sin registrar',
          hora(it.cargado_at)
        ]
      }),
      styles: { fontSize: 8, cellPadding: 1.6, lineColor: [210, 210, 210], lineWidth: 0.1 },
      headStyles: { fillColor: [30, 142, 78], textColor: 255, fontSize: 8, halign: 'left' },
      bodyStyles: { fillColor: RGB.cargado },
      columnStyles: {
        0: { cellWidth: 34, font: 'courier' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 26 },
        3: { cellWidth: 11, halign: 'center' },
        4: { cellWidth: 38, fontSize: 7.5 },
        5: { cellWidth: 17, halign: 'center' }
      }
    })
    y = doc.lastAutoTable.finalY
  }

  // Resumen por camión: lo que firma el transportista
  const porViaje = new Map()
  for (const it of cargados) {
    const v = viajes[it.viaje_id]
    const clave = v ? `${v.camion_codigo} · ${v.codigo}${v.destino ? ` → ${v.destino}` : ''}` : 'Sin viaje registrado'
    porViaje.set(clave, (porViaje.get(clave) ?? 0) + 1)
  }
  if (porViaje.size) {
    y += 8
    if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = MARGEN + 10 }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0)
    doc.text('Reparto por camión', MARGEN, y)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(40)
    for (const [clave, n] of porViaje) {
      y += 5.5
      doc.text(`${clave}: ${n} bultos`, MARGEN + 3, y)
    }
  }

  // Faltantes: la sección que evita la segunda visita a obra
  y += 10
  if (y > doc.internal.pageSize.getHeight() - 50) { doc.addPage(); y = MARGEN + 10 }

  if (faltantes.length) {
    doc.setFillColor(196, 43, 43)
    doc.rect(MARGEN, y - 5, doc.internal.pageSize.getWidth() - MARGEN * 2, 8, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(255)
    doc.text(`FALTAN POR CARGAR: ${faltantes.length} bultos`, MARGEN + 2, y + 0.6)

    autoTable(doc, {
      startY: y + 6,
      margin: { left: MARGEN, right: MARGEN },
      head: [['Código', 'Ítem', 'Área', 'N.º', 'Estado']],
      body: faltantes.map(it => ([
        it.codigo, it.nombre,
        areas[it.area_id]?.nombre ?? '',
        it.cantidad > 1 ? `${it.indice}/${it.cantidad}` : '',
        ESTADOS[it.estado].nombre
      ])),
      styles: { fontSize: 8, cellPadding: 1.6, lineColor: [210, 210, 210], lineWidth: 0.1 },
      headStyles: { fillColor: [196, 43, 43], textColor: 255, fontSize: 8, halign: 'left' },
      bodyStyles: { fillColor: RGB.faltante },
      columnStyles: { 0: { cellWidth: 34, font: 'courier' }, 3: { cellWidth: 11, halign: 'center' } }
    })
    y = doc.lastAutoTable.finalY
  } else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(30, 142, 78)
    doc.text('Proyecto completo. Todos los bultos subieron al camión.', MARGEN, y)
    y += 6
  }

  // Firmas
  y += 16
  if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = MARGEN + 20 }
  const ancho = doc.internal.pageSize.getWidth()
  const col = (ancho - MARGEN * 2 - 16) / 2
  doc.setDrawColor(0); doc.setLineWidth(0.3)
  doc.line(MARGEN, y, MARGEN + col, y)
  doc.line(MARGEN + col + 16, y, ancho - MARGEN, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90)
  doc.text('Entrega taller', MARGEN, y + 4.5)
  doc.text('Recibe transporte', MARGEN + col + 16, y + 4.5)

  pieDePagina(doc)
  return doc
}

export function descargar(doc, nombre) {
  doc.save(nombre)
}
