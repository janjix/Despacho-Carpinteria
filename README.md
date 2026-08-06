# TECC Despacho

Control de embalaje y carga de muebles por proyecto y área. Cada nombre de la
lista genera una etiqueta con código de barras. Se escanea al embalar y se
escanea otra vez antes de subir al camión.

Estados: **pendiente** (gris) → **embalado** (amarillo) → **cargado** (verde).

---

## Pantallas

| Dirección | Para qué sirve | Dónde corre |
|---|---|---|
| `#/proyectos` | Crear proyectos, abrirlos, borrarlos | Escritorio |
| `#/proyecto/{id}` | Áreas, ítems, etiquetas, PDF | Escritorio |
| `#/escaneo` | Lector USB, modo Embalaje o Carga | Tablet o teléfono en el taller |
| `#/camiones` | Camiones y su historial de viajes | Escritorio |
| `#/panel/{id}` | Avance en vivo, para el televisor | Navegador en kiosco |

El panel tiene dos salidas: una discreta arriba a la izquierda y un botón
claro abajo, junto al selector de proyecto. Vuelve al detalle del proyecto que
estaba mostrando. Hacen falta las dos porque el panel se abre a pantalla
completa y en un televisor en kiosco no hay barra de navegador donde retroceder.

---

## Instalación

```bash
npm install
cp .env.example .env      # completar con las claves de Supabase
npm run dev
```

### Supabase

1. Crear un proyecto nuevo en supabase.com.
2. SQL Editor → ejecutar en este orden, cada archivo completo y sin nada
   seleccionado en el editor:

   | Archivo | Cuándo |
   |---|---|
   | `supabase/migracion.sql` | siempre, primero |
   | `supabase/parche-02-camiones-viajes.sql` | siempre, después |
   | `supabase/parche-01-codigo-plano.sql` | solo si la base es anterior al cambio de código sin guiones |

   El parche 01 empieza con un `alter table items`. Si se ejecuta sobre una
   base vacía falla con *relation "items" does not exist*, que es correcto:
   ese archivo no es para instalaciones nuevas.
3. Project Settings → API → copiar `Project URL` y `anon public` a `.env`.
4. Database → Replication → confirmar que `items` y `escaneos` están en la
   publicación `supabase_realtime`. La migración ya lo intenta; si el proyecto
   es viejo puede fallar en silencio.

### Cargar la lista de ítems

Tres caminos, en orden de preferencia:

1. **Subir el PDF** (recomendado). Botón *Subir PDF*. Un PDF generado por
   software lleva el texto adentro con sus coordenadas, así que pdf.js lo lee
   entero dentro del navegador: sin OCR, sin clave, sin salir a la red.

   La app agrupa los fragmentos por posición vertical para formar filas y por
   posición horizontal para formar columnas, propone qué es cada una, y tú
   corriges con un selector. Las columnas que no marques quedan tachadas y no
   entran. Así se descartan descripción, material y observaciones sin copiar
   nada.

   **Si el PDF es un escaneo** no hay capa de texto. La app lo detecta, te
   dice cuántos fragmentos de texto y cuántas imágenes encontró, y ofrece dos
   salidas:

   - **OCR aquí mismo**, con Tesseract dentro del navegador. Gratis y sin
     clave. Rasteriza a 500 dpi, detecta las columnas por los bordes dibujados
     de la tabla y asigna cada palabra a su celda. La primera vez descarga unos
     15 MB de motor e idioma y tarda cerca de un minuto por página.

     La resolución no es un número al azar. Medido contra el listado real de
     Spazio 3D de 60 muebles: 300 dpi acierta 55 nombres, 400 acierta 59, 500
     acierta los 60, y 600 no mejora y pesa 40% más. El PDF de origen tiene
     150 dpi nativos, así que por encima de eso el rasterizador interpola, y
     esa interpolación es justamente lo que ayuda a Tesseract con letras que a
     tamaño original quedan dentadas.

     Hay un tope de 30 megapíxeles por página. Safari de iPhone corta cerca de
     los 17 y devuelve un canvas en blanco sin avisar, así que la app baja los
     dpi antes de llegar ahí en vez de fallar en silencio.
   - **Leer con IA**, que manda cada página al lector de imágenes. Más rápido
     y más exacto, pero necesita la clave de Anthropic.

   Con cualquiera de los dos, revisa la tabla antes de crear etiquetas.

