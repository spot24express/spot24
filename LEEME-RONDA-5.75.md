# RONDA 5.75 · Cuenta que trabaja para el cliente + datos que se copian solos

## Qué resuelve (los pedidos del dueño)

> «Mis Pedidos en vivo» ✔ · «Imágenes imgbb a prueba de redes» ✔ · «Horario de
> los deliverys en el Home, pero editable en Ajustes» ✔ · «El chip Últimas 5 se
> ve encima del precio en el teléfono» ✔ · «El stock de la tarjeta del panel no
> corresponde con lo que queda» ✔ · «Copiar cada dato del pago móvil, el RIF
> solo números» ✔ · «La transición al entrar a un producto/categoría es
> brusca» ✔ · «Crear cuenta con cédula y dirección, y que el checkout los
> autollene» ✔ · «El cliente no puede cambiar su contraseña» ✔

> «Si el producto no tiene descripción, que no aparezca en la tarjeta» ✔
> «En métricas no se ve el gráfico de 7 días, quita la línea en Bs., y quiero
> el gráfico de lunes a domingo» ✔
>
> **Rondas 5.77–5.79 añadidas al mismo lote:** subcategorías con tarjetas
> estilo Farmatodo ✔ · sin contador en las tarjetas ✔ · cambiar categoría de
> un producto revisado y blindado ✔ · filtrado estricto (sin repetidos entre
> principal y subcategoría) ✔ · «en los datos de pago, el ícono de copiar en
> vez de la palabra» ✔ · «mi QR en el pago» ✔ · «varias formas de pago que
> yo activo o apago desde el panel» ✔
>
> **Ronda 5.80 añadida al mismo lote:** «subir el QR como archivo, igual que
> las fotos de productos» ✔ · «varias opciones: pago móvil y transferencias
> de varios bancos» ✔ · «agrega efectivo y punto de venta» ✔
>
> **Ronda 5.81 añadida al mismo lote:** «el − + de cantidad en la tarjeta de
> producto, como Farmatodo» ✔ · «que un producto tenga varias fotos» ✔ ·
> «categoría con subcategorías muestra SOLO las subcategorías (Farmatodo)» ✔
>
> **Ronda 5.82 añadida al mismo lote:** «el + y la píldora se ven muy
> grandes» ✔ · «no puedo agregar más Pago Móvil como forma de pago» ✔ ·
> «cuando un producto tiene varias fotos quiero que se comporte como en
> Farmatodo» ✔ (+ FIX: las fotos se borraban al editar precio o stock)
>
> **Ronda 5.83 añadida al mismo lote:** «en Farmatodo la tarjeta solo muestra
> la portada y el carrusel se ve cuando ENTRAS al producto — corrígelo como
> está en la PWA» ✔
>
> **Ronda 5.84 añadida al mismo lote:** «los QR son individuales por cuenta:
> al agregar otro Pago Móvil no debe traer NINGÚN QR hasta que el admin suba
> la imagen de esa cuenta» ✔
>
> **Ronda 5.85 añadida al mismo lote:** «el chip Últimas 5 va abajo a la
> izquierda y con más transparencia» ✔ · «el + y la cápsula con el
> comportamiento de Farmatodo: al aumentar se retrae sola y pone el número
> en el círculo; lo tocas de nuevo y vuelve la cápsula; más pequeño y con el
> símbolo o el número ocupando el 80 % del círculo» ✔
>
> **Ronda 5.86 añadida al mismo lote:** «quiero que al darle click al código
> QR se le agrande para escanear desde su app bancaria» ✔
>
> **Ronda 5.87 añadida al mismo lote:** «quiero que desde admin pueda
> importar este pdf, que podrá tener más o menos páginas y si el producto no
> existe que lo cree; el nombre será la descripción, el código será el
> código, el costo será el precio, el stock será la existencia; si ya existe
> actualizará el stock y el costo; desde admin deberé cargar el archivo» ✔
>
> **Ronda 5.87b (corrección) añadida al mismo lote:** «fn-importInventory
> 400 (Bad Request) · fn fn-importInventory falló» al probar la importación
> en su PC — el lector de PDF no encontraba su motor dentro del empaquetado
> de Netlify; arreglado, probado DENTRO del paquete real y con test de
> regresión para que no vuelva a pasar ✔
>
> **Ronda 5.87c (diagnóstico) añadida al mismo lote:** volvió a salir el
> MISMO 400 «No se pudo leer el PDF» y el motivo real quedaba invisible —
> ahora el error técnico del lector se ve en la terminal de netlify dev Y
> en el modal (PDF con contraseña, PDF corrupto o una página rota… cada
> caso con su mensaje), el motor se registra de forma blindada y el lector
> libera la memoria tras cada importación ✔
>
> **Ronda 5.87d (causa raíz) añadida al mismo lote:** el diagnóstico de
> 5.87c reveló el motivo REAL de tus 400: «Cannot find package
> 'pdfjs-dist' imported from C:\Users\Erick\spot24\.netlify\…» — el
> lector de PDF estaba instalado SOLO dentro de `functions/` y `netlify
> dev` resuelve los paquetes desde la RAÍZ del proyecto. Ahora pdfjs-dist
> también es dependencia de la raíz (copias `package.json` y corres
> `npm install` UNA vez), el TS2307 de tu VSC desaparece de verdad y si
> falta el paquete en cualquier PC el modal da la ORDEN exacta. Probado
> con tus DOS reportes desde la ruta EXACTA donde netlify dev sirve las
> funciones (57/57 y 390 filas) ✔
>
> **Ronda 5.87e (índice) añadida al mismo lote:** «pantalla me dice no
> tienes acceso a esta area» + «El servidor no pudo importar · Motivo: 9
> FAILED_PRECONDITION: The query requires a COLLECTION_GROUP_ASC index
> for collection variants and field sku» — el lector de PDF YA funcionaba
> (5.87d logró su trabajo) y el 400 nuevo era de la BASE DE DATOS: una
> consulta exigía un índice manual de Firestore (y el toast acusaba
> permisos por error). Consulta reemplazada por una lectura que no
> necesita NINGÚN índice, emparejamiento por SKU en memoria y toast
> honesto: nada que crear a mano en la consola, nunca ✔
>
> **Ronda 5.87f (fotos) añadida al mismo lote:** «me los creo · 57 filas
> leídas · 56 creados · 1 actualizados» ✔ — ¡la importación funcionó de
> verdad! Quedó pendiente que los nuevos salían SIN FOTO y la consola
> marcaba «Failed to load resource: …7feTaW8YRdjJrOpyjHk7.svg»: la
> portada de respaldo es la imagen de la CATEGORÍA y las categorías que
> tú creas no tienen svg en el repo. Ahora un placeholder de SPOT 24
> aparece solo donde falte la foto (catálogo, ficha, carrito, pedidos y
> panel): nada roto mientras les subes sus fotos ✔
>
> **Ronda 5.88 (modal) añadida al mismo lote:** «en la PC con la pantalla
> de 14 pulgadas, cuando edito un producto no veo la parte de abajo del
> cuadro» + «me di cuenta que también pasa en el teléfono» ✔ — la
> transición suave entre páginas (la 5.75) dejaba un transform residual
> que DESANCLABA los modals de la pantalla: en una página alta (tus 57
> productos ≈ 3.200 px) el editor se anclaba a TODA la página y su
> parte de abajo (Guardar/Cancelar) quedaba fuera de pantalla — recortado
> en PC e INVISIBLE en el teléfono. Dos capas de blindaje, medido en
> navegador ANTES/DESPUÉS en 1366×768 y 390×844: completo en ambas ✔
> (CONFIRMADO: «funciono perfecto».)
>
> **Ronda 5.89 (copias de seguridad) añadida al mismo lote:** «es posible
> que admin pueda hacer copia de seguridad del catalogo de productos y
> poder restaurar esa copia y que pueda programar copias de seguridad» +
> «yo uso firebase gratis creo que no tengo almacenamiento o si?» ✔ —
> SÍ se puede y sin pagar: tu plan gratis incluye la base de datos
> Firestore (1 GiB: espacio para MILES de copias de tu catálogo, que
> ocupa ~0,2 MB); lo que NO incluye es el almacenamiento de archivos
> (Cloud Storage) — y no hace falta: las fotos viajan como ENLACES y las
> copias viven DENTRO de la base de datos. Copia manual (descarga JSON),
> copia automática DIARIA a las 6:00 a.m. de Venezuela, lista de copias
> en la nube (últimas 30 de cada tipo) y restauración por REEMPLAZO con
> doble confirmación y copia previa automática para volver atrás ✔
>
> **Ronda 5.90 (campana de notificaciones) añadida al mismo lote:** «quiero
> que solo en PC o tablet en la barra superior antes del icono de instagram
> salga el icono donde al entrar se vean las notificaciones, ya que en
> teléfono no cabe, esto es posible sin romper la pwa?» ✔ — SÍ se puede y
> la PWA no se toca: es solo un icono web más (la instalación, el offline y
> los avisos del teléfono quedan igual). El servidor GUARDA cada aviso de
> pedido («Pago confirmado», «En camino»…) en el historial del cliente en
> el mismo momento que manda el push — con sesión, la campana aparece en la
> barra SOLO en pantallas grandes (antes de Instagram), con punto rojo si
> hay avisos sin leer, y abre una página propia con la lista; los avisos
> quedan consultables aunque el cliente nunca haya activado el push ✔
>
> **Ajuste 5.90.1 (mismo lote, prueba de campo del dueño):** si tu red da un
> tropiezo (el «ERR_QUIC…» de la consola), la campana NO se queda sorda en
> silencio: el canal se RECONECTA SOLO (3 s, 6 s… tope 60 s) y la página
> avisa «conexión en vivo cortada · Reintentar» en vez de fingir que está
> al día. Los avisos nunca se perdían: el servidor los guarda ANTES de
> mandar el push — al reconectar aparece todo, incluido lo que sonó
> mientras la página estaba sorda.
>
> **Ajuste 5.90.2 (mismo lote, tras tu deploy — EL ARREGLO DE LAS IMÁGENES):**
> tenías razón: no era tu Wi-Fi ni imgbb. El «cacheo de imágenes» de la 5.75
> hace que el service worker pida las fotos ÉL MISMO, y el permiso de
> seguridad (la CSP que viaja con sw.js) no incluía a imgbb: toda foto que
> no estuviera ya en el caché del teléfono/PC era rechazada (en tu consola:
> «Refused to connect … Content Security Policy» y «no-response» de workbox).
> Por eso antes del deploy todo cargaba y después se rompió: el cacheo llegó
> a producción con tu push. Arreglo: UNA línea de permiso en `netlify.toml`
> + el hash nuevo que salía en tu consola de PC (about:srcdoc:85, inofensivo).
> **Después del push: abre la app DOS veces en el teléfono** — la 1ª visita
> actualiza el service worker, la 2ª ya muestra todas las fotos (y los QR de
> pago vuelven a verse para tus clientes).
>
> **Ajuste 5.90.3 (mismo lote — «Farmatodo» fuera del alcance del cliente):**
> barrido completo de la marca en todo lo que puede llegar al navegador. El
> ÚNICO texto visible que la traía era una ayuda del panel de fotos (solo lo
> ve el personal, pero viajaba dentro del bundle público que baja cualquier
> visitante) y ~25 comentarios internos de código. Todo quedó redactado en
> neutral, el build verificó CERO apariciones y entra un test guardián nuevo
> (`marcas-cliente.test.ts`) que escanea `src/`, `public/` e `index.html` en
> cada `npm test`: si la marca — o cualquier otra que agregues a su lista —
> reaparece, el test falla y el push se detiene. Nota honesta: si algún
> NOMBRE de producto, promo o categoría tuyo contuviera la palabra, eso vive
> en TUS datos del panel (se cambia ahí); el código ya quedó limpio.
>
> **Ronda 5.91 añadida al mismo lote — SEO + tarjeta de WhatsApp:**
> tu tienda aprendió a presentarse sola. (1) **WhatsApp con cara bonita**:
> compartir tu link ya no sale pelado — sale tarjeta con título,
> descripción y la FOTO de tu fachada de noche (`public/og-cover.jpg`,
> 1200×630, 143 KB). (2) **Google puede encontrarte**: `public/robots.txt`
> (permiso + lo privado fuera del buscador) y `public/sitemap.xml` (mapa
> de las rutas públicas). (3) **Ficha para Google** (JSON-LD con tu
> Instagram) + link canónico. Sin cambios de app: precache intacto en 114.
> **Para ESTE push copia SOLO 4 archivos**: `index.html`,
> `public/robots.txt`, `public/sitemap.xml`, `public/og-cover.jpg`.
> Después del deploy: comparte tu link en un chat de prueba y mira la
> tarjeta (guía completa en el paso 32 de abajo: Search Console, Perfil
> de Negocio y el limpiador de caché de WhatsApp). Cuando compres el
> dominio propio se cambian 6 URLs y listo.
>
> **Ronda 5.92 añadida al mismo lote — el importador entiende TU lista de accesorios:**
> probé el PDF que me mandaste (la «LISTA LIMPIA» de accesorios) contra el importador y
> NO lo reconocía: es otro formato (cabecera distinta partida en renglones, precios con
> «$» y DOS columnas, códigos que empiezan con letra). Ahora el importador DETECTA el
> formato solo: sirve igual para el reporte del POS y para tus listas con doble precio,
> usando el precio SIN impuesto (como pediste). Tus 7 forros que compartían el código
> FORROSINT no se pierden: quedan FORROSINT, FORROSINT-2 … FORROSINT-7 con aviso visible;
> ídem WT4RUNNE-2. Y ya no existe la casilla «omitir existencia 0»: los productos en cero
> TAMBIÉN se crean — cuando una importación futura traiga precio y existencia reales,
> stock y precio se actualizan solos. Probado con TU PDF real: 72 de 72 productos.
> **Para ESTE push copia SOLO 6 archivos**: `functions/src/lib/inventarioPdf.ts`,
> `functions/src/importInventory.ts`, `src/features/admin/services/admin.service.ts`,
> `src/features/admin/pages/AdminProductsPage.tsx`, `src/tests/inventario-pdf.test.ts`
> y `src/tests/fixtures/lista-limpia-items.sample.json` (NUEVO). ⚙️ Toca la función
> fn-importInventory: entra sola con el push, NO hace falta `firebase deploy`
> (guía completa en el paso 33 de abajo).
>
> **Ronda 5.92b añadida al mismo lote — fix del 1er intento de importación («No document to update»):**
> la primera corrida REAL de la importación (con el script local) se detuvo con
> «5 NOT_FOUND: No document to update: products/cfAX4q…». TRANQUILO: no se escribió
> NADA en tu base — el lote entero es atómico y se canceló completo; tu catálogo
> está exactamente como antes. La causa era del importador: cuando en el panel se
> elimina un producto, sus variantes quedan colgando en la base (Firestore nunca
> borra subcolecciones en cascada) y el emparejamiento por SKU las tomaba como si
> el producto padre aún existiera — intentaba actualizar un producto borrado y
> todo abortaba. Ahora el importador VALIDA que cada producto candidato exista
> ANTES de planear las escrituras: las referencias muertas se omiten y sus filas
> se crean como productos NUEVOS. De paso, la variante que se le inventa a un
> producto sin variantes se crea con set (el update anterior habría dado el mismo
> error). Tocan: `functions/src/importInventory.ts` (vuelve a copiarlo) y el
> script local `importar-inventario-local.mjs` (se reemplaza tal cual, mismo uso).
> Tests del backend: de 21 a 27 (nuevo guardián de variantes huérfanas).
>
> **Ronda 5.92c añadida al mismo lote — Eliminar borra el producto COMPLETO:**
> para que nunca más haya variantes colgando, el botón Eliminar del panel ahora
> borra en UN lote atómico TODAS las variantes + la ficha del producto: si algo
> falla no se borra nada, y si sale bien no queda nada huérfano. Solo cambia
> `src/features/admin/services/admin.service.ts` (vuelve a copiarlo; el resto
> de la 5.92b sigue igual y el lote sigue en 93 archivos).
>
> **Ronda 5.92d añadida al mismo lote — VACIAR el catálogo para partir de cero:**
> a tu pedido («quitar todo lo que esté en productos y dejarlo en cero para que la
> importación quede limpia»), el script local ahora puede dejar el catálogo en CERO
> antes de importar: borra TODOS los productos, TODAS sus variantes y también las
> variantes huérfanas de productos ya borrados (la basura que abortó la 1ª corrida).
> SEGURO: ANTES de borrar guarda una copia de seguridad local en JSON con el MISMO
> formato del panel — puedes restaurarla desde Copias de seguridad → Restaurar desde
> archivo. Pide confirmación escribiendo VACIAR (con Enter u otra cosa no borra
> nada) y al final verifica que quedó 0/0. Dos formas de usarlo:
>   · En la importación normal: te pregunta «¿VACIAR?» después de elegir la
>     categoría — escribe VACIAR y sigue con SI como siempre. En una sola corrida:
>     respaldo → vacío → catálogo con solo los productos del PDF.
>   · Solo vaciar (sin PDF): `node scripts\importar-inventario-local.mjs --vaciar`
> El script se REEMPLAZA de nuevo (mismo archivo, mismo uso) — es herramienta local
> y NO va en el push: el lote sigue en 93 archivos. Tus categorías NO se tocan.
>
> **Ronda 5.92e añadida al mismo lote — el aviso «duplicate key» de la consola (corregido):**
> si en la consola del navegador viste «Warning: Encountered two children with the same
> key», no era basura: era la paginación del catálogo. Tus 72 productos se importaron en
> UN solo lote (todos con la MISMA fecha de creación, grabada como Timestamp de Firestore)
> y el cursor de «Cargar más» esperaba un número — con Timestamp daba NaN, la página 2
> repetía la página 1 y React marcaba las llaves duplicadas. TUS DATOS ESTÁN BIEN: en
> Firebase hay exactamente 72 productos, sin duplicados. ARREGLO: el catálogo ahora
> acepta AMBOS formatos (Timestamp o número) y además la grilla deduplica por id
> (cinturón de seguridad); el importador desde ahora graba la fecha como número (misma
> convención del resto de la app). NO tienes que reimportar nada. Vuelven a copiarse:
> `src/features/catalog/services/catalog.service.ts`, `src/features/catalog/pages/CatalogPage.tsx`
> y `functions/src/importInventory.ts` + 2 NUEVOS archivos: `src/shared/lib/tiempos.ts`
> y `src/tests/tiempos.test.ts`. **El lote queda en 95 archivos.** Los mensajes
> `[Violation] …` de la consola son avisos de rendimiento de Chrome en modo desarrollo —
> inofensivos, ignóralos.
>
> **Corrección 5.92e-bis (mismo lote) — «Too many arguments provided to startAfter()»:**
> al arreglar el cursor de arriba, quedó al descubierto un SEGUNDO bug que llevaba
> escondido desde siempre: el cursor del catálogo pasaba 2 valores (fecha + id) a
> `startAfter()` pero la consulta solo declara 1 `orderBy` — Firestore lo rechaza.
> Antes no se veía porque el cursor NaN ni siquiera llegaba a armar esa cláusula.
> ARREGLO DEFINITIVO: el cursor ahora es por SNAPSHOT del documento (patrón oficial
> de Firestore: desempata solo con el nombre del documento — imprescindible con tus
> 72 productos que comparten la MISMA fecha) y sin ningún índice nuevo. Solo cambia
> `src/features/catalog/services/catalog.service.ts` (re-cópialo de nuevo).
>
> **Ronda 5.92f añadida al mismo lote — textos de la tienda (pedido del
> dueño):** «cuando un producto no tenga stock, que el chip diga AGOTADO» ✔ ·
> «en el catálogo, que no salga el "12+ productos"» ✔. El texto «Sin stock»
> se cambia por «Agotado» en los 3 lugares cara al cliente (tarjeta, ficha y
> botón del carrito) y el subtítulo del catálogo ya no muestra contadores —
> de paso se retira la consulta de conteo: una lectura de Firestore menos en
> cada visita. Nada de datos ni de backend. Re-cópialos:
> `src/features/catalog/components/ProductCard.tsx`,
> `src/shared/components/ui/PriceTag.tsx` (NUEVO en el lote: cambia por
> primera vez), `src/features/catalog/pages/ProductPage.tsx` y
> `src/features/catalog/pages/CatalogPage.tsx`. **El lote queda en 96
> archivos.**
>
> **Ronda 5.92g añadida al mismo lote — Mi Cuenta a tu manera (pedido del
> dueño):** «en lugar de "Mis datos de entrega" que diga "Actualización de
> mis Datos de entrega"» ✔ · «que solo pueda actualizar número de teléfono y
> dirección completa» ✔ · «la cédula seguirá siendo usada para ser prellenada
> en cada compra» ✔ · «quita lo que dice "Van prellenados en cada compra"» ✔.
> El formulario ahora trae TELÉFONO + DIRECCIÓN (validación idéntica a la del
> registro; se guarda como +58… en el perfil y la UI siempre lo muestra en
> formato local 04…), la cédula pasa a SOLO LECTURA en la tarjeta «Datos» (la
> del registro sigue prellenando el checkout — contacto y «Cédula del pagador»
> del pago móvil — sin cambios de comportamiento) y el rótulo «Van prellenados
> en cada compra» desapareció. Reglas de Firestore SIN cambios (phoneE164 ya
> estaba en la lista blanca). Re-cópialos:
> `src/features/auth/pages/AccountPage.tsx`,
> `src/features/auth/services/auth.service.ts`,
> `src/features/auth/store/auth.store.ts` y
> `src/features/auth/hooks/useAuth.ts`. **El lote sigue en 96 archivos.**
>
> **Ronda 5.91b añadida al mismo lote — Search Console (crecimiento):** entra
> el archivo de verificación de Google `public/googlea7423837b95abad3.html`
> (NUEVO en el lote), servido en la raíz del sitio para activar
> https://search.google.com/search-console. Es un estático de 53 bytes con el
> contenido EXACTO que Google exige — no toca código, ni datos, ni reglas.
> Como el service worker precachea los .html, el precache pasa de 114 a 115
> (+53 bytes, inofensivo). **El lote queda en 97 archivos.**
>
> **Ronda 5.91c añadida al mismo lote — CI de GitHub en verde:** el push de
> 5.89/5.90 dejó el job «Web» del CI en rojo por 2 ERRORES de ESLint en
> `functions/src/lib/extraerPdf.ts` (la regla `triple-slash-reference`
> rechaza las referencias `/// <reference path>` a los .d.ts propios de
> pdfjs — que son VOLUNTARIAS: obligan a todos los tsconfig y a VSC a ver
> declaraciones que pdfjs-dist no publica; sin ellas, TS2307). FIX:
> excepción quirúrgica SOLO para ese archivo en `eslint.config.js`
> (NUEVO en el lote) — el código de extraerPdf.ts no se toca. Los 10
> warnings restantes no bloquean (logging deliberado + avisos de dev).
> **El lote queda en 98 archivos.**
>
> **Ronda 5.93 añadida al mismo lote — AUTOPSIA del 500 de fn-reserveStock:**
> ese 500 que apareció UNA vez en producción ya tiene dueño. La autopsia del
> código encontró 3 caminos que producían un 500 «internal» OPACO (error sin
> código, imposible de diagnosticar con logs) y los 3 quedan cerrados:
> 1. **Sesión vencida o revocada** (la causa más probable del 500 real): el
>    token de sesión dura 1 hora; si llegaba vencido (pestaña abierta rato,
>    reloj del teléfono descuadrado, sesión revocada por cambio de clave),
>    la verificación del token lanzaba un error con código `auth/…` que NO
>    estaba en la tabla de códigos → caía como 500. Ahora: **401 con
>    mensaje claro** («Tu sesión expiró. Recarga la app») y el log de
>    Netlify dice la causa exacta (`[auth] token rechazado: auth/…`).
> 2. **Id con ruta inválida**: un productId/variantId/zona/reserva con `/`
>    construía una ruta de Firestore inválida → error sin código → 500.
>    Ahora se corta ANTES con 400 accionable («Ítem inválido»).
> 3. **Stock corrupto (NaN)**: un stock/stockReserved no numérico se colaba
>    por las comparaciones y llegaba a la escritura de la transacción →
>    Firestore la rechazaba con error sin código → 500. Ahora el corrupto
>    se coacciona a 0: stock = falla honesta «Sin stock suficiente»;
>    stockReserved = la propia escritura SANA el campo.
> El blindaje cubre reserveStock, quoteTotals, createOrder, cancelOrder y
> el repuesto del rechazo de pago (mismo patrón en los 5). **10 tests
> nuevos** (items-guard.test.ts) congelan el contrato: ids válidos/inválidos
> y NaN→0. **El lote queda en 102 archivos** (con este LEEME, 103). Nota
> honesta de inventario: `functions/src/lib/http-ctx.ts`, `items.ts` y
> `payments.ts` ya vivían en el lote desde rondas anteriores pero no
> aparecían en la tabla — ahora sí, con su fila completa.
> **Despliegue: entra solo con el push** (Netlify recompila las funciones).
> NO hace falta firebase deploy, NO toca reglas, NO toca el dinero: la caja
> fuerte del backend (transacciones, App Check, idempotencia) queda intacta.

