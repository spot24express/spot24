# RONDA 5.106 · Páginas legales: Términos y Condiciones + Política de Privacidad

## Lo nuevo de esta ronda (decisión tuya, cerrada hoy)

- **Dos páginas nuevas, públicas y sin inicio de sesión**:
  - `/terminos` — Términos y Condiciones completos (16 secciones numeradas con
    índice navegable): titular del sitio, registro y cuenta, precios y tasa BCV,
    flujo del pedido con reserva de mercancía, pago y verificación, entregas y
    retiro, cambios/devoluciones, licores +18, uso aceptable, propiedad
    intelectual, responsabilidad, legislación venezolana y contacto.
  - `/privacidad` — Política de Privacidad completa (17 secciones): qué datos se
    piden y para qué, notificaciones push, proveedores (Firebase, Netlify,
    imgbb), comprobantes de pago, almacenamiento local de la PWA, conservación,
    derechos y eliminación de cuenta, seguridad y menores de edad.
- **Datos legales reales en el texto** (como pediste):
  - Titular: **Auto Servicio Montaña Fresca 2026, C.A.**
  - RIF: **J-50800328-4**
  - Los dos textos citan además la marca SPOT 24, el correo de contacto y la
    URL del sitio. Los datos viven en UN solo archivo (`datos.ts`): si algún
    día cambian, se corrige ahí y ambas páginas quedan al día.
- **Políticas que tú aprobaste**, escritas tal cual en los textos:
  - **Cambios**: venta final, salvo **defecto de fábrica** (reclamo con foto en
    48 horas, pieza sin instalar y completa; cambio, crédito o devolución).
  - **Licores**: solo a **mayores de 18**, con verificación de cédula al
    entregar (si no acredita edad, la bebida no se entrega y se reembolsa).
  - **Aceptación**: solo con enlaces discretos en el **pie de página** de toda
    la tienda (sin checkbox en el checkout ni en el registro, como pediste).
- **Enlaces en el footer**: «Términos y Condiciones» y «Política de
  Privacidad» aparecen al pie de TODAS las páginas (móvil y PC), en la misma
  línea de estilos de la tienda.
- **El texto legal no inventa nada que la app no haga**: precios en USD con
  equivalente en Bs a tasa BCV (como ya muestra el checkout), reserva de stock
  al confirmar, verificación de pago por personal, zonas y costo de envío
  visibles antes de pagar, retiro en local con dirección/horario de Ajustes.
- **Cero cambios de backend, de reglas de Firestore, de la PWA ni de
  colecciones**: son 2 páginas nuevas + 2 archivos existentes editados (router
  y footer). Cada página sale como su propio chunk en el build.

## Probado antes de entregar

- Typecheck completo del proyecto: **0 errores**.
- Pruebas raíz (comando oficial del CI, `npm test`): **207/207 verdes**.
  (El test de reglas de Firestore exige el emulador y va excluido del comando
  oficial, igual que en todas las rondas anteriores; no se tocó nada de reglas.)
- Build de producción: OK. Las páginas nuevas salen como chunks propios
  (`TerminosPage` ~7.9 kB gzip, `PrivacidadPage` ~5.8 kB gzip) y el precache
  de la PWA pasó de 116 a **119** entradas — son los chunks nuevos que el
  service worker precarga solito para que las legales también abran offline.
  No se tocó ningún archivo del service worker ni de la configuración PWA.
- Cotejo repo ↔ lote 1:1 (verificación abajo).

## Despliegue — pasos (TU CASO: tu VSC ya trae la 5.105)

1. **NO pegues la carpeta del lote entera sobre tu proyecto.** Este lote se
   armó sobre la base **5.104** (sin la 5.105): dentro del zip viajan
   versiones VIEJAS de `package.json`, `package-lock.json`, `vite.config.ts`
   y `src/features/admin/pages/AdminProductsPage.tsx`. Si las pegas encima de
   tu VSC, la ronda 5.105 (Exportar PDF) se rompe: jspdf desaparece del
   `package.json` y el build de Netlify falla. El resto de los ~127 archivos
   del zip ya los tienes idéntico: se ignoran.
2. Copia SOLO los archivos de esta tabla, a sus mismas carpetas:
   - **ACTUALIZA** (sobrescribe): 2 archivos.
   - **NUEVO** (crea la carpeta `src/features/legal/` completa): 3 archivos.

   | # | Archivo | Acción |
   |---|---------|--------|
   | 1 | `src/app/router.tsx` | ACTUALIZA |
   | 2 | `src/app/layouts/RootLayout.tsx` | ACTUALIZA |
   | 3 | `src/features/legal/datos.ts` | NUEVO |
   | 4 | `src/features/legal/pages/TerminosPage.tsx` | NUEVO |
   | 5 | `src/features/legal/pages/PrivacidadPage.tsx` | NUEVO |
   | 6 | (referencia) `LEEME-RONDA-5.106.md` | este archivo |

3. Push a GitHub como siempre (Netlify publica solo) y prueba **Ctrl+F5**.
   - Tu `package-lock.json` de la 5.105 (con jspdf) queda intacto: Netlify
     instala igual y compila las dos rondas juntas en un solo deploy.
   - Precache final esperado: **119 entradas** (las 116 de siempre + los 3
     chunks legales), con jspdf FUERA del precache, tal como lo dejó la 5.105.
4. Prueba de 2 minutos:
   - Abre la tienda y baja al pie → clic en **«Términos y Condiciones»**:
     debe abrir `/terminos` con el índice y las 16 secciones.
   - Clic en **«Política de Privacidad»** → `/privacidad` con las 17 secciones.
   - Verifica que aparezcan **Auto Servicio Montaña Fresca 2026, C.A.** y el
     RIF **J-50800328-4** al inicio de ambas.
   - En el teléfono: los enlaces también deben verse en el pie, debajo del
     WhatsApp.
   - La 5.105 sobrevivió: en el panel → Productos, el botón «Exportar PDF»
     sigue ahí y genera el PDF con tu inventario.
   - (Opcional) Instala/actualiza la PWA y abre `/terminos` sin conexión: el
     service worker la sirve del precache.

## Notas

- El botón flotante de WhatsApp y el resto del pie quedaron intactos: los
  enlaces legales van DESPUÉS de la línea de WhatsApp y ANTES de la versión.
- Las dos páginas usan el mismo diseño de la tienda (negro/rojo, mismas
  fuentes y contenedores) y el título de pestaña es consistente
  («Términos y Condiciones · SPOT 24»).
- No se tocaron rutas del panel ni permisos: las legales son públicas para
  que Google también las indexe (buen punto para SEO formal).
