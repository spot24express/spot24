/**
 * Hook público del historial de avisos (5.90). Conecta el canal UNA vez por
 * sesión (el store es global: campana y página comparten el MISMO listener)
 * y expone lo que la UI necesita: lista, conteo de no leídos (punto rojo),
 * estados de carga/fallo («stale» = canal caído con datos en pantalla,
 * 5.90.1) y la acción de marcar todo como leído.
 */
import { useEffect, useMemo } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { contarNoLeidas } from '../services/notifs.service';
import { useNotifsStore } from '../store/notifs.store';

export function useNotifs() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  useEffect(() => {
    // login/cambio de cuenta → abre canal; logout (null) → cierra y limpia.
    useNotifsStore.getState().startFor(uid);
  }, [uid]);

  const notifs = useNotifsStore((s) => s.notifs);
  const lastReadMs = useNotifsStore((s) => s.lastReadMs);
  const ready = useNotifsStore((s) => s.ready);
  const failed = useNotifsStore((s) => s.failed);
  const stale = useNotifsStore((s) => s.stale);

  const unread = useMemo(() => contarNoLeidas(notifs, lastReadMs), [notifs, lastReadMs]);
  const markAllRead = useMemo(
    () => () => useNotifsStore.getState().markAllRead(),
    [],
  );

  return { notifs, unread, ready, failed, stale, markAllRead };
}
