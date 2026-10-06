/**
 * Utilidades de presentación de nombres de producto (UI).
 * Una sola fuente de verdad para catálogo y carrito: la marca vive en su
 * campo propio y NO se repite dentro del nombre visible.
 */

/**
 * Quita la marca del inicio del nombre para no repetirla en la tarjeta.
 * Regla conservadora, sin regex dinámicas:
 * · Si el PRIMER token del nombre ES la marca → se elimina ese token.
 *   («POLAR Caroreña Verano» + marca POLAR → «Caroreña Verano»)
 * · Si el primer token empieza con la marca pegada (admin la comprimió al
 *   escribir) y la sobra son ≤3 letras → también se elimina.
 *   («POLARCAR Caroreña Verano» + marca POLAR → «Caroreña Verano»)
 * · Cualquier otro caso se devuelve tal cual; un nombre de un solo token
 *   jamás se vacía (si el nombre ES la marca, queda igual).
 */
export function cleanProductName(name: string, brand: string): string {
  const nameTrimmed = name.trim();
  const brandTrimmed = brand.trim();
  if (!nameTrimmed || !brandTrimmed) return nameTrimmed;
  const [first, ...rest] = nameTrimmed.split(/\s+/);
  if (!first || rest.length === 0) return nameTrimmed; // un solo token: no se toca
  const firstLower = first.toLowerCase();
  const brandLower = brandTrimmed.toLowerCase();
  const gluedExtra = firstLower.length - brandLower.length; // sobra tras la marca
  const isBrandToken = firstLower === brandLower;
  const isGluedBrand =
    firstLower.startsWith(brandLower) && gluedExtra > 0 && gluedExtra <= 3;
  if (!isBrandToken && !isGluedBrand) return nameTrimmed;
  const cleaned = rest.join(' ');
  return cleaned || nameTrimmed;
}