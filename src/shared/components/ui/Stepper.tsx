import { STATUS_LABELS, type OrderStatus } from '@/shared/constants/orders';

interface StepperProps {
  steps: readonly string[];
  current: number; // índice 0-based
}

/** Indicador de pasos del checkout (Datos → Entrega → Pago → Confirmación). */
export function Stepper({ steps, current }: StepperProps) {
  return (
    <ol className="flex items-center gap-2" aria-label="Pasos">
      {steps.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : 'todo';
        return (
          <li key={label} className="flex flex-1 items-center gap-2" aria-current={state === 'active' ? 'step' : undefined}>
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-brand border-2 font-display text-sm font-bold italic ${
                state === 'active'
                  ? 'border-signal bg-signal text-paper'
                  : state === 'done'
                    ? 'border-paper bg-paper text-ink'
                    : 'border-line text-muted'
              }`}
            >
              {state === 'done' ? '✓' : i + 1}
            </div>
            <span className={`hidden font-body text-sm font-semibold uppercase tracking-label sm:block ${state === 'todo' ? 'text-muted' : 'text-paper'}`}>
              {label}
            </span>
            {i < steps.length - 1 && <div className="h-0.5 flex-1 bg-line" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

/** Timeline vertical de eventos del pedido (seguimiento). */
export function StatusTimeline({ current, events }: { current: OrderStatus; events: { status: OrderStatus; at: number }[] }) {
  const order: OrderStatus[] = ['pendiente', 'en_verificacion', 'pagado', 'preparado', 'en_camino', 'entregado'];
  const cancelled = current === 'cancelado';
  const currentIndex = order.indexOf(current);
  return (
    <ol className="space-y-0">
      {order.map((status, i) => {
        const done = !cancelled && i < currentIndex;
        const active = !cancelled && i === currentIndex;
        const evt = [...events].reverse().find((e) => e.status === status);
        return (
          <li key={status} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span
                className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                  active ? 'border-signal bg-signal' : done ? 'border-paper bg-paper' : 'border-line bg-ink'
                }`}
                aria-hidden="true"
              />
              {i < order.length - 1 && <span className={`w-0.5 flex-1 ${done ? 'bg-paper' : 'bg-line'}`} aria-hidden="true" />}
            </div>
            <div className="pb-6">
              <p className={`font-display text-base font-bold italic uppercase ${active ? 'text-signal' : done ? 'text-paper' : 'text-muted'}`}>
                {STATUS_LABELS[status]}
              </p>
              {evt && (
                <p className="text-sm text-muted">
                  {new Date(evt.at).toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          </li>
        );
      })}
      {cancelled && (
        <li className="flex gap-4">
          <span className="mt-1 h-4 w-4 shrink-0 rounded-full border-2 border-line bg-ink" aria-hidden="true" />
          <p className="font-display text-base font-bold italic uppercase text-muted line-through">Cancelado</p>
        </li>
      )}
    </ol>
  );
}
