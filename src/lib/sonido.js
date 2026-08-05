// Sonidos del escáner generados con Web Audio.
// Sin archivos de audio: cargan al instante y no dependen de la red del taller.

let ctx = null

function contexto() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

/** El navegador exige un gesto del usuario antes de reproducir audio. */
export function despertarAudio() {
  const c = contexto()
  if (c && c.state === 'suspended') c.resume()
}

function tono(frecuencia, duracion, inicio = 0, volumen = 0.25) {
  const c = contexto()
  if (!c) return
  const osc = c.createOscillator()
  const gan = c.createGain()
  osc.type = 'square'
  osc.frequency.value = frecuencia
  gan.gain.setValueAtTime(0, c.currentTime + inicio)
  gan.gain.linearRampToValueAtTime(volumen, c.currentTime + inicio + 0.01)
  gan.gain.exponentialRampToValueAtTime(0.001, c.currentTime + inicio + duracion)
  osc.connect(gan).connect(c.destination)
  osc.start(c.currentTime + inicio)
  osc.stop(c.currentTime + inicio + duracion + 0.02)
}

/** Un pitido corto y agudo: el escaneo entró */
export function sonarOk() {
  tono(1180, 0.09)
}

/** Dos pitidos medios: ya estaba registrado */
export function sonarAviso() {
  tono(760, 0.08, 0)
  tono(760, 0.08, 0.13)
}

/** Tres pitidos graves y largos: rechazo */
export function sonarAlerta() {
  tono(220, 0.16, 0, 0.35)
  tono(220, 0.16, 0.22, 0.35)
  tono(220, 0.26, 0.44, 0.35)
}

export function sonar(tonoNombre) {
  if (tonoNombre === 'alerta') return sonarAlerta()
  if (tonoNombre === 'aviso') return sonarAviso()
  return sonarOk()
}

/** Vibración en tablets y teléfonos, cuando el equipo la soporta */
export function vibrar(tonoNombre) {
  if (!navigator.vibrate) return
  if (tonoNombre === 'alerta') navigator.vibrate([120, 80, 120, 80, 120])
  else if (tonoNombre === 'aviso') navigator.vibrate([70, 60, 70])
  else navigator.vibrate(45)
}
