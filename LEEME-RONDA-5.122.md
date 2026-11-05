# Ronda 5.122 · El equipo queda «de la cajera en turno» (Opción B aprobada)

## Qué resuelve

Tres personas comparten el equipo del mostrador por turnos. El token de
notificaciones es del **navegador**, pero el registro vive **por cuenta**.
Antes de esta ronda: si 3 cajeras activaban el toggle en el mismo equipo, cada
aviso sonaba 3 veces y las cuentas fuera de turno seguían recibiendo avisos
para siempre.

**Ahora**: al iniciar sesión, el backend traspasa a la cuenta que entra los
registros de notificaciones que OTRO personal haya hecho en ese navegador.
El equipo queda de quien está en turno, sin duplicados y sin volver a
activar nada.

## Respuestas a tus preguntas

**¿Aplica para todos los roles?** Sí: admin, gerente, cajero y delivery.
Quien entra al equipo se lo lleva, sin importar el rol.

**Si entra admin o gerente, y luego la cajera de nuevo, ¿solo le llegan los
avisos de la cajera que entra?** Exacto. El equipo queda de quien entró
ÚLTIMO:
- Entra el gerente → el equipo suena con los avisos de gerencia.
- Vuelve la cajera → traspaso de vuelta: solo ella recibe en ese equipo, un
  solo sonido por aviso. Los demás roles dejan de recibir allí al instante.

**¿Tendrán que activar las notificaciones cada vez que inician sesión?** No.
Cada quien activa el toggle UNA sola vez por equipo. Después, cada inicio de
sesión re-registra el equipo automáticamente: ni permiso nuevo, ni toggle, ni
tocar «Mi cuenta». El interruptor aparece encendido solo.

**Casos que NO cambian (guardia de esta ronda):**
- Un **cliente** que inicia sesión (o se registra) en el equipo de la tienda
  NO se lleva el dispositivo: el panel sigue sonando con quien quedó en turno.
  Y en el teléfono del cliente nadie le toca nada.
- Salir de la sesión no borra nada: el registro se traspasa cuando el
  siguiente entra.

## Archivos de esta ronda (copiar sobre el repo)

| # | Archivo | Destino | Estado |
|---|---------|---------|--------|
| 1 | `deviceTokens.ts` | `functions/src/deviceTokens.ts` | NUEVO |
| 2 | `device-tokens.test.ts` | `functions/src/__tests__/device-tokens.test.ts` | NUEVO |
| 3 | `fn-transferDeviceTokens.ts` | `netlify/functions/fn-transferDeviceTokens.ts` | NUEVO |
| 4 | `functions-index.ts` | `functions/src/index.ts` | 1 línea agregada |
| 5 | `notifications.service.ts` | `src/features/delivery/services/notifications.service.ts` | función nueva al final |
| 6 | `auth.service.ts` | `src/features/auth/services/auth.service.ts` | 2 ganchos (login y registro) |

## Cómo probar (después de copiar y empujar)

1. En el equipo del mostrador, entra con la cajera A (si ya tenía el toggle
   de notificaciones encendido, no toques nada).
2. Cierra sesión y entra con el gerente. Espera ~5 segundos (el traspaso va
   en segundo plano, no bloquea nada).
3. Entra con la cajera B (que ya activó notificaciones antes en ese equipo).
   El toggle en «Mi cuenta» debe verse ENCENDIDO sin que ella tocara nada.
4. Crea un pedido de prueba: el aviso debe sonar UNA sola vez en ese equipo.
5. (Opcional, Netlify) En el log de la función `fn-transferDeviceTokens`
   verás: `[deviceTokens] <uid>: traspaso de N doc(s) del dispositivo …`.

Para probar local con `netlify dev`: reinícialo para que cargue la función
nueva y crea un pedido NUEVO.

## Detalles técnicos (por si pregunto yo luego)

- La función nueva es Netlify Function (`POST /.netlify/functions/
  fn-transferDeviceTokens`): se despliega sola con el push a `main`. No hace
  falta `npm run deploy:firebase`. El export en `functions/src/index.ts` es
  solo paridad con el resto de los cores.
- El cliente llama fire-and-forget tras el login/registro: si la función
  fallara, el login sigue igual que siempre (comportamiento de antes).
- El UID viaja por el token Bearer de la sesión (verificado con Admin SDK):
  nadie puede fingir ser otro usuario para robar un equipo.
- Saneo del `deviceId` y del token, tope de 20 docs por usuario, límite de
  30 llamadas por hora por usuario, App Check respetado igual que en el
  resto de las funciones.
- El traspaso preserva el `createdAt` original del dispositivo y el toggle
  queda encendido para quien entra (el doc pasa completo).

## Verificación realizada

- `npm --prefix functions run build` ✓ (typecheck limpio)
- `npm --prefix functions test` → **128/128** ✓ (11 pruebas nuevas del traspaso)
- `npm test` → **340/340** ✓
- `npm run build` ✓ (PWA generada, 120 entradas en precache)