### Una línea es una etiqueta

Ningún importador fusiona renglones automáticamente. Si la lista trae dos veces
`CURVA TV IZQ`, salen dos ítems con dos códigos distintos.

Es deliberado. En un listado de muebles los nombres se distinguen por
partículas cortas: IZQ y DER, un número al final, un SUP o un INF. Si el
programa junta dos filas porque le parecen iguales, el error no se ve: la
cuenta de bultos sigue cuadrando y el mueble que falta aparece en obra.

En su lugar, el panel de revisión marca tres cosas sobre la tabla:

- **Repetidos exactos**, con un botón para unirlos si de verdad estaba
  duplicada la línea. La decisión es del usuario, no del programa.
- **Opuestos**: nombres iguales salvo IZQ contra DER, SUP contra INF, y otros
  pares. Casi siempre son correctos, y aun así conviene confirmar que están
  los dos.
- **Una letra de diferencia**: `ISLA 1` contra `SLA 1`. Esa es la firma típica
  de un error de OCR y es la que más vale la pena mirar.

Las diferencias de puro número quedan fuera a propósito. `MODULO 1` y
`MODULO 2` son la norma en estos listados y marcarlas sería solo ruido.

2. **Pegar**. Botón *Pegar lista*. Copias las dos columnas desde
   el PDF de Mozaik o desde una hoja de cálculo y las pegas. El parser separa
   cantidad y nombre, descarta encabezados y bordes de tabla, y suma cantidades
   cuando un nombre se repite. Gratis, exacto y sin red.

   Cuida el caso `ZAPATERA 4`: el número final es parte del nombre. Solo se lee
   como cantidad un número al principio de la línea, o la primera celda cuando
   el texto viene con tabulaciones desde Excel. La casilla *La primera columna
   es la cantidad* se desmarca cuando la lista trae solo nombres.

3. **A mano**, en la tabla del editor.

4. **Desde una foto**, que necesita clave de API y solo hace falta cuando la
   lista está manuscrita o el PDF es un escaneo.

### Lectura de listas por foto

La extracción corre en `api/extraer.js`, una función serverless de Vercel.
La clave de Anthropic vive ahí y nunca llega al navegador.

Es opcional. Sin ella todo funciona salvo el botón de la foto, y para una
lista impresa que se puede copiar, pegar es mejor que fotografiar.

En Vercel: Settings → Environment Variables → agregar `ANTHROPIC_API_KEY`
**sin** el prefijo `VITE_`. La variable `ANTHROPIC_MODELO` es opcional: por
defecto usa `claude-sonnet-5`, y `claude-haiku-4-5-20251001` cuesta la mitad y
basta para listas impresas. Cualquier variable con ese prefijo termina dentro
del bundle público.

En desarrollo local la función no corre con `npm run dev`. Usar `vercel dev`,
o cargar los ítems a mano mientras se prueba.

---

## Despliegue en Vercel

```bash
npm i -g vercel
vercel
```

Framework: Vite. Build: `npm run build`. Output: `dist`.

