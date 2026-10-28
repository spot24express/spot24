# Ronda 5.110 — «Instalar en iPhone y tarjeta con foto»

**Fecha:** 27/10/2026 · **Estado:** implementada y validada (typecheck 0 · build ✓ · 247/247 tests)
**Alcance:** 2 pendientes del dueño (aviso de instalación en iOS, tarjeta de WhatsApp). RootLayout solo recibe 2 líneas; el footer NO se toca. La propuesta de transición estilo Farmatodo queda PENDIENTE de aprobación (no entra en esta ronda).

## 1) Qué entra en esta ronda

### Aviso de instalación en iPhone/iPad
- **El problema:** Android muestra el aviso nativo de Chrome («Agregar a pantalla de inicio») porque sí dispara `beforeinstallprompt`. iOS NO lo tiene: Safari nunca dispara ese evento, así que en iPhone no salía NADA.
- **El fix:** aviso propio de SPOT 24 con los 3 pasos exactos del teléfono:
  1. Toca **Compartir** (el cuadrado con la flecha).
  2. Elige **«Agregar a pantalla de inicio»**.
  3. Toca **«Agregar»**. Queda como una app más.
- **Reglas (para no molestar):** SOLO dispositivos Apple (incluidos iPads modernos, que se hacen pasar por Mac con pantalla táctil) · SOLO si la app no está ya instalada · SOLO si no se cerró antes (se recuerda). En Chrome/WhatsApp/Instagram de iOS añade «ábrela en Safari» (instalar solo se puede desde Safari).
- **Detalles:** entra a los 1.6 s (no compite con la fachada), sube suave desde abajo, en el teléfono flota sobre la barra inferior SIN tapar el botón de WhatsApp, en iPad baja a la esquina izquierda. La X lo cierra para siempre.

### Tarjeta de WhatsApp con foto
- **El diagnóstico:** las etiquetas OG estaban BIEN y la foto (`og-cover.jpg`, la fachada 1200×630) está servida en producción desde la 5.75. El problema es la **caché de WhatsApp**: guarda la tarjeta la PRIMERA vez que alguien comparte un enlace y no la vuelve a pedir — y compartimos el enlace antes de que existiera la foto.
- **El fix:** `?v=2` en la URL de la foto (`og:image`, `twitter:image` y el dato estructurado). Cambiar la URL (aunque sea el parámetro) obliga a WhatsApp/Facebook a re-bajarla. Tras el push, compartir una vez el enlace con `?v=2` (`https://spot24express.netlify.app/?v=2`) refresca la tarjeta de una vez.

## 2) Archivos de la ronda (3 nuevos + 2 actualizados)

**NUEVOS (3):**
- `src/shared/lib/instalar.ts` — decisión pura: ¿dispositivo Apple? ¿ya instalada? ¿aviso cerrado? (inyectable y testeable sin navegador)
- `src/shared/components/pwa/InstalarEnIphone.tsx` — el aviso con los 3 pasos
- `src/tests/instalar-iphone.test.ts` — 18 tests con UAs reales (iPhone/iPad/Chrome iOS/WhatsApp webview/Android/PC)

**ACTUALIZADOS (2):**
- `src/app/layouts/RootLayout.tsx` — 1 import + 1 montaje del aviso (fuera del envoltorio route-enter a propósito; el footer intacto)
- `index.html` — `?v=2` en la URL de la foto de la tarjeta + comentario

**NO SE TOCAN:** footer («Diseñado por…» intacto), Android (su aviso nativo sigue igual), carrito/pedidos, ninguna lectura de Firebase (el aviso no lee nada de la base).

## 3) Validación

1. `npm run build` → typecheck 0 errores, build VERDE (precache 120 entries).
2. `npm test` → **247/247 en 20 archivos** (229 + 18 nuevos de instalar-iphone).

## 4) Push ÚNICO (COMBINADO con la 5.109 — decisión del dueño)

Las dos rondas salen juntas en un solo commit (la 5.109 seguía sin push):

```
git rm --cached "respaldos/respaldo-productos-antes-de-normalizar-2026-10-24_001506.json"
git add -A
git status
git commit -m "Rondas 5.109-5.110: llegada rapida (fachada liviana, preload, cache-first /img), fixes (buscador del heroe, Eliminar en categorias), aviso de instalar en iPhone/iPad y tarjeta de WhatsApp con foto (?v=2)"
git push
```

En el `git status` intermedio verificar 3 cosas:
- que NI `respaldos/` NI `spot24-para-comparar.txt` salgan en «Changes to be committed»;
- que el JSON retirado aparezca como `deleted` (sale del repo, la copia local queda);
- que aparezcan los archivos de las 2 rondas (6 modificados + LEEMEs + 3 nuevos de la 5.110).

## 5) Después del push (producción)

- **iPhone:** abrir `spot24express.netlify.app` en Safari → a los ~2 s sube el aviso con los 3 pasos. Seguir los pasos y verificar que el ícono queda en el inicio. Cerrarlo con la X y refrescar: ya no debe volver.
- **Android:** NO debe cambiar nada (aviso nativo de Chrome intacto).
- **WhatsApp:** compartir `https://spot24express.netlify.app/?v=2` una vez → la tarjeta debe salir con la fachada. Después el enlace normal también sale con foto.
- **PC:** nada del aviso (solo Apple); tarjeta al compartir por otras vías también refresca.
- Footer intacto en todas las páginas.
