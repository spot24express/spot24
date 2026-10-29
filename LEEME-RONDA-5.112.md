# SPOT 24 · Ronda 5.112 — completa (A + B + C + D)

**Fecha:** 29/10/2026 · **Estado:** todo validado en clon local (ver §6) · **31 archivos**

Esta es la ronda completa, en un solo paquete. Cada archivo viene **dentro de
su ruta de repo**: copia cada uno a la misma ruta en tu árbol (la carpeta te
dice dónde va cada uno). Los marcados **NUEVO** crean carpeta si no existe;
los demás reemplazan tu archivo completo.

| # | Parte | Qué resuelve |
|---|-------|--------------|
| A | Congela-código | El `code` del producto queda guardado en cada línea del pedido (dato SOLO del personal) |
| B | Franja REAL del delivery | Candado del envío a domicilio según el horario que guardas en Ajustes |
| C | Parche imgbb | Reintentos al subir fotos + mensaje honesto + respaldo visual en promos y bahías + carrusel que espera |
| D | Eliminar mi cuenta | El cliente puede darse de baja él mismo desde Mi Cuenta |

---

## 1 · Mapa completo (para que verifiques qué llevas)

### 5.112-A · Congela-código (6 archivos)

| Archivo | Estado | Qué hace |
|---------|--------|----------|
| `src/shared/lib/lineaMeta.ts` | **NUEVO** | Helper puro: construye/lee el `code` congelado de cada línea. Sin lecturas nuevas. |
| `src/tests/linea-meta.test.ts` | **NUEVO** | 8 tests del helper. |
| `src/features/orders/types/index.ts` | Reemplaza | El tipo de línea lleva `code` opcional (compatible con pedidos viejos). |
| `src/features/orders/pages/OrderDetailPage.tsx` | Reemplaza | El personal ve el código congelado por línea aunque hoy el producto cambie de código o se borre. |
| `src/features/admin/pages/AdminPaymentsPage.tsx` | Reemplaza | Ídem en verificación de pagos. |
| `src/features/admin/pages/AdminDispatchPage.tsx` | Reemplaza | Ídem en despacho: el códogo que ves es el que se congeló al pedir. |

### 5.112-B · Franja REAL del delivery (5 archivos + orders.ts)

| Archivo | Estado | Qué hace |
|---------|--------|----------|
| `src/shared/lib/horarioDelivery.ts` | **NUEVO** | Helper puro del horario (hora Venezuela UTC-4). Sin franja guardada o datos raros = delivery SIEMPRE disponible (compatibilidad hacia atrás). Soporta franjas que cruzan medianoche (22:00–02:00). `hhmmBonito()` muestra "12:00 pm". |
| `src/tests/horario-delivery.test.ts` | **NUEVO** | 14 tests, incluido TU caso exacto: franja 12:00 pm–11:59 pm → a las 11:59 am CERRADO, 12:00 pm abre, 11:59 pm abierto, 12:00 am cerró. |
| `src/shared/services/settings.service.ts` | Reemplaza | Lee `deliveryStart`/`deliveryEnd` de settings/general para el checkout. |
| `src/features/checkout/pages/CheckoutPage.tsx` | Reemplaza | Doble llave del lado cliente: si el reloj está fuera de la franja, el checkout solo ofrece RETIRO EN TIENDA. Si el backend rechaza por franja («Delivery cerrado…»), manda al cliente a retiro sin perder nada. |
| `src/features/admin/pages/AdminSettingsPage.tsx` | Reemplaza | Ajustes → Operación: guarda la franja (tu ejemplo se escribe 12:00 y 23:59). Sin franja guardada, todo sigue como siempre. |
| `functions/src/orders.ts` | Reemplaza | **Compartido A+B** (ver §2.1). |

### 5.112-C · Parche imgbb (11 archivos + netlify.toml)

