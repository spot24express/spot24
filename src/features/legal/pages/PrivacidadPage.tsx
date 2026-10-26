import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { SpeedLines } from '@/shared/components/brand/Logo';
import { TITULAR } from '../datos';

/**
 * SPOT 24 · Política de Privacidad (ronda 5.106).
 * · Versión COMPLETA pedida por el dueño: 17 secciones numeradas y navegables.
 * · Describe el tratamiento real de la plataforma: Firebase (Auth/Firestore/
 *   Storage/FCM), Netlify, imgbb, tokens push, comprobantes de pago,
 *   almacenamiento local de la PWA y derechos del cliente.
 * · Datos del titular desde ../datos (única fuente; edición sin tocar esta página).
 */

/** Sección numerada: título con ancla (#sNN) para el índice y parrafado compacto. */
function Seccion({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <section id={`s${n}`} className="mt-8 scroll-mt-24">
      <h2 className="font-display text-lg font-bold italic uppercase text-paper">
        <span className="text-signal">{String(n).padStart(2, '0')}.</span> {titulo}
      </h2>
      <div className="mt-3 space-y-3 text-justify text-paper/85">{children}</div>
    </section>
  );
}

function Lista({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-6 text-left">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

const INDICE: Array<[number, string]> = [
  [1, 'Responsable del tratamiento'],
  [2, 'Alcance de esta Política'],
  [3, 'Datos que recolectamos'],
  [4, 'Finalidades del tratamiento'],
  [5, 'Base legal y principios'],
  [6, 'Notificaciones push'],
  [7, 'Proveedores e infraestructura'],
  [8, 'Comprobantes de pago'],
  [9, 'Cookies y almacenamiento local'],
  [10, 'Conservación de los datos'],
  [11, 'Tus derechos'],
  [12, 'Eliminación de cuenta'],
  [13, 'Seguridad de la información'],
  [14, 'Menores de edad'],
  [15, 'Transferencias internacionales'],
  [16, 'Modificaciones a esta Política'],
  [17, 'Contacto'],
];

export default function PrivacidadPage() {
  useDocumentTitle('Política de Privacidad');
  return (
    <div className="spot-container py-10">
      <article className="mx-auto max-w-3xl">
        <SpeedLines className="mb-4" />
        <h1 className="font-display text-3xl font-extrabold italic uppercase text-paper">
          Política de Privacidad
        </h1>
        <p className="mt-2 spot-label">Vigente desde el {TITULAR.vigencia}</p>
        <p className="mt-4 text-justify text-paper/85">
          Esta Política de Privacidad explica, en lenguaje claro, qué datos personales recoge{' '}
          <strong className="text-paper">{TITULAR.marca}</strong> cuando usas la tienda, para qué
          los usamos, con quiénes se comparten, cuánto tiempo se conservan y cómo ejercer tus
          derechos. El responsable del tratamiento es <strong className="text-paper">
          {TITULAR.razonSocial}</strong> (RIF {TITULAR.rif}), y el canal de contacto para todo lo
          relativo a privacidad es el WhatsApp de soporte de la tienda, visible en su pie de
          página. Esta Política forma parte de los{' '}
          <Link to="/terminos" className="font-semibold text-signal hover:underline">
            Términos y Condiciones
          </Link>
          .
        </p>

        <nav aria-label="Índice" className="mt-6 rounded-brand border-2 border-line bg-surface-1 p-5">
          <p className="spot-label">Contenido</p>
          <ol className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {INDICE.map(([n, t]) => (
              <li key={n}>
                <a href={`#s${n}`} className="text-paper/70 hover:text-signal">
                  {String(n).padStart(2, '0')}. {t}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <Seccion n={1} titulo="Responsable del tratamiento">
          <p>
            El responsable de los datos personales tratados en la tienda es{' '}
            <strong className="text-paper">{TITULAR.razonSocial}</strong>, titular del RIF{' '}
            {TITULAR.rif}, que opera la plataforma {TITULAR.marca} en {TITULAR.sitio} y como
            aplicación web instalable. El responsable decide qué datos se piden, para qué se usan y
            cómo se protegen, y es a quien debes dirigir cualquier solicitud sobre tus datos
            (sección 11).
          </p>
        </Seccion>

        <Seccion n={2} titulo="Alcance de esta Política">
          <p>
            Esta Política cubre el tratamiento de datos realizado al: navegar y buscar en el
            catálogo, crear y usar tu cuenta, confirmar pedidos, pagar y enviar comprobantes,
            recibir notificaciones del sistema, y escribirnos por los canales de soporte. No cubre
            los servicios de terceros con los que puedes interactuar desde la tienda — como
            WhatsApp, Instagram o tu banco — que tienen sus propias políticas de privacidad; te
            invitamos a leerlas antes de usarlos.
          </p>
        </Seccion>

        <Seccion n={3} titulo="Datos que recolectamos">
          <p>Recolectamos únicamente los datos necesarios para operar la tienda y entregarte tus pedidos:</p>
          <Lista
            items={[
              <>
                <strong className="text-paper">Cuenta:</strong> nombre, correo electrónico y
                teléfono que registras al crear tu cuenta.
              </>,
              <>
                <strong className="text-paper">Entrega:</strong> dirección, zona y referencias que
                ingresas al confirmar un pedido a domicilio.
              </>,
              <>
                <strong className="text-paper">Pedidos:</strong> productos, cantidades, montos,
                forma de pago, estado del pedido y su historial completo.
              </>,
              <>
                <strong className="text-paper">Pagos:</strong> el comprobante que envías (imagen
                del recibo de pago móvil o transferencia, con los datos que el propio recibo
                contiene), la referencia y el método. No almacenamos claves, PIN ni credenciales
                bancarias: el pago lo ejecutas tú directamente ante tu banco.
              </>,
              <>
                <strong className="text-paper">Dispositivo:</strong> el token de notificaciones
                push (sección 6) y datos técnicos básicos de la sesión del navegador.
              </>,
              <>
                <strong className="text-paper">Comunicaciones:</strong> los mensajes y evidencias
                que nos envías por WhatsApp o los formularios de la tienda al pedir o reclamar.
              </>,
            ]}
          />
          <p>
            No solicitamos datos sensibles (salud, religión, origen étnico, biometría) y te pedimos
            no incluirlos en los campos de texto libre de la tienda.
          </p>
        </Seccion>

        <Seccion n={4} titulo="Finalidades del tratamiento">
          <p>Usamos tus datos para:</p>
          <Lista
            items={[
              'Procesar tus pedidos: reservar la mercancía, preparar el despacho y entregarte o dejarte lista la compra para retiro.',
              'Verificar tus pagos contra los comprobantes enviados y conciliar el cobro.',
              'Informarte el estado de tu pedido mediante las notificaciones del sistema y tu historial: verificación de pago, preparación, despacho y entrega.',
              'Coordinar la entrega con el delivery o el retiro en local, usando tu teléfono y dirección.',
              'Atender tus consultas, reclamos y solicitudes de cambio o devolución (Términos, sección 8).',
              'Mantener la seguridad de la plataforma y prevenir fraudes, pedidos falsos y abuso del sistema de reservas.',
              'Mejorar el servicio mediante métricas agregadas de uso (cuántos pedidos, en qué zonas, qué categorías se consultan), siempre de forma agregada o disociada.',
            ]}
          />
          <p>
            <strong className="text-paper">No vendemos ni alquilamos tus datos personales.</strong>{' '}
            No los usamos para publicidad de terceros ni los compartimos con empresas ajenas a la
            operación de la tienda, salvo los proveedores de infraestructura descritos en la
            sección 7 y las
            obligaciones legales aplicables.
          </p>
        </Seccion>

        <Seccion n={5} titulo="Base legal y principios">
          <p>
            El tratamiento se apoya en: tu <strong className="text-paper">consentimiento</strong>,
            que otorgas al crear la cuenta y confirmar pedidos; la{' '}
            <strong className="text-paper">ejecución del contrato</strong> de compra-venta que
            formalizas al pedir (sin tus datos no podemos reservar, verificar el pago ni
            entregar); el <strong className="text-paper">interés legítimo</strong> del responsable
            en la seguridad de la plataforma y la prevención de fraude; y el cumplimiento de{' '}
            <strong className="text-paper">obligaciones legales</strong> y contables que correspondan.
          </p>
          <p>
            El tratamiento respeta los principios de legalidad, finalidad, veracidad, seguridad,
            confidencialidad y proporción: pedimos lo mínimo, lo usamos solo para lo declarado aquí
            y lo protegemos con las medidas de la sección 13. Este enfoque es coherente con el marco
            venezolano vigente, en particular la garantía constitucional que protege la vida
            privada, la intimidad y la confidencialidad de las comunicaciones.
          </p>
        </Seccion>

        <Seccion n={6} titulo="Notificaciones push">
          <p>
            Si autorizas las notificaciones en tu navegador, la tienda guarda un{' '}
            <strong className="text-paper">token de dispositivo</strong> gestionado por Firebase
            Cloud Messaging, que se usa exclusivamente para enviarte avisos del sistema asociados a
            TU cuenta: estado de tus pedidos, verificación de pagos y disponibilidad de productos
            que sigues. Cada aviso indica el motivo y puedes dejar de recibirlos desde tu cuenta o
            desactivando las notificaciones del sitio en el navegador.
          </p>
          <p>
            Sin autorización de notificaciones la tienda funciona con normalidad: el estado de tu
            pedido siempre está disponible en la sección Pedidos y en tu historial. Los tokens
            inválidos o de dispositivos dados de baja se eliminan automáticamente.
          </p>
        </Seccion>

        <Seccion n={7} titulo="Proveedores e infraestructura">
          <p>
            La tienda opera sobre proveedores de infraestructura que tratan datos por nuestra
            cuenta y según nuestras instrucciones:
          </p>
          <Lista
            items={[
              <>
                <strong className="text-paper">Google Firebase</strong> (Authentication, Firestore,
                Storage y Cloud Messaging): aloja las cuentas, el catálogo, los pedidos, los
                comprobantes de pago y entrega las notificaciones push.
              </>,
              <>
                <strong className="text-paper">Netlify</strong>: aloja el sitio, la aplicación web
                y las funciones de servidor que procesan pedidos y pagos.
              </>,
              <>
                <strong className="text-paper">imgbb</strong>: aloja las imágenes de la tienda
                (fotos de productos y códigos QR de pago).
              </>,
            ]}
          />
          <p>
            Estos proveedores aplican sus propios controles de seguridad certificados y no pueden
            usar los datos para fines propios. La relación comercial y el tratamiento de tus datos
            siguen siendo responsabilidad de {TITULAR.razonSocial} ante ti, conforme a la
            sección 11.
          </p>
        </Seccion>

        <Seccion n={8} titulo="Comprobantes de pago">
          <p>
            El comprobante de pago es el documento que acredita tu abono ante la tienda y, según el
            método, puede contener datos bancarios (banco, monto, referencia, teléfono o cédula del
            pagador). Por su naturaleza es información sensible:{' '}
            <strong className="text-paper">solo personal autorizado</strong> de administración y
            caja accede a él, exclusivamente para verificar tu pago (Términos, sección 6).
          </p>
          <p>
            No se usan para ningún otro fin, no se comparten con terceros y no se publican. Te
            recomendamos enviar únicamente el recibo del pago correspondiente al pedido, y no
            capturas de tu estado de cuenta completo. Si en algún comprobante diste más
            información de la necesaria, puedes solicitarnos su retiro del expediente del pedido
            una vez verificada la operación.
          </p>
        </Seccion>

        <Seccion n={9} titulo="Cookies y almacenamiento local">
          <p>
            La tienda no usa cookies publicitarias ni rastreadores de terceros con fines de
            mercadeo. Sí utiliza el <strong className="text-paper">almacenamiento local</strong> del
            navegador (localStorage e IndexedDB) para funciones necesarias: mantener tu sesión
            abierta, recordar tu carrito, guardar tus preferencias y, si instalas la aplicación,
            conservar los datos que permiten su uso sin conexión (PWA) y las notificaciones
            autorizadas.
          </p>
          <p>
            Puedes limpiar estos datos en cualquier momento desde tu navegador (borrar datos del
            sitio); perderás la sesión y el carrito local, pero tus pedidos y cuenta permanecen
            íntegros en el servidor.
          </p>
        </Seccion>

        <Seccion n={10} titulo="Conservación de los datos">
          <p>Conservamos los datos por el tiempo necesario para cada finalidad:</p>
          <Lista
            items={[
              <>
                <strong className="text-paper">Cuenta y pedidos:</strong> mientras tu cuenta
                exista, para mantenerte el historial, facilitar recompras y atender garantías o
                reclamos posteriores.
              </>,
              <>
                <strong className="text-paper">Comprobantes de pago:</strong> el tiempo necesario
                para la verificación, la conciliación y los resguardos contables correspondientes.
              </>,
              <>
                <strong className="text-paper">Tokens de notificación:</strong> hasta que
                desactives las notificaciones o el token quede invalidado por el propio sistema.
              </>,
              <>
                <strong className="text-paper">Métricas de uso:</strong> en forma agregada y
                disociada, sin identificar personas.
              </>,
            ]}
          />
          <p>
            Cumplido el plazo de cada finalidad, los datos se eliminan o se disocian de manera que
            ya no permitan identificar al titular.
          </p>
        </Seccion>

        <Seccion n={11} titulo="Tus derechos">
          <p>
            Frente al responsable puedes ejercer en cualquier momento los derechos de:{' '}
            <strong className="text-paper">acceso</strong> (conocer qué datos tuyos tratamos),{' '}
            <strong className="text-paper">rectificación y actualización</strong> (corregir nombre,
            teléfono, dirección), <strong className="text-paper">eliminación</strong> (sección 12),{' '}
            <strong className="text-paper">revocación del consentimiento</strong> de
            notificaciones, y <strong className="text-paper">solicitud de copia</strong> de tu
            historial de pedidos.
          </p>
          <p>
            Para ejercerlos escríbenos por WhatsApp desde el botón de la tienda, indicando el
            correo de tu cuenta y el derecho que deseas ejercer. Verificada tu
            identidad, responderemos dentro de un plazo razonable conforme al ordenamiento
            venezolano. Si el ejercicio de un derecho afecta un pedido en curso (por ejemplo,
            eliminar la dirección de un pedido no entregado), te lo indicaremos para coordinar la
            mejor solución.
          </p>
        </Seccion>

        <Seccion n={12} titulo="Eliminación de cuenta">
          <p>
            Puedes solicitar la eliminación de tu cuenta por los canales de la sección 11. Al procesarla
            eliminamos tu perfil, tu teléfono y tus direcciones; el historial de pedidos ya
            entregados puede conservarse de forma{' '}
            <strong className="text-paper">disociada</strong> de tu persona, por resguardos
            contables y de garantía, y los comprobantes de pago se retienen el tiempo mínimo
            necesario conforme a la sección 10. Los datos de pedidos en curso se coordinan antes de la
            eliminación para no afectar entregas o devoluciones pendientes.
          </p>
        </Seccion>

        <Seccion n={13} titulo="Seguridad de la información">
          <p>
            Aplicamos medidas técnicas y organizativas proporcionadas al riesgo: transporte cifrado
            (HTTPS) en toda la tienda; reglas de seguridad en la base de datos que limitan el
            acceso por cuenta y por rol — cada cliente solo ve sus pedidos y el personal solo las
            secciones de su función; reserva de inventario y estados del pedido gestionados en el
            servidor; y comprobantes alojados en almacenamiento de acceso restringido (sección 8).
          </p>
          <p>
            Ningún sistema es infalible: si llegara a ocurrir un incidente de seguridad que afecte
            tus datos, te lo comunicaremos por los canales de tu cuenta con la descripción del
            hecho y las medidas adoptadas, en la mayor brevedad posible.
          </p>
        </Seccion>

        <Seccion n={14} titulo="Menores de edad">
          <p>
            La plataforma no está dirigida a menores de 18 años y no creamos cuentas para menores:
            el registro requiere capacidad legal conforme a los Términos (sección 2). No tratamos
            deliberadamente datos de menores; si identificamos una cuenta creada por un menor de
            edad, la eliminaremos junto con sus datos. La venta de bebidas alcohólicas tiene su
            propia regla de verificación en la entrega (Términos, sección 9).
          </p>
        </Seccion>

        <Seccion n={15} titulo="Transferencias internacionales">
          <p>
            Los proveedores descritos en la sección 7 operan infraestructura global, por lo que tus datos
            pueden procesarse o almacenarse en centros de datos ubicados fuera de Venezuela. Dichos
            proveedores mantienen compromisos contractuales y certificaciones de seguridad
            internacional, y el transporte de datos se realiza siempre cifrado. El responsable
            mantiene la supervisión del tratamiento y la responsabilidad ante ti conforme a esta
            Política.
          </p>
        </Seccion>

        <Seccion n={16} titulo="Modificaciones a esta Política">
          <p>
            Esta Política puede actualizarse para reflejar cambios en la operación o en los
            proveedores. La versión vigente se publica en esta página con nueva fecha de entrada en
            vigor, y los cambios sustanciales se anunciarán en la tienda con anticipación
            razonable. Los tratamientos ya realizados conforme a versiones anteriores no quedan
            afectados retroactivamente salvo que la ley disponga otra cosa.
          </p>
        </Seccion>

        <Seccion n={17} titulo="Contacto">
          <p>
            Para todo lo relativo a privacidad — dudas, derechos, copias, eliminación — escríbenos
            por el botón WhatsApp de la tienda, o en persona en el local (dirección y horario
            mostrados en el paso de retiro del checkout).
          </p>
        </Seccion>

        <p className="mt-10 spot-label">
          {TITULAR.razonSocial} · RIF {TITULAR.rif} · {TITULAR.marca} — «Tu parada segura. 24/7.»
        </p>
      </article>
    </div>
  );
}