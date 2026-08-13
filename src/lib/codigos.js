// Códigos, fechas y vocabulario de estado.
// Todo lo que se imprime o se compara pasa por aquí.

export const ZONA = 'America/Caracas' // UTC-4, fija todo el año

const LARGO_MAXIMO = 24 // límite para que el Code 128 quepa legible en 88 mm

/**
 * Convierte texto libre en un fragmento apto para el código de barras:
 * sin acentos, sin espacios, mayúsculas, solo A-Z y 0-9.
 */
export function abreviar(texto, largo = 5) {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, largo) || 'X'
}

/** TECC-{proyecto}-{area}-{nnn} */
export function armarCodigo(proyectoCorto, areaCorta, numero) {
  const n = String(numero).padStart(3, '0')
  return `TECC-${proyectoCorto}-${areaCorta}-${n}`
}

export function codigoLargo(codigo) {
  return codigo.length > LARGO_MAXIMO
}

/**
 * Carga útil del código de barras: sin guiones, solo A-Z y 0-9.
 *
 * El lector no envía caracteres, envía códigos de tecla. Con el lector en
 * distribución US y la tablet en latinoamericano, la tecla del guion llega
 * como comilla simple y el código deja de coincidir. Falla en una máquina y
 * funciona en otra, que es la peor clase de falla.
 *
 * Quitando el guion del barcode el problema desaparece y el símbolo gana
 * densidad: 15 caracteres en 88 mm dan módulos de 0,45 mm contra los 0,38 mm
 * de la versión con guiones.
 *
 * El código con guiones sigue impreso debajo, legible para teclear a mano.
 */
export function aPlano(codigo) {
  return (codigo ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

export const LARGO_MAXIMO_CODIGO = LARGO_MAXIMO

// ---------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------

export function hora(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-VE', {
    timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false
  })
}

export function fechaHora(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('es-VE', {
    timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false
  })
}

export function fechaCorta(fecha) {
  if (!fecha) return 'sin fecha'
  const d = typeof fecha === 'string' ? new Date(`${fecha}T12:00:00`) : fecha
  return d.toLocaleDateString('es-VE', {
    timeZone: ZONA, day: '2-digit', month: 'short', year: 'numeric'
  })
}

/** Fecha de hoy en Venezuela, formato YYYY-MM-DD */
export function hoyVenezuela() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date())
  const v = Object.fromEntries(partes.map(p => [p.type, p.value]))
  return `${v.year}-${v.month}-${v.day}`
}

export function esHoy(fecha) {
  return Boolean(fecha) && fecha === hoyVenezuela()
}

// ---------------------------------------------------------------------
// Vocabulario de estado. Un solo lugar para el color y el nombre.
// ---------------------------------------------------------------------

export const ESTADOS = {
  pendiente: { nombre: 'Pendiente', hex: '#8A857C', fondo: '#F0EEEA', texto: '#3E3B36' },
  embalado:  { nombre: 'Embalado',  hex: '#E8A400', fondo: '#FDF3D8', texto: '#5C4300' },
  cargado:   { nombre: 'Cargado',   hex: '#1E8E4E', fondo: '#DDF2E6', texto: '#0E4B29' }
}

export const ORDEN_ESTADO = ['pendiente', 'embalado', 'cargado']

/** Resumen de conteos sobre una lista de ítems */
export function resumir(items = []) {
  const r = { total: items.length, pendiente: 0, embalado: 0, cargado: 0 }
  for (const it of items) r[it.estado] = (r[it.estado] ?? 0) + 1
  return r
}

// ---------------------------------------------------------------------
// Mensajes de resultado de escaneo. La interfaz habla con una sola voz.
// ---------------------------------------------------------------------

export function mensajeEscaneo(resultado, modo, item) {
  const nombre = item ? item.nombre : ''
  switch (resultado) {
    case 'ok':
      return modo === 'embalaje'
        ? { titulo: 'Embalado', detalle: nombre, tono: 'embalado' }
        : { titulo: 'Cargado', detalle: nombre, tono: 'cargado' }
    case 'duplicado':
      return {
        titulo: 'Ya estaba registrado',
        detalle: `${nombre} se escaneó antes en este modo`,
        tono: 'aviso'
      }
    case 'fuera_de_orden':
      return {
        titulo: 'Este bulto no pasó por embalaje',
        detalle: `${nombre}. Escanéalo primero en modo Embalaje`,
        tono: 'alerta'
      }
    default:
      return {
        titulo: 'Código no encontrado',
        detalle: 'La etiqueta no pertenece a ningún proyecto cargado',
        tono: 'alerta'
      }
  }
}