Variables de entorno a configurar en el panel de Vercel:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY`

---

## Camiones y viajes

Dos entidades separadas a propósito. El **camión** es el vehículo y existe
entre viaje y viaje. El **viaje** es una carga concreta, con su código, su
destino, su fecha y su contenido.

Guardar el camión directamente en el ítem habría perdido el historial: al
segundo viaje ya no se sabría qué llevó el primero. Con esta forma, la ficha
de un camión muestra qué lleva ahora y qué llevó antes, cada carga con sus
bultos y sus horas.

El código de viaje es `V-AAMMDD-NNN`, correlativo global, generado en la base
de datos para que dos personas abriendo viajes a la vez no colisionen.

**En modo Carga el viaje es obligatorio.** Si no hay uno seleccionado, el
escaneo se rechaza con un aviso y queda registrado en la bitácora como
`sin_viaje`. Es deliberado: un bulto marcado como cargado sin decir en qué
camión subió no resuelve el problema que esta app existe para resolver.

Estados de un viaje: `cargando` → `despachado` → `entregado`. Solo los dos
primeros admiten escaneos.

Borrar un viaje devuelve sus bultos a estado embalado y los deja libres para
cargarse en otro. El viaje desaparece; la carga no se pierde.

## Anular un escaneo

Botón *Anular* en tres sitios: sobre el último escaneo en la pantalla de
lectura, en cada línea del historial reciente, y en el detalle de cada ítem
dentro del proyecto.

Pide motivo. No es un capricho: un escaneo deshecho sin explicación es
indistinguible de un fallo de la app cuando alguien revisa la bitácora tres
semanas después. El motivo se guarda junto al estado del que venía el ítem
(`era el izquierdo, subieron el derecho · venía de cargado`).

Nada se borra. La anulación no elimina el escaneo original, lo contradice, y
las dos entradas quedan en `escaneos`.

Anular un bulto cargado lo devuelve a embalado y lo saca del viaje. Anular uno
embalado lo devuelve a pendiente.

## Impresora térmica

Las etiquetas se generan como PDF de **101 × 59 mm**, una por página,
orientación horizontal. El PDF se abre en una pestaña nueva y dispara el
diálogo de impresión.

En el diálogo del navegador:

- **Tamaño de papel**: el rollo de 101 × 59 mm. Si el driver no lo lista, crear
  un tamaño personalizado en las preferencias de la impresora, no en el
  navegador.
- **Escala**: 100 %. Nunca "Ajustar a la página": encoge el código de barras y
  el lector empieza a fallar de forma intermitente, que es peor que fallar
  siempre.
- **Márgenes**: ninguno.
- **Gráficos de fondo**: activados.

Impresoras probadas con este formato: Zebra ZD220 y TSC TE200 a 203 dpi. Con
un código de 18 caracteres, cada módulo del Code 128 mide unos 0,38 mm, que a
203 dpi son tres puntos de impresión. Suficiente para cualquier lector láser.

**El código de barras no lleva guiones.** El formato visible es
`TECC-CASAM-COC-047`, y eso es lo que se imprime en texto legible debajo del
símbolo. Pero el Code 128 codifica `TECCCASAMCOC047`, sin guiones.

El motivo: el lector no envía caracteres, envía códigos de tecla. Con el lector
en distribución US y la tablet en latinoamericano, la tecla del guion llega
como comilla simple, el código deja de coincidir y la app responde "código no
encontrado". Funciona en la máquina de la oficina y falla en la del taller, sin
que nadie entienda por qué.

De paso el símbolo gana densidad: quince caracteres en 88 mm dan módulos de
0,45 mm contra los 0,38 mm de la versión con guiones. Más margen para etiquetas
rayadas o mal pegadas.

La comparación en la base de datos usa la columna generada `codigo_plano`, así
que la app acepta las dos formas: sin guiones si vino del lector, con guiones
si alguien lo tecleó a mano leyendo la etiqueta. Las etiquetas impresas antes
de este cambio siguen sirviendo.

**Límite de longitud.** Cinco caracteres del proyecto y tres del área dan 18 en
total con guiones, 15 sin ellos. La app avisa si pasa de 24.

---

## Lector de código de barras

Cualquier lector USB en modo HID. No hay que configurarlo: se comporta como un
teclado y la app escucha las teclas de toda la ventana.

Dos detalles que conviene verificar en el lector antes de llevarlo al taller:

1. **Sufijo Enter activado.** Casi todos vienen así de fábrica. Si el tuyo no
   lo trae, la app igual cierra la lectura por tiempo, pero con un retardo de
   unos 300 ms por escaneo.
2. **Distribución de teclado en inglés.** Con distribución latinoamericana
   algunos lectores mandan el guion como otro carácter y el código no coincide.

La pantalla de escaneo también acepta el código tecleado a mano, para cuando la
etiqueta se rasga o se moja.

---

## Lectura por cámara

Respaldo para cuando la pistola se queda sin batería o alguien se la llevó a
otra mesa. Botón **Leer con la cámara** en la pantalla de escaneo.

Dos motores, elegidos en ese orden:

1. **`BarcodeDetector`**, nativo en Chrome de Android. Sin descargas y sin
   librería. Es el camino normal.
2. **ZXing**, que se carga solo si el navegador no trae el primero. Cubre
   Safari de iPhone y los Chrome viejos. Son unos 110 kB comprimidos que no
   se descargan a menos que hagan falta.

Detalles que importan en el taller:

- **Requiere HTTPS.** Vercel lo da por defecto. En desarrollo funciona en
  `localhost`, pero si pruebas desde el teléfono contra la IP local de tu PC
  el navegador va a bloquear la cámara.
- **Botón de linterna** cuando el equipo lo soporta, que en el galpón de noche
  es la diferencia entre leer y no leer.
- **El mismo código no se repite** dentro de dos segundos y medio, para que
  dejar la etiqueta frente al lente no dispare veinte escaneos.
- **La luz directa del mediodía la rompe.** En el portón, de frente al sol, la
  cámara no lee. Por eso es respaldo y no método principal.

---

## Decisiones tomadas al construirlo

**Sin registro de usuario.** El escaneo queda trazado por código, acción, hora
y resultado en la tabla `escaneos`, no por persona. Las políticas RLS abren
lectura y escritura al rol `anon`. Si más adelante hace falta saber quién
escaneó, activar Supabase Auth y cambiar `using (true)` por
`using (auth.role() = 'authenticated')` en las cuatro tablas.

**La transición de estado se resuelve en Postgres.** La función `escanear()`
bloquea la fila, decide la transición y escribe la bitácora en una sola
transacción. Dos lectores escaneando el mismo bulto al mismo tiempo no pueden
producir un estado inconsistente. Hacerlo en el cliente habría sido más simple
y habría fallado el primer día que dos personas trabajen en paralelo.

**El correlativo vive en la tabla de áreas.** `reservar_correlativo()` reserva
un bloque de números de forma atómica. Los números de los ítems borrados no se
reutilizan, así que una etiqueta impresa nunca puede referirse a dos bultos
distintos a lo largo de la vida del proyecto.

**Escucha de teclado en `window`, no en un input con foco.** El input con foco
es la solución habitual y se rompe en cuanto alguien toca un botón de la
pantalla. El operario no se da cuenta hasta que un escaneo no entra. Escuchar
en `window` e ignorar las teclas cuando el destino es un campo de texto cubre
los dos casos.

**El estado del grupo lo define su etiqueta más atrasada.** Un mueble con seis
bultos aparece como cargado solo cuando los seis subieron al camión. Es la
lectura conservadora y es la que evita la segunda visita a obra.

**Borrado lógico en todo.** Nada se elimina de la base de datos. `deleted_at`
oculta el registro de la app y conserva la trazabilidad.

**PDF por carga diferida.** jsPDF pesa más que el resto de la app junta. La
pantalla de escaneo, que es la que está abierta todo el día en la tablet, no lo
descarga hasta que alguien pide imprimir.

---

## Estructura

```
api/
  extraer.js            función serverless: imagen → lista de ítems
src/
  App.jsx               navegación por hash
  lib/
    supabase.js         cliente
    codigos.js          códigos, fechas de Venezuela, vocabulario de estado
    parsearLista.js     texto pegado desde PDF o Excel a filas de ítems
    leerPdf.js          extracción de tabla desde PDF con pdf.js
    ocr.js              OCR local con Tesseract y rejilla por píxeles
    revisarFilas.js     repetidos, opuestos y errores de una letra
    etiquetas.js        PDF de 101 × 59 mm con Code 128
    listasPdf.js        lista de embalaje y lista de carga
    sonido.js           pitidos del escáner con Web Audio
  hooks/
    useSupabase.js      todas las consultas
    useEscaner.js       captura del lector HID
  components/
    Proyectos.jsx       lista de proyectos
    Proyecto.jsx        detalle, áreas, ítems, impresión
    EditorItems.jsx     carga manual, pegado, PDF y foto
    ImportarPdf.jsx     subida del PDF y asignación de columnas
    RevisionLista.jsx   avisos antes de generar etiquetas
    Escaneo.jsx         pantalla del lector
    Panel.jsx           panel del televisor
    ui.jsx              primitivas compartidas
supabase/
  migracion.sql         tablas, índices, RLS, funciones, realtime
```