| Archivo | Estado | Qué hace |
|---------|--------|----------|
| `functions/src/lib/imgbb.ts` | **NUEVO** | El corazón del parche: subida a imgbb con **3 intentos** (pausas de 500 ms y 1,5 s), tope de 5 s por intento. Reintenta SOLO caídas reales (red, 5xx, 429); una foto inválida (4xx) falla al momento. Al agotarse lanza el mensaje honesto «El servicio de imágenes está caído…». |
| `functions/src/images.ts` | Reemplaza | Core modo Cloud Functions: ahora pasa por el helper (antes este podía quedar colgado SIN tope de tiempo). |
| `netlify/functions/fn-uploadImage.ts` | Reemplaza | Subida de fotos del panel (productos/promos): reintentos + mensaje honesto. |
| `src/shared/lib/errors.ts` | Reemplaza | Nuevo código de app `images` con el mensaje honesto como `userMessage`. |
| `src/shared/lib/backend.ts` | Reemplaza | Reconoce el prefijo del mensaje del servidor y lo mapea a `images` (mismo mecanismo del «Reserva vencida»). |
| `src/shared/lib/imgFallback.ts` | Reemplaza | Nueva `alFallarFotoCon(respaldo)` + `FOTO_LOCAL` (la foto del mural con el escudo gigante, archivo del repo). |
| `src/features/catalog/pages/HomePage.tsx` | Reemplaza | Promos del carrusel: si la foto no carga se muestra la foto del local (nunca el cartel azul de imgbb ni un cuadro roto) + el carrusel espera la primera imagen. |
| `src/features/catalog/components/CategoryCard.tsx` | Reemplaza | Bahías y subcategorías con foto: mismo respaldo al fallo. |
| `src/features/catalog/hooks/useAutoCarousel.ts` | Reemplaza | Opción `esperarPrimera`: el auto-avance de 5 s NO arranca hasta que la primera imagen carga (o falla al respaldo). Tope de seguridad de 8 s para que una red moribunda no congele el Home. |
| `functions/src/__tests__/imgbb-reintentos.test.ts` | **NUEVO** | 9 tests del helper (503, red, 429, 400, respuesta sin URL, contrato del mensaje). |
| `src/tests/img-fallback.test.ts` | Reemplaza | +3 tests de `alFallarFotoCon` (total 6). |

### 5.112-D · Eliminar mi cuenta (7 archivos + netlify.toml)

| Archivo | Estado | Qué hace |
|---------|--------|----------|
| `functions/src/admin.ts` | Reemplaza | Nuevo `coreDeleteMyAccount`: borra ficha + carrito + tokens de notificaciones + la cuenta de Authentication, en lote atómico e idempotente. **SOLO clientes**: el personal recibe «pide la baja a un administrador» (el panel no puede quedarse sin dueño). Pedidos históricos SE CONSERVAN (contabilidad/antifraude), igual que en la baja por el panel. |
| `netlify/functions/fn-deleteMyAccount.ts` | **NUEVO** | La función Netlify que expone la baja propia. |
| `src/features/auth/services/auth.service.ts` | Reemplaza | `deleteMyAccount()`: llama al backend y cierra la sesión local (la app despierta como visitante). |
| `src/features/auth/store/auth.store.ts` | Reemplaza | Acción del store. |
| `src/features/auth/hooks/useAuth.ts` | Reemplaza | Expone `deleteMyAccount`. |
| `src/features/auth/pages/AccountPage.tsx` | Reemplaza | Nueva sección **«Eliminar mi cuenta»** al pie (SOLO para clientes — el personal no la ve). Dos pasos: el primer botón solo despliega la advertencia completa (qué se borra, qué se conserva, «no se puede deshacer») y la baja exige «Sí, eliminar definitivamente». Un toque accidental jamás borra una cuenta. |
| `functions/src/__tests__/eliminar-mi-cuenta.test.ts` | **NUEVO** | 5 tests de las guardas (sin sesión, cajero, admin, delivery, mensaje al personal). |

### Compartido C+D

| Archivo | Qué cambia |
|---------|-----------|
| `netlify.toml` | Dos timeouts nuevos: `fn-uploadImage` → 26 s (los reintentos del parche imgbb necesitan margen; antes moría a los 10 s de fábrica) y `fn-deleteMyAccount` → 26 s (mismo margen que `fn-deleteUser`). El resto del archivo intacto. |

---

## 2 · Notas de las dos piezas fuertes

### 2.1 · `functions/src/orders.ts` — reemplaza COMPLETO (no es parche)

Contiene TODO lo que ya tenía tu archivo de rondas anteriores, más:

- **Candado de franja (B):** `fn-createOrder` rechaza todo pedido a domicilio
  fuera de la franja ANTES de gastar imgbb ni leer montos. Mensaje:
  «Delivery cerrado: el envío a domicilio solo está disponible de X a Y.
  Elige retiro en tienda o vuelve dentro de la franja.» El checkout nuevo lo
  reconoce y manda al cliente a retiro. Retiro en tienda JAMÁS se bloquea.
- **Congela-código (A):** cada línea guarda el `code` del producto al
  momenta del pedido. Cero lecturas nuevas.
