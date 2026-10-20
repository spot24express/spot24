/**
 * SPOT 24 · Copiar al portapapeles con respaldo (ronda 5.75).
 * La Clipboard API async solo existe en contextos seguros (https) y en
 * navegadores modernos; los WebViews viejos y `netlify dev` (http) caen al
 * respaldo con textarea + execCommand. Devuelve true SOLO si el texto
 * realmente llegó al portapapeles: el toast del checkout depende de esto.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* permiso denegado o API a medias: cae al respaldo */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