> **Ronda 5.95 añadida al mismo lote — LOS PRODUCTOS IMPORTADOS YA SE VEN Y SE BUSCAN:**
> importaste los 78 MOOG y no salían ni en **Productos** del panel ni en la
> búsqueda de la tienda. Causa real (encontrada en el código, no adivinada):
> la fecha de creación de un producto vivía con DOS formatos distintos — los
> productos creados a mano en el panel se guardan como Timestamp de Firestore
> y los importados como número (convención 5.92e). Firestore, al ordenar por
> fecha DESC, pone TODOS los Timestamps primero y los números después: con
> tope de 60 productos en la lista del panel y ~72 viejos, los 78 MOOG
> quedaban AL FINAL de la cola y NUNCA entraban a la lista (ni a la búsqueda
> del panel, que revisaba esos mismos 60). Y la búsqueda de la tienda tampoco
> los encontraba por código: los términos de búsqueda de un producto solo
> guardan palabras del NOMBRE — el código vivía en otro campo.
> Correcciones (todas sin tocar datos ni índices, entran con el push):
> 1. **Productos del panel**: se leen TODOS (tope 300) y se ordenan en código
>    con fecha normalizada — la lista completa, MOOG incluido, siempre.
> 2. **Búsqueda de la tienda por CÓDIGO**: escribe «ES800033», «es-800033»
>    o el arranque de un código («es800») y salen los que coinciden. La barra
>    se ve IGUAL para el cliente — nada lo anuncia (tu pedido: solo los
>    trabajadores y el admin la usan para esto).
> 3. **Varias palabras**: «terminal aveo» ahora filtra de verdad (antes
>    cualquier frase de 2+ palabras daba cero resultados).
> 4. **De ahora en más**: el panel guarda la fecha como número (misma
>    convención del importador) y si re-importas una lista vieja (el reporte
>    del POS) sus productos quedan normalizados también — todo el catálogo
>    ordena cronológico de verdad.
> **5 tests nuevos** de búsqueda + **5 de fechas** (42 en functions,
> 182 en la tienda). **El lote queda en 104 archivos** (con este LEEME, 105).
> Despliegue: solo push. NO firebase deploy, NO reglas, NO toca el dinero.

> **Ronda 5.96 añadida al mismo lote — CONTADOR DE PRODUCTOS en el panel:**
> en **Productos** (donde creas y editas) ahora se ve, junto al buscador, la
> **cantidad total de productos que tienes**: «N productos en total». Si
> estás buscando, cambia a «M encontrados de N» para saber cuántos casaron.
> Cuenta TODO: activos e inactivos, creados a mano e importados. Aplica igual
> para **admin y gerencia** (los dos usan la misma pantalla — y la corrección
> 5.95 también les sirve a los dos). El número sale de un conteo de servidor:
> 1 lectura, no descarga productos, y vale aunque el catálogo siga creciendo.
> **El lote sigue en 104 archivos** (2 ACTUALIZADOS, nada NUEVO).

Todo en esta ronda. Nada de esto toca el dinero: la caja fuerte del backend
(transacciones, App Check, idempotencia) queda intacta.

## Los cambios, en tu idioma

### 1 · Mis Pedidos EN VIVO (ya estaba montado, entra en este lote)
La pantalla **Pedidos** se actualiza sola: nuevo pedido, cambio de estado o
cancelación aparecen al instante, sin tirar para refrescar. «Cargar más» sigue
funcionando igual. Costo: 1 lectura solo cuando algo cambia de verdad.

### 2 · Imágenes imgbb blindadas (ya estaba montado, entra en este lote)
Las fotos de productos se guardan en el teléfono del visitante (CacheFirst):
la segunda vez que las ve, salen al instante aunque la red del operador esté
peleando. **Con 1000+ productos no hay problema**: cada teléfono guarda como
máximo las 300 imágenes más usadas (≈ 15-30 MB) y el resto baja del CDN de
imgbb normal. Si reemplazas una foto, imgbb genera link nuevo → nunca ves la
imagen vieja atrapada.

### 3 · Horario de los deliverys — AHORA EN AJUSTES (como pediste)
**Panel → Ajustes → Operación → «Horario de los deliverys»**. Lo cambias ahí y
aplica al instante en el Home de todos los clientes — sin deploy, sin código.
Ya no vive en el código: no volverás a pedirme esto.

### 4 · Chip «Últimas N» arreglado en el teléfono
El chip vivía anclado al fondo de la tarjeta y caía ENCIMA del precio en móvil.
Ahora vive DENTRO de la foto (esquina inferior izquierda): nunca tapa el precio.

### 5 · Stock del panel = stock real (b1)
**Causa:** la tarjeta muestra el total guardado del producto (`stockTotal`),
pero las ventas anteriores al deploy 5.74 no lo bajaban — quedaron docs
hinchados. **Arreglo en 3 partes:**
- **Reparación one-shot por URL** (paso 3 del despliegue): recalcula el total
  de TODOS los productos con el stock real de sus variantes. Corrige solo lo
  que esté descuadrado y te dice qué corrigió.
- **De ahora en adelante** las ventas/cancelaciones/rechazos ya mantienen el
  total cuadrado (ronda 5.74) — no vuelve a fallar.
- **Bonus:** descubrí y arreglé un bug del formulario: al editar un producto,
  el modal arrastraba nombre/marca/código del producto ANTERIOR. Ahora cada
  edición abre limpio.

### 6 · Copiar cada dato del pago móvil (b2)
En el paso Pago, **cada dato tiene su botón «Copiar»**: Banco, RIF, Teléfono,
Cuenta, Correo y **Total a pagar**. Detalles que importan:
- **El RIF se copia SOLO con los números** (`123456789`) — sin la J, sin
  guiones, tal como la app del banco lo espera.
- **El total se copia como número limpio** (`1234,56`) — sin «Bs.» ni
  separadores de miles, listo para pegar en el campo del monto.
- Funciona incluso en WebViews viejos (respaldo interno). El toast dice qué
  copió; si falla, te avisa en vez de fingir.

### 7 · Transición suave entre páginas (b3)
Tu ojo tenía razón: el cambio era un corte seco (no había NINGUNA animación).
Ahora el contenido entra con un **fundido + subida leve (180 ms)** al entrar a
un producto, categoría o cualquier página. Es sutil a propósito: orienta sin
hacer esperar. Respeta el «reducir movimiento» de los teléfonos y el panel
admin queda exactamente como estaba (sin parpadeos al navegar entre secciones).

### 8 · Crear cuenta con cédula + dirección (d2) y checkout autolleno (d3)
- **Registro:** nuevos campos **Cédula** (solo números, 4-8 dígitos) y
  **Dirección completa** (urbanización, calle, casa/apto).
- **Checkout autolleno** igual que con el nombre y el teléfono: la cédula
  prellena los datos de contacto **y la «Cédula del pagador» del pago móvil**;
  la dirección prellena «Dirección completa» de la entrega. Lo que el cliente
  ya escribió en esa compra NUNCA se pisa.
- ⚠️ Esto exigió ampliar la lista blanca de `firestore.rules`. **Sin el paso 2
  del despliegue, el registro de cuentas nuevas se rompería** (permission
  denied). El paso 2 es obligatorio.

### 9 · «Mis datos» editable + cambio de contraseña (d4 + d5)
En **Mi Cuenta** hay dos tarjetas nuevas:
- **Mis datos de entrega:** el cliente corrige su cédula y dirección si se
  equivocó al registrarse (tú dejas de ser el soporte de eso).
- **Seguridad:** cambio de contraseña en la app, pidiendo la actual (Firebase
  lo exige). Sin correos de recuperación ni esperas: 20 segundos.

### 10 · Descripción del producto OPCIONAL (nuevo)
Si un producto no tiene descripción en el panel, su tarjeta **NO muestra el
bloque «Descripción»**: ni título suelto, ni caja vacía. Si la tiene, se ve
igual que siempre. En el panel el campo ahora avisa «Descripción (opcional)».

Bonus silencioso: desaparecieron de la consola los avisos «Password field is
not contained in a form» — el bloque «Seguridad» de Mi Cuenta ahora es un
formulario nativo (Enter envía también).

### 11 · Métricas: gráfico de 7 días arreglado + fuera la línea en Bs. (nuevo)
- **«Pedidos últimos 7 días» tenía un bug real de maquetación**: las barras
  medían 0 píxeles (el navegador no les daba altura) — nunca se vio, con o sin
  pedidos, desde que existe la pantalla. Ahora las barras se ven **con el
  número encima de cada día**; si la semana va en cero, la caja dice «Sin
  pedidos esta semana» en vez de un cuadro vacío.
- **«Ventas 30 días» ya NO muestra** «≈ Bs. … con la tasa BCV vigente»: queda
  solo la cifra en USD, como pediste.
- **El gráfico ahora es de LUNES A DOMINGO** (semana fija, como pediste): los
  días cortan a medianoche venezolana, la barra de HOY va resaltada y cada
  barra muestra su número. Se llena solo a medida que entran pedidos esta
  semana. (Este cambio toca `functions/src/admin.ts`: entra con el push.)

### 12 · SUBCATEGORÍAS (nuevo)
- **Ya puedes meter categorías DENTRO de otras** (un nivel: principal →
  subcategorías). En Panel → Categorías, al crear o editar, elige el campo
  **«Ubicación»**: como **Categoría principal (bahía)** o **«Dentro de: …»**
  otra categoría. En la lista del panel, las subcategorías salen indentadas
  con ↳ y su etiqueta «Subcategoría de …».
- **En la tienda:** el inicio sigue mostrando las bahías (solo las principales).
  En el catálogo, al elegir una categoría que tenga subcategorías aparece una
  **segunda fila de chips para afinar**: «Toda la categoría» o una
  subcategoría concreta. Y al elegir la principal se ven TAMBIÉN los productos
  de sus subcategorías (nunca se esconde nada).
- **Productos:** en Panel → Productos el selector de categoría va en árbol
  (subcategorías con ↳). Un producto puede vivir en la principal o directo
  en una subcategoría, como te convenga.
- **Protecciones para no romper nada:** no se deja eliminar una categoría que
  tenga subcategorías (elimínalas primero) ni una que tenga productos activos
  (te avisa cuántos y te pide moverlos). Una subcategoría cuyo padre se haya
  borrado vuelve sola a ser principal — nunca queda invisible. Los números de
  bahía (01, 02…) cuentan SOLO las principales: crear subcategorías no corre
  los números de tus bahías.
- **Sin cambios en Firebase**: solo se añade un campo (`parentId`) en las
  categorías. NO toca reglas de Firestore ni funciones: con copiar los
  archivos y hacer push ya queda funcionando.

### 13 · Tarjetas de subcategorías estilo Farmatodo (nuevo)
- Revisamos Farmatodo contigo y copiamos SU IDEA con TU estilo: al entrar a
  una categoría que tenga subcategorías, estas se ven como **tarjetas grandes
  ANTES de los productos** (ya no como chips chiquitos que nadie veía).
- **SIN contador de productos (ajuste 5.78, pedido tuyo)**: las tarjetas de
  subcategorías ya NO muestran el número de la esquina ni la línea «N
  productos» — quedaron solo con el nombre, su foto y su descripción corta.
  (La primera versión traía contador; lo quitamos tal como lo pediste.)
- **Foto opcional**: igual que las bahías — si le subes foto a una
  subcategoría en el panel, sale de fondo en su tarjeta. Sin foto, queda la
  tarjeta limpia de siempre.
- **La subcategoría elegida se resalta** en borde rojo señal, y la fila de
  chips repetida se quitó (la misma navegación no vive dos veces).
- **Cada categoría muestra SOLO lo suyo (ajuste 5.78c, pedido tuyo)**: si
  mueves un producto a una subcategoría, sale ÚNICAMENTE dentro de esa
  subcategoría — la principal ya NO lo repite. Antes la bahía sumaba también
  lo de sus hijas y el mismo producto aparecía en ambas. Si una bahía se
  queda sin productos propios, la tienda lo dice claro y guía a las tarjetas
  de subcategorías.

### 14 · Editar producto y cambiarle la categoría (revisado 5.78)
- **Revisamos el flujo completo a tu pedido**: editar un producto y cambiarle
  la categoría o subcategoría SÍ funciona como debe — se guarda al instante,
  la tienda se refresca sola y el producto aparece en su nueva bahía (y en la
  principal si es subcategoría), desapareciendo de la vieja. El breadcrumb y
  los relacionados siguen la categoría nueva.
- **Aviso de categoría oculta (nuevo 5.78)**: si al editar un producto su
  categoría actual está oculta o fue eliminada, antes el campo se veía EN
  BLANCO y se podía guardar sin darse cuenta. Ahora el select muestra
  «⚠ Actual: oculta o eliminada — cámbiala» con un aviso debajo, para que la
  muevas a una categoría de la lista y vuelva a verse en la tienda.
- **Candado de precio/stock (nuevo 5.78)**: «Guardar producto» se activa
  hasta que el panel termina de leer el precio y el stock actuales. Si esa
  lectura falla (red), te avisa y no te deja guardar — antes un guardado así
  podía dejar el producto con precio 0 y stock 0.

### 15 · Formas de pago múltiples + QR + ícono de copiar (nuevo 5.79)
- **Cuatro formas de pago**: Pago Móvil (la de siempre), Transferencia,
  Zelle y Binance. **Tú decides cuáles están activas** en Panel → Ajustes →
  «Formas de pago»: cada forma tiene su interruptor Activo/Inactivo y el
  checkout solo muestra las activas como tarjetas elegibles. Las inactivas
  conservan sus datos por si las reactivas después.
- **Tu QR ya está cargado**: el QR de Suiche 7B que enviaste va empaquetado
  en la app (`img/qr-pago-movil.jpg`) y el cliente lo ve en el paso de pago
  junto a los datos («escanea con tu app del banco»). Si un día cambias de
  cuenta, pega el enlace de otro QR (imgbb) en Ajustes y listo — sin deploy.
- **Datos por forma**: Pago Móvil y Transferencia piden banco, RIF y sus
  campos VE; Zelle pide correo de recaudo + titular; Binance pide Pay ID +
  titular. Cada forma muestra SOLO sus datos, cada uno con su ícono de copiar.
- **«Copiar» ahora es un ícono** (las dos hojitas): mismo toque, menos ruido.
  Sigue avisando «Banco copiado», «RIF copiado» (solo números) y el total
  pegable como `1234,56`.
- **Comprobante obligatorio en TODAS las formas** (flujo estricto intacto):
  Zelle y Binance también suben su captura; el pedido nace en verificación.
- **⚠️ DESPLIEGA LAS FUNCIONES** (una sola vez por esta ronda): el backend
  ahora acepta las 4 formas — mira el paso 2 del despliegue.

### 16 · Varias cuentas por forma + QR subido por ti + Efectivo y Punto de venta (nuevo 5.80)
- **MULTICUENTA**: en Ajustes → Formas de pago ahora administras una LISTA de
  cuentas. Puedes repetir un método: **transferencias de varios bancos**
  (Banesco, BNC, Mercantil…), dos Pago Móvil, lo que necesites. Cada cuenta
  tiene su interruptor Activo/Inactivo, sus datos y su QR. Botones «＋ Efectivo»
  y «＋ Punto de venta» para agregarlas en un toque, y «＋ Agregar otra cuenta»
  para duplicar métodos.
- **Nombre para el cliente (opcional)**: con varias cuentas del mismo método,
  nómbralas («Banesco», «Cuenta Erick») y el checkout las distingue
  («Transferencia · Banesco»). Con una sola cuenta, no hace falta.
- **El QR lo SUBES tú** (igual que las fotos de productos): en cada cuenta hay
  un botón «Subir QR (foto)» — eliges la imagen de tu galería, se sube a imgbb
  y queda en esa cuenta. También puedes pegar un enlace, como antes. Cada
  cuenta tiene SU QR: el de tu Pago Móvil principal sigue siendo el que ya
  está cargado (Suiche 7B).
