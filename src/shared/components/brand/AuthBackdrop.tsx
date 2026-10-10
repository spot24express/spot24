import { type ReactNode } from 'react';

/**
 * Fondo fotográfico compartido (ronda 5.14): la insignia SPOT 24 pintada en
 * el asfalto con el velo ink de marca, idéntico en Entrar, Crear cuenta y
 * Recuperar clave, para que toda la familia de autenticación comparta un
 * único tratamiento visual y la transición entre pantallas no parpadee.
 * Al ser la misma imagen, el navegador la descarga UNA sola vez (caché).
 * En el éxito del pedido se pasa otra foto del local con el MISMO velo para
 * variar el momento sin romper la marca.
 * Uso: <AuthBackdrop>…tarjeta…</AuthBackdrop> (por defecto, la insignia).
 */
export function AuthBackdrop({
  image = '/img/local-insignia.jpg',
  children,
}: {
  /** Ruta de la foto de fondo (debe vivir en /public/img). */
  image?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-[75dvh] items-center justify-center overflow-hidden py-10">
      {/* Fondo: foto real del local con el velo de marca encima */}
      <img
        src={image}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-ink via-ink/75 to-ink/55"
      />

      <div className="spot-container relative flex justify-center">{children}</div>
    </div>
  );
}