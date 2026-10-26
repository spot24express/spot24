import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { SpeedLines } from '@/shared/components/brand/Logo';
import { TITULAR } from '../datos';

/**
 * SPOT 24 · Términos y Condiciones (ronda 5.106).
 * · Versión COMPLETA pedida por el dueño: 16 secciones numeradas y navegables.
 * · Política aprobada por el dueño: venta final salvo defecto de fábrica (sección 8),
 *   licores solo a mayores de 18 con verificación de cédula al entregar (sección 9),
 *   aceptación SOLO vía enlaces del footer (sin checkbox en checkout/registro).
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
  [1, 'Identificación del titular'],
  [2, 'Objeto y aceptación'],
  [3, 'Registro y cuenta de usuario'],
  [4, 'Catálogo, precios y disponibilidad'],
  [5, 'Flujo del pedido y reserva de mercancía'],
  [6, 'Formas de pago y verificación'],
  [7, 'Entregas, retiro y zonas de cobertura'],
  [8, 'Cambios, devoluciones y garantías'],
  [9, 'Venta de bebidas alcohólicas'],
  [10, 'Uso aceptable del sitio'],
  [11, 'Propiedad intelectual'],
  [12, 'Limitación de responsabilidad'],
  [13, 'Suspensión y terminación'],
  [14, 'Modificaciones a estos Términos'],
  [15, 'Legislación aplicable y jurisdicción'],
  [16, 'Contacto'],
];

export default function TerminosPage() {
  useDocumentTitle('Términos y Condiciones');
  return (
    <div className="spot-container py-10">
      <article className="mx-auto max-w-3xl">
        <SpeedLines className="mb-4" />
        <h1 className="font-display text-3xl font-extrabold italic uppercase text-paper">
          Términos y Condiciones
        </h1>
        <p className="mt-2 spot-label">Vigente desde el {TITULAR.vigencia}</p>
        <p className="mt-4 text-justify text-paper/85">
          Estos Términos y Condiciones regulan el uso de la tienda en línea{' '}
          <strong className="text-paper">{TITULAR.marca}</strong>, disponible en {TITULAR.sitio} y
          como aplicación web instalable, operada por {TITULAR.razonSocial}. Al navegar la tienda,
          crear una cuenta o confirmar un pedido, declaras haber leído, entendido y aceptado la
          totalidad de estos Términos. Si no estás de acuerdo con alguna parte, por favor no uses la
          plataforma; nuestro equipo estará atento a tus preguntas por los canales de la sección 16.
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

        <Seccion n={1} titulo="Identificación del titular">
          <p>
            La tienda {TITULAR.marca} es operada por{' '}
            <strong className="text-paper">{TITULAR.razonSocial}</strong>, sociedad mercantil
            inscrita en la República Bolivariana de Venezuela, titular del Registro de Información
            Fiscal <strong className="text-paper">{TITULAR.rif}</strong>. El titular es el
            responsable del sitio, del catálogo, de los pedidos y de la relación comercial con los
            clientes, y pone a disposición el WhatsApp de soporte, visible en el pie de página de
            la tienda, para consultas sobre estos Términos.
          </p>
          <p>
            Las referencias a «{TITULAR.marca}», «nosotros» o «la tienda» dentro de este documento
            se entienden hechas a {TITULAR.razonSocial}. Las referencias a «tú» o «el cliente» se
            entienden hechas a toda persona que navegue la tienda, tenga cuenta o realice un pedido.
          </p>
        </Seccion>

        <Seccion n={2} titulo="Objeto y aceptación">
          <p>
            El objeto de estos Términos es definir las reglas de la relación entre el cliente y el
            titular para: la navegación y búsqueda del catálogo, la creación y uso de la cuenta, la
            confirmación de pedidos, las formas de pago y su verificación, la entrega o el retiro de
            la mercancía, y los casos de cambio o devolución. La tienda comercializa repuestos y
            accesorios automotrices, lubricantes y refrigerantes, alimentos y bebidas, licores y
            productos de conveniencia, según lo publicado en el catálogo de cada momento.
          </p>
          <p>
            La aceptación de estos Términos es expresa: se produce cuando creas una cuenta, cuando
            confirmas un pedido en el checkout, o cuando instalas la aplicación web y continúas
            usándola. La versión vigente siempre está publicada en esta página con su fecha de
            entrada en vigor, de modo que puedes consultarla en cualquier momento antes de pedir.
          </p>
          <p>
            Para contratar por la tienda debes tener capacidad legal para obligarte, es decir, ser
            mayor de edad y actuar en nombre propio o como representante autorizado de una persona
            jurídica. Los pedidos hechos por personas sin capacidad legal podrán anularse y
            reembolsarse según la sección 8.
          </p>
        </Seccion>

        <Seccion n={3} titulo="Registro y cuenta de usuario">
          <p>
            Para comprar necesitas una cuenta con correo electrónico y clave. Al registrarte
            declaras que la información que suministras es verídica, completa y actual — nombre,
            teléfono de contacto y dirección de entrega — y te comprometes a mantenerla al día,
            porque los avisos de estado del pedido y las coordinaciones de entrega dependen de
            ella. Una persona puede mantener una sola cuenta; la creación de cuentas duplicadas o
            con datos de terceros sin autorización podrá ser suspendida.
          </p>
          <p>
            La clave de tu cuenta es personal e intransferible: eres responsable de custodiarla y
            de toda actividad realizada con tu sesión, incluidos los pedidos confirmados. Si
            detectas un acceso no autorizado, avísanos de inmediato por los canales de la
            sección 16 para
            bloquear la cuenta y revisar los pedidos afectados. La tienda no será responsable de
            pedidos confirmados desde una sesión cuyo acceso no nos fue notificado como
            comprometido.
          </p>
        </Seccion>

        <Seccion n={4} titulo="Catálogo, precios y disponibilidad">
          <p>
            Los precios se publican en dólares de los Estados Unidos (USD). El equivalente en
            bolívares se calcula con la tasa oficial de referencia del Banco Central de Venezuela
            vigente al momento de la operación: el monto en bolívares mostrado en pantalla es
            informativo y el definitivo es el aplicado por la tienda al verificar tu pago. El costo
            de envío no está incluido en el precio del producto: se calcula por zona y se muestra
            antes de confirmar el pedido, en la sección 7 se explica su tratamiento.
          </p>
          <p>
            Las fotografías y descripciones del catálogo son referenciales; las piezas reales
            pueden variar en presentación o empaques del fabricante sin alterar su función o
            compatibilidad. La disponibilidad mostrada refleja el inventario en tiempo real, pero
            la separación definitiva de la mercancía ocurre con la reserva de la sección 5:
            mientras la
            reserva esté activa, las unidades de tu pedido quedan separadas para ti y no pueden
            venderse a otro cliente.
          </p>
          <p>
            Puede haber errores de precio, texto o compatibilidad en el catálogo. Si detectamos un
            error manifiesto en un pedido ya confirmado (por ejemplo, un precio claramente errado
            o una pieza imposible de surtir), te lo comunicaremos a la brevedad por los datos de
            contacto de tu cuenta y podrás elegir entre la corrección del pedido o su anulación con
            devolución íntegra de lo pagado, según la sección 8.
          </p>
        </Seccion>

        <Seccion n={5} titulo="Flujo del pedido y reserva de mercancía">
          <p>Todo pedido sigue el mismo flujo, visible para ti en la pantalla del pedido:</p>
          <Lista
            items={[
              <>
                <strong className="text-paper">Selección:</strong> agregas productos al carrito;
                puedes revisar y quitar libremente antes de confirmar.
              </>,
              <>
                <strong className="text-paper">Confirmación:</strong> entregas tus datos de
                contacto, la dirección o el retiro en local, y eliges forma de pago.
              </>,
              <>
                <strong className="text-paper">Reserva:</strong> al confirmar, la mercancía queda{' '}
                <em>reservada</em> para ti — separada del inventario por un tiempo limitado que la
                pantalla indica — para que nadie más te la gane mientras pagas.
              </>,
              <>
                <strong className="text-paper">Pago:</strong> ejecutas el pago por la forma que
                elegiste y, si aplica, envías el comprobante por la tienda.
              </>,
              <>
                <strong className="text-paper">Verificación:</strong> personal autorizado verifica
                el pago (sección 6). Sin verificación el pedido no entra a preparación.
              </>,
              <>
                <strong className="text-paper">Preparación y despacho:</strong> la mercancía se
                prepara y se entrega por delivery o se deja lista para retiro.
              </>,
            ]}
          />
          <p>
            La reserva vence automáticamente si el pago no se completa dentro del plazo mostrado en
            pantalla. Vencido el plazo, las unidades vuelven al inventario y el pedido queda
            anulado sin cargos. Si pagaste y el pago no pudo verificarse antes del vencimiento, el
            sistema guarda tu comprobante y el equipo lo revisará para aplicar la devolución o la
            activación del pedido, según resulte de la verificación.
          </p>
        </Seccion>

        <Seccion n={6} titulo="Formas de pago y verificación">
          <p>
            Las formas de pago disponibles se muestran al confirmar el pedido y pueden incluir
            pago móvil, transferencia bancaria, efectivo y punto de venta, u otras que el titular
            habilite con el tiempo. Los datos de recaudo (banco, titular, RIF, referencia) se
            presentan en pantalla en el paso de pago y no deben tomarse de fuentes distintas:
            cualquier dato recibido por un canal no oficial no obliga a la tienda.
          </p>
          <p>
            Un pago se considera acreditado solo después de la <em>verificación</em> realizada por
            personal autorizado, que comprueba la correspondencia del monto exacto, el banco o
            método, y la referencia del comprobante. El envío de un comprobante no constituye
            pago; la verificación sí. Si el monto pagado difiere del total del pedido (pagos
            incompletos o con descuentos bancarios), la verificación podrá rechazarse y se te
            pedirá completar la diferencia o se anulará el pedido con devolución de lo recibido.
          </p>
          <p>
            En efectivo y punto de venta el cobro se realiza al momento de la entrega o del retiro.
            No se aplican intereses ni cargos ocultos: el total que ves al confirmar (productos +
            envío) es el total que pagas, salvo ajuste notificado conforme a la sección 4.
          </p>
        </Seccion>

        <Seccion n={7} titulo="Entregas, retiro y zonas de cobertura">
          <p>
            Entregamos a domicilio dentro de las zonas de cobertura configuradas por la tienda; el
            listado de zonas y el costo de cada una se muestran en el checkout antes de pagar, de
            modo que el costo final siempre queda a tu vista antes de confirmar. El horario
            operativo de los deliverys se publica en la página principal (por defecto, de 8:00 am a
            8:00 pm) y puede ajustarse por contingencias con aviso en el mismo lugar. También
            puedes elegir retiro en el local: la dirección y el horario de atención se muestran en
            el checkout y quedan fijados en tu pedido.
          </p>
          <p>
            La mercancía se entrega a quien presente el pedido en la dirección indicada; te
            recomendamos recibir personalmente o dejar a alguien autorizado. Si nadie recibe en la
            primera visita, el delivery coordinará un reintento por los datos de contacto de tu
            cuenta; los reintentos adicionales por causas imputables al cliente (dirección errada,
            teléfono apagado, ausencia reiterada) podrán conllevar costos de envío adicionales.
          </p>
          <p>
            Los plazos de entrega son estimados y dependen del volumen de pedidos, la zona y las
            condiciones de vías y servicios públicos. Situaciones de fuerza mayor — lluvias
            intensas, contingencias eléctricas o de combustible, operativos viales — pueden
            retrasar una entrega; en tal caso avisaremos por los canales disponibles y coordinaremos
            el nuevo momento de entrega o el retiro en local sin costo para ti.
          </p>
        </Seccion>

        <Seccion n={8} titulo="Cambios, devoluciones y garantías">
          <p>
            <strong className="text-paper">
              La venta se entiende finalizada, salvo defecto de fábrica.
            </strong>{' '}
            No se aceptan cambios ni devoluciones por decisión de compra, error en la selección
            del cliente, o incompatibilidad mal informada al pedir: por eso la ficha de cada
            producto incluye fotos, medidas, códigos y notas de compatibilidad que te invitamos a
            revisar antes de confirmar.
          </p>
          <p>
            Revisa tu pedido al recibirlo y firma de conformidad solo después de hacerlo. Se
            aceptará cambio o devolución únicamente cuando el producto presente un{' '}
            <strong className="text-paper">defecto de fabricación comprobable</strong>, entendido
            como un vicio propio del producto que impide o degrada su función, y que no derive de
            instalación incorrecta, uso indebido, desgaste normal, daños físicos posteriores a la
            entrega o manipulación por terceros.
          </p>
          <p>
            El procedimiento de reclamo es el siguiente, en orden y con todos sus requisitos:
          </p>
          <Lista
            items={[
              <>
                Escríbenos dentro de las <strong className="text-paper">48 horas</strong>{' '}
                siguientes a la entrega, por WhatsApp, indicando el número de pedido.
              </>,
              <>
                Adjunta <strong className="text-paper">fotografías o video</strong> donde se
                aprecie el defecto, y describe brevemente qué ocurre al instalar o usar la pieza.
              </>,
              <>
                El producto debe estar <strong className="text-paper">sin instalar</strong> (o con
                evidencia clara de que el defecto no proviene de la instalación), completo y con su
                empaque, tornillería y accesorios originales.
              </>,
              <>
                Recibida la evidencia, el equipo evaluará el caso; podrá solicitarse la devolución
                física de la pieza para inspección. Aprobado el reclamo, a elección del titular y
                según disponibilidad se aplicará:{' '}
                <strong className="text-paper">cambio por el mismo producto</strong>,{' '}
                <strong className="text-paper">crédito para otra compra</strong> o{' '}
                <strong className="text-paper">devolución del monto pagado</strong>, por la misma
                vía del pago original cuando sea posible.
              </>,
            ]}
          />
          <p>
            Las piezas eléctricas y electrónicas (sensores, módulos, cornetas, cargadores y
            similares) se rigen por la misma regla: solo cambio por defecto de fábrica documentado,
            dado que una instalación o conexión incorrecta puede dañarlas de forma indistinguible
            del defecto original. Los productos perecederos (alimentos y bebidas) se revisan al
            momento de la entrega: cualquier reclamo por estado o vencimiento debe plantearse
            inmediatamente al recibir y, de ser procedente, se resolverá en el acto con cambio o
            devolución.
          </p>
          <p>
            Lo anterior no limita las garantías que el fabricante o importador ofrezca
            directamente y que estén indicadas en la ficha del producto o el empaque; esas
            garantías son adicionales y las gestiona el fabricante conforme a sus propias
            condiciones. Los derechos que otorga la ley venezolana de protección a las personas en
            el acceso a bienes y servicios quedan igualmente a salvo.
          </p>
        </Seccion>

        <Seccion n={9} titulo="Venta de bebidas alcohólicas">
          <p>
            La venta de licores y bebidas alcohólicas a través de la tienda está dirigida
            exclusivamente a <strong className="text-paper">mayores de 18 años</strong>. Al
            confirmar un pedido que incluya bebidas alcohólicas, el cliente declara y garantiza
            ser mayor de edad.
          </p>
          <p>
            En la entrega, el delivery queda autorizado a solicitar la cédula de identidad del
            receptor para verificar la edad. Si el receptor es menor de edad, no puede acreditar su
            edad, o se encuentra manifiestamente en estado de ebriedad, la bebida alcohólica{' '}
            <strong className="text-paper">no será entregada</strong>: se devolverá al inventario y
            su monto será reembolsado conforme a la sección 8. El resto del pedido (si lo
            hubiera) se
            entregará con normalidad. La coordinación de la nueva entrega o el retiro del resto del
            pedido se hará con el cliente sin costo adicional cuando la negativa provenga de la
            verificación de edad.
          </p>
        </Seccion>

        <Seccion n={10} titulo="Uso aceptable del sitio">
          <p>Está prohibido, sin limitación:</p>
          <Lista
            items={[
              'Extraer contenido del catálogo con herramientas automatizadas (robots, scrapers) o sobrecargar deliberadamente la plataforma.',
              'Confirmar pedidos sin intención de pagar, reservar mercancía de forma reiterada para afectar el inventario, o suplantar la identidad de terceros.',
              'Intentar vulnerar los mecanismos de seguridad, acceder a cuentas ajenas o a datos de otros clientes.',
              'Revender la plataforma, usarla para publicidad no autorizada o presentarla como propia.',
              'Cargar contenido ilegal, ofensivo o que infrinja derechos de terceros en los campos de texto libre (direcciones, referencias, reclamos).',
            ]}
          />
          <p>
            El incumplimiento de esta sección faculta al titular a anular los pedidos asociados,
            suspender la cuenta y, de ser necesario, ejercer las acciones legales que correspondan.
            Los pedidos hechos por la tienda son compras legítimas para consumo propio o uso
            comercial ordinario del cliente.
          </p>
        </Seccion>

        <Seccion n={11} titulo="Propiedad intelectual">
          <p>
            La marca {TITULAR.marca}, el escudo, los textos, las fotografías propias, el diseño de
            la interfaz y el código de la plataforma son propiedad de {TITULAR.razonSocial} o de
            sus respectivos titulares, y están protegidos por la legislación venezolana e
            internacional aplicable. Se te concede un derecho de uso personal, limitado y
            revocable: navegar la tienda, comprar e instalar la aplicación en tus dispositivos.
            Ningún otro uso — reproducción, distribución, modificación o explotación comercial —
            está autorizado sin consentimiento escrito del titular. Las marcas de terceros que
            aparecen en el catálogo pertenecen a sus respectivos dueños y su uso en la ficha del
            producto es descriptivo de compatibilidad.
          </p>
        </Seccion>

        <Seccion n={12} titulo="Limitación de responsabilidad">
          <p>
            La plataforma se ofrece «tal cual» y «según disponibilidad». Trabajamos para que el
            catálogo, los precios y la reserva de inventario sean exactos, pero no garantizamos un
            funcionamiento ininterrumpido ni libre de errores: mantenimientos, fallas de
            proveedores de infraestructura (sección 7 de la Política de Privacidad) o contingencias
            eléctricas y de conectividad del país pueden afectar temporalmente el servicio. En tales
            casos los pedidos ya pagados y no entregados se respetarán: se cumplirán o se
            reembolsarán a elección del cliente.
          </p>
          <p>
            La responsabilidad máxima del titular frente a ti, por cualquier concepto, se limita al
            monto que hayas pagado por el pedido objeto de la reclamación. No respondemos por: la
            instalación de piezas realizada por talleres o terceros; daños derivados del uso
            indebido de los productos; lucro cesante o daños indirectos; ni por consecuencias de
            información ingresada errada por el cliente (dirección, teléfono, referencias o modelo
            de vehículo). Nada en esta sección limita responsabilidades que la ley impida limitar.
          </p>
        </Seccion>

        <Seccion n={13} titulo="Suspensión y terminación">
          <p>
            El titular puede suspender o cerrar una cuenta cuando exista una violación grave o
            reiterada de estos Términos: fraude o intento de fraude, pedidos falsos, abuso del
            sistema de reservas, usurpación de identidades o violación de la sección 10. La
            suspensión se
            comunicará al correo de la cuenta indicando el motivo; los pedidos ya pagados y no
            entregados se respetarán conforme a la sección 12, y los saldos pendientes de
            devolución se procesarán según la sección 8.
          </p>
          <p>
            Tú puedes terminar la relación cuando quieras dejando de usar la plataforma y
            solicitando la eliminación de tu cuenta según la Política de Privacidad. Las
            obligaciones de pago ya asumidas, y las cláusulas que por su naturaleza deban
            sobrevivir (propiedad intelectual, limitación de responsabilidad, legislación
            aplicable), permanecen vigentes tras la terminación.
          </p>
        </Seccion>

        <Seccion n={14} titulo="Modificaciones a estos Términos">
          <p>
            El titular puede actualizar estos Términos para reflejar cambios en la operación
            (nuevas formas de pago, nuevas zonas de cobertura, ajustes de políticas de cambio). La
            versión vigente se publica en esta página con nueva fecha de entrada en vigor, y los
            cambios sustanciales se anunciarán con anticipación razonable en la propia tienda. Los
            pedidos confirmados antes de una modificación se rigen por la versión vigente al
            momento de su confirmación. Continuar usando la tienda después de la entrada en vigor
            de una versión implica su aceptación.
          </p>
        </Seccion>

        <Seccion n={15} titulo="Legislación aplicable y jurisdicción">
          <p>
            Estos Términos se rigen por las leyes de la República Bolivariana de Venezuela, en
            particular la Ley para la Defensa de las Personas en el Acceso a los Bienes y
            Servicios, la Ley de Mensajería de Datos y Firmas Electrónicas — que reconoce el valor
            jurídico de los pedidos y comprobantes electrónicos — y demás normativa aplicable.
          </p>
          <p>
            Cualquier controversia se intentará resolver primero por la vía amistosa, a través de
            los canales de contacto de la sección 16, procurando una solución en un plazo
            razonable. Si no
            resultare posible, las partes se someten a los tribunales competentes de la
            jurisdicción del domicilio del titular, renunciando a cualquier otro fuero que pudiera
            corresponderles.
          </p>
        </Seccion>

        <Seccion n={16} titulo="Contacto">
          <p>
            Para cualquier consulta sobre estos Términos, un pedido o un reclamo, puedes
            escribirnos:
          </p>
          <Lista
            items={[
              <>
                Por el botón <strong className="text-paper">WhatsApp</strong> de la tienda (el
                número de operación se muestra en el propio botón).
              </>,
              <>
                En persona en el local, cuya dirección y horario se muestran en el paso de retiro
                del checkout.
              </>,
            ]}
          />
          <p>
            El tratamiento de los datos personales que nos das al usar la tienda se describe en
            detalle en la{' '}
            <Link to="/privacidad" className="font-semibold text-signal hover:underline">
              Política de Privacidad
            </Link>
            , que forma parte de estos Términos.
          </p>
        </Seccion>

        <p className="mt-10 spot-label">
          {TITULAR.razonSocial} · RIF {TITULAR.rif} · {TITULAR.marca} — «Tu parada segura. 24/7.»
        </p>
      </article>
    </div>
  );
}