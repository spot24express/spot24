# LEEME · Ronda 5.117 FINAL — El delivery solo ve pedidos a domicilio

**Fecha:** 01/11/2026
**Estado:** validada sobre tu árbol EXACTO (tu commit `a9f08b9` = 5.112.1, la base de tu 5.116):
typecheck ✓ · tests 260/260 en 22 archivos · build ✓ precache 121 · functions tsc 0 errores ·
functions 46/46 (+14 de emulador se auto-saltan, como siempre).

---

## 0) LÉEME PRIMERO — dos correcciones importantes sobre lo que te dije antes

**1. Este paquete REEMPLAZA al anterior «5.117+5.118». Si llegaste a pegar algo de ese paquete,
NO lo empujes: descártalo.** Se armó sobre una copia mía desactualizada (mi clon se quedó en la
base 5.112 y perdió tu 5.112.1). Pegarlo te habría REVERTIDO partes de tu 5.112.1. Tu pregunta
de «¿trabajas sobre mi último commit?» lo detectó a tiempo.

**2. La 5.118 YA LA TIENES — la hizo tu 5.112.1.** Al reconstruir contra tu último commit
apareció tu ronda 5.112.1 («pickup-aware») ya implementando EXACTAMENTE lo que aprobaste como
5.118, en backend y panel:

- La **cajera** ve «→ **Retirado en tienda**» directo desde Preparado (un clic, cobra y cierra).
- **Gerencia/admin** también tienen ese cierre (y cierran retiros viejos atascados en En camino).
- El botón «→ En camino» **desapareció de los retiros** (nadie sale «de ruta» hacia la barra).
- En **domicilio** el salto Preparado → Entregado **no existe para nadie** (reclama y culmina
  el delivery — la máquina backend `canTransitionFor` es consciente del MODO: en pickup
  «en_camino» es inválida, y el tracking solo se genera con envío).
- Textos al cliente pickup-aware («Empacado y listo. Te esperamos en la tienda…» / «Retirado en
  tienda. ¡Gracias por tu visita!»).

Mi clon perdió esa sincronización y por eso te propuse una «5.118» que ya vivía en tu árbol.
Mea culpa documentada; la evidencia está en TU commit `a9f08b9` (`canTransitionFor` en
`functions/src/domain/order-state.ts`, cierre `→ Retirado en tienda` en `AdminDispatchPage.tsx`).
**No hay que pegar NADA de backend.**

## 1) Qué hace esta ronda (la ÚNICA pieza que te faltaba)

**HOY (tu árbol):** el delivery entra a Despacho y ve TODA la cola, incluidos los retiros en
tienda, sin ningún botón útil (el backend ya le niega tomarlos: «Es retiro en tienda: no requiere
delivery»). Igual en «Entregadas»: ve el chip «Retiro en tienda» con conteo. Puro ruido.

**CON LA 5.117:** el rol delivery ve ÚNICAMENTE pedidos a domicilio:
- Cola activa: los retiros NO aparecen.
- Historial «Entregadas»: NO aparecen retiros; el chip «Retiro en tienda» desaparece solo
  (los chips se derivan de la lista ya filtrada).
- Sus dos botones de siempre («Tomar pedido» y «→ Entregado») funcionan EXACTOS igual.
- **admin, gerente y cajero siguen viendo TODO**, intacto (el filtro solo aplica al delivery).

Detalle técnico honesto: la consulta a Firestore es la MISMA de siempre (mismo tope 60, mismos
índices). Los retiros viajan al navegador del delivery y se filtran en memoria con una función
pura testeada. **Cero índices nuevos, cero reglas nuevas, cero lecturas extra, cero coste.**

## 2) Archivos (2 NUEVOS + 1 ACTUALIZADO + este LEEME)

| Archivo | Tipo | Qué es |
|---|---|---|
| `src/features/admin/lib/colaDespacho.ts` | NUEVO | Libra pura: `esVisiblePorRol` + `filtrarColaPorRol` |
| `src/tests/cola-despacho.test.ts` | NUEVO | 8 tests de esa libra (sin emulador) |
| `src/features/admin/pages/AdminDispatchPage.tsx` | ACTUALIZADO | TU archivo 5.112.1 EXACTO + parche de 4 puntos: import de la libra, filtro en la cola, filtro en «Entregadas», `[role]` en deps del `useEffect`. **19 líneas nuevas, 3 cambiadas — ni una línea más de lo tuyo tocada** (verificado con `git diff` contra tu `a9f08b9`) |

⚠️ El `AdminDispatchPage.tsx` de este paquete va sobre **TU versión 5.112.1**. Según tu
`git status`, ese archivo NO está entre tus cambios sin desplegar → pega y listo, sin conflicto.

## 3) Cómo aplicar (2 minutos)

1. Pega los 3 archivos en tu repo (respetando las carpetas) + este LEEME.
2. `npm test` → **todo verde** (tu árbol tiene más tests que mi clon por tus rondas
   5.113–5.116; este paquete añade los 8 de `cola-despacho`).
3. `npm run build` → precache (debe subir en +0/-0 entradas; son archivos ya contemplados).
4. **Un solo push** → Netlify despliega TU 5.116 y esta 5.117 juntos (sin `firebase deploy`,
   igual que las rondas 5.109+).

## 4) QA post-deploy (3 minutos)

- **Delivery**: entra a Despacho → su cola ya no muestra retiros; en «Entregadas» no aparece el
  chip «Retiro en tienda». Sus pedidos a domicilio: tomar y culminar como siempre.
- **Cajera**: un retiro en Preparado → botón «→ Retirado en tienda» (tu 5.112.1 ya lo hace);
  el cliente recibe su push de Entregado y el producto suma a «Más pedidos».
- **Gerencia/admin**: ven TODO como siempre (cola completa, retiros incluidos).

## 5) Pushes: SIN cambios en ningún caso

La 5.117 es SOLO DE VISTA: no crea, quita ni modifica una sola notificación. La matriz de
pushes que te pasé para la 5.118 sigue siendo válida — y ya está viva en tu 5.112.1.

## 6) Pendiente que sigues decidiendo

- Prueba D2 «Llegaste tarde» / Reasignar con segunda cuenta (en pausa a tu pedido).
- Investigación a fondo del IVA (doble tasa 20% + 16% ya localizada; falta la solución).
- Si quieres que el **gerente** vea todos los botones de avance como el admin (hoy no ve
  ninguno — quirk de la 5.5; el backend sí le permite todo): ronda corta, dime y la armo.
