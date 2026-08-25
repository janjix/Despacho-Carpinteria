/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        papel:    '#F5F4F1',
        tinta:    '#16181C',
        tenue:    '#6E6A63',
        borde:    '#DCD8D1',
        pendiente:'#8A857C',
        embalado: '#E8A400',
        cargado:  '#1E8E4E',
        alerta:   '#C42B2B',
        panel:    '#14161A',
        panelsup: '#1E222A'
      },
      fontFamily: {
        display: ['Archivo', 'Arial Narrow', 'sans-serif'],
        cuerpo:  ['Inter', 'system-ui', 'sans-serif'],
        codigo:  ['"IBM Plex Mono"', 'ui-monospace', 'monospace']
      }
    }
  },
  plugins: []
}