- **EFECTIVO y PUNTO DE VENTA** (pago contra entrega): el cliente confirma el
  pedido SIN comprobante y SIN formulario — paga en efectivo o con tarjeta en
  el terminal cuando lo reciba (o al retirar en tienda). El checkout le dice
  claro «pagas al recibir», y el pedido entra a la misma cola de Pedidos para
  que lo proceses y cobres. La cajera NO los ve en «Pagos» (no hay nada que
  verificar): viven en Pedidos, y la alerta de pedidos nuevos también los avisa
  («pago al recibir»).
- **El pedido recuerda a qué cuenta pagó**: si nombraste la cuenta, la orden
  guarda «cuenta: Banesco» — la cajera lo ve al verificar.
- **⚠️ DESPLIEGA LAS FUNCIONES OTRA VEZ** (una sola vez por esta ronda): el
  backend ahora acepta las 6 formas y el comprobante es OPCIONAL en Efectivo y
  Punto de venta — mira el paso 2b.

### 17 · Stepper en la tarjeta, varias fotos y bahías solo-subcategorías (nuevo 5.81)
- **El «− qty +» en la tarjeta (como Farmatodo)**: tocas el «+» rojo y se
  convierte en la píldora «− 1 +» en la misma esquina: sube y baja unidades
  sin salir del catálogo. «−» llega a 0 y quita el producto del carrito; «+»
  se apaga solo cuando llegas al stock disponible (o al tope de 20 por
  línea). El ajuste fino de variantes sigue en la ficha y el carrito, como
  siempre. (En productos con varias variantes elegidas, la tarjeta vuelve a
  mostrar el «+» que lleva a la ficha — ahí se elige cuál.)
- **Varias fotos por producto (hasta 6)**: en Panel → Productos ahora agregas
  una LISTA de fotos — subes desde el teléfono/PC o pegas un enlace, quitas
  con «×», ordenas con «←» «→». **La primera es la portada** (lo que se ve en
  tarjetas y carrito) y lleva su etiqueta. En la ficha del producto el cliente
  ve las miniaturas y TOCA para cambiar la foto grande (resaltada en rojo),
  igual que Farmatodo. Tus productos de una sola foto quedan exactamente igual.
- **Bahías estilo Farmatodo (regla que pediste)**: una categoría que TIENE
  subcategorías muestra ÚNICAMENTE las tarjetas de subcategorías — sin
  productos, sin «vacío». Solo una categoría SIN subcategorías muestra sus
  productos. Bonus silencioso: esa bahía ya no gasta lecturas consultando
  productos que no se ven.
- **¿Y si una bahía con productos le creas una subcategoría?** Los productos
  NO se pierden — quedan ocultos en la tienda (seguirían en el panel, la
  búsqueda y los primeros del Home). Para que nunca sea de sorpresa:
  · **Candado al crear**: al guardar una subcategoría en una bahía con
    productos directos, el panel te avisa con el número exacto y te ofrece
    «Aceptar = moverlos ahora a la subcategoría» (1 toque) o «Cancelar =
    dejarlos donde están».
  · **Marca ⚠ permanente**: mientras una bahía tenga productos directos
    ocultos, el panel se lo recuerda en su fila («⚠ 3 directos ocultos»),
    con el detalle al pasar el mouse.
  Si borras u ocultas la subcategoría, los productos se ven solos otra vez:
  la regla se evalúa en vivo, sin mover nada.
- **Sin cambios de backend**: esta ronda no toca funciones — el paso 2 del
  despliegue NO vuelve a hacer falta por aquí.

### 18 · Píldora compacta, carrusel de fotos en la tarjeta y agregar Pago Móvil en un toque (nuevo 5.82)
- **El «+» y la píldora «− qty +» más pequeños**: bajaron de 44 a 36 px, con
  dígitos más compactos — mismo lugar (esquina superior derecha de la foto),
  mismas reglas de stock y tope. Se ve como el de Farmatodo y no tapa la foto.
- **Fotos deslizables EN LA TARJETA (como Farmatodo)**: un producto con varias
  fotos se pasa con el dedo directamente en la tarjeta (scroll con resortes a
  cada foto) y unos PUNTOS abajo al centro indican cuál estás viendo. La
  tarjeta de un producto con una sola foto queda igual que siempre. El chip
  «Últimas N» pasó a la esquina superior izquierda para dejarle sitio a los
  puntos. Tocar la foto o el nombre/precio sigue abriendo la ficha (ahí
  siguen las miniaturas clicables de 5.81).
- **⚠ FIX importante — las fotos ya NO se borran al editar**: había un bug de
  5.81: si editabas el precio o el stock de un producto SIN tocar sus fotos,
  el guardado reescribía la galería con SOLO la portada — las demás fotos
  desaparecían. Por eso «no podías subir las fotos como antes»: subías 3,
  luego corregías un precio y quedaba 1. Arreglado de raíz: editar precio,
  stock, nombre o categoría NO toca las fotos; la galería solo cambia cuando
  tú agregas, quitas o reordenas fotos.
- **Agregar otro Pago Móvil (o cualquier forma) en un toque**: en Panel →
  Ajustes → Formas de pago hay una fila de chips «＋ Pago móvil / ＋
  Transferencia / ＋ Zelle / ＋ Binance / ＋ Efectivo / ＋ Punto de venta»
  SIEMPRE visible arriba de las cuentas. Antes solo aparecían los métodos que
  FALTABAN y el único botón genérico quedaba al fondo de la lista (fácil de
  perder en el teléfono) y abría la tarjeta con otro método. Ahora: tocas «＋
  Pago móvil», llenas banco + RIF + teléfono del banco nuevo y Guardas — el
  cliente lo ve como su propio chip en el checkout (ponle «Nombre para el
  cliente» para distinguirlos, ej. «Banesco» / «Mercantil»).

### 19 · El carrusel vive DENTRO del producto, la tarjeta solo portada (corrección 5.83)
- **Tarjeta = SOLO la portada (como Farmatodo)**: la tarjeta del catálogo
  volvió a mostrar únicamente la primera foto del producto (la portada),
  fija y sin puntos. En 5.82 pusimos el carrusel EN la tarjeta y no era así
  como funciona Farmatodo — corregido: en la tarjeta no se desliza nada y el
  toque abre la ficha. Todo lo demás de la tarjeta queda igual: «+» y píldora
  compactos de 36 px, chip «Últimas N» arriba-izquierda.
- **Ficha = carrusel DESLIZABLE con puntos (como Farmatodo)**: al entrar a
  un producto con varias fotos, la foto grande es un carrusel — pasas las
  fotos con el dedo (scroll con resortes a cada una) y los PUNTOS abajo al
  centro indican cuál estás viendo. Las miniaturas clicables de 5.81
  quedan debajo y ahora se SINCRONIZAN: tocar una desliza el carrusel
  suave hasta esa foto, y deslizar con el dedo resalta su miniatura.
- Productos de UNA sola foto: tarjeta y ficha exactamente igual que siempre
  (sin carrusel, sin puntos, sin miniaturas).
- **Sin cambios de backend**: esta ronda no toca funciones ni reglas —
  solo los 2 archivos de la tienda (tarjeta y ficha).

### 20 · QR individual por cuenta: una cuenta nueva nace SIN QR (corrección 5.84)
- **Qué pasaba**: al agregar otro Pago Móvil la tarjeta traía PUESTO el QR de
  tu otra cuenta (el QR empaquetado del repo). Ese QR se metía solo en 3
  sitios: al abrir Ajustes (las cuentas sin QR recibían el QR del repo), en
  la vista previa del panel y en el checkout. Y al guardar, quedaba GRABADO
  en la cuenta nueva — por eso «sale el mismo QR del otro».
- **La regla ahora (la que pediste)**: cada cuenta nace SIN QR y el QR es
  INDIVIDUAL: el cliente solo ve el QR de ESA cuenta cuando TÚ subes su
  imagen (foto o enlace) en Panel → Ajustes. Mientras una cuenta no tenga
  QR propio: cero QR en el checkout — el cliente paga con los datos (banco,
  RIF, teléfono) como siempre.
- **Tu segundo Pago Móvil guardado con el QR repetido**: entra a Panel →
  Ajustes → Formas de pago, toca «Quitar QR» en ESA cuenta y Guarda. Desde
  ese momento el cliente ya no le ve QR; súbele después el QR de ese banco
  y solo ESA cuenta lo muestra.
- El QR de tu Pago Móvil principal (el que ya estaba cargado desde 5.79)
  sigue apareciendo igual: es EL suyo.
- **Sin cambios de backend**: lógica pura + panel + tests (3 archivos).

### 21 · Chip abajo-izquierda y stepper que se retrae como Farmatodo (nuevo 5.85)
- **Chip «Últimas N» / «Sin stock»**: movido de arriba-izquierda a
  ABAJO-izquierda de la foto y con MÁS TRANSPARENCIA (fondo del 85 % al
  50 %): estorba menos y deja ver más de la foto.
- **Stepper con el comportamiento EXACTO de Farmatodo**:
  - Sin el producto en el carrito: círculo «+» — al tocarlo se agrega la
    pieza y se abre la cápsula «− qty +».
  - Cada vez que AUMENTAS, la cápsula se retrae sola al rato (1,8 s) y queda
    el NÚMERO en el círculo. Si sigues tocando «+» no se cierra: se retrae
    cuando sueltas.
  - Si tocas el círculo con el número, vuelve a abrirse la cápsula para
    aumentar o disminuir — y al rato se retrae de nuevo al círculo. Si
    disminuyes hasta 0, la pieza sale del carrito y vuelve el «+».
- **Todo más pequeño**: círculo y cápsula pasan de 36 px a 32 px, y el
  símbolo «+» o el número ocupan el 80 % del círculo (se ve lleno, como
  Farmatodo). Con 10 o más unidades el número se ajusta para caber.
- Productos de varias variantes: el «+» sigue llevando a la ficha a elegirla
  (igual que antes) y con varias líneas en el carrito vuelve el «+».
- **Sin cambios de backend**: solo la tarjeta del producto (1 archivo).

### 22 · Toca el QR y se AMPLÍA para escanear (nuevo 5.86)
- **El QR del checkout ahora es TOCABLE**: el cliente le da click (o lo
  toca) y se abre AMPLIADO en una ventana grande — nada de apurar la vista
  para escanearlo desde su app bancaria.
- La ventana muestra el QR GRANDE (casi todo el ancho del teléfono, fondo
  blanco para que lo lean los lectores), el nombre de la cuenta que está
  pagando («Pago Móvil», «Transferencia · Banesco»…) y un recordatorio:
  escanea, confirma en el banco y vuelve a registrar el pago.
- Se cierra con la ✕, tocando fuera del QR o con la tecla ESC; mientras
  está abierta la página de fondo no se desplaza (modal accesible: foco
  atrapado, como el resto de la tienda).
- La pista junto al QR ahora avisa: «Tócalo para ampliarlo».
- **Sin cambios de backend**: solo la página del checkout (1 archivo).

### 23 · Importar tu inventario desde el PDF del sistema (nuevo 5.87)
- **Panel → Productos → «Importar PDF»**: subes el reporte «Inventario
  disponible» de tu sistema (el PDF con Codigo / Descripcion / Existencia /
  Costo, de las páginas que traiga) y el panel hace el resto:
  - El producto NO existe → se CREA solo, con el mapeo que pediste:
    nombre ← Descripcion · código ← Codigo · **precio ← Costo** ·
    stock ← Existencia. Nace con una sola presentación «Estándar», activo,
    en la categoría que elijas al importar (y con la imagen de esa categoría
    hasta que le subas foto).
  - El producto YA existe (por su código, o porque una variante tuya ya usa
    ese código como SKU) → NO se toca nada salvo **stock y precio**:
    sus fotos, nombre, categoría y visibilidad quedan exactos.
- **Cómo lo lee**: el PDF se analiza POR COORDENADAS de columnas (la tabla
  del reporte es de layout fijo), así que los códigos raros con letras
  («10500060A», «05K650MV») se separan bien de la descripción aunque el
  texto plano venga pegado. Funciona con el número de páginas que traiga
  (tope 400 / 4 MB) y si el sistema repitiera un código, gana la última.
- **Casilla «Omitir los productos con existencia 0»**: si tu reporte trae
  muchos en cero, márcala y esos no se crean ni se tocan (los demás sí).
  *(Actualizado en la 5.92: la casilla se RETIRÓ — los productos en cero
  SIEMPRE se crean/actualizan; mira el paso 33.)*
- **Resumen al terminar**: filas leídas · creados · actualizados (y los
  omitidos) + avisos de filas descartadas con su motivo.
- ⚙️ **Despliegue**: esta ronda SÍ agrega una función de Netlify
  (fn-importInventory) y una dependencia nueva (pdfjs-dist) — entran solas
  con el push (el build instala `functions/`); NO hace falta `firebase
  deploy`. Re-importar el mismo PDF es seguro: solo reescribe los valores.

### 24 · Corrección: la importación fallaba con «400» (nuevo 5.87b)
- **Qué pasaba**: al probar la importación en tu PC, la función respondía
  **400** y la consola solo decía «fn fn-importInventory falló Object». La
  causa era el lector de PDF (pdfjs): cuando Netlify empaqueta la función en
  UN SOLO ARCHIVO, el lector no encontraba su motor interno — pasaba igual
  en local y en producción: la importación JAMÁS habría funcionado ni
  subiendo el push. Tu reporte lo delató a tiempo.
- **Arreglado**: el lector ahora lleva su motor DENTRO del paquete (registro
  oficial de pdfjs para empaquetadores). Probado contra el empaquetado REAL
  de Netlify: tu PDF de 2 páginas (57 filas) y el grande de 23 páginas (390
  filas) se leen bien desde dentro del paquete.
- **Blindaje**: la suite de tests ahora REPRODUCE el empaquetado de Netlify
  y extrae un PDF real desde dentro de él — si algo vuelve a romper el
  lector, los tests avisan antes de llegar a producción. 110/110 en verde.
- **Además, si algo falla se VE**: (a) el modal de importación muestra el
  motivo REAL del servidor («El servidor no pudo importar — Motivo: …»), ya
  no hay que adivinar ni leer la consola; (b) la consola del navegador
  imprime los errores de funciones en UNA línea plana con código y motivo
  (antes mostraba «Object» y el paste no servía para diagnosticar).
- ⚙️ **Despliegue**: 2 archivos NUEVOS en `functions/src/lib/` + 4
  actualizados (incluye `src/shared/lib/backend.ts`). Entra con el push,
  sin `firebase deploy`.

### 25 · Si el PDF falla, AHORA se sabe POR QUÉ (nuevo 5.87c)
- **Qué pasaba**: volviste a ver el 400 «No se pudo leer el PDF: ¿es el
  reporte de inventario de tu sistema?» — y ese texto era el MISMO para
  cualquier falla: el error real del lector se descartaba y los 400 no
  imprimen nada en la terminal de Netlify. Imposible diagnosticar a
  distancia: dos rondas con el mismo mensaje y ni una pista.
- **Arreglado**: el lector ahora (a) imprime el error REAL en la terminal
  de `netlify dev` (`[fn-importInventory] pdfjs no pudo leer el PDF: …`) y
  (b) manda el motivo técnico RECORTADO dentro del mensaje que el modal
  muestra («Motivo: …»). Además cada caso común tiene mensaje PROPIO:
  - PDF con contraseña → «El PDF está protegido con contraseña: exporta el
    reporte del sistema SIN protección e inténtalo de nuevo.»
  - PDF corrupto o truncado → «El PDF llegó corrupto o incompleto (…):
    vuelve a exportar el reporte y súbelo de nuevo.»
  - Una página rota en un reporte de cientos → «…falló la lectura de la
    página N de M (…)» — se sabe cuál, no «todo el PDF».
- **Blindaje extra**: el registro del motor de lectura acepta el namespace
  plano O el envuelto en `.default` (varía según la versión del
  empaquetador — sospechosa principal del 400 en TU PC), y el documento se
  cierra SIEMPRE al terminar para no dejar memoria colgada en la función
  caliente de producción.
- **Si VSC marca en rojo el import de pdfjs (TS2307)**: es SOLO el editor —
  la función sí funciona (tu 400 probó que se ejecutó). Con la ronda entra
  `functions/src/lib/pdfjs.d.ts`, que declara los tipos del lector dentro
  del propio repo: el archivo compila aunque falte la dependencia en tu PC.
  Después de copiar: recarga la ventana de VSC («Developer: Reload
  Window»). Y por si tu `functions/node_modules` está viejo, corre UNA vez
  en la carpeta del repo: `npm --prefix functions install`.
- Re-validado contra el empaquetado REAL de Netlify con tus DOS reportes:
  el de 2 páginas (57/57 filas) y el de 23 (390 filas) se leen igual que
  antes. 112/112 tests en verde.
- ⚙️ **Despliegue**: 2 archivos ACTUALIZADOS (`functions/src/lib/
  extraerPdf.ts` y `src/tests/inventario-pdf.test.ts`) + 1 NUEVO
  (`functions/src/lib/pdfjs.d.ts`, tipos del lector para tu VSC). Entra con
  el push, sin `firebase deploy`.

### 26 · El lector de PDF se instala en la RAÍZ — tu 400 por fin tenía dueño (nuevo 5.87d)
- **Qué pasaba**: con el diagnóstico de 5.87c, el modal y tu terminal por
  fin dijeron la verdad: `Cannot find package 'pdfjs-dist' imported from
  C:\Users\Erick\spot24\.netlify\functions-serve\…`. Corriste
  `npm --prefix functions install` (instaló 4 paquetes) y el 400 seguía
  IGUAL — porque ese comando instaló bien, pero en OTRO lugar. (Y ojo: lo
  de «tu 400 probó que la función se ejecutó» que dije en la sección 25
  quedó descartado: el 400 era justamente que NO podía ejecutarse.)
- **Por qué**: `netlify dev` compila cada función a
  `.netlify/functions-serve/…` y deja los paquetes npm como imports
  EXTERNOS: Node los busca subiendo carpetas `node_modules` DESDE ESA
  ruta, y la única que alcanza es la RAÍZ del proyecto —
  `functions/node_modules` (donde estaba pdfjs) queda FUERA de esa cadena.
  Por eso todas tus demás funciones sí corren: firebase-admin y
  firebase-functions ya viven en la raíz. Tu consola también mostraba el
  aviso de la CSP bloqueando `ws://localhost:3000` — mismo archivo, mismo
  arreglo de una línea.
- **Arreglado (3 frentes)**:
  1. `pdfjs-dist` ahora es dependencia TAMBIÉN de la raíz
     (`package.json` + `package-lock.json` NUEVOS en el lote, misma
     versión 4.10.38 que en `functions/`). Copias y corres `npm install`
     UNA vez en la raíz — en producción el build ya lo hace solo.
  2. Si el paquete vuelve a faltar en cualquier PC, el lector responde
     con la ORDEN, no con una pregunta: «Falta el paquete del lector de
     PDF… detente en la carpeta del proyecto (la que contiene
     package.json, NO dentro de functions/) y ejecuta: npm install.
     Después reinicia netlify dev.»
  3. La CSP ya no bloquea el websocket de Vite: se va el aviso
     «Connecting to 'ws://localhost:3000…' violates connect-src» y los
     cambios se aplican en caliente (sin F5) mientras pruebas en local.
- **Validación quirúrgica**: reproduje TU fallo EXACTO en el sandbox — un
  bundle con el mismo modo de netlify dev (pdfjs EXTERNO) colgado de la
  ruta real `.netlify/functions-serve/…` falló con tu mismo mensaje antes
  del fix, y DESPUÉS de instalar el paquete en la raíz leyó tus DOS
  reportes: 57/57 filas y 390 (3 avisos). Es la misma resolución de
  carpetas que hará tu PC. 113/113 tests en verde.
- ⚙️ **Despliegue**: 2 NUEVOS en la RAÍZ (`package.json`,
  `package-lock.json`) + 3 ACTUALIZADOS (`functions/src/lib/extraerPdf.ts`,
  `src/tests/inventario-pdf.test.ts`, `netlify.toml`). Después de copiar:
  `npm install` en la raíz y reinicia `netlify dev`. Entra con el push,
  sin `firebase deploy`.

### 27 · Tu 400 ya NO era el PDF: era un ÍNDICE de Firestore (nuevo 5.87e)
- **Qué pasaba**: con el paquete en la raíz (5.87d) el lector de PDF POR
  FIN funcionó — y la importación avanzó hasta el paso siguiente:
  emparejar tus filas con lo que ya hay en la base. Ahí saltó OTRO 400,
  pero con OTRO dueño: `9 FAILED_PRECONDITION: The query requires a
  COLLECTION_GROUP_ASC index for collection variants and field sku…` —
  y el toast decía «No tienes acceso a esta área»: mentira. Tu acceso
  estaba perfecto (por eso la función llegó tan lejos); lo que faltaba era
  un ÍNDICE de base de datos.
- **Por qué**: para reconocer los productos que creaste A MANO en el panel
  (sin código pero con ese código del reporte como SKU), la función
  filtraba TODAS las variantes de la base por sku. Firestore NO mantiene
  índices automáticos en alcance «collection group»: ese filtro exigía
  crear un índice A MANO en la consola de Firebase (el propio error traía
  el link — y abrirlo con la cuenta equivocada muestra «no tienes
  acceso»). Configuración manual = algo que se olvida en cada PC nueva y
  en cada proyecto. Fuera.
- **Arreglado (2 frentes)**:
  1. `functions/src/importInventory.ts`: la lectura de variantes va SIN
     filtro (Firestore atiende eso SIN NINGÚN índice, garantía del
     servicio) y el emparejamiento por SKU se hace en memoria. Nada que
     crear a mano: primera importación, quinta, otro PC — siempre igual.
  2. `src/shared/lib/backend.ts`: los errores crudos de Firestore
     (empiezan «9 FAILED_PRECONDITION») ya NO se disfrazan de permisos —
     el toast dice «reintenta» y el motivo REAL queda en el modal, igual
     que hizo 5.87c con el lector de PDF.
- **Costo de la nueva lectura**: una sola ida y vuelta leyendo sku y
  producto padre de cada variante (centenares~miles de filas — KB en tu
  escala). La primera importación parte con la base casi vacía y las
  siguientes entran mayormente por el código del producto, sin leer
  variantes de más.
- ⚙️ **Despliegue**: 2 ACTUALIZADOS (`functions/src/importInventory.ts`,
  `src/shared/lib/backend.ts`) — entran con el push. NADA nuevo que
  instalar (no repitas `npm install` por esta ronda): copia, reinicia
  `netlify dev` y repite la importación.

### 28 · Los productos importados YA NO salen con la foto rota (nuevo 5.87f)
- **Tu éxito primero**: «57 filas leídas · 56 creados · 1 actualizados» —
  la importación terminó 200 en 26,7 s con tu reporte real. ¡ESO ES!
- **Qué faltaba**: los productos nuevos nacen con la imagen de su
  categoría (`/img/products/{id}.svg`), IGUAL que cuando creas uno a mano
  en el panel. Las 8 categorías del repo tienen SU svg; las categorías
  que TÚ creas desde el panel no lo tienen — tus 56 productos apuntaban a
  `…7feTaW8YRdjJrOpyjHk7.svg`, un archivo que no existe: foto rota + el
  error «Failed to load resource» en consola.
- **Arreglado (2 frentes)**:
  1. NUEVO `public/img/products/placeholder.svg`: el cuadro negro con las
     barras rojas de SPOT 24 y «FOTO PENDIENTE», mismo estilo que los svg
     de categoría (va PRECACHEADO: se ve hasta sin internet).
  2. `src/shared/lib/imgFallback.ts` (NUEVO) + onError en las fotos de
     producto: tarjeta del catálogo, ficha (carrusel + miniaturas),
     carrito, detalle del pedido, lista del panel y editor — si la foto
     no carga, se muestra el placeholder AL INSTANTE, sin tocar los datos
     (la ruta real sigue guardada: cuando le subas la foto en Editar,
     ESA es la que se ve).
- **NO toca**: el QR de pago ni el comprobante del cliente — ahí un
  placeholder de repuesto sería engañoso; si fallan, se muestran como
  están.
- **Sobre tu consola**: el aviso del .svg que no existe puede seguir
  saliendo UNA vez por foto pendiente (el navegador anota el intento);
  la diferencia es que AHORA se ve el placeholder en su lugar y nada
  queda roto.
- **Sobre «me saca de netlify dev»**: la importación es pesada (PDF +
  56×2 escrituras) y el servidor local de tu PC murió DESPUÉS de
  responder el 200 — tus datos ya estaban a salvo en Firestore cuando
  saltó el prompt. Reinicia `netlify dev` y sigue; en producción (Netlify)
  la función corre en otra infraestructura y eso no aplica.
- ⚙️ **Despliegue**: 3 NUEVOS (`public/img/products/placeholder.svg`,
  `src/shared/lib/imgFallback.ts`, `src/tests/img-fallback.test.ts`) +
  5 ACTUALIZADOS (ProductCard, ProductPage, CartPage, OrderDetailPage,
  AdminProductsPage) — entran con el push, sin install ni deploy.

### 29 · El editor ya NO se corta: Guardar/Cancelar siempre a la vista (nuevo 5.88)
- **Tu reporte**: «en la PC con la pantalla de 14 pulgadas, cuando edito
  un producto no veo la parte de abajo del cuadro» — y después «me di
  cuenta que también pasa en el teléfono». Tu instinto acertó a medias:
  el fondo bloqueado SÍ es a propósito (el modal te pide terminar o
  cerrar); lo que rompía la vista era OTRA cosa.
- **La causa real**: la transición suave entre páginas (la 5.75) deja un
  «transform» residual al terminar su animación. Regla de CSS: cualquier
  ancestro con transform se vuelve el marco de referencia de los
  elementos FIJOS (position: fixed) que tenga dentro. Resultado: el
  modal dejaba de anclarse a LA PANTALLA y se anclaba a TODA LA PÁGINA
  — con tus 57 productos la página mide ≈ 3.200 px, así que el editor
  flotaba en el medio de ese piscazo: en PC se veía cortado (280 px
  fuera) y en el teléfono quedaba COMPLETAMENTE por debajo de lo
  visible (558 px: el modal móvil es una hoja que nace del pie de la
  PÁGINA, no de la pantalla). Por eso con el catálogo corto nunca se
  vio: la página media lo mismo que la pantalla.
- **Arreglado con 2 capas (cinturón y tirantes)**:
  1. La transición de ruta usa ahora `backwards` en vez de `both`: se
     ve EXACTAMENTE igual (mismos 180 ms y 6 px) pero al terminar la
     animación el transform residual desaparece y la pantalla vuelve a
     mandar.
  2. TODOS los modals de la app (editar producto, importar PDF, QR
     ampliado del checkout, categorías, promos, zonas, usuarios,
     pagos, despacho, comprobante, cancelar pedido…) se montan ahora
     por «portal» directamente en el cuerpo del documento: aunque el
     CSS del futuro vuelva a meter un transform, los modals NO se
     enteran — anclados a la pantalla SIEMPRE.
- **Medido en navegador de verdad** (headless, réplica exacta de la
  página + el modal con 57 filas): móvil 390×844 ANTES «INVISIBLE: 558
  px debajo de la pantalla» → DESPUÉS «COMPLETO en pantalla (Guardar/
  Cancelar alcanzables)»; PC 1366×768 ANTES «se sale 280 px» →
  DESPUÉS «COMPLETO». El portal solo, con la causa deliberadamente
  re-rota, también aguanta: inmunidad probada. Las 4 capturas quedan
  archivadas con esta ronda (junto al LEEME, fuera del zip).
- ⚙️ **Despliegue**: 1 ACTUALIZADO (`src/index.css`) + 1 NUEVO
  (`src/shared/components/ui/Modal.tsx`) — solo frontal, entra con el
  push, sin install ni deploy.

### 30 · Copias de seguridad del catálogo: descarga, nube, automáticas y restaurar (nuevo 5.89)
- **Tu pedido**: «es posible que admin pueda hacer copia de seguridad del
  catalogo de productos y poder restaurar esa copia y que pueda programar
  copias de seguridad» — y tu duda previa: «yo uso firebase gratis creo
  que no tengo almacenamiento o si?». Ambas respuestas en una: SÍ hay
  sitio (la base de datos gratis tiene 1 GiB; tu catálogo ocupa ~0,2 MB)
  y NO se necesita el almacenamiento de archivos (que tu plan ya no
  incluye): las fotos viajan como enlaces y las copias son texto.
- **Todo vive en Panel → «Copias»** (menú nuevo, SOLO admin, código 10):
  1. **Descargar copia ahora** → un archivo JSON con TODO el catálogo
     (productos, variantes, categorías, precios, stock y fotos como
     enlaces) baja a tu teléfono o PC. La copia vive CONTIGO: gasta 0.
  2. **Guardar copia en la nube** → guarda el estado actual DENTRO de la
     base de datos (útil ANTES de cambios grandes, p. ej. antes de
     importar inventario).
  3. **Automática**: todos los días a las 6:00 a.m. (hora de Venezuela)
     el cron de Netlify (el mismo mecanismo del BCV, plan gratis) guarda
     una copia. Se conservan las ÚLTIMAS 30 automáticas y las últimas 30
     que guardes a mano, sin que hagas nada.
  4. **Restaurar** → desde el archivo que descargaste o de la lista de
     copias en la nube: REEMPLAZA el catálogo completo tal como estaba en
     ese momento. Doble confirmación: ves el resumen (fecha, N
     categorías, N productos, N variantes) y debes escribir RESTAURAR.
- **Red de seguridad SIEMPRE**: antes de restaurar, la app guarda
  automáticamente una copia del estado actual («previo a restaurar» en
  la lista) — si algo no te gusta, restauras esa y vuelves atrás. Y la
  restauración es por «morph»: primero escribe lo de la copia y AL FINAL
  borra los sobrantes, así la tienda jamás se ve vacía a mitad del
  proceso. Los pedidos y los usuarios NO se tocan.
- **Los robots no entran**: las copias viven en una colección cerrada
  (solo las funciones con sesión de admin las leen; las reglas del
  catálogo quedan intactas) y restaurar es SOLO admin (descargar y
  guardar también lo puede la gerencia… pero la página es solo tuya).
- ⚙️ **Despliegue**: 10 NUEVOS (core `functions/src/backups.ts`, 5
  funciones de Netlify, servicio y página del panel, 2 archivos de
  tests) + 4 ACTUALIZADOS (`netlify.toml`, `firestore.rules`,
  `src/app/router.tsx`, `src/features/admin/pages/AdminLayout.tsx`).
  Las 5 funciones nuevas ENTRAN SOLOS con el push (Netlify las detecta;
  el cron queda programado al instante) — sin `firebase deploy` ni
  `npm install`. Re-deployar reglas NO es necesario: la colección nueva
  ya está bloqueada por el cierre general de las reglas; la línea
  explícita nueva es solo documentación viva.

### 31 · Campana de notificaciones en PC/tablet (nuevo 5.90)
**Lo que pediste:** «solo en PC o tablet, en la barra superior antes del
icono de Instagram, un icono que al entrar muestre las notificaciones —
en teléfono no cabe». Hecho, y **sin tocar nada de la PWA**: es solo un
icono web más (la instalación, el modo offline y los avisos del teléfono
funcionan EXACTAMENTE igual que hoy).

- **Qué guarda la campana**: cada aviso que hoy salta en el teléfono
  («Pago confirmado», «Tu pedido va en ruta», «Entregado», «Cancelado»…)
  ahora TAMBIÉN queda guardado para el cliente en su historial privado.
  Mismo texto, mismo momento, mismo código de pedido.
- **Dónde aparece**: con sesión iniciada y en pantallas grandes (PC y
  tablet, el mismo corte que el botón «Panel»), la campana se ve ANTES del
  icono de Instagram. En el teléfono no sale — como pediste.
- **Punto rojo**: mientras haya avisos que el cliente no haya visto, la
  campana lleva un punto rojo. Al abrir la página, se marca todo como
  leído y el punto se apaga al instante (aquí y en cualquier pantalla).
- **La página de notificaciones**: lista limpia de la más nueva a la más
  vieja, con fecha y hora («20/10/2026 3:45 p.m.»), etiqueta del estado
  (Pagado, En camino…) y el código del pedido. Los que eran nuevos en
  esta visita llevan punto rojo en la lista.
- **Sirve aunque no activen el push**: los avisos del teléfono solo
  llegan si el cliente tocó «Activar notificaciones» en Mi Cuenta; el
  historial en cambio se llena SIEMPRE — es la memoria consultable de la
  tienda, no depende del permiso del navegador.
- **Sin correo basura ni costos raros**: se conservan los últimos 30
  avisos por cliente (el 31.º drena los más viejos) y leerlos es lectura
  normal de su propia base de datos — el plan gratis te sobra.
- **A prueba de cortes de red (5.90.1)**: si el canal en vivo muere
  (tropiezo QUIC/Wi-Fi — el aviso clásico de la consola), la campana se
  RECONECTA SOLA con paciencia creciente (3 s → 6 s → … → tope 60 s) y la
  página muestra un aviso «se cortó la conexión en vivo · Reintentar»
  mientras tanto — la lista JAMÁS se congela fingiendo que está al día.
  Lo que el servidor guardó no se pierde: al reconectar aparece todo.
- ⚙️ **Despliegue**: 5 NUEVOS (página, servicio, store, hook y tests del
  historial) + 5 ACTUALIZADOS (`functions/src/lib/notifications.ts` que
  ahora también guarda el historial, su test con 10 fases, `firestore.rules`
  con la subcolección `notifs` y el campo de lectura, `src/app/router.tsx`
  con la ruta `/notificaciones` y `src/app/layouts/RootLayout.tsx` con la
  campana). Todo entra solo con copiar y hacer push: sin `firebase deploy`,
  sin instalar nada. Dos archivos que faltaban del lote por rondas previas
  (`functions/src/lib/notifications.ts` y su test) entran AHORA incluidos.

### 32 · Que Google te encuentre: Search Console + Perfil de Negocio (nuevo 5.91)

Después del push de esta ronda tu tienda ya tiene el letrero puesto. Para que
Google la muestre cuando alguien la busca, haz estos dos registros (gratis,
se hacen UNA vez, ~20 minutos en total):

1. **Search Console** (search.google.com/search-console):
   - Entra con tu cuenta de Google → «Añadir propiedad» → pega
     `https://spot24express.netlify.app/`.
   - Verificación: elige **«Archivo HTML»** → Google te descarga un archivo
     tipo `google1234abcd.html` → ponlo en la RAÍZ de tu repo (al lado de
     index.html), haz push, y dale «Verificar». (O pásame el contenido del
     archivo y te lo meto en el próximo lote.)
   - Ya verificado: menú «Sitemaps» → escribe `sitemap.xml` → «Enviar».
     Google empieza a indexar en cuestión de días.
   - Consejo: usa «Inspección de URL» con tu link y pide indexación
     inmediata en vez de esperar.
2. **Perfil de Negocio de Google** (business.google.com):
   - «Administrar ahora» → nombre **SPOT 24** → categoría sugerida:
     «Tienda de repuestos automotrices» (si te ofrece secundarias, agrega
     «Tienda de conveniencia»).
   - Completa teléfono/WhatsApp, dirección o zona de entrega, y en «Sitio
     web» pega tu URL. Con el perfil verificado apareces en búsquedas y
     mapas de tu zona — gratis.

**Ver tu tarjeta de WhatsApp**: comparte el link en un chat de prueba (a ti
mismo). Si aún sale pelado, WhatsApp cachea el enlace ~24 h — se limpia al
instante con el «Depurador de uso compartido» de Facebook
(developers.facebook.com/tools/debug): pega tu URL → «Depurar» →
«Volver a extraer» y comparte de nuevo.

**Nota del dominio (pospuesto a tu pedido)**: cuando compres el dominio
propio se cambian las 6 URLs absolutas (canónico, og:url, og:image,
twitter:image, sitemap, JSON-LD), se reenvía el sitemap y todo queda igual
— te lo preparo en minutos ese día.

### 33 · Tus listas con doble precio entran al importador (nuevo 5.92)
- **Qué pasaba**: me pasaste tu PDF de accesorios (la «LISTA LIMPIA» con
  «Precio USD sin impuesto» y «con impuesto») y el importador solo entendía
  el reporte del POS: devolvía 0 productos.
- **Qué cambió**:
  - El importador RECONOCE EL FORMATO SOLO: si el PDF es el reporte
    «Inventario disponible» del POS se usa el Costo; si es una lista con
    columnas Código / Descripción / Existencia / «Precio USD sin/con
    impuesto» se usa el **SIN impuesto** (tu decisión). El resumen del
    modal te dice cuál detectó.
  - **Códigos repetidos sin perder nada**: tu lista trae 7 forros distintos
    que comparten el código FORROSINT y 2 alfombras con WT4RUNNE (el
    sistema de origen corta los códigos). Antes se perderían 7 productos;
    ahora quedan FORROSINT, FORROSINT-2 … FORROSINT-7 y WT4RUNNE-2, cada
    uno con su nombre, y el modal te avisa de cada renombrado. Si un
    sufijo ya está ocupado por un producto real, salta al siguiente libre.
  - **Se crean también los productos en cero** (existencia 0 y precio 0):
    la casilla «omitir existencia 0» se retiró — cuando una importación
    futura traiga los valores reales, stock y precio se actualizan solos.
  - Códigos que empiezan con LETRA (CE0501, DM1202, WTAUTANA…) ahora
    entran bien.
- **Probado con TU PDF real**: 72 de 72 productos extraídos y 0 ilegibles;
  el reporte del POS sigue igual que siempre (tests de regresión).
- **5.92b — el 1er intento real se detuvo con «No document to update» y quedó
  blindado**: al eliminar un producto del panel, sus variantes quedan colgando
  en la base (Firestore no borra subcolecciones en cascada) y el emparejamiento
  por SKU las tomaba como si el producto padre existiera: el plan intentaba
  actualizar un producto borrado y el lote COMPLETO abortaba. Ahora cada
  producto candidato se valida por existencia antes de planear nada; las
  referencias muertas se omiten y sus filas se crean como NUEVAS (el resumen
  del script te dice cuántas hubo). En la corrida fallida del dueño NO se
  escribió nada (lote atómico).
- ⚙️ **Despliegue**: ACTUALIZA fn-importInventory — entra sola con el push
  (el build de Netlify recompila las funciones); NO hace falta
  `firebase deploy`.

## Despliegue — pasos EN ESTE ORDEN

1. **Copia los 104 archivos** sobre tu repo `C:\Users\Erick\spot24`,
   respetando las carpetas (la estructura del lote es la del repo).
   **5.95: NUEVOS en el lote** `src/features/catalog/lib/busqueda.ts` (libra
   de búsqueda: código + varias palabras — créeale su carpeta `lib/`) y
   `src/tests/busqueda-codigo.test.ts` (tests, no corren en producción).
   **5.95: ACTUALIZA** `src/features/catalog/services/catalog.service.ts`,
   `src/features/admin/services/admin.service.ts`,
   `functions/src/importInventory.ts` y
   `functions/src/__tests__/import-inventario.test.ts` (productos importados
   visibles y buscables — entra solo con el push, sin firebase deploy).
   **5.96: ACTUALIZA** `src/features/admin/services/admin.service.ts` y
   `src/features/admin/pages/AdminProductsPage.tsx` (contador de productos
   en el panel — entra solo con el push, sin firebase deploy).
   **5.93: NUEVO en el lote** `functions/src/__tests__/items-guard.test.ts` —
   tests de regresión de la autopsia del 500 (no corren en producción).
   **5.93: ACTUALIZA** `functions/src/orders.ts`,
   `functions/src/payments.ts`, `functions/src/lib/http-ctx.ts` y
   `functions/src/lib/items.ts` (blindaje del 500 de fn-reserveStock —
   entra solo con el push, sin firebase deploy).
   **5.91c: NUEVO en el lote** `eslint.config.js` (raíz del repo) —
   excepción de ESLint para que el CI de GitHub quede en verde.
   **5.91b: NUEVO en el lote** `public/googlea7423837b95abad3.html` — archivo
   de verificación de Google Search Console; cópialo tal cual (contenido
   exacto exigido por Google).
   **5.92f: NUEVO en el lote** `src/shared/components/ui/PriceTag.tsx` —
   cópialo también (cambia por primera vez desde que existe el lote).
   **5.92g: ACTUALIZA** `src/features/auth/pages/AccountPage.tsx`,
   `src/features/auth/services/auth.service.ts`,
   `src/features/auth/store/auth.store.ts` y
   `src/features/auth/hooks/useAuth.ts` (Mi Cuenta: «Actualización de mis
   Datos de entrega» — solo teléfono y dirección editables).
   **5.81: NUEVA carpeta en el lote** `src/features/cart/` (lógica del
   carrito + sus tests) — créala al copiar, respeta la ruta exacta.
   **5.87: NUEVOS archivos en `functions/`** (`package.json`,
   `package-lock.json`, `src/importInventory.ts`, `src/lib/inventarioPdf.ts`)
   y `netlify/functions/fn-importInventory.ts` — cópialos todos: el build de
   Netlify instala la dependencia nueva del PDF solo.
   **5.87b: NUEVOS** `functions/src/lib/extraerPdf.ts`,
   `functions/src/lib/pdfjs-worker.d.ts` y `src/shared/lib/backend.ts` —
   cópialos también (el fix del lector de PDF).
   **5.87c: ACTUALIZA** `functions/src/lib/extraerPdf.ts` y
   `src/tests/inventario-pdf.test.ts` (diagnóstico del lector de PDF) y
   AGREGA `functions/src/lib/pdfjs.d.ts` (tipos para que tu VSC no marque
   el import de pdfjs en rojo) — cópialos todos.
   **5.87d: NUEVOS en la RAÍZ del repo** `package.json` y
   `package-lock.json` (pdfjs-dist también como dependencia de la raíz) y
   **ACTUALIZA** `functions/src/lib/extraerPdf.ts`,
   `src/tests/inventario-pdf.test.ts` y `netlify.toml` — cópialos todos.
   **5.87e: ACTUALIZA** `functions/src/importInventory.ts` y
   `src/shared/lib/backend.ts` (la importación ya no exige índices de
   Firestore y el toast de error interno ya no acusa permisos) — cópialos
   también.
   **5.87f: NUEVOS** `public/img/products/placeholder.svg`,
   `src/shared/lib/imgFallback.ts` y `src/tests/img-fallback.test.ts` +
   **ACTUALIZA** `src/features/catalog/components/ProductCard.tsx`,
   `src/features/catalog/pages/ProductPage.tsx`,
   `src/features/cart/pages/CartPage.tsx`,
   `src/features/orders/pages/OrderDetailPage.tsx` y
   `src/features/admin/pages/AdminProductsPage.tsx` (placeholder si una
   foto de producto no carga) — cópialos todos.
   **5.88: NUEVO** `src/shared/components/ui/Modal.tsx` (carpeta nueva
   en el lote: `src/shared/components/ui/` — créala al copiar) y
   **ACTUALIZA** `src/index.css` (modals siempre anclados a la pantalla:
   se acabó el editor cortado en PC e invisible en el teléfono) —
   cópialos todos.
   **5.89: NUEVOS** `functions/src/backups.ts` (core de las copias),
   `netlify/functions/fn-exportCatalog.ts`,
   `netlify/functions/fn-listCatalogBackups.ts`,
   `netlify/functions/fn-saveCatalogBackup.ts`,
   `netlify/functions/fn-restoreCatalog.ts`,
   `netlify/functions/backup-catalog.ts` (la copia automática diaria),
   `src/features/admin/services/backups.service.ts`,
   `src/features/admin/pages/AdminBackupsPage.tsx` (la página nueva del
   panel), `src/tests/backup-file.test.ts` y
   `functions/src/__tests__/backups-core.test.ts` + **ACTUALIZA**
   `netlify.toml`, `firestore.rules`, `src/app/router.tsx` y
   `src/features/admin/pages/AdminLayout.tsx` (menú «Copias» código 10,
   SOLO admin) — cópialos todos; las funciones nuevas entran solas con
   el push y el cron queda programado al instante.
   **5.90: NUEVOS** `src/features/orders/pages/NotificationsPage.tsx`
   (la página de la campana), `src/features/orders/services/notifs.service.ts`,
   `src/features/orders/store/notifs.store.ts`,
   `src/features/orders/hooks/useNotifs.ts` y
   `src/tests/notifs-helpers.test.ts` + **ACTUALIZA**
   `functions/src/lib/notifications.ts` (ahora guarda el historial),
   `functions/src/__tests__/notifications-flow.test.ts` (10 fases),
   `firestore.rules` (subcolección `notifs` + campo de lectura),
   `src/app/router.tsx` (ruta `/notificaciones`) y
   `src/app/layouts/RootLayout.tsx` (la campana antes de Instagram).
   Los `src/features/orders/services|store|hooks/` son carpetas nuevas
   en el lote solo para services/store/hooks — cópialos todos.
   **5.92: ACTUALIZA** `functions/src/lib/inventarioPdf.ts`,
   `functions/src/importInventory.ts`,
   `src/features/admin/services/admin.service.ts`,
   `src/features/admin/pages/AdminProductsPage.tsx` y
   `src/tests/inventario-pdf.test.ts` + **NUEVO**
   `src/tests/fixtures/lista-limpia-items.sample.json` (el importador
   ahora entiende tus listas de accesorios con doble precio) — cópialos
   todos. **5.92b: vuelve a copiar** `functions/src/importInventory.ts`
   (blindaje «No document to update»: variantes colgantes de productos
   borrados) y **AGREGA** `functions/src/__tests__/import-inventario.test.ts`
   (NUEVO: el guardián de variantes huérfanas) — el resto de la 5.92 sigue
   igual. **5.92c: vuelve a copiar** `src/features/admin/services/admin.service.ts`
   (Eliminar borra variantes + ficha en un solo lote atómico).
   Después de copiar corre EN LA RAÍZ (donde está package.json):
   ```powershell
   npm install
   ```
   y reinicia `netlify dev` (Ctrl+C y de nuevo `netlify dev`).

2. **⚠️ Despliega las reglas de Firestore ANTES del push** (obligatorio para
   el registro nuevo). En PowerShell, en la carpeta del repo:
   ```powershell
   firebase deploy --only firestore:rules
   ```
   (Las reglas nuevas solo AUMENTAN permisos: si se suben antes que el código,
   nada se rompe. Al revés, el registro se cae hasta que subas las reglas.)

2b. **⚠️ NUEVO 5.80 — Despliega las funciones UNA sola vez** (el backend
   acepta las 6 formas de pago y el comprobante pasa a ser OPCIONAL en
   Efectivo y Punto de venta; sin esto, esos dos dan «Método de pago inválido»
   al confirmar). En PowerShell, en la carpeta del repo (el predeploy compila
   solo):
   ```powershell
   firebase deploy --only functions
   ```
   (Si ya desplegaste en la ronda 5.79, Pago Móvil/Transferencia/Zelle/Binance
   siguen funcionando igual mientras tanto; Efectivo y Punto de venta entran
   cuando despliegues.)

3. **Repara el stock una sola vez.** Después del deploy de Netlify, abre en tu
   navegador (usa la MISMA clave de `BCV_RUN_KEY` que ya configuraste):
   ```
   https://spot24express.netlify.app/.netlify/functions/fn-recomputeStock?key=TU_CLAVE_BCV_RUN_KEY
   ```
   Responde un JSON: `productosRevisados`, `corregidos` y el detalle
   `id: viejo → nuevo`. Puedes reabrirla cuando quieras: si todo está
   cuadrado responde `corregidos: 0` y no escribe nada.

4. **Commit y push** como siempre → Netlify despliega solo.

Después: **Panel → Ajustes → Operación** y pon el horario REAL de tus
deliverys (por defecto dice «de 8:00 am a 8:00 pm»). Y en **Panel → Ajustes →
Formas de pago** revisa tus datos de Pago Móvil (el QR ya está puesto), sube
los QR que quieras como foto y agrega cuentas con los chips «＋ Pago móvil»,
«＋ Transferencia»… (deja activas Efectivo y Punto de venta si los vas a
ofrecer).

## Probar en tu PC con `netlify dev` (opcional, antes de subir nada)

Sí puedes probar TODO el lote en tu computadora antes del push:

1. En la carpeta del repo (ya con los 47 archivos copiados): `npm install`
   (una vez) y `netlify login` + `netlify link` (una vez).
   **IMPORTANTE (5.78d):** `netlify dev` NO hereda las variables del panel
   de Netlify — léelas del archivo `.env` de la raíz del repo. Si no tienes
   `.env`, cópialo: `Copy-Item .env.example .env` y rellena AL MENOS las de
   SERVIDOR con los MISMOS valores del panel:
   `FIREBASE_SERVICE_ACCOUNT`, `ENC_KEY_HEX`, `IMGBB_API_KEY`, `BCV_RUN_KEY`.
2. `netlify dev` → abre `http://localhost:8888`.
3. Ahí corre la app COMPLETA y también las funciones:
   `http://localhost:8888/.netlify/functions/fn-runBcvRate?key=TU_CLAVE`.
   Firebase Auth siempre acepta `localhost`: registrar y entrar funciona igual
   que en producción.

> **¿Te salió `fn-reserveStock … 500 (Internal Server Error)` en local?**
> Es eso: falta `FIREBASE_SERVICE_ACCOUNT` en tu `.env` (las funciones corren
> EN TU PC y necesitan la clave de servicio para verificar tu sesión). Ponla
> como dice el paso 1 y reinicia `netlify dev`. En producción NO pasa nada:
> esa variable ya vive en el panel de Netlify. Con el ajuste 5.78d, si falta,
> el aviso dice el paso a paso en la consola en vez del 500 mudo.

Tres reglas de oro del modo local:
- **Firebase es el real**: lo que crees o edites queda grabado en producción.
  Prueba con una cuenta de prueba y, si tocas «Cambiar contraseña» en tu
  cuenta principal, el cambio es de verdad.
- **Las reglas de Firestore NO corren en tu PC**: despliega primero el paso 2
  (`firebase deploy --only firestore:rules`) o el registro con cédula fallará
  en local igual que en producción.
- **El modo PWA (instalar/offline) no se ve en local**: el service worker solo
  nace con el build de producción. Esa prueba hazla en el sitio desplegado.

Nota menor: si al editar código el navegador no se refresca solo, dale F5 —
es una configuración del entorno de desarrollo, no afecta la app.
(5.87d: en gran parte ARREGLADO — la CSP ya no bloquea el websocket de
Vite; el aviso «Connecting to 'ws://localhost:3000…'» desaparece de la
consola y los cambios aplican en caliente.)

## Cómo probar (10 minutos)

1. **Registro:** crea una cuenta nueva con cédula y dirección → entra al Home
   sin errores.
2. **Autollenado:** con esa cuenta, mete algo al carrito y llega al paso de
   Datos → nombre, teléfono, cédula y dirección YA prellenados; avanza al
   pago → «Cédula del pagador» prellenada también.
3. **Copiar:** en el paso Pago, toca el ÍCONO de copiar (las dos hojitas) del
   RIF y pégalo en el bloc de notas → solo números. Ícono del total →
   `1234,56` sin «Bs.».
4. **Contraseña:** Mi Cuenta → Seguridad → cambia la clave (pide la actual),
   cierra sesión y entra con la nueva.
5. **Mis datos:** Mi Cuenta → cambia la dirección → Guardar → vuelve al
   checkout → la dirección nueva aparece prellenada.
6. **Stock:** abre la URL del paso 3 → `corregidos: N` (los hinchados). Abre
   Panel → Productos → el stock de la tarjeta ya coincide con la realidad.
7. **Ajustes:** cambia el horario de los deliverys → abre el Home → ya está.
8. **Transición:** navega Home → producto → atrás → el fundido se nota y el
   panel admin navega igual que siempre.
9. **Subcategorías:** Panel → Categorías → crea una dentro de otra (Ubicación
   → «Dentro de: …») → ábrelo en la tienda: al entrar a esa categoría salen
   las TARJETAS de sus subcategorías (solo nombre y foto, SIN contador de
   productos), antes de los productos. Cada una muestra SOLO sus productos
   directos. Sube una foto a una subcategoría y revisa que salga de fondo
   en su tarjeta.
   Intenta eliminar una categoría con productos → te bloquea y te dice
   cuántos tiene.
10. **Mover producto de categoría:** Panel → Productos → Edita uno que esté
   en una categoría principal y ponlo en una ↳ subcategoría de la misma →
   Guardar. Abre la tienda SIN recargar: el producto aparece SOLO dentro de
   la subcategoría y ya NO sale repetido en la principal. Entra a su ficha:
   el breadcrumb muestra la categoría nueva.
11. **Formas de pago (5.79):** Panel → Ajustes → Formas de pago → activa
   Zelle (interruptor), llena correo + titular → Guardar. Abre el checkout:
   el paso Pago ahora muestra DOS tarjetas (Pago Móvil y Zelle) — toca Zelle:
   sus datos, su formulario (banco de origen, titular, confirmación) y el
   comprobante obligatorio. Desactívala de nuevo y en el checkout vuelve a
   haber una sola. El QR de tu Pago Móvil se ve bajo los datos: escanéalo
   con tu app del banco para confirmar que abre tu Suiche 7B.
12. **Multicuenta + QR + efectivo (5.80):** Panel → Ajustes → Formas de pago:
   (a) toca «＋ Agregar otra cuenta», elige Transferencia, ponle nombre
   «Banesco», llena banco + RIF + cuenta de 20 → Guardar → en el checkout
   salen DOS chips («Transferencia» y «Transferencia · Banesco»); (b) en tu
   Pago Móvil toca «Subir QR (foto)», elige una imagen → se ve la miniatura →
   Guardar y escanéala desde el checkout; (c) toca «＋ Efectivo» y «＋ Punto de
   venta» → Guardar → en el checkout elígelos: NO piden comprobante ni
   formulario, dicen «pagas al recibir» y el pedido se crea igual — te llega
   la alerta «· pago al recibir» y aparece en Pedidos (NO en la cola de
   Pagos). Las cuentas quitadas desaparecen del checkout al guardar.
13. **Tarjeta, fotos y bahías (5.81):** (a) en la tienda toca el «+» de una
   tarjeta → se convierte en «− 1 +»: sube a 2-3, baja a 0 (el producto sale
   del carrito) y revisa que el «+» se apague al llegar al stock del
   producto; (b) Panel → Productos → Edita uno → «Fotos del producto»:
   sube 2-3 fotos, ordénalas con «←» «→», guarda → abre su ficha: la primera
   foto es la portada y las miniaturas cambian la foto grande al tocarlas;
   (c) entra a una categoría CON subcategorías: solo ves las tarjetas de
   subcategorías (sin productos abajo) — entra a una subcategoría y ves sus
   productos; una categoría SIN subcategorías sigue mostrando productos;
   (d) crea una subcategoría nueva en una bahía que tiene productos → te
   avisa cuántos hay y te ofrece moverlos: acepta y revisa en la tienda que
   quedaron dentro de la subcategoría; (e) si dejas productos directos en una
   bahía con subcategorías, su fila del panel muestra «⚠ N directos ocultos».
14. **Píldora, carrusel y Pago Móvil extra (5.82):** (a) la píldora «− qty +»
   y el «+» ahora se ven compactos (36 px) — verifica que no tapen la foto;
   (b) sube 2-3 fotos a un producto, guarda y mira su TARJETA en la tienda:
   pasa las fotos con el dedo y mira los puntos de abajo; (c) **prueba el
   FIX de fotos**: con ese producto ya multi-foto, edítale SOLO el precio →
   Guardar → reábrelo: las 2-3 fotos SIGUEN ahí (antes quedaba solo la
   portada); (d) Panel → Ajustes → Formas de pago → toca «＋ Pago móvil»
   (chip de arriba), llena banco + RIF + teléfono, ponle nombre «Banesco» →
   Guardar → en el checkout salen DOS chips de Pago Móvil.
15. **Carrusel Farmatodo en la ficha (5.83):** con un producto de 2-3 fotos:
   (a) su TARJETA muestra SOLO la portada, sin puntos y sin deslizar — el
   toque abre la ficha; (b) al ENTRAR al producto: pasa las fotos con el
   dedo → la foto cambia con resorte y los puntos de abajo avanzan; (c)
   toca una miniatura → el carrusel se desliza hasta ella; desliza con el
   dedo → su miniatura queda resaltada en rojo; (d) un producto de UNA foto
   queda igual que siempre en tarjeta y ficha.
16. **QR individual por cuenta (5.84):** (a) Panel → Ajustes → toca «＋ Pago
   móvil» → la cuenta nueva aparece SIN QR (ni la vista previa ni «lo que ve
   el cliente» muestran el QR de tu otra cuenta); guarda y abre el checkout:
   al elegir esa cuenta NO hay QR — solo sus datos; (b) súbele un QR (foto)
   → Guardar → el checkout lo muestra SOLO para esa cuenta; (c) si tu
   segundo Pago Móvil de la ronda pasada quedó con el QR repetido: «Quitar
   QR» → Guardar → desaparece del checkout hasta que subas el suyo.
17. **Chip y stepper Farmatodo (5.85):** (a) busca un producto con «Últimas
   N» → el chip está ABAJO a la izquierda de la foto y se ve más
   transparente; (b) toca el «+» de una tarjeta → se agrega y se abre la
   cápsula «− qty +»; toca «+» de la cápsula y suelta → al rato se retrae
   sola y queda el NÚMERO en el círculo; (c) toca el círculo → vuelve la
   cápsula para aumentar o disminuir → al rato se retrae de nuevo; baja a 0
   → la pieza sale del carrito y vuelve el «+»; (d) círculo y cápsula se ven
   más pequeños (32 px) y el «+» o el número llenan casi todo el círculo.
18. **QR ampliado (5.86):** llega al paso Pago con una forma electrónica →
   toca el QR de la cuenta → se abre AMPLIADO (grande, con el nombre de la
   cuenta arriba); escanéalo de ahí; cierra con la ✕, tocando fuera o con
   ESC → sigues en el checkout donde estabas. Contra entrega sigue sin QR.
19. **Importar inventario (5.87):** Panel → Productos → «Importar PDF» →
   elige la categoría para los productos nuevos → «Elegir PDF…» con tu
   reporte «Inventario disponible» → Importar: al terminar ves «N filas
   leídas · X creados · Y actualizados». (a) Vuelve a importar el MISMO PDF
   con «Omitir los productos con existencia 0» marcado → solo cambian los
   que tienen stock; (b) edita a mano el precio de un producto importado,
   vuelve a importar → su precio vuelve al del reporte (stock y precio son
   del PDF); (c) la lista de productos ya muestra los nuevos con su código.
20. **Importar inventario corregido (5.87b):** repite el paso 19 con el
   mismo PDF → ahora SÍ termina en verde (era el 400 que viste). (a) Prueba
   también tu reporte GRANDE (el de todo el catálogo, 23 páginas): lee las
   ~390 filas y te avisa de las poquitas que descartó con su motivo; (b) si
   el PDF no es el reporte (o está dañado), el MODAL muestra «El servidor no
   pudo importar — Motivo: …» con la razón exacta — nada de adivinar.
21. **Importación con diagnóstico (5.87c):** si la importación vuelve a
   fallar en tu PC, ya no verás un texto genérico: (a) el MODAL muestra el
   motivo técnico exacto (con contraseña → pide exportar SIN protección;
   corrupto → vuelve a exportar; página rota → dice cuál es) y (b) en la
   terminal de `netlify dev` aparece la línea
   `[fn-importInventory] pdfjs no pudo leer el PDF: …` con el error crudo.
   Si tienes que reportarlo, copia ESE motivo: con él se arregla en una
   ronda, sin pruebas a ciegas.
22. **Importación con el paquete en su sitio (5.87d):** después de copiar
   el lote y correr `npm install` en la raíz (paso 1), reinicia
   `netlify dev` y repite el paso 19 → la importación termina en verde con
   tu reporte real (57 filas) y con el grande (390). (a) El aviso
   «Connecting to 'ws://localhost:3000…'» de la consola ya NO aparece y
   los cambios de código aplican en caliente; (b) si algún día ves
   «Falta el paquete del lector de PDF…», el modal te da la orden exacta:
   `npm install` en la raíz (NO dentro de functions/) y reiniciar.
23. **Importación sin índices a mano (5.87e):** repite el paso 19 con tu
   reporte real → termina en verde SIN abrir la consola de Firebase (tu
   último 400 «COLLECTION_GROUP_ASC index … field sku» ya no puede
   ocurrir: esa consulta con filtro YA NO EXISTE). (a) Crea a mano un
   producto SIN código pero con un código del reporte como SKU y vuelve a
   importar → ese producto se ACTUALIZA (stock y precio del PDF) y NO se
   duplica; (b) si una función falla por algo interno, el toast ya no
   acusa «No tienes acceso a esta área» por accidente: dice «reintenta»
   y el motivo exacto queda en el modal de importación.
24. **Fotos pendientes, nada roto (5.87f):** en tu lista de productos los
   importados SIN foto muestran el cuadro «FOTO PENDIENTE» de SPOT 24 en
   vez de una foto rota; igual en el catálogo, la ficha, el carrito y el
   detalle del pedido. (a) Edita uno y súbele foto → la foto real
   sustituye al placeholder; (b) el QR de pago y los comprobantes NO usan
   placeholder (no corresponde); (c) los avisos «Failed to load
   resource» de fotos pendientes pueden salir una vez en consola — es el
   navegador anotando el intento, no una avería.
25. **El editor COMPLETO en cualquier pantalla (5.88):** con tu lista de
   57 productos, baja hasta un producto de en medio y toca «Editar» —
   en el teléfono el cuadro sube desde el pie de LA PANTALLA y se ve
   entero (Guardar/Cancelar siempre a la vista, mires donde mires de
   la lista); en la PC con la de 14 pulgadas igual: nada recortado.
   (a) Prueba también el QR ampliado del checkout y el modal «Importar
   PDF»: todos se ven completos; (b) la transición entre páginas se ve
   y se siente EXACTAMENTE igual que antes (mismos 180 ms) — solo que
   ya no rompe los modals.
26. **Copias de seguridad (5.89):** entra al panel → «Copias» (menú nuevo,
    solo con tu cuenta admin): arriba el bloque de acciones y abajo la
    lista de copias en la nube. (a) Toca «Descargar copia ahora» → te
    baja `spot24-catalogo-…json` con tu catálogo completo; ábrelo con
    el bloc de notas si quieres: es texto legible. (b) Toca «Guardar
    copia en la nube» → aparece en la lista con la etiqueta «Manual».
    (c) Toca «Restaurar» en esa copia → el modal muestra el resumen y
    la advertencia; escribe RESTAURAR y confirma → el toast dice cuántos
    productos se escribieron y la lista muestra además la copia «Manual
    · previo a restaurar» (tu red de seguridad para volver atrás).
    (d) La copia automática se crea sola a las 6:00 a.m. de Venezuela:
    al día siguiente verás la fila «Automática» sin hacer nada.
    (e) «Restaurar desde archivo…»: elige el JSON que descargaste →
    mismo resumen, misma confirmación. (f) NO pruebes restaurar a mitad
    de un día de ventas: hazlo al cerrar o con la tienda quieta.
27. **Campana de notificaciones (5.90):** en tu PC (o agranda la ventana
    a tamaño tablet): (a) con TU sesión abierta, mira la barra superior —
    la campana aparece ANTES del icono de Instagram. (b) Haz un pedido
    (o pide a alguien que haga uno) → al confirmarse el pago, la campana
    muestra el punto rojo. (c) Toca la campana → se abre «Notificaciones»
    con el aviso (fecha, estado, código del pedido) y al instante el
    punto rojo se apaga — en la barra y en cualquier pantalla. (d) En el
    teléfono la campana NO aparece (la barra se queda igual que siempre)
    y los avisos siguen llegando al teléfono como hasta ahora. (e) Con la
    app instalada como PWA nada cambió: mismo ícono, mismo offline, mismo
    aviso del sistema.

## Archivos (95) — copiar SOBRE tu repo, respetando carpetas

| Archivo | Cambio |
|---|---|
| `firestore.rules` | Lista blanca users: + cedula, address (create y update) · 5.89: línea explícita `catalogBackups` en el bloque de colecciones internas (solo documentación: el cierre general ya la bloquea) · 5.90: subcolección `users/{uid}/notifs` SOLO-lectura para el dueño (el servidor escribe el historial de avisos) + `notifsLastReadAt` entra en la lista blanca del update de users (número acotado a ahora+1 min) |
| `netlify.toml` | Timeout 26 s para fn-recomputeStock · 5.87: timeout 26 s para fn-importInventory · 5.87d: la CSP de dev permite el websocket de Vite (HMR sin F5) · 5.89: timeout 26 s para las 4 funciones de copias + backup-catalog (el cron diario) · 5.90.2: FIX imágenes rotas — connect-src += `https://i.ibb.co` (el fetch del SW lo gobierna la CSP de sw.js, NO img-src de la página) y += `https://firebasestorage.googleapis.com` (mina latente de la ruta CacheFirst de Storage) + 4º hash del script inline del SDK de Auth (`about:srcdoc:85`) |
| `index.html` | NUEVO EN LOTE 5.91 · cara pública de la tienda en buscadores/redes: canónico + Open Graph (título, descripción, `og-cover.jpg` 1200×630, locale es_VE) + Twitter card summary_large_image + JSON-LD AutoPartsStore (nombre, eslogan, Instagram, Venezuela) · el título y la descripción ya existían · 6 URLs absolutas a cambiar cuando haya dominio propio |
| `public/robots.txt` | NUEVO 5.91 · permiso a buscadores: Allow / + fuera de Google el panel y lo transaccional (admin, carrito, checkout, pedidos, pedido/, notificaciones, recuperar) + apunta al sitemap |
| `public/sitemap.xml` | NUEVO 5.91 · mapa de rutas públicas: / (1.0, daily), /catalogo (0.9, daily), /cuenta/registro y /cuenta/login · XML validado |
| `public/og-cover.jpg` | NUEVO 5.91 · tarjeta de WhatsApp/redes: fachada real de noche (billboard «Tu parada segura», letrero encendido, mural del escudo) recortada a 1200×630 · 143 KB · NO precachea (jpg fuera de los globs del SW) |
| `public/googlea7423837b95abad3.html` | NUEVO 5.91b · archivo de verificación de Google Search Console (contenido exacto exigido por Google, 53 bytes) · PRECACHEADO (html está en los globs del SW: precache 114 → 115) |
| `vite.config.ts` | imgbb CacheFirst (300 imgs/30 días) + hmr dev |
| `eslint.config.js` | NUEVO EN LOTE 5.91c · reglas de lint del repo · excepción quirúrgica: `triple-slash-reference` OFF solo para `functions/src/lib/extraerPdf.ts` (las referencias a los .d.ts de pdfjs son voluntarias — declaraciones ambientales que pdfjs-dist no publica; sin ellas VSC muestra TS2307) · los 10 warnings restantes no bloquean CI |
| `package.json` | NUEVO EN LOTE 5.87d · pdfjs-dist TAMBIÉN en la RAÍZ del repo: netlify dev resuelve los paquetes desde aquí (functions/node_modules queda fuera de la cadena) |
| `package-lock.json` | NUEVO EN LOTE 5.87d · lock de la raíz con pdfjs-dist 4.10.38 (misma versión que en functions/) |
| `public/img/qr-pago-movil.jpg` | NUEVO 5.79 · Tu QR de pago (Suiche 7B) comprimido y precacheado |
| `public/img/products/placeholder.svg` | NUEVO 5.87f · cuadro «FOTO PENDIENTE» de SPOT 24 (mismo estilo que los svg de categoría) — portada de los productos sin foto, PRECACHEADO |
| `src/index.css` | Animación de entrada de ruta (.route-enter, 180 ms) · 5.88: fill-mode `both` → `backwards` — el transform residual desanclaba los modals del viewport (editor cortado en PC e invisible en el teléfono con páginas altas); la animación se ve IDÉNTICA |
| `src/app/layouts/RootLayout.tsx` | Transición de ruta + caché compartida de ajustes · 5.90: campana `NotifBell` en la barra SOLO ≥sm (PC/tablet), antes de Instagram, con puntito rojo de avisos sin leer + BellIcon · 5.90.3: referencias de marca de terceros retiradas del texto/comentarios (sin cambios de comportamiento)|
| `src/app/router.tsx` | NUEVO EN LOTE 5.89 · ruta `/admin/copias` con guard SOLO admin (la página de Copias de seguridad) · 5.90: ruta `/notificaciones` con guard de sesión (la página de la campana) |
| `src/features/admin/pages/AdminLayout.tsx` | NUEVO EN LOTE 5.89 · entrada de menú «Copias» (código 10, SOLO admin) |
| `src/shared/components/ui/Modal.tsx` | NUEVO EN LOTE 5.88 · el modal se monta por PORTAL en document.body — anclado SIEMPRE a la pantalla aunque un ancestro tenga transform (cinturón del fix 5.88; beneficia a los 15 modals de la app: editor, importar PDF, QR ampliado, categorías, promos, zonas, usuarios, pagos, despacho, comprobante, cancelar) |
| `src/shared/components/ui/PriceTag.tsx` | NUEVO EN LOTE 5.92f (cambia por primera vez y ahora viaja) · PriceTag: precio SOLO en Bs. con la tasa BCV en vivo · StockBadge: chip de stock de la ficha — 5.92f: dice «Agotado» sin existencias (antes «Sin stock») |
| `src/features/admin/pages/AdminProductsPage.tsx` | FIX: modal no arrastra datos del producto anterior + «Descripción (opcional)» + selector de categoría en árbol (↳) · 5.78: aviso de categoría oculta/eliminada + candado de precio/stock · 5.81: LISTA de fotos (hasta 6, portada + quitar + reordenar) · 5.82: nota de que editar precio/stock NO toca las fotos · 5.87: botón «Importar PDF» + modal (categoría destino, archivo, omitir ceros, resumen) · 5.87b: si la importación falla, el modal muestra el MOTIVO REAL del servidor (nada de adivinar) · 5.87f: placeholder en lista y editor si la foto no carga · 5.90.3: referencias de marca de terceros retiradas del texto/comentarios (sin cambios de comportamiento) · 5.92: modal sin casilla de ceros + formato detectado en el resumen + textos de los dos formatos admitidos · 5.96: contador de productos junto al buscador — «N productos en total» y con búsqueda activa «M encontrados de N» (se refresca al guardar, importar o eliminar) |
| `functions/src/importInventory.ts` | NUEVO 5.87 · core de la importación: empareja por código/SKU, crea lo que falta y actualiza stock+precio en lotes (admin/gerencia, con auditoría) · 5.87b: la lectura del PDF vive en lib/extraerPdf (fix del worker dentro del bundle) · 5.87e: lectura de variantes SIN where — NINGÚN índice que crear a mano (fuera el FAILED_PRECONDITION «COLLECTION_GROUP_ASC … sku») y emparejamiento de SKU en memoria · 5.92: detecta el formato SOLO (reporte del POS o lista con doble precio — usa el SIN impuesto) y la casilla «omitir cero» se RETIRÓ: los productos en cero también se crean/actualizan (pedido del dueño) · 5.92b: blindaje «No document to update» — los productos candidatos se validan por EXISTENCIA antes de planear (las variantes colgantes de productos borrados ya no abortan el lote; sus filas se crean como nuevas) y la variante inventada para un producto sin variantes va con set · 5.92e: createdAt = Date.now() (número, la convención de la app — serverTimestamp dejaba Timestamp y rompía el cursor de paginación del catálogo) · 5.95: al actualizar un producto viejo, si su createdAt es Timestamp se reescribe como número epoch-ms (aMillisDe) — re-importando las listas queda TODO el catálogo con fechas uniformes y el orden cronológico real |
| `functions/src/lib/inventarioPdf.ts` | NUEVO 5.87 · parser PURO del reporte «Inventario disponible»: filas por coordenadas de columnas (código/desc/existencia/costo) + números VE — 13 tests con items reales del PDF del dueño · 5.92: +parseListaLimpia (cabecera multi-renglón, «$»/«und.», códigos con letra inicial, sufijos -2/-3… para códigos repetidos) y +parseInventarioAuto (detección automática de formato) |
| `functions/src/lib/extraerPdf.ts` | NUEVO 5.87b · lectura del PDF con pdfjs + registro del worker en el escape hatch oficial (FIX del 400 «No se pudo leer el PDF»: el motor viaja DENTRO del paquete de Netlify) — tope 4 MB / 400 páginas · 5.87c: si el PDF falla, el motivo TÉCNICO llega al modal y al log de netlify dev (mensaje propio para contraseña / corrupto / página rota) + registro blindado del worker (namespace plano o .default) + destroy() del documento + referencia a la declaración pdfjs.d.ts · 5.87d: mensaje PROPIO si falta el paquete del lector (ERR_MODULE_NOT_FOUND → la orden: npm install en la raíz, NO dentro de functions/, y reiniciar netlify dev) |
| `functions/src/lib/pdfjs.d.ts` | NUEVO 5.87c · declaración de tipos del lector de pdfjs DENTRO del repo — tu VSC dejará de marcar TS2307 «No se encuentra el módulo pdfjs-dist/legacy/build/pdf.mjs» (era solo el editor: la función sí funciona) |
| `functions/src/lib/pdfjs-worker.d.ts` | NUEVO 5.87b · tipos del worker de pdfjs (el paquete no los publica) |
| `functions/src/lib/notifications.ts` | RECUPERADO EN LOTE 5.90 (faltaba en el lote desde las rondas del push — ahora entra sí o sí porque cambió) · motor de los avisos: push de estado del pedido al cliente (6 estados, textos de marca, doble vía 5.67, urgencia alta 5.73-j) + avisos de despacho/pagos/stock al personal y carritos · 5.90: CADA aviso de pedido TAMBIÉN queda en el historial in-app `users/{uid}/notifs` (title/body/código/estado/createdAtMs) ANTES del gate de tokens (con o sin push activado) + rotación: se conservan las 30 más recientes por usuario (offset+orderBy de un campo, sin índices) — best-effort: si falla no interrumpe el push ni la venta |
| `netlify/functions/fn-importInventory.ts` | NUEVO 5.87 · shim de la función (POST /.netlify/functions/fn-importInventory) |
| `netlify/functions/fn-exportCatalog.ts` | NUEVO 5.89 · shim: devuelve el JSON de la copia (catálogo actual o copia guardada con snapshotId) |
| `netlify/functions/fn-listCatalogBackups.ts` | NUEVO 5.89 · shim: lista las copias en la nube (solo metas, jamás el contenido) |
| `netlify/functions/fn-saveCatalogBackup.ts` | NUEVO 5.89 · shim: guarda UNA copia del estado actual (modo manual) |
| `netlify/functions/fn-restoreCatalog.ts` | NUEVO 5.89 · shim: restaura (SOLO admin) desde archivo o copia en la nube |
| `netlify/functions/backup-catalog.ts` | NUEVO 5.89 · CRON diario '0 10 * * *' UTC = 6:00 a.m. Venezuela: copia automática del catálogo (idempotente: salta si la última tiene <20 h; nunca lanza, como el BCV) |
| `functions/src/backups.ts` | NUEVO 5.89 · core de las copias: ensambla el catálogo (1 lectura de variantes con collectionGroup, sin índices), valida el archivo con lista blanca y coerción, trocea por BYTES UTF-8 (≤512 KB/doc, acentos intactos), guarda meta+chunks en `catalogBackups`, rota 30 por tipo, restaura por MORPH (escribe primero, borra sobrantes al final, IDs originales preservados) con copia previa OBLIGATORIA antes de tocar nada |
| `functions/package.json` | NUEVO EN LOTE 5.87 · dependencia pdfjs-dist (lector de PDF) |
| `functions/package-lock.json` | NUEVO EN LOTE 5.87 · lock con pdfjs-dist (el build de Netlify lo instala) |
| `src/tests/inventario-pdf.test.ts` | NUEVO 5.87 · 13 tests del parser (fixture real + casos límite) · 5.87b: +3 — PDF mínimo REAL extremo a extremo (pdfjs → parser), PDF truncado con error accionable y REGRESIÓN que extrae un PDF desde dentro del bundle esbuild de Netlify · 5.87c: +2 — el worker queda registrado con la forma EXACTA que pdfjs consulta y un PDF basura deja ver el motivo técnico (mensaje + log) · 5.87d: +1 — el mensaje de paquete ausente lleva la ORDEN exacta de arreglo · 5.92: +11 — lista limpia REAL del dueño (72/72), sufijos FORROSINT-2…-7 y WT4RUNNE-2, fila en cero, exclusión mutua de formatos y casos límite |
| `src/tests/fixtures/lista-limpia-items.sample.json` | NUEVO 5.92 · items REALES del PDF de accesorios del dueño (4 páginas, 399 items con coordenadas) para los tests del formato lista limpia |
| `src/tests/fixtures/inventario-items.sample.json` | NUEVO 5.87 · items REALES del PDF del dueño para los tests |
| `src/features/admin/pages/AdminCategoriesPage.tsx` | SUBCATEGORÍAS: lista en árbol, campo «Ubicación», guardas al eliminar · 5.81: candado «avisar + mover» al crear subcategoría en bahía con productos + marca ⚠ de productos ocultos · 5.90.3: referencias de marca de terceros retiradas del texto/comentarios (sin cambios de comportamiento)|
| `src/features/admin/pages/AdminPaymentsPage.tsx` | 5.80 · fuera de «Sin comprobante» los pedidos contra entrega (Efectivo/Punto de venta): se cobran al entregar y se procesan en Pedidos |
| `src/features/admin/components/NewOrderAlert.tsx` | 5.80 · la alerta de pedidos nuevos también avisa los contra entrega («pago al recibir») |
| `src/features/admin/pages/AdminSettingsPage.tsx` | Campo «Horario de los deliverys» en Operación · 5.79: formas de pago con interruptor · 5.80: LISTA de cuentas (varias por método), agregar/quitar, nombre para el cliente y SUBIR el QR como archivo (o enlace) · 5.82: chips «＋ Pago móvil / ＋ Transferencia / …» SIEMPRE visibles (agregar otra cuenta en un toque; fuera el botón del fondo) · 5.84: cuenta nueva nace SIN QR — ni la carga ni la vista previa inyectan el QR del repo (el de la otra cuenta) |
| `src/features/admin/pages/AdminMetricsPage.tsx` | Gráfico 7 días (barras 0 px) + fuera la línea «≈ Bs.» + semana lun→dom |
| `src/features/admin/services/admin.service.ts` | Guarda `parentId` + conteo de productos por categoría (protege el borrado) · 5.81: mover productos entre categorías en lotes + guardar categoría devuelve su id · 5.82: FIX — editar producto ya NO reescribe images (antes borraba las fotos extra al cambiar precio/stock) · 5.87: adminImportInventory (sube el PDF del POS a fn-importInventory) · 5.92: adminImportInventory sin «omitir cero» + formato detectado en el resultado · 5.92c: adminDeleteProduct borra en UN lote atómico TODAS las variantes + la ficha — no queda nada colgando (la causa de las variantes huérfanas que abortaron la 1ª importación) · 5.95: adminListProducts SIN orderBy createdAt (el orden de tipos de Firestore mandaba los importados al final y el tope 60 los dejaba fuera) — lee hasta 300, ordena en código con aMillis y busca sobre TODOS; altas del panel con createdAt = Date.now() (número, misma convención del importador — fuera la mezcla de tipos) · 5.96: adminCountAllProducts — conteo EXACTO de la colección products (activos e inactivos) con getCountFromServer: 1 lectura de agregación, sin descargar documentos |
| `src/features/admin/services/backups.service.ts` | NUEVO 5.89 · capa de servicios de las copias: 4 llamadas a funciones + helpers puros (parseBackupFile valida el archivo subido ANTES de enviarlo, copiaFilename, fechaCorta, bytesLegibles) — los tipos son espejo del core del backend |
| `src/features/admin/pages/AdminBackupsPage.tsx` | NUEVO 5.89 · página «Copias» del panel: descargar, guardar en la nube, lista con etiqueta Automática/Manual (fecha, conteos, KB), descargar copia de la nube y RESTAURAR con doble confirmación (resumen + escribir RESTAURAR) y advertencia en rojo |
| `src/shared/lib/backend.ts` | 5.87b · los errores de funciones se registran en UNA línea plana (http + code + motivo): el paste de consola ya no muestra «Object» sin información · 5.87e: los errores crudos de Firestore («9 FAILED_PRECONDITION», p. ej. índice faltante) ya no se muestran como «No tienes acceso a esta área» — toast de reintento y motivo real en el modal de admin |
| `functions/src/admin.ts` | Métricas: semana fija lun→dom con cortes a medianoche VE |
| `functions/src/orders.ts` | createOrder acepta las formas de pago — 5.80: 6 métodos y comprobante OPCIONAL en Efectivo/Punto de venta (nacen sin comprobante) — REQUIERE deploy de funciones · 5.93: blindaje del 500 — ids validados con isSafeDocId (400 «Ítem inválido» en vez de 500 opaco) y stock/stockReserved/expiresAt con finiteNum (nunca NaN a la transacción) en reserveStock, quote, create y cancel |
| `functions/src/payments.ts` | Verificación de pagos y repuesto del stock al rechazar — 5.93: el repuesto lee stock con finiteNum (stock corrupto ya no revienta la transacción como 500 opaco) |
| `functions/src/lib/http-ctx.ts` | Adaptador HTTP de Netlify (token Bearer + App Check + errores canónicos) · 5.93: CAUSA RAÍZ del 500 de fn-reserveStock — token vencido/revocado (auth/…) ahora es 401 con mensaje claro y el log dice la causa (`[auth] token rechazado: …`); defensa en profundidad: cualquier código `auth/*` mapea a unauthenticated |
| `functions/src/lib/items.ts` | Contrato de líneas del carrito (extractItems acepta {items} y array pelado) · 5.93: helpers puros de la autopsia — isSafeDocId (ids que no revientan doc()) y finiteNum (nunca NaN hacia Firestore) |
| `functions/src/__tests__/items-guard.test.ts` | NUEVO 5.93 · 10 tests de regresión de la autopsia: ids válidos/inválidos (incluye el caso exacto `/`), NaN→0 en todas sus formas y contrato de extractItems intacto |
| `functions/src/lib/ctx.ts` | NUEVO 5.78d · sin credencial admin en local: aviso con paso a paso (antes 500 mudo en netlify dev) |
| `src/features/auth/types/index.ts` | SpotUser: + cedula, address |
| `src/features/auth/services/auth.service.ts` | Registro con cédula/dirección, saveCustomerData, changePassword · 5.92g: saveCustomerData guarda TELÉFONO (acepta 04…/414…/+58…, guarda +58… con validación VE) + dirección; la cédula ya no se toca desde aquí |
| `src/features/auth/store/auth.store.ts` | Acciones signUp (ampliada), saveMyData, changeMyPassword · 5.92g: saveMyData(phone, address) parchea user.phone con el E.164 sanitizado |
| `src/features/auth/hooks/useAuth.ts` | Expone saveMyData y changeMyPassword · 5.92g: firma nueva saveMyData(phone, address) |
| `src/features/auth/pages/RegisterPage.tsx` | Campos Cédula + Dirección completa |
| `src/features/auth/pages/AccountPage.tsx` | «Mis datos de entrega» + «Seguridad» (cambiar clave, formulario accesible) · 5.92g: título «Actualización de mis Datos de entrega», formulario TELÉFONO + DIRECCIÓN (fuera el rótulo «Van prellenados en cada compra»), cédula de SOLO LECTURA en «Datos» (sigue prellenando el checkout) |
| `src/features/cart/lib/cartLogic.ts` | NUEVO EN LOTE 5.81 · lógica pura del carrito (stock, topes, fusión) + `singleLineForProduct` (stepper de la tarjeta) · 5.90.3: referencias de marca de terceros retiradas del texto/comentarios (sin cambios de comportamiento)|
| `src/features/cart/pages/CartPage.tsx` | NUEVO EN LOTE 5.87f · onError de fotos en los ítems del carrito (placeholder si la foto no carga) — el resto de la página igual que en tu repo · 5.90.3: referencias de marca de terceros retiradas del texto/comentarios (sin cambios de comportamiento)|
| `src/features/cart/tests/cartLogic.test.ts` | NUEVO EN LOTE 5.81 · 14 tests de la lógica del carrito (incluye el stepper de la tarjeta) |
| `src/features/catalog/pages/ProductPage.tsx` | «Descripción» solo si existe + breadcrumb compatible con subcategorías · 5.81: galería con miniaturas CLICABLES (foto grande cambia al tocar) · 5.83: carrusel DESLIZABLE con puntos (Farmatodo) — pasar las fotos con el dedo dentro de la ficha, miniaturas sincronizadas (tocar una desliza hasta ella) · 5.87f: placeholder en carrusel y miniaturas cuando una foto falla · 5.90.3: referencias de marca de terceros retiradas del texto/comentarios (sin cambios de comportamiento) · 5.92f: el botón del carrito dice «Agotado» cuando la variante elegida no tiene existencias (antes «Sin stock»)|
| `src/features/catalog/components/ProductCard.tsx` | Chip «Últimas N» dentro de la foto (no tapa el precio) · 5.81: píldora «− qty +» estilo Farmatodo cuando el producto ya está en el carrito · 5.82: «+» y píldora COMPACTOS (36 px) + chip arriba-izquierda · 5.83: la tarjeta vuelve a mostrar SOLO la portada, fija y sin puntos (el carrusel vive en la ficha) · 5.85: chip ABAJO-izquierda + más transparencia (50 %) · stepper que se RETRAE al círculo con el número y vuelve al tocarlo (Farmatodo), todo a 32 px con el «+»/número al 80 % del círculo · 5.87f: placeholder si la portada no carga · 5.90.3: referencias de marca de terceros retiradas del texto/comentarios (sin cambios de comportamiento) · 5.92f: el chip de producto sin existencias dice «Agotado» (antes «Sin stock»)|
| `src/features/catalog/components/CategoryCard.tsx` | NUEVO 5.77 · Tarjeta de subcategoría (foto opcional) · 5.78: sin contador de productos · 5.90.3: referencias de marca de terceros retiradas del texto/comentarios (sin cambios de comportamiento)|
| `src/features/catalog/pages/HomePage.tsx` | Horario de deliverys leído de Ajustes + bahías = solo categorías principales |
| `src/features/catalog/pages/CatalogPage.tsx` | Tarjetas de subcategorías antes de los productos (5.77) · 5.78c: cada categoría filtra SOLO sus productos directos · 5.81: bahía con subcategorías muestra ÚNICAMENTE las subcategorías (sin productos, sin consultas en vano) · 5.90.3: referencias de marca de terceros retiradas del texto/comentarios (sin cambios de comportamiento) · 5.92f: fuera el contador «N+ productos · N en la categoría» del subtítulo y la consulta de conteo que lo alimentaba (una lectura de Firestore menos por visita)|
| `src/features/catalog/components/SearchBar.tsx` | Filtros: fila de categorías principales (los chips repetidos de subcats salieron en 5.77) · 5.90.3: referencias de marca de terceros retiradas del texto/comentarios (sin cambios de comportamiento)|
| `src/features/catalog/services/catalog.service.ts` | Filtrado por categoría + árbol normalizado (`in` queda como soporte genérico) · 5.92e: el cursor de paginación normaliza createdAt con aMillis (acepta Timestamp de Firestore O número — jamás NaN) + cursor por SNAPSHOT del documento (desempate implícito, sin índices nuevos; fixes «duplicate key» y «Too many arguments provided to startAfter()») · 5.95: búsqueda de verdad — 1º por CÓDIGO con prefijo (`code >= T && code <= T+…`, índice automático de un campo, orden en código, respeta filtros) y si no por NOMBRE con el token más largo como ancla + resto de palabras filtrado en código (varias palabras ya no dan cero); sin índices nuevos |
| `src/features/catalog/lib/busqueda.ts` | NUEVO 5.95 · libra PURA de búsqueda (sin Firebase, probada en vitest): tokensDe/anclaDe (ancla = palabra más larga 3+), pasaTodosLosTokens (AND de palabras sobre nombre+marca+código+términos+slug, sin acentos), terminosDeCodigo («es-800033» → ES-800033 y ES800033), pasaFiltros (categoría/stock/precio para los resultados por código) |
| `src/features/catalog/hooks/useCatalog.ts` | Conteo por categoría (getCountFromServer, cache 5 min + bus en vivo) · 5.81: listado con apagador (bahías con subcategorías no consultan productos) |
| `src/features/catalog/types/index.ts` | Filtro `categoryIds` (soporte genérico de varios ids, sin uso en la tienda) |
| `src/features/checkout/pages/CheckoutPage.tsx` | Autofill cédula/dirección + Copiar (RIF solo números) · 5.79: tarjetas de formas activas, formulario por método, QR en pantalla, ícono de copiar · 5.80: chips por CUENTA (multicuenta), contra entrega sin comprobante ni formulario · 5.86: el QR es TOCABLE — se abre AMPLIADO (modal accesible) para escanearlo desde la app del banco |
| `src/features/orders/pages/MyOrdersPage.tsx` | Mis Pedidos EN VIVO (vigía onSnapshot) |
| `src/features/orders/pages/NotificationsPage.tsx` | NUEVO 5.90 · página de la campana: lista EN VIVO de los avisos del historial (más nuevo arriba) con punto rojo en los posteriores a la última visita (umbral congelado al abrir), etiqueta del estado (STATUS_LABELS) + código del pedido + fecha corta am/pm · marca todo como leído UNA vez al cargar (campana apagada en toda la app al instante) · estados skeleton/empty/error como el resto de la app · 5.90.1: banner «se cortó la conexión en vivo · Reintentar» cuando el canal murió con datos en pantalla (stale) — jamás una lista congelada en silencio |
| `src/features/orders/pages/OrderDetailPage.tsx` | 5.80 · contra entrega: NO pide comprobante y dice «pagas al recibir»; texto de estado por método · 5.87f: placeholder en la miniatura si la foto del ítem falla |
| `src/features/orders/services/orders.service.ts` | subscribeMyOrders |
| `src/features/orders/services/notifs.service.ts` | NUEVO 5.90 · lectura en vivo del historial (onSnapshot, limit 30, más nuevo arriba — cierre seguro si se desuscribe antes de conectar) + marca de lectura (notifsLastReadAt en users/{uid}: 1 write por visita, sin tocar 30 avisos) + helpers PUROS: contarNoLeidas (comparación estricta >, empate = leído) y fechaCortaNotif (dd/mm/aaaa h:mm a.m./p.m., misma voz que las copias) · 5.90.1: helper puro nextReconnectDelayMs (backoff de reconexión 3 s → 6 s → … → tope 60 s) |
| `src/features/orders/store/notifs.store.ts` | NUEVO 5.90 · store Zustand del historial (patrón cart.store): UNA suscripción viva compartida por campana y página (startFor idempotente, logout cierra y limpia) · lastReadMs MONÓTONO (la marca nunca retrocede: el valor viejo del doc no deshace el markAllRead de la visita) · marca optimista + write best-effort · 5.90.1: canal a PRUEBA DE CORTES — el SDK no reengancha un listener muerto (QUIC/Wi-Fi): ahora el store RECONECTA SOLO con backoff (3 s → 60 s, reset cuando el snapshot repone datos), levanta `stale` con datos en pantalla (banner) y muestra la pantalla de error como siempre sin datos; temporizador único con limpieza en stop/cambio de cuenta |
| `src/features/orders/hooks/useNotifs.ts` | NUEVO 5.90 · hook público: conecta el canal por uid (login/logout) y expone {notifs, unread, ready, failed, markAllRead} — la campana y la página leen el MISMO store · 5.90.1: expone también `stale` (canal caído con datos en pantalla) para el banner de la página |
| `src/shared/constants/orders.ts` | Formas de pago — 5.80: 6 métodos (Efectivo y Punto de venta), instrucciones contra entrega, comprobante solo en electrónicas + texto de estado por método |
| `src/shared/constants/brand.ts` | Fuera DELIVERY_HOURS (vive en Ajustes) · 5.79: PaymentAccount +active/qrUrl · 5.80: +id y +label (multicuenta) y semillas de las 6 formas |
| `src/shared/constants/categories.ts` | CategoryDef: + `parentId` (subcategoría de…) |
| `src/shared/lib/categoryTree.ts` | NUEVO · lógica del árbol: rama, numeración de bahías, huérfanos |
| `src/shared/lib/format.ts` | rifToDigits + cleanAmountBs |
| `src/shared/lib/paymentMethods.ts` | Lógica pura de formas de pago — 5.80: multicuenta (activeAccountsOf sin deduplicar, accountKey/accountChipLabel/newAccountId), reglas contra entrega · 5.84: qrForAccount SOLO devuelve el QR propio de la cuenta (nada de respaldo al repo: un segundo Pago Móvil ya no hereda el QR del primero) |
| `src/shared/lib/clipboard.ts` | copyText con respaldo (WebView viejo) |
| `src/shared/lib/tiempos.ts` | NUEVO 5.92e · aMillis (normaliza fechas de Firestore: número, Timestamp, Date o JSON plano — jamás NaN) + dedupePorId (grilla sin repetidos, conserva orden y 1ª aparición) |
| `src/shared/services/settings.service.ts` | deliveryHours + caché compartida (1 lectura por carga) · 5.79/5.80: lee TODAS las cuentas (activas e inactivas, varias por método) |
| `src/tests/copy-helpers.test.ts` | Tests nuevos de rifToDigits/cleanAmountBs |
| `src/shared/lib/imgFallback.ts` | NUEVO 5.87f · alFallarFoto: onError de las fotos de producto — si la foto no carga muestra el placeholder UNA vez (dataset impide el bucle si el propio placeholder falla) |
| `src/tests/img-fallback.test.ts` | NUEVO 5.87f · 3 tests del respaldo (cambia al placeholder, sin bucle, imágenes independientes) |
| `src/tests/backup-file.test.ts` | NUEVO 5.89 · 14 tests del lado panel: parseBackupFile (válido, ida y vuelta, JSON corrupto, no-SPOT, versión, incompleto, tope 1000) + nombre de archivo con fecha LOCAL + fechaCorta/bytesLegibles |
| `src/tests/notifs-helpers.test.ts` | NUEVO 5.90 · 14 tests de los helpers puros del historial: contarNoLeidas (vacía, sin marca, marca en medio, EMPATE = leído, orden irrelevante) + fechaCortaNotif («—» sin fecha, ceros, mediodía p.m., 12:15 a.m.) + el espejo NOTIFS_PAGE_SIZE=30 con el tope del servidor · 5.90.1: backoff de reconexión (progresión 3→48 s, techo 60 s, basura → 3 s, ciclo error/reset del canal) |
| `src/tests/marcas-cliente.test.ts` | NUEVO 5.90.3 · guardián de marcas de terceros: recorre src/ + public/ + index.html (archivos textuales) y FALLA si encuentra una marca prohibida (lista extensible; hoy: farmatodo) en textos, aria-labels o comentarios — el dueño pidió que el cliente jamás la lea; se excluye a sí mismo (su lista) |
| `functions/src/__tests__/notifications-flow.test.ts` | RECUPERADO EN LOTE 5.90 (faltaba en el lote desde las rondas del push — ahora entra sí o sí porque cambió) · E2E con emulador del flujo de avisos: 10 fases (creación→pago→despacho→entrega→cancelación, replays sin duplicar, staff jamás destinatario, inventario consistente, secuencia exacta de 10 pushes) · 5.90: asserts del HISTORIAL in-app en cada fase — el doc users/{uid}/notifs con el MISMO texto del push, cliente SIN tokens acumula historial (el punto de la ronda), replay no duplica doc, secuencia del historial = secuencia de pushes, staff sin historial y FASE 8 de rotación (35+1 → quedan exactamente 30, se drenan las 6 más viejas) |
| `functions/src/__tests__/backups-core.test.ts` | NUEVO 5.89 · 13 tests del lado servidor (lógica pura sin Firestore): validateBackupFile (lista blanca, coerción, repetidos, huérfanos, topes) + chunk/join UTF-8 (round-trip exacto con acentos, el corte nunca parte un carácter) + planRotación 30/30 + normalizeTs |
| `functions/src/__tests__/import-inventario.test.ts` | NUEVO 5.92b · 6 tests del guardián de variantes huérfanas (lógica pura, sin Firestore): filtrarPidsVivos deja SOLO productos vivos en los mapas code/sku→producto — la regresión del «No document to update» que detuvo la 1ª importación real del dueño (nada se escribió: lote atómico) · 5.95: +5 tests de aMillisDe (número/Date/string/Timestamp real y pelado → epoch-ms; NaN/Infinity/basura → 0) |
| `src/tests/busqueda-codigo.test.ts` | NUEVO 5.95 · 15 tests de la búsqueda nueva: ancla = palabra más larga, varias palabras TODAS deben estar, código con/sin guion y prefijo corto (2 letras), filtros respetados en resultados por código |
| `src/tests/category-tree.test.ts` | NUEVO · 10 tests del árbol de categorías |
| `src/tests/tiempos.test.ts` | NUEVO 5.92e · 11 tests: aMillis (número, Timestamp del SDK con toMillis, JSON {seconds,nanoseconds} con redondeo, Date, string, basura → 0 y la REGRESIÓN del cursor con Timestamp real) + dedupePorId (páginas solapadas con los ids reales de la consola del dueño, orden, vacío) |
| `src/tests/payment-methods.test.ts` | Tests de formas de pago — 5.80: 39 tests (multicuenta, contra entrega, chips, ids) · 5.84: QR individual por cuenta (sin QR propio = sin QR) |
| `netlify/functions/fn-recomputeStock.ts` | Reparación one-shot del stockTotal (URL con clave) |

