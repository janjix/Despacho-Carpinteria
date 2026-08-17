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

## El panel en un televisor

El criterio de diseño no es estético sino de distancia de lectura. A cuatro o
cinco metros un carácter necesita medir cerca de 25 mm para leerse sin
esfuerzo; en un televisor de 55 pulgadas a 1080p eso son unos 40 px de altura
de letra. Por eso el cuerpo base arranca en 34 px y los números grandes en
100. Todo lo que en un monitor de escritorio parece exagerado es lo justo en
la pared del taller.

De ahí salen las demás decisiones:

- **Cada tarjeta lleva su área** bajo el nombre, en cuerpo menor. Los grupos
  salen en seguidilla por área, sin encabezados de sección: el cambio se nota
  por la etiqueta de cada tarjeta y no se pierde una fila entera en un título.
- **Lo despachado desaparece.** Cuando un viaje pasa a *despachado* o
  *entregado*, sus bultos salen del panel. Lo que va camino a la obra no aporta
  nada en la pared y solo ocupa sitio. Se puede desactivar desde los ajustes;
  no se borra nada de la base.
- **Sin scroll.** Lo que no cabe se pagina solo cada doce segundos, con puntos
  abajo que indican en qué página va. Nadie va a bajar con la rueda del ratón
  en una pantalla colgada a tres metros de altura.
- **Blanco roto sobre gris muy oscuro**, no blanco puro sobre negro puro. A
  esa distancia el contraste máximo produce halo alrededor de las letras.
- **Los estados se distinguen por tres cosas a la vez**: color de fondo, la
  palabra escrita, y una tira de barritas cuando el mueble tiene varios
  bultos. Funciona con alguien que no distinga verde de amarillo.
- **Márgenes generosos.** Muchos televisores recortan hasta un 4% del borde.
- **El fondo oscuro se aplica al documento**, no solo al contenedor de la
  vista. Si vive únicamente en el contenedor, cualquier hueco que quede por
  debajo deja ver el blanco de la página: contenido corto, altura mal
  calculada por el navegador del televisor, o el rebote del scroll. La clase
  `panel-oscuro` se pone en `html` mientras el panel está montado y se quita
  al salir. La altura declara `100vh` y luego `100dvh`, porque muchos
  navegadores de Smart TV no entienden la segunda y se quedan con la primera.

**Controles** en un cajón lateral que se abre con el botón *Ajustes* de la
esquina. Antes eran una barra superior que tapaba la cabecera justo cuando
alguien intentaba ajustarla. Dentro: proyecto, tamaño de letra, tarjetas por
pantalla, orientación, los dos filtros, pantalla completa y salida. Los
ajustes se recuerdan en el navegador.

**Orientación vertical** para un televisor montado de canto. Apila la
cabecera, reparte los contadores a lo ancho y usa columnas más anchas: en una
pantalla angosta y alta, pocas columnas anchas leen mejor que muchas
estrechas.

El filtro de lo que falta es el más útil el día del despacho: deja de mostrar
lo ya cargado y la pantalla se va vaciando a medida que sube el camión.

**Dos salidas**: una discreta arriba y un botón claro entre los controles.
Hacen falta las dos porque el panel se abre a pantalla completa y en un
televisor en kiosco no hay barra de navegador donde retroceder.

**Calibración.** Antes de fijar el televisor, abre `vista-panel-tv.html` en
él, párate donde va a estar el operario y elige el tamaño desde ahí, no desde
el escritorio. Es el único modo de acertar a la primera.

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
   | `supabase/parche-03-escaneo-automatico.sql` | siempre |
   | `supabase/parche-04-codigos-unicos.sql` | siempre |
   | `supabase/parche-05-estado-manual.sql` | siempre, al final |
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

## Guía de despacho

Botón *Guía de despacho PDF* dentro del detalle de cualquier viaje. Se imprime
al cerrar la carga y viaja con el chofer.

Cumple tres funciones y por eso tiene la forma que tiene:

1. **Comprobante de entrega.** El conteo va grande arriba, porque es el número
   que se cuenta en el portón antes de arrancar.
2. **Lista de verificación en obra.** Cada renglón lleva una casilla a la
   izquierda para tachar lo que baja del camión.
3. **Respaldo del taller.** Si falta algo, el papel dice qué subió y a qué hora
   se escaneó cada bulto.

Sale en tres ejemplares idénticos, marcados *original taller*, *copia
transporte* y *copia obra*.

**Sin membrete.** La franja superior va en blanco, con el mismo alto que
ocupaba antes el logo, para imprimir sobre papel preimpreso. La constante
`ALTO_MEMBRETE` en `guiaDespacho.js` controla ese hueco: súbela o bájala según
la altura real del membrete del papel.

Los datos que vivían ahí no se perdieron. El código del viaje y la fecha
pasaron al bloque gris, a la derecha del conteo, y el camión con su placa y su
conductor quedaron bajo el proyecto. El pie de cada página repite el código
del viaje, por si las hojas se separan.

