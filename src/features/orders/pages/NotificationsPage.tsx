/**
 * Notificaciones (5.90) — historial in-app de avisos del CLIENTE, abierto
 * por la campana de la barra (solo PC/tablet). Cada aviso es el MISMO texto
 * que viaja en el push («SPOT 24 · Pago confirmado»…), guardado por el
 * servidor en users/{uid}/notifs; aquí se lee EN VIVO y al entrar se marcan
 * todos como leídos (la campana se apaga en toda la app al instante).
 *
 * El punto rojo de la lista se congela con el umbral de lectura DEL MOMENTO
 * de abrir: aunque markAllRead() adelante la marca, el cliente sigue viendo
 * cuáles avisos eran nuevos en esta visita (la próxima ya salen limpios).
 */
import { useEffect, useState } from 'react';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { EmptyState, ErrorState } from '@/shared/components/ui/States';
import { Button } from '@/shared/components/ui/Button';
import { ListSkeleton } from '@/shared/components/ui/Skeleton';
import { SpeedDivider } from '@/shared/components/brand/Logo';
import { STATUS_LABELS } from '@/shared/constants/orders';
import type { OrderStatus } from '@/shared/constants/orders';
import { fechaCortaNotif } from '../services/notifs.service';
import { useNotifs } from '../hooks/useNotifs';
import { useNotifsStore } from '../store/notifs.store';
import { BRAND } from '@/shared/constants/brand';

export default function NotificationsPage() {
  useDocumentTitle('Notificaciones');
  const { notifs, ready, failed, stale, markAllRead } = useNotifs();
  const lastReadMs = useNotifsStore((s) => s.lastReadMs);
  const lastReadLoaded = useNotifsStore((s) => s.lastReadLoaded);
  const [umbral, setUmbral] = useState<number | null>(null);
  const [marcadas, setMarcadas] = useState(false);

  useEffect(() => {
    // Umbral congelado UNA vez, cuando la marca de lectura ya cargó del doc
    // del usuario: los avisos posteriores a la ÚLTIMA VISITA llevan punto
    // rojo en ESTA visita. Detrás (y solo una vez) se adelanta la marca a
    // AHORA → la campana se apaga al instante en toda la app.
    if (umbral !== null || !lastReadLoaded || marcadas) return;
    setUmbral(lastReadMs);
    setMarcadas(true);
    void markAllRead();
  }, [umbral, lastReadLoaded, lastReadMs, marcadas, markAllRead]);

  const haySinLeer = umbral !== null && notifs.some((n) => n.createdAtMs > umbral);

  return (
    <div className="spot-container py-8 sm:py-10">
      <header>
        <p className="spot-label text-signal">{BRAND.slogan}</p>
        <h1 className="mt-1 font-display text-3xl font-bold italic uppercase text-paper">
          Notificaciones
        </h1>
        <p className="mt-2 max-w-lg text-body-base text-muted">
          El seguimiento de tus pedidos, guardado aquí para que lo consultes
          cuando quieras. Los avisos del teléfono y esta lista son los mismos.
        </p>
      </header>

      <SpeedDivider className="my-6" />

      {failed && notifs.length === 0 && (
        <ErrorState
          message="No pudimos traer tus avisos."
          onRetry={() => {
            // Reabre el canal del historial para el usuario en sesión.
            useNotifsStore.getState().startFor(useNotifsStore.getState().uid);
          }}
        />
      )}

      {!failed && !ready && <ListSkeleton rows={4} />}

      {/* 5.90.1 · Canal en vivo caído CON datos en pantalla: NUNCA silencio.
          La lista sigue visible (lo último que llegó) y el store ya está
          reconectando solo con backoff; el botón fuerza el reenganche ya. */}
      {stale && notifs.length > 0 && (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-brand-lg border-2 border-signal/40 bg-signal/5 px-4 py-3"
        >
          <p className="text-body-sm text-paper">
            Se cortó la conexión en vivo: esta lista puede estar
            desactualizada. Reconectando…
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              const st = useNotifsStore.getState();
              st.startFor(st.uid);
            }}
          >
            Reintentar
          </Button>
        </div>
      )}

      {ready && !failed && notifs.length === 0 && (
        <EmptyState
          title="Sin avisos por ahora"
          message="Cuando hagas un pedido, cada paso —pago confirmado, en camino, entregado— quedará aquí."
        />
      )}

      {notifs.length > 0 && (
        <ul className="space-y-3" aria-label="Historial de notificaciones">
          {notifs.map((n) => {
            const esNueva = umbral !== null && n.createdAtMs > umbral;
            const etiqueta = STATUS_LABELS[n.status as OrderStatus];
            return (
              <li
                key={n.id}
                className={`relative rounded-brand-lg border-2 bg-surface-1 p-4 pl-5 transition ${esNueva ? 'border-signal/50' : 'border-line'}`}
              >
                {esNueva && (
                  <span
                    aria-label="Nuevo"
                    className="absolute left-2 top-5 h-2 w-2 rounded-full bg-signal"
                  />
                )}
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h2 className="font-display text-base font-bold text-paper">{n.title}</h2>
                  <time
                    dateTime={new Date(n.createdAtMs).toISOString()}
                    className="text-xs text-muted"
                  >
                    {fechaCortaNotif(n.createdAtMs)}
                  </time>
                </div>
                <p className="mt-1 text-body-sm text-muted">{n.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {etiqueta && (
                    <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold uppercase tracking-label text-paper">
                      {etiqueta}
                    </span>
                  )}
                  {n.code && (
                    <span className="text-[11px] font-semibold uppercase tracking-label text-muted">
                      #{n.code}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Transparencia del dato: cuántos eran nuevos en esta visita. */}
      {haySinLeer && (
        <p className="mt-4 text-center text-xs text-muted">
          Los avisos marcados eran nuevos cuando abriste esta página.
        </p>
      )}
    </div>
  );
}
