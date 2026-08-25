// Captura del lector USB.
//
// El lector se comporta como un teclado: teclea el código carácter por
// carácter y cierra con Enter. Lo detectamos por velocidad. Un humano no
// escribe 18 caracteres en menos de 400 ms, así que si la ráfaga es rápida
// y termina en Enter, viene del lector.
//
// Escuchamos en window en lugar de usar un input con foco, porque el foco
// se pierde en cuanto alguien toca cualquier botón de la pantalla y el
// operario no va a darse cuenta hasta que falle un escaneo.

import { useEffect, useRef } from 'react'

const CIERRE_MS = 120   // pausa que da por terminada una ráfaga
const MINIMO = 4        // códigos más cortos se ignoran

export function useEscaner(alLeer, { activo = true } = {}) {
  const buffer = useRef('')
  const ultimaTecla = useRef(0)
  const temporizador = useRef(null)
  const callback = useRef(alLeer)

  useEffect(() => { callback.current = alLeer }, [alLeer])

  useEffect(() => {
    if (!activo) return

    const cerrar = () => {
      const texto = buffer.current.trim()
      buffer.current = ''
      if (texto.length >= MINIMO) callback.current(texto.toUpperCase())
    }

    const alPresionar = (e) => {
      // No robamos las teclas cuando el usuario está escribiendo en un campo
      const destino = e.target
      const editando =
        destino instanceof HTMLElement &&
        (destino.tagName === 'INPUT' ||
         destino.tagName === 'TEXTAREA' ||
         destino.tagName === 'SELECT' ||
         destino.isContentEditable)
      if (editando) return

      const ahora = Date.now()
      if (ahora - ultimaTecla.current > 600) buffer.current = ''
      ultimaTecla.current = ahora

      if (e.key === 'Enter') {
        e.preventDefault()
        clearTimeout(temporizador.current)
        cerrar()
        return
      }

      if (e.key.length === 1) {
        buffer.current += e.key
        clearTimeout(temporizador.current)
        // Algunos lectores no envían Enter. El cierre por tiempo los cubre.
        temporizador.current = setTimeout(cerrar, CIERRE_MS + 200)
      }
    }

    window.addEventListener('keydown', alPresionar)
    return () => {
      window.removeEventListener('keydown', alPresionar)
      clearTimeout(temporizador.current)
    }
  }, [activo])
}