## Verificado antes de entregar

- **5.96 — Contador de productos en el panel**: la página Productos (la usan
  admin Y gerencia: misma pantalla, mismo servicio) muestra junto al buscador
  «N productos en total» y con búsqueda activa «M encontrados de N». N =
  colección completa (activos + inactivos, importados incluidos) vía
  getCountFromServer: 1 lectura de agregación, sin descargar documentos y
  válido aunque el catálogo pase del tope 300 del listado. Se refresca al
  guardar, importar o eliminar (no en cada tecla). Verificación: typecheck ×3
  (raíz + netlify + functions) OK, lint **0 errores** (10 warnings conocidos),
  **42 tests functions** y **182/182 raíz**, build verde precache **115**.
  Lote: sigue en **104 archivos** (2 ACTUALIZADOS), verificar-lote 1:1 EXACTO.
- **5.95 — Productos importados visibles y buscables**: lista de Productos
  del panel SIN orderBy createdAt (el orden de tipos de Firestore — Timestamps
  del panel antes que números del importador — enterraba a los importados al
  final y el tope 60 los dejaba fuera para siempre): lee hasta 300, ordena en
  código con aMillis, búsqueda sobre TODOS. Tienda: búsqueda por CÓDIGO con
  prefijo («es800» encuentra ES800033; índice automático de un campo, sin
  orderBy — orden resuelto en código, respeta filtros) y varias palabras con
  ancla = palabra más larga + filtro del resto en código (paginación intacta).
  Panel guarda altas con createdAt número; el importador normaliza el
  createdAt viejo (Timestamp → número) al re-importar listas. Sin cambios de
  datos, sin índices nuevos, sin reglas. Verificación: typecheck ×3 (raíz +
  netlify + functions) OK, lint **0 errores** (10 warnings conocidos),
  **42 tests functions** (37 + 5 de aMillisDe) y **182/182 raíz** (167 + 15
  de búsqueda), build verde precache **115**. Lote: **104 archivos** (2 NUEVOS:
  busqueda.ts + busqueda-codigo.test.ts), verificar-lote 1:1 EXACTO.
- **5.93 — AUTOPSIA del 500 de fn-reserveStock (3 caminos cerrados)**:
  (1) token vencido/revocado → 401 accionable con log de causa
  (`[auth] token rechazado: …`) — causa raíz del 500 real de producción;
  (2) id con ruta inválida → 400 «Ítem inválido» ANTES de tocar Firestore;
  (3) stock corrupto (NaN) → finiteNum (falla honesta o campo saneado).
  Mismo blindaje en reserveStock, quoteTotals, createOrder, cancelOrder y
  payments (repuesto del rechazo). Verificación: typecheck ×3 (raíz +
  netlify + functions) OK, lint **0 errores** (10 warnings conocidos),
  **37 tests functions** (27 + 10 nuevos de items-guard) y **167/167 raíz**,
  build verde precache 115 (207 módulos, mismo número que el dueño).
  Lote: **102 archivos** (1 NUEVO: items-guard.test.ts + 3 filas que ya
  vivían en el lote sin fila en la tabla), verificar-lote 1:1 EXACTO.
- **5.91c — CI de GitHub en verde (job «Web»)**: los 2 errores de ESLint de
  `functions/src/lib/extraerPdf.ts` (triple-slash a los .d.ts de pdfjs,
  voluntarios desde 5.87b) se silencian con excepción quirúrgica en
  `eslint.config.js` — el archivo TS no se toca. Lint: **0 errores**
  (10 warnings que no bloquean), typecheck ×2 OK, **167/167 tests**,
  build verde precache 115. Functions sin cambios (su job ya estaba verde).
  Lote: 98 archivos (1 NUEVO: eslint.config.js), verificar-lote 1:1 EXACTO.
- **5.91b — Archivo de verificación de Search Console**: el dueño lo descargó
  de la consola de Google y se copió BYTE-IDÉNTICO (`cmp`) a `public/` del
  repo y del lote. Estático de 53 bytes, sin cambios de código ni de datos.
  Build verde con precache 115 (+1 esperado por el .html de Google).
  Lote: 97 archivos (1 NUEVO), verificar-lote 1:1 EXACTO.
- **5.92g — «Actualización de mis Datos de entrega» (Mi Cuenta, pedido del
  dueño)**: el formulario ahora edita SOLO el número de teléfono y la dirección
  completas; la cédula pasa a solo lectura en la tarjeta «Datos» (la del
  registro sigue prellenando el checkout — contacto y «Cédula del pagador» del
  pago móvil — sin cambios de comportamiento) y fuera el rótulo «Van prellenados
  en cada compra». El teléfono se acepta en cualquier formato venezolano, se
  guarda E.164 (+58…) igual que en el registro y la UI lo muestra local (04…).
  Reglas de Firestore sin cambios (phoneE164 ya estaba en la lista blanca).
  `tsc` ×3 limpio, **167/167 frontend · 27/27 backend**, build verde con
  precache 114 INTACTO. Lote: 96 archivos (4 re-copiados), verificar-lote 1:1.
