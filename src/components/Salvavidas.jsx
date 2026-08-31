// Captura de errores de React.
//
// Sin esto, una excepción durante el render deja el árbol vacío y la pantalla
// en blanco, sin nada en la consola que apunte al sitio. En una laptop de
// taller o en un televisor eso es imposible de diagnosticar: el operario solo
// ve que "no hace nada".
//
// Aquí el error se muestra en pantalla, con el componente donde ocurrió y un
// botón para volver sin recargar toda la app.

import { Component } from 'react'

export default class Salvavidas extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, pila: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    this.setState({ pila: info?.componentStack ?? null })
    console.error('Error en la interfaz:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold mb-3">Esta pantalla falló</h1>
        <p className="text-[15px] text-tenue mb-5">
          El resto de la app sigue funcionando. Vuelve atrás y vuelve a entrar;
          si se repite, manda esta información.
        </p>

        <pre className="bg-white border border-alerta border-l-4 p-4 text-[13px]
                        whitespace-pre-wrap overflow-auto max-h-64 mb-5">
          {String(this.state.error?.message ?? this.state.error)}
          {this.state.pila ? `\n${this.state.pila}` : ''}
        </pre>

        <div className="flex flex-wrap gap-3">
          <button
            className="btn btn-solido"
            onClick={() => this.setState({ error: null, pila: null })}
          >
            Reintentar
          </button>
          <button className="btn btn-linea" onClick={() => window.location.reload()}>
            Recargar la app
          </button>
        </div>
      </div>
    )
  }
}
