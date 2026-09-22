import { useEffect } from 'react';

/** Título de documento consistente con la marca. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · SPOT 24`;
    return () => {
      document.title = 'SPOT 24 — Tu parada segura. 24/7';
    };
  }, [title]);
}
