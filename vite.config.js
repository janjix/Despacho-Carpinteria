import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  plugins: [
    react(),
    // Los TV Box baratos traen un Chrome viejo que nunca se actualiza, y ahí
    // sintaxis como ?. o ?? no existe: el bundle revienta en la primera línea
    // y la pantalla queda en blanco sin ningún mensaje.
    //
    // Este plugin genera un segundo bundle transpilado con sus polyfills. El
    // navegador moderno descarga el normal y lo ignora; el viejo carga el
    // otro. Pesa más en disco, pero nadie descarga los dos.
    legacy({
      // Chrome 64 es de 2018: cubre prácticamente cualquier TV Box en venta
      targets: ['chrome >= 64', 'android >= 6', 'firefox >= 67', 'safari >= 12'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime']
    })
  ],
  server: { port: 5173 }
})