- **5.92f — «Agotado» en vez de «Sin stock» + fuera el «12+ productos»
  (textos de la tienda, pedido del dueño)**: los 3 puntos cara al cliente que
  decían «Sin stock» (chip de la tarjeta, StockBadge de la ficha y botón «Al
  carrito») ahora dicen «Agotado»; el subtítulo del catálogo ya no muestra
  «N+ productos · N en la categoría» y se retiró la consulta de conteo que lo
  alimentaba (useCategoryCount) — una lectura de Firestore menos por visita.
  Sin cambios de datos ni de backend. `tsc` ×2 limpio, **167/167 tests del
  frontend**, build verde con precache INTACTO en 114. Lote: 96 archivos
  (4 re-copiados, 1 NUEVO en lote: PriceTag.tsx), verificar-lote 1:1 EXACTO.
- **5.92e — el aviso «duplicate key» de la consola (paginación del catálogo)**:
  causa raíz confirmada en código: los 72 productos importados en UN lote
  comparten el MISMO createdAt y quedó grabado como Timestamp de Firestore
  (serverTimestamp); el cursor del catálogo esperaba número → NaN → sin
  startAfter → la página 2 repetía la página 1 («Encountered two children with
  the same key» ×12 y «Cargar más» infinito). ARREGLO: aMillis normaliza
  número/Timestamp/Date/JSON en encodeCursor y mapProduct (jamás NaN), la
  grilla deduplica por id (dedupePorId) y el importador graba
  createdAt = Date.now() desde ahora. Probado con 11 tests NUEVOS de tiempos
  (incluida la regresión con Timestamp real y los ids reales de la consola del
  dueño). NO hay que reimportar: los 72 productos ya existentes se leen bien
  con el mapper normalizado. `tsc` ×2 limpio, **167/167 tests del frontend**
  (156 + 11), **27/27 del backend**, build verde con precache INTACTO en 114.
  Lote: 95 archivos (2 NUEVOS), verificar-lote 1:1 EXACTO.
- **5.92e-bis — «Too many arguments provided to startAfter()»**: el arreglo del
  cursor (aMillis) destapó el bug LATENTE de fondo: la consulta pasaba 2 valores
  (createdAt + id) a startAfter() con UN solo orderBy — Firestore lo rechaza de
  plano. ARREGLO DEFINITIVO: clausulaCursor resuelve el documento del cursor con
  getDoc (1 lectura por clic de «Cargar más») y arma startAfter(snapshot) — el
  patrón oficial de Firestore, que desempata empates de createdAt con el nombre
  del documento (imprescindible: los 72 productos comparten el mismo createdAt).
  Respaldo: si el doc fue borrado entre páginas, cae a startAfter(createdAt) con
  aridad válida y la grilla deduplica. CERO índices nuevos. `tsc` ×2 limpio,
  **167/167 frontend**, build verde precache 114 INTACTO.
- **5.92d — VACIAR el catálogo (partir de cero, sin rastros viejos)**: probado
  COMPLETO contra el emulador de Firestore con datos de prueba: conteo exacto
  (2 productos · 4 variantes · 1 huérfana detectada), responder otra cosa = NO
  borra nada, responder VACIAR = primero copia de seguridad JSON válida
  (formato spot24-catalog-backup, restaurable desde el panel) → borrado en
  lotes → verificación 0/0 con tu categoría intacta; y el vestidor completo
  con tu PDF real: vaciar + importar en UNA corrida dejó el catálogo con
  EXACTAMENTE los 72 productos (72 variantes, 0 huérfanas) y quedó registro
  doble en la auditoría (vaciar_catalogo + importar_inventario). Probados
  además: stdin vacío (cancela sin colgarse) y catálogo ya en cero («no hay
  nada que vaciar»). El repo de producción NO cambió en esta ronda (todo vive
  en el script local): tsc ×3, 27/27 backend, 156/156 frontend y build
  precache 114 INTACTO re-corridos por protocolo.
- **5.92c — Eliminar borra el producto completo (variantes + ficha, lote
  atómico)**: `tsc` limpio, **156/156 tests del frontend**, build verde con
  precache INTACTO en 114; solo cambia `admin.service.ts` (sin funciones
  nuevas ni reglas: el borrado ya está permitido para admin).
- **5.92b — blindaje «No document to update» del importador**: `tsc` ×3
  limpio; **27/27 tests del backend** (21 previos + 6 nuevos del guardián
  de variantes huérfanas) y **156/156 del frontend**; build verde con
  precache INTACTO en 114; y el script local reempaquetado con el core
  corregido y probado con tu PDF real: mismo formato detectado, 72 filas,
  7 avisos y la fila en cero en la muestra.
- **5.92 — el importador entiende tu lista de accesorios**: `tsc` ×3
  limpio; **156/156 tests** del frontend (145 previos + 11 nuevos: el PDF
  real de la lista entero con 72/72 filas y precio SIN impuesto, los
  sufijos FORROSINT-2…-7 y WT4RUNNE-2, la fila en cero, el salto de
  sufijos ocupados y la regresión del reporte del POS) y **21/21 del
  backend**; build verde con precache INTACTO en 114; y el PDF real
  re-extraído y parseado con el código final: formato detectado
  «lista-limpia», 72 filas, 7 avisos de renombrado.
- `tsc` ×2 limpio (PWA y adaptador de funciones de Netlify) + `tsc` de
  `functions/` limpio.
- **113/113 tests** del frontend en verde (52 de rondas previas + 39 de formas
  de pago + 3 del stepper de la tarjeta en 5.81 + 19 del parser y lector de
  inventario: 13 en 5.87 + 3 en 5.87b + 2 en 5.87c + 1 en 5.87d) y **8/8 del
  backend**.
- **5.87b — validación del fix contra el empaquetado REAL**: el bundle esbuild
  de la función (mismo modo que Netlify y netlify dev) extrae tu PDF de 2
  páginas (57/57 filas) y el grande de 23 páginas (390 filas, 3 avisos)
  desde DENTRO del paquete; la suite incluye ese empaquetado como test de
  regresión. Antes del fix, ese mismo bundle moría con «Setting up fake
  worker failed» → 400 «No se pudo leer el PDF».
- **5.87c — re-validado el lector actualizado con el mismo método**: los
  DOS reportes reales se extraen desde el bundle (57/57 y 390 filas) y hay
  tests que fijan que (a) el worker queda registrado con la forma EXACTA
  que pdfjs consulta y (b) un PDF basura responde con el motivo técnico
  real (mensaje + log), no con un texto genérico.
- **5.87c — tipos a prueba de todo (fix del TS2307 de tu VSC)**: los 3
  `tsc` pasan TAMBIÉN con `functions/node_modules/pdfjs-dist` ELIMINADO a
  propósito (la declaración `pdfjs.d.ts` declara el import dentro del
  repo) — el editor ya no depende de qué tengas instalado ni de la versión
  de TS de VSC. 112/112 tests y build verde con la declaración activa.
- **5.87d — tu causa raíz REPRODUCIDA y arreglada en el sandbox**: un probe
  con el mismo modo de netlify dev (bundle esbuild ESM con pdfjs EXTERNO)
  colgado de la ruta real `.netlify/functions-serve/fn-importInventory/…`
  falló con el MISMO «Cannot find package 'pdfjs-dist'» de tu consola
  ANTES del fix; después de instalar pdfjs-dist en la raíz, el MISMO probe
  leyó tus DOS reportes desde esa ruta (57/57 filas y 390 con 3 avisos) —
  es exactamente la resolución de carpetas que hará tu PC con
  `npm install` en la raíz.
- **5.87e — el fallo de TU último intento, eliminado de raíz**: el 400
  `COLLECTION_GROUP_ASC index for collection variants and field sku` que
  viste después de instalar el paquete venía de una consulta que EXIGÍA
  un índice manual en alcance collection group (Firestore no los mantiene
  solos); esa consulta se reemplazó por una lectura SIN filtro (que el
  servicio atiende SIN índices, garantía documentada) y el emparejamiento
  por SKU se hace en memoria. El mapeo de errores ya no muestra permisos
  por un fallo interno: «Reserva vencida» sigue su curso propio (checkout
  intacto) y los «9 FAILED_PRECONDITION» crudos van como reintento
  genérico. Typecheck ×3 en verde, 121 tests en verde (113 frontend + 8
  backend), build PWA con precache 110.
- **5.87f — respaldo visual probado y precacheado**: el placeholder.svg
  entra en el precache del SW (verificado en el sw.js generado: los 8 svgs
  de categoría + «FOTO PENDIENTE» van dentro) y el handler tiene 3 tests
  (cambia al placeholder la 1ª vez, SIN bucle si el propio placeholder
  falla, imágenes independientes). 116/116 tests del frontend (113 + 3) y
  8/8 del backend; build PWA precache 112.
- **5.88 — modal medido en navegador (headless) ANTES y DESPUÉS**: réplica
  exacta de RootLayout + Modal con 57 filas — móvil 390×844: «INVISIBLE:
  558 px debajo de la pantalla» → COMPLETO (top=98, bottom=844); PC
  1366×768: «se sale 280 px» → COMPLETO (top=31, bottom=737). El portal
  solo también aguanta el wrapper deliberadamente RE-ROTO con transform
  residual: inmunidad probada (ningún CSS futuro puede volver a romper
  los modals). Typecheck ×3 en verde, 116/116 + 8/8 tests, build PWA
  precache 112.
- **5.89 — copias de seguridad verificadas con 27 tests nuevos**: typecheck
  ×3 en verde (root + netlify + functions directo), **130/130 del
  frontend** (116 + 14: parseBackupFile acepta/rechaza con motivo claro,
  ida y vuelta del JSON descargado, nombre de archivo con fecha LOCAL
  correcta incluso con fecha inválida, fechaCorta am/pm y bytesLegibles)
  y **21 + 13 del backend** (8 previos + 13 nuevos: validateBackupFile
  normaliza y rechaza repetidos/huérfanos/topes, el troceo UTF-8
  recompone EXACTO una copia de 2,7 MB con acentos — el corte nunca
  parte un carácter — y la rotación conserva 30 por tipo). Build PWA
  verde con precache 113 (el chunk nuevo de la página Copias entra al
  manifest). El core reutiliza patrones EN PRODUCCIÓN: cron nativo
  (update-bcv-rate), collectionGroup sin índices (5.87e), lotes ≤450 y
  writeAudit. Seguridad: restaurar SOLO admin (los demás roles los
  rechaza el core), las copias viven en colección cerrada (reglas
  intactas: catch-all) y NADA del flujo toca pedidos, pagos ni usuarios.
  Las 5 funciones Netlify nuevas entran con el push; sin `firebase
  deploy` ni `npm install`.
- **5.90 — campana de notificaciones verificada con 10 tests nuevos**:
  typecheck ×3 en verde (root + netlify + functions directo), **140/140
  del frontend** (130 previos + 10: contarNoLeidas con empate = leído,
  fechaCortaNotif «—»/ceros/am-pm y el espejo del tope 30 con el
  servidor), **15/15 de reglas** (la subcolección `notifs` es
  solo-lectura del dueño y `notifsLastReadAt` pasa la lista blanca) y
  **E2E de notificaciones 10/10 con emulador** (9 fases previas + FASE 8
  de rotación: 35 avisos + 1 nuevo → quedan EXACTAMENTE 30; el cliente
  SIN tokens acumula historial aunque el push fue 0 — el punto de la
  ronda; el historial replica la MISMA secuencia que sonaron los pushes
  y el staff no acumula). Suite general del backend 21/21 + compra real
  E2E en verde. Build PWA verde con **precache 114** (el chunk nuevo de
  la página Notificaciones entra al manifest). La PWA NO se toca: el
  service worker, el manifest y el registro de mensajería quedan
  idénticos — solo entra 1 chunk de página y el icono es HTML/CSS
  normal (aparece con sesión y pantallas ≥640 px, antes de Instagram).
- **5.90.1 — campana a PRUEBA DE CORTES (prueba de campo del dueño: el
  centro «funcionaba hasta preparado» y dejaba de reflejar en_camino y
  entregado)**: diagnóstico — el SDK de Firestore NO reengancha un listener
  muerto; con datos en pantalla la lista quedaba SORDA en silencio (el
  push llega por FCM, otro canal: por eso el teléfono sí sonaba) y lo que
  se veía era la última foto vieja. Los datos JAMÁS se perdieron: el
  servidor escribe el historial ANTES del push (E2E 5.90 con la secuencia
  completa preparado→en_camino→entregado en el historial). Arreglo: el
  store RECONECTA SOLO con backoff 3 s → 6 s → … → tope 60 s (reset al
  reponerse), levanta `stale` y la página muestra el banner «se cortó la
  conexión en vivo · Reintentar» — jamás lista congelada fingiendo vida.
  +4 tests (144/144 del frontend), typecheck ×3 en verde, reglas 18/18
  (incluidas las 3 NUEVAS de aislamiento: otro usuario NO lee tus notifs
  por get ni por query, NADIE escribe el historial desde el cliente y la
  marca de lectura solo la fija el dueño), funciones 21/21 (backend
  intacto) y build precache 114 (sin chunks nuevos: solo cambian archivos
  ya existentes).
- **5.90.2 — EL ARREGLO DE LAS IMÁGENES (causa raíz del reporte post-deploy
  del dueño, con su consola en la mano)**: NO era la red del dueño ni el CDN
  de imgbb. El CacheFirst de i.ibb.co (5.75) hace que el SERVICE WORKER pida
  las fotos con fetch() DENTRO de su propio contexto; ese fetch NO lo gobierna
  img-src de la página sino connect-src de LA CSP QUE VIAJA CON sw.js (la
  cabecera global /* también cubre /sw.js — verificado en producción con
  curl). Sin i.ibb.co ahí, toda imagen no-cacheada era rechazada («Refused to
  connect … Content Security Policy» → no-response) desde que el lote 5.75
  llegó a producción: teléfono sin caché = todas rotas; PC con caché vieja =
  solo las nuevas. La 1ª visita (SW aún sin control) seguía cargando — por
  eso la prueba headless de visita fresca dio 18/18 y el diagnóstico inicial
  falló. Evidencia reproducida: 2ª navegación en producción real = 8/18
  rotas, TODAS i.ibb.co, hashes idénticos a la consola del dueño; A/B local
  con SW real: CSP actual 3/3 rotas → con i.ibb.co en connect-src 0/3.
  Fix: connect-src += `https://i.ibb.co` y += `https://firebasestorage
  .googleapis.com` (desactiva la mina latente de la ruta CacheFirst de
  Storage que ya existía en el SW) + script-src += 4º hash
  `sha256-BkKP2XO6WOEc3kXOiLr2ZoY83hamalKjPY9xBcbXVuw=` (script inline nuevo
  del SDK de Auth, aviso «about:srcdoc:85» — cosmético, el login nunca dejó
  de funcionar). Un SOLO archivo tocado: `netlify.toml` (parse OK, 13
  directivas). Verificación: tsc ×3, tests 144/144, build precache 114. El
  SW se actualiza SOLO en cada cliente (cada build cambia el bundle → sw.js
  distinto → autoUpdate con skipWaiting+clientsClaim): **tras el push, abrir
  la app DOS veces en cada dispositivo** — la 2ª ya muestra las fotos.
  También reaparecen los QR de pago de las cuentas (eran imgbb).
- **5.90.3 — «Farmatodo» fuera del código cliente (pedido del dueño,
  aprovechando el push de 5.90.2)**: auditoría case-insensitive de todo el
  repo. Hallazgos: 1 texto VISIBLE (ayuda del modal de fotos en
  AdminProductsPage — lo ve el personal, pero viaja en el bundle público) +
  ~25 comentarios internos en 10 archivos. Nada de esto era visible al
  cliente en la tienda (los comentarios no llegan al bundle: esbuild los
  elimina y sourcemap=false), pero la regla del dueño es «en ningún lado» →
  todo redactado en neutral («app de farmacia de referencia», «apps de
  autoservicio») conservando el sentido técnico. Guardián nuevo
  `src/tests/marcas-cliente.test.ts`: recorre src/ + public/ + index.html
  (extensiones textuales), lista de marcas prohibidas extensible (hoy:
  farmatodo), se excluye a sí mismo, y FALLA el push si una reaparece.
  Verificación: tsc ×3, tests 145/145 (144+1), build PWA v1.3.0 precache
  114, grep -ric farmatodo sobre dist/ = CERO apariciones. La palabra solo
  queda en la lista del guardián y en estos documentos privados (LEEME/
  worklog), que jamás viajan al navegador.
- **5.91 — SEO + tarjeta de WhatsApp (pedido del dueño tras evaluación)**:
  index.html gana canónico + Open Graph + Twitter card + JSON-LD
  AutoPartsStore; public/ gana robots.txt, sitemap.xml y og-cover.jpg
  (fachada real 1200×630, 143 KB, recorte sesgado que conserva autos y
  mural). Precache INTACTO en 114 (jpg/txt/xml no entran a los globs del
  SW — costo para el service worker: cero). Verificación: tsc ×3, tests
  145/145, tests de functions 21/21, build PWA v1.3.0 precache 114,
  sitemap XML validado, JSON-LD parseado OK, guardián de marcas verde
  (robots.txt pasa por su escáner). Sin cambios TS/backend → reglas y E2E
  no aplican. Dominio propio: pospuesto a pedido del dueño — al comprarlo
  se cambian 6 URLs y se reenvía el sitemap.
- Build PWA completo verde (precache 110): `sw.js` y
  `firebase-messaging-sw.js` intactos (tags de stock/despacho/pagos
  y badge +25 % verificados byte a byte), regla imgbb presente en el SW.
- 5.81 y 5.82 NO tocan el backend: no hay que desplegar funciones por estas
  rondas. El FIX de fotos de 5.82 es frontal (el guardado de productos ya no
  reescribe la galería). La corrección 5.83 tampoco toca el backend: solo 2
  archivos de la tienda (tarjeta y ficha del producto). La 5.84 igual:
  lógica pura + panel + tests, sin deploy de funciones ni reglas. La 5.85
  también es solo frontal: la tarjeta del producto (1 archivo). La 5.86 lo
  mismo: la página del checkout (1 archivo). La 5.87 SÍ agrega una función
  de Netlify (fn-importInventory) + la dependencia pdfjs-dist en functions/:
  entran solas con el push, SIN `firebase deploy`. La 5.87b es la corrección
  de esa función (lector de PDF dentro del paquete): funciones + frontend,
  mismo trato — entra con el push. La 5.87c ACTUALIZA solo el lector y sus
  tests (2 archivos ya existentes): mismo trato, entra con el push. La
  5.87d añade pdfjs-dist a la RAÍZ (`package.json` + lock) y actualiza el
  lector, sus tests y `netlify.toml`: en local requiere UN `npm install`
  en la raíz; en producción el build del push lo instala solo. La 5.87e
  ACTUALIZA 2 archivos ya existentes (core de importación + transporte de
  errores): entra con el push, sin install ni deploy de funciones. La
  5.87f es SOLO frontal (placeholder + onError + tests, 8 archivos):
  entra con el push, sin install ni deploy. La 5.88 lo mismo: 2 archivos
  (`src/index.css` actualizado + `Modal.tsx` nuevo) — sin install ni
  deploy de funciones.
- Reglas validadas: create/update de users solo acepta los campos de la lista
  blanca; email, rol, createdAtMs y sessionEpoch siguen congelados.
- La animación de ruta NO remonta el panel admin (navegación interna intacta)
  y se desactiva sola con «reducir movimiento».

## Notas técnicas (por si las necesitas)

- **Costo en lecturas:** settings/general se lee UNA vez por carga de app
  (compartido entre el botón de WhatsApp y el horario del Home). Mis Pedidos
  en vivo: 1 lectura por cambio real de tus pedidos. La reparación de stock:
  1 lectura de producto + 1 de sus variantes, solo cuando TÚ la corras.
- **BCV:** tu cron-job.org horario apuntando a
  `/.netlify/functions/fn-runBcvRate?key=TU_CLAVE` está perfecto; el cron
  interno de Netlify sigue como respaldo (correr dos veces es inofensivo).
  Pruébala una vez en el navegador: debe responder un JSON con la tasa.
- La cédula se guarda SOLO en dígitos (sin V-, sin puntos) en el perfil:
  es lo que el pago móvil necesita y evita limpiezas después.
- «Mis datos» y el registro comparten exactamente las mismas validaciones
  (4-8 dígitos; dirección ≥ 8 letras) — el cliente no puede guardar algo que
  el checkout después rechace.