- **Parche imgbb (C):** la subida del comprobante (dentro de createOrder y
  en la re-subida `fn-uploadReceipt`) pasa por `imgbbConReintentos`: 3
  intentos contra la caída del hosting de fotos; agotados, el mensaje
  honesto llega al checkout vía el código `images`.

Si en tu árbol este archivo tiene ajustes hechos a mano que no pasaron por
mí, avísame antes de pegar.

### 2.2 · Por qué el parche imgbb no toca el QR ni los comprobantes

La regla de la 5.87f sigue en pie: el QR de pago y el comprobante del
cliente **jamás** muestran un placeholder de repuesto (sería engañoso). El
respaldo visual con la foto del local aplica SOLO a promos y bahías.

### 2.3 · Qué se borra y qué se conserva en «Eliminar mi cuenta»

- **Se borra:** ficha del perfil (nombre, correo, teléfono, cédula,
  dirección), carrito guardado, tokens de notificaciones y el acceso (el
  correo queda libre para registrarse de nuevo).
- **Se conserva:** los pedidos históricos con nombre/teléfono/cédula
  embebidos — es tu registro contable y tu antifraude.
- Si el cliente tiene un pedido en curso, el equipo lo contacta igual al
  teléfono guardado en el pedido.
- La auditoría interna queda registrada (`eliminar_mi_cuenta`, solo UIDs).

---

## 3 · Prueba rápida con `netlify dev`

1. **A:** crea/edita un producto y pide un pedido de prueba → el pedido
   muestra el código por línea en despacho/pagos.
2. **B:** Ajustes → Operación: guarda la franja (ej. 12:00 pm → 11:59 pm).
   Fuera de franja el checkout solo ofrece retiro; dentro, todo normal.
   Deja la franja vacía → todo sigue funcionando.
3. **C:** en el panel, sube una foto de producto → debe subir normal
   (con imgbb caído, verá el mensaje honesto tras los reintentos en vez
   del error seco). En el Home, el carrusel espera la primera imagen y las
   promos/bahías con foto caída muestran la foto del local.
4. **D:** entra con una cuenta de cliente → Mi Cuenta → «Eliminar mi
   cuenta» → despliega advertencia → «Sí, eliminar definitivamente» →
   la sesión cierra y la app despierta como visitante. La cuenta deja de
   existir en Authentication y su correo queda libre.
   Con tu cuenta admin el botón NO aparece (protección).

## 4 · Después de pegar todo

```
npm --prefix functions ci     # solo si cambiaran dependencias (no cambian)
npm test                      → 255/255 VERDE (21 archivos)
npm --prefix functions test   → 60/60 VERDE (+14 nuevos de esta ronda)
npm run typecheck             → VERDE
npm run build                 → VERDE (PWA precache 121)
```

Luego: commit, push, y **verifica en Netlify** que el deploy incluye los
dos timeouts nuevos (netlify.toml) — se aplican solos al redeploy.

## 5 · Validación realizada en el clon local (con TODOS los archivos)

- `npm test` (frontend) → **255/255 en 21 archivos, VERDE**
  (252 de antes + 3 nuevos de alFallarFotoCon)
- `npm run typecheck` → VERDE
- `npm run build:only` → VERDE (PWA precache 121)
- functions: `tsc --noEmit` → VERDE · `vitest` → **60/60 VERDE**
  (46 de antes + 9 de imgbb-reintentos + 5 de eliminar-mi-cuenta;
  14 se saltan sin emulador, igual que siempre)
- Campos `deliveryStart`/`deliveryEnd` consistentes entre panel (escribe),
  checkout (lee) y candado (valida).
- El prefijo del mensaje honesto es contrato entre `lib/imgbb.ts` y
  `backend.ts` — verificado por test.

## 6 · Qué NO cambia en esta ronda

- Firestore: sin reglas ni índices nuevos (la baja reusa las colecciones
  existentes; el `code` congelado viaja dentro del doc del pedido).
- Firebase Console: nada que activar a mano. La función nueva
  (`fn-deleteMyAccount`) se registra sola con el redeploy de Netlify.
- La subida de imágenes sigue siendo imgbb (plan Spark sin Storage). El
  parche la hace RESISTENTE, no cambia de proveedor. Si quieres las fotos
  de marca dentro del repo (que jamás se caen), eso ya empezó: la fachada,
  el mural y las fotos del local viven en `/public/img/` — cuando quieras
  ampliamos esa vía.