Los bultos se agrupan por proyecto y área, para que en obra se baje por
ambientes. Una sección nunca queda huérfana al pie de página: si no caben al
menos dos renglones bajo su título, la sección entera pasa a la hoja
siguiente. El bloque de firmas se queda en la misma página que la última
sección siempre que quepa, porque una hoja suelta con tres rayas invita a
firmar sin haber visto la lista.

## Cambiar el estado a mano

Botón *Estado* en cada bulto dentro del proyecto. Lleva el ítem a pendiente,
embalado o cargado directamente, sin pasar por el lector.

Existe porque la realidad del taller no siempre pasa por el escáner: una
etiqueta se moja, alguien sube un bulto sin escanearlo, se escanea el que no
era. Sin esta salida, la única forma de corregir sería borrar el ítem y
volver a crearlo, lo que cambiaría su código y dejaría una etiqueta impresa
apuntando a nada.

Pide motivo y queda en la bitácora igual que un escaneo, con el estado del que
venía. La base mantiene la coherencia de las fechas: pasar a pendiente limpia
las dos horas y suelta el viaje; pasar a cargado sin hora de embalaje la
rellena en ese momento, porque un bulto cargado que nunca estuvo embalado
rompería los conteos.

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

### Los códigos los genera la base, no el navegador

El código de un ítem se arma dentro de la misma transacción que lo inserta,
con la función `crear_items`. Antes se armaba en el navegador abreviando el
nombre del área a tres letras y el del proyecto a cinco, y eso tenía un fallo
que aparecía solo cuando el taller crecía:

```
Vestier principal → VES     Vestidor        → VES
Baño              → BAN     Baño de visitas → BAN
Casa Montaña 12   → CASAM   Casa Montaña 14 → CASAM
```

Dos áreas con la misma abreviatura llevan contadores separados, así que al
insertar el segundo ítem el código chocaba con uno existente y Supabase
devolvía un 409 sin explicación.

La solución no fue abreviar mejor, porque cualquier abreviatura acaba
chocando. Ahora la base asigna la abreviatura comprobando las que ya están
tomadas en su ámbito, cambiando el último carácter por un número: `VES` y
`VE2`, `BAN` y `BA2`, `CASAM` y `CASA2`. El ámbito de un área es su proyecto,
así que dos proyectos distintos pueden tener cada uno su `COC`.

El parche 04 además repara los códigos cortos ya duplicados. Los ítems que ya
existen conservan su código: una etiqueta impresa no puede cambiar de nombre.

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

## Escaneo automático y global

**No hay modo.** La primera lectura de una etiqueta significa embalado y la
segunda significa cargado. El estado del bulto ya contiene esa información y
volver a pedirla solo abría la puerta a que alguien la diera mal.

El caso que lo motiva: la laptop está lejos del puesto de embalaje, el lector
llega por radio y nadie está frente a la pantalla. Un modo mal puesto habría
marcado como cargado un camión entero que apenas se estaba embalando.

**La escucha vive en la app entera**, no en una pantalla. El proveedor
`EscaneoProvider` envuelve todas las rutas, incluido el panel del televisor.
Da igual en qué apartado esté abierta la app: si llega una lectura, se
registra. La pantalla de escaneo solo muestra en grande lo que ya está
pasando.

**Barra fija abajo.** En todas las pantallas menos la de escaneo aparece una
barra con el último resultado, los contadores de la sesión, el viaje activo y
un reloj que corre. El reloj es a propósito: si se congela, la app dejó de
correr, y eso se nota desde lejos. Una pantalla en blanco no.

**Bloqueo de suspensión.** La app pide `wakeLock` para que el equipo no se
duerma. Una laptop dormida no recibe teclas, y el lector pita igual, así que
el operario creería que registró. El bloqueo se vuelve a pedir cada vez que la
pestaña recupera el foco, porque el navegador lo suelta al cambiar de ventana.

### Lo que la app no puede resolver

Si la laptop está **apagada**, el escaneo se pierde y nadie se entera: el
lector pita porque descifró el código de barras, no porque alguien lo haya
recibido. Ningún código dentro del navegador puede recibir teclas cuando el
navegador no existe.

Lo mismo si el lector queda **fuera de alcance** del receptor.

La única solución real para eso es un lector con memoria interna, de los que
se venden como *batch mode* o *modo inventario*: guardan las lecturas en el
propio aparato y las vuelcan al reconectar. Cuestan algo más y eliminan la
dependencia de que haya una máquina despierta al otro lado.

### Cargar sin viaje activo

En automático el viaje es opcional. Si no hay ninguno seleccionado, el bulto
se marca como cargado igual y queda **sin camión asignado**, con aviso.

Rechazarlo habría sido peor: el operario está lejos de la pantalla, no vería
el rechazo, y el bulto subiría al camión sin registro de ningún tipo.

Esos bultos aparecen dentro del detalle de cualquier viaje abierto, con un
botón para asignarlos de una vez. La asignación queda en la bitácora como
*asignado al viaje después del escaneo*.

Si hay un solo viaje abierto, la app lo elige sola. Con dos o más decide la
persona, y la elección se recuerda entre recargas.

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
    guiaDespacho.js     guía por camión, para firmar y entregar
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
