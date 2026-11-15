/**
 * SPOT 24 · 5.143 · Cotización a prueba de todo.
 * ────────────────────────────────────────────────────────────────────
 * SÍNTOMA EN PRODUCCIÓN (ronda 5.143, reporte del dueño): fuera de la franja
 * del delivery, el checkout vuela a RETIRO EN TIENDA y la pantalla se queda
 * en «Calculando montos exactos…» para siempre; el Pago Móvil automático
 * desaparece (exige cotización lista) y el pie dice «Esperando los montos
 * exactos para seguir». Dentro de la franja todo funciona.
 *
 * Por qué podía colgarse: el efecto de cotización depende de que la promesa
 * de fn-quoteTotals RESUELVA. `AbortSignal.timeout` (25 s prod / 60 s dev)
 * cubre el fetch en sí, pero NO todo lo que pasa antes o alrededor:
 *  · la carga de Firebase (loadFirebase) y el refresco del ID token;
 *  · un isolate de Netlify que muere sin cerrar la conexión (la promesa
 *    nunca se rechaza ni resuelve);
 *  · cualquier limpieza del efecto en pleno vuelo que dejara el estado en
 *    «loading» sin una nueva corrida que lo reemplazara.
 * El watchdog cierra TODOS esos agujeros: si la cotización no se definió en
 * el plazo, la UI pasa a error accionable con Reintentar — jamás un spinner
 * eterno. Una respuesta tardía que llegue después del vencimiento AÚN gana
 * (mejor montos tarde que nunca) porque el estado no se congela.
 */

/** Resultado de la carrera cotización-vs-watchdog. */
export type ResultadoCotizacion<T> =
  | { tipo: 'ok'; valor: T }
  | { tipo: 'error' };

/**
 * Plazo del watchdog de cotización.
 * · Producción: 20 s — el tope de red es 25 s (AbortSignal.timeout); el
 *   watchdog dispara antes y da tiempo a que una respuesta tardía aún gane.
 * · Desarrollo: 45 s — netlify.dev ejecuta las funciones EN SERIE (1 worker):
 *   reserveStock 28 s + quoteTotals en cola supera los 25 s legítimamente.
 */
export function msWatchdogCotizacion(dev: boolean): number {
  return dev ? 45_000 : 20_000;
}

/**
 * Corre `promesa` contra un reloj de `ms`. NUNCA queda pendiente: resuelve
 * { tipo: 'ok', valor } si la promesa gana, { tipo: 'error' } si falla o si
 * el reloj vence primero. La promesa original sigue su curso igual (su
 * resultado tardío ya no cambia nada aquí — el llamador decide con `alive`).
 */
export function correrConWatchdog<T>(
  promesa: Promise<T>,
  ms: number,
): Promise<ResultadoCotizacion<T>> {
  return new Promise((resolve) => {
    let definido = false;
    const reloj = setTimeout(() => {
      if (definido) return;
      definido = true;
      resolve({ tipo: 'error' });
    }, ms);
    promesa.then(
      (valor) => {
        if (definido) return;
        definido = true;
        clearTimeout(reloj);
        resolve({ tipo: 'ok', valor });
      },
      () => {
        if (definido) return;
        definido = true;
        clearTimeout(reloj);
        resolve({ tipo: 'error' });
      },
    );
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * 5.144 · LA PISTA DEL DUEÑO: «sucede si RECARGO, en teléfono o PC».
 * ────────────────────────────────────────────────────────────────────────────
 * Al recargar, el carrito NO está en memoria: el store arranca con items: []
 * y el carrito real llega ASÍNCRONO (observeAuth → hydrateForUser →
 * localStorage o Firestore). Los efectos del checkout que dependen del
 * carrito tenían un guard `if (isEmpty) return;` con `isEmpty` FUERA de sus
 * dependencias: si el efecto corría mientras el carrito aún se hidrata,
 * retornaba en silencio y NUNCA volvía a correr → la cotización quedaba
 * «Calculando montos exactos…» para siempre, el guard del paso Pago decía
 * «Esperando los montos exactos para seguir» y el Pago Móvil automático
 * desaparecía (exige cotización lista).
 *
 * Por qué SOLO fallaba fuera de la franja del delivery: el vuelo a RETIRO
 * (5.112-B) es el ÚNICO evento que re-corre el efecto de cotización sin
 * acción del cliente. Fuera de horario ese vuelo ocurre al instante de
 * cargar settings — y si el carrito pierde esa carrera, el guard `isEmpty`
 * mata la última corrida posible. Dentro de horario el cliente ELIGE ZONA
 * después de hidratarse (re-corrida garantizada) y por eso nunca lo vio.
 *
 * El gate convierte ese contrato en lógica PURA y testeable: los efectos de
 * CheckoutPage lo consultan y lo declaran en sus dependencias, de modo que
 * el momento en que el carrito termina de hidratarse RE-DISPARA la corrida.
 */

/** Entrada del gate de cotización (los valores exactos que mira CheckoutPage). */
export interface GateCotizacion {
  /** ¿Ya llegó el carrito real tras la recarga? (cart.store → hydrated) */
  cartHydrated: boolean;
  /** ¿El carrito está vacío? */
  isEmpty: boolean;
  /** Modalidad de entrega activa. */
  fulfillment: 'delivery' | 'pickup';
  /** Zona del DESTINATARIO real (tercero o comprador) en delivery; '' si no hay. */
  zoneEntregaId: string;
}

/**
 * ¿Debe correr (o re-correr) el efecto de cotización? `false` = el guard del
 * efecto retorna sin tocar nada. Los tres no:
 * · !cartHydrated → el carrito real aún no llegó (recarga): cotizar ahora
 *   sería cotizar contra un carrito vacío o congelar la corrida única.
 * · isEmpty → no hay qué cotizar; la página muestra el estado de carrito
 *   vacío.
 * · delivery sin zona → no hay tarifa que cotizar; la UI guía «Elige la
 *   zona…» y al elegirla el cambio de zoneEntregaId re-dispara.
 * En cuanto `cartHydrated` pase a false→true, el efecto re-corre y la
 * cotización de RETIRO (la del vuelo 5.112-B que ganó la carrera) se pide
 * con el carrito REAL: adiós cuelgue al recargar fuera de horario.
 */
export function debeCotizar(g: GateCotizacion): boolean {
  if (!g.cartHydrated) return false;
  if (g.isEmpty) return false;
  if (g.fulfillment === 'delivery' && !g.zoneEntregaId) return false;
  return true;
}

/** Entrada del gate de la reserva de stock 2 h (mismo tipo de carrera). */
export interface GateReserva {
  cartHydrated: boolean;
  isEmpty: boolean;
  /** ¿Ya se disparó la reserva en esta vida de la página? (reserveFired) */
  yaReservada: boolean;
}

/**
 * ¿Debe dispararse la reserva de stock (fn-reserveStock)? Mismo mal que la
 * cotización: al recargar, el efecto corría con el carrito vacío, retornaba
 * y la reserva quedaba SIN DISPARAR hasta que createOrder revalidara al
 * final. Con el gate: cuando el carrito se hidrata con items, la reserva
 * sale una sola vez (yaReservada evita dobles en cualquier re-corrida).
 */
export function debeReservar(g: GateReserva): boolean {
  return g.cartHydrated && !g.isEmpty && !g.yaReservada;
}
