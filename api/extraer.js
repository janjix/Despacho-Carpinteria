// Lectura de la lista desde una foto.
//
// Corre en el servidor y no en el navegador por una razón: la clave de
// Anthropic no puede viajar en el bundle. Vercel la inyecta desde
// Environment Variables y nunca llega al cliente.

const INSTRUCCION = `Eres un lector de listas de despacho de un taller de carpintería.

Extrae de la imagen cada renglón de la lista de muebles o bultos.

Reglas estrictas:
- Respeta el nombre EXACTAMENTE como aparece escrito. No lo traduzcas, no lo
  corrijas, no lo normalices, no lo abrevies y no lo dividas en partes.
- Si un renglón dice "Closet principal", devuelve un solo ítem con ese nombre.
  No lo desgloses en puertas, entrepaños ni gavetas.
- Si hay una columna de cantidad, úsala. Si no la hay, usa 1.
- Si el renglón trae medidas (por ejemplo 2400x600x18 o 1.20 x 0.60), ponlas
  en "medidas" tal cual aparecen.
- Si trae material (melamina, MDF, un color, un código de tablero), ponlo en
  "material".
- Ignora encabezados de tabla, totales, firmas, sellos y notas al margen.
- Si la imagen está borrosa o no contiene una lista, devuelve items vacío.

Responde SOLO con este JSON. Sin markdown, sin explicación, sin texto antes
ni después:

{"items":[{"nombre":"","descripcion":"","medidas":"","material":"","cantidad":1}]}`

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Solo POST' })
  }

  const clave = process.env.ANTHROPIC_API_KEY
  if (!clave) {
    return res.status(500).json({
      error: 'Falta ANTHROPIC_API_KEY en el servidor. Configúrala en Vercel y vuelve a desplegar.'
    })
  }

  const { imagen, tipo } = req.body ?? {}
  if (!imagen) {
    return res.status(400).json({ error: 'No llegó ninguna imagen' })
  }

  try {
    const respuesta = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': clave,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: tipo || 'image/jpeg', data: imagen } },
            { type: 'text', text: INSTRUCCION }
          ]
        }]
      })
    })

    if (!respuesta.ok) {
      const detalle = await respuesta.text()
      return res.status(502).json({ error: 'La lectura falló', detalle: detalle.slice(0, 400) })
    }

    const datos = await respuesta.json()
    const texto = (datos.content ?? [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .replace(/```json|```/g, '')
      .trim()

    let leido
    try {
      leido = JSON.parse(texto)
    } catch {
      return res.status(422).json({ error: 'La respuesta no vino en el formato esperado' })
    }

    const items = Array.isArray(leido.items) ? leido.items : []
    return res.status(200).json({
      items: items.map(i => ({
        nombre: String(i.nombre ?? '').trim(),
        descripcion: String(i.descripcion ?? '').trim(),
        medidas: String(i.medidas ?? '').trim(),
        material: String(i.material ?? '').trim(),
        cantidad: Math.max(1, parseInt(i.cantidad, 10) || 1)
      })).filter(i => i.nombre)
    })
  } catch (e) {
    return res.status(500).json({ error: 'Error inesperado en el servidor', detalle: String(e).slice(0, 300) })
  }
}
