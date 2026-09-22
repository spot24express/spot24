/**
 * SPOT 24 · Semilla del modo demo (sin Firebase configurado).
 * Catálogo realista de 8 categorías, 5 zonas de Caracas, tasa BCV simulada.
 * Sirve para desarrollo, previews de Netlify y demostraciones sin tocar datos.
 */
import type { Product, ProductVariant } from '@/features/catalog/types';
import type { Zone } from '@/features/delivery/types';
import type { BcvRate } from '@/shared/types';

const slugify = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const deaccent = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

interface SeedInput {
  name: string;
  brand: string;
  categoryId: string;
  description: string;
  images: string[];
  variants: Array<{ name: string; sku: string; priceUsd: number; stock: number; weightKg: number }>;
}

const RAW: SeedInput[] = [
  // 01 · Lubricantes
  {
    name: 'Aceite de motor sintético Valvoline', brand: 'Valvoline', categoryId: 'lubricantes',
    description: 'Sintético 100% para gasolina. Protección de arranque en frío y limpieza de pistones. Formato americano original.',
    images: ['/img/products/lubricantes.svg'],
    variants: [
      { name: '5W-30 · 5 QT', sku: 'VLV-5W30-5QT', priceUsd: 38.9, stock: 24, weightKg: 4.9 },
      { name: '10W-40 · 5 QT', sku: 'VLV-10W40-5QT', priceUsd: 34.5, stock: 18, weightKg: 4.9 },
      { name: '5W-40 · 1 QT', sku: 'VLV-5W40-1QT', priceUsd: 9.9, stock: 40, weightKg: 1.1 },
    ],
  },
  {
    name: 'Aceite semisintético Castrol Magnatec', brand: 'Castrol', categoryId: 'lubricantes',
    description: 'Moléculas inteligentes que se adhieren al metal desde el arranque. Ideal para tráfico urbano parado.',
    images: ['/img/products/lubricantes.svg'],
    variants: [
      { name: '5W-30 · 4 L', sku: 'CTR-MAG-5W30-4L', priceUsd: 29.9, stock: 15, weightKg: 3.9 },
      { name: '10W-30 · 4 L', sku: 'CTR-MAG-10W30-4L', priceUsd: 27.5, stock: 9, weightKg: 3.9 },
    ],
  },
  {
    name: 'Aceite ATF transmisión automática', brand: 'Mobil', categoryId: 'lubricantes',
    description: 'Mobil ATF 320 para cajas automáticas Dexron III. Cambio programado cada 40.000 km.',
    images: ['/img/products/lubricantes.svg'],
    variants: [{ name: '1 galón', sku: 'MBL-ATF320-GAL', priceUsd: 21.0, stock: 12, weightKg: 3.6 }],
  },
  {
    name: 'Aditivo refrigerante listo para usar', brand: 'Repsol', categoryId: 'lubricantes',
    description: 'Coolant orgánico -37 °C a +135 °C. Mezcla lista, no diluir. Protege bomba de agua y selladores.',
    images: ['/img/products/lubricantes.svg'],
    variants: [{ name: '1 galón', sku: 'RPS-COOL-GAL', priceUsd: 12.5, stock: 22, weightKg: 3.9 }],
  },
  // 02 · Filtros
  {
    name: 'Filtro de aceite original', brand: 'Wix', categoryId: 'filtros',
    description: 'Cartucho de alta retención (25 micras). Válvula antidrenaje de silicona. Rendimiento hasta 10.000 km.',
    images: ['/img/products/filtros.svg'],
    variants: [
      { name: 'Toyota 90915', sku: 'WIX-51334', priceUsd: 6.5, stock: 35, weightKg: 0.3 },
      { name: 'GM 25183779', sku: 'WIX-51042', priceUsd: 7.0, stock: 28, weightKg: 0.3 },
      { name: 'Ford 1S7Z', sku: 'WIX-51515', priceUsd: 7.5, stock: 4, weightKg: 0.3 },
    ],
  },
  {
    name: 'Filtro de aire de motor', brand: 'Mann-Filter', categoryId: 'filtros',
    description: 'Papel celulósico tratado, flujo optimizado. Renueva el aire de admisión en polvo de ciudad.',
    images: ['/img/products/filtros.svg'],
    variants: [
      { name: 'Corolla / Civic', sku: 'MANN-C25114', priceUsd: 11.9, stock: 16, weightKg: 0.4 },
      { name: 'Aveo / Sail', sku: 'MANN-C30105', priceUsd: 10.5, stock: 20, weightKg: 0.4 },
    ],
  },
  {
    name: 'Filtro de gasolina', brand: 'Denso', categoryId: 'filtros',
    description: 'Para inyección electrónica. Retiene partículas antes de la bomba. Cambio cada 20.000 km.',
    images: ['/img/products/filtros.svg'],
    variants: [{ name: 'Universal in-line', sku: 'DNS-GDF-220', priceUsd: 9.0, stock: 11, weightKg: 0.3 }],
  },
  {
    name: 'Filtro de cabina (polen y polvo)', brand: 'Mann-Filter', categoryId: 'filtros',
    description: 'Carbón activado contra olores y PM2.5. Aire limpio dentro del carro, siempre.',
    images: ['/img/products/filtros.svg'],
    variants: [{ name: 'Estándar', sku: 'MANN-CUK-2939', priceUsd: 13.9, stock: 8, weightKg: 0.3 }],
  },
  // 03 · Amortiguadores
  {
    name: 'Amortiguador delantero Gazoo', brand: 'KYB', categoryId: 'amortiguadores',
    description: 'Gas de nitrógeno a alta presión. Frenadas cortas y curvas firmes. Venta por unidad.',
    images: ['/img/products/amortiguadores.svg'],
    variants: [
      { name: 'Toyota Corolla 09-13', sku: 'KYB-339032', priceUsd: 78.0, stock: 6, weightKg: 4.2 },
      { name: 'Chevrolet Aveo 04-11', sku: 'KYB-341234', priceUsd: 72.0, stock: 4, weightKg: 4.0 },
    ],
  },
  {
    name: 'Amortiguador trasero Excel-G', brand: 'KYB', categoryId: 'amortiguadores',
    description: 'Twin-tube de precisión OEM. Estabilidad de carga y confort en badenes.',
    images: ['/img/products/amortiguadores.svg'],
    variants: [{ name: 'Corolla 09-13', sku: 'KYB-344321', priceUsd: 68.0, stock: 3, weightKg: 3.8 }],
  },
  {
    name: 'Kit de montes y topes de suspensión', brand: 'SKF', categoryId: 'amortiguadores',
    description: 'Kit de montaje con tope de goma, guarda polvo y cojinete. Instala con el amortiguador nuevo.',
    images: ['/img/products/amortiguadores.svg'],
    variants: [{ name: 'Par delantero', sku: 'SKF-VKDA-35311', priceUsd: 34.0, stock: 7, weightKg: 1.2 }],
  },
  // 04 · Baterías
  {
    name: 'Batería Duncan Platinum', brand: 'Duncan', categoryId: 'baterias',
    description: 'Libre mantenimiento, 650 A de arranque en frío. Garantía de fábrica 18 meses. Traemos y dejamos instalada.',
    images: ['/img/products/baterias.svg'],
    variants: [
      { name: '12V 75Ah', sku: 'DNC-PL-75', priceUsd: 89.0, stock: 10, weightKg: 18.5 },
      { name: '12V 60Ah', sku: 'DNC-PL-60', priceUsd: 69.0, stock: 8, weightKg: 14.8 },
    ],
  },
  {
    name: 'Batería Energizer Plus', brand: 'Energizer', categoryId: 'baterias',
    description: 'Placas de calcio, altísima resistencia al calor de ciudad. Ideal para vehículos con A/C fuerte.',
    images: ['/img/products/baterias.svg'],
    variants: [{ name: '12V 70Ah', sku: 'ENR-PL-70', priceUsd: 79.0, stock: 6, weightKg: 16.9 }],
  },
  {
    name: 'Batería Willard Power', brand: 'Willard', categoryId: 'baterias',
    description: 'Relación valor/arranque para carros compactos. Carga de fábrica lista para instalar.',
    images: ['/img/products/baterias.svg'],
    variants: [{ name: '12V 45Ah', sku: 'WLR-PW-45', priceUsd: 52.0, stock: 5, weightKg: 11.4 }],
  },
  // 05 · Cambio de aceite (servicio)
  {
    name: 'Cambio de aceite en tu domicilio', brand: 'SPOT 24 Service', categoryId: 'cambio-aceite',
    description: 'Técnico certificado en tu casa o trabajo: drenaje, filtro nuevo, nivel y revisión de 20 puntos. Incluye sellado y registro digital. Conecta este servicio con tu aceite elegido en Lubricantes.',
    images: ['/img/products/cambio-aceite.svg'],
    variants: [
      { name: 'Gasolina · incluye filtro Wix', sku: 'SVC-OIL-STD', priceUsd: 12.0, stock: 99, weightKg: 0.5 },
      { name: 'Camioneta / SUV · incluye filtro', sku: 'SVC-OIL-SUV', priceUsd: 16.0, stock: 99, weightKg: 0.6 },
    ],
  },
  {
    name: 'Rótación y balanceo de cauchos', brand: 'SPOT 24 Service', categoryId: 'cambio-aceite',
    description: 'Rótación en cruz y balanceo dinámico a domicilio con equipo portátil. Prolonga la vida del caucho.',
    images: ['/img/products/cambio-aceite.svg'],
    variants: [{ name: '4 cauchos', sku: 'SVC-ROT-4', priceUsd: 18.0, stock: 99, weightKg: 0.2 }],
  },
  {
    name: 'Escaneo computarizado OBD-II', brand: 'SPOT 24 Service', categoryId: 'cambio-aceite',
    description: 'Diagnóstico completo del motor con reporte digital y presupuesto transparente. Sin compromiso.',
    images: ['/img/products/cambio-aceite.svg'],
    variants: [{ name: 'Sesión 30 min', sku: 'SVC-OBD-30', priceUsd: 10.0, stock: 99, weightKg: 0.1 }],
  },
  // 06 · Bebidas
  {
    name: 'Refresco cola 2 L', brand: 'Coca-Cola', categoryId: 'bebidas',
    description: 'Bien frío, listo para el asiento de copiloto. Formato familiar.',
    images: ['/img/products/bebidas.svg'],
    variants: [
      { name: 'Botella 2 L', sku: 'BEB-COLA-2L', priceUsd: 2.5, stock: 48, weightKg: 2.1 },
      { name: 'Pack 6 × 350 ml', sku: 'BEB-COLA-P6', priceUsd: 6.5, stock: 20, weightKg: 2.4 },
    ],
  },
  {
    name: 'Agua mineral 600 ml', brand: 'Minalba', categoryId: 'bebidas',
    description: 'Hidratación de manantial. El básico del pit stop.',
    images: ['/img/products/bebidas.svg'],
    variants: [{ name: 'Pack 6 × 600 ml', sku: 'BEB-AGU-P6', priceUsd: 3.9, stock: 40, weightKg: 3.8 }],
  },
  {
    name: 'Maltín Polar', brand: 'Polar', categoryId: 'bebidas',
    description: 'La malta venezolana de siempre. Servida fría.',
    images: ['/img/products/bebidas.svg'],
    variants: [{ name: 'Pack 4 × 222 ml', sku: 'BEB-MAL-P4', priceUsd: 4.2, stock: 26, weightKg: 1.2 }],
  },
  {
    name: 'Energizante Fénix', brand: 'Fénix', categoryId: 'bebidas',
    description: 'Para la noche larga. Taurina + vitaminas B.',
    images: ['/img/products/bebidas.svg'],
    variants: [{ name: 'Lata 250 ml', sku: 'BEB-ENR-250', priceUsd: 2.0, stock: 32, weightKg: 0.3 }],
  },
  {
    name: 'Jugo natural naranja', brand: 'Zulia Fresh', categoryId: 'bebidas',
    description: 'Prensado del día, sin azúcar añadida. Produce local.',
    images: ['/img/products/bebidas.svg'],
    variants: [{ name: 'Botella 1 L', sku: 'BEB-JUG-1L', priceUsd: 3.2, stock: 14, weightKg: 1.1 }],
  },
  // 07 · Snacks
  {
    name: 'Papas fritas clásicas', brand: "Lay's", categoryId: 'snacks',
    description: 'Crujientes, sal perfecta. La compañera de ruta oficial.',
    images: ['/img/products/snacks.svg'],
    variants: [{ name: 'Bolsa 184 g', sku: 'SNK-PAP-184', priceUsd: 2.2, stock: 36, weightKg: 0.2 }],
  },
  {
    name: 'Cheetos queso', brand: 'Cheetos', categoryId: 'snacks',
    description: 'Queso intenso, danger level máximo.',
    images: ['/img/products/snacks.svg'],
    variants: [{ name: 'Bolsa 150 g', sku: 'SNK-CHT-150', priceUsd: 2.0, stock: 30, weightKg: 0.2 }],
  },
  {
    name: 'Mix de frutos secos', brand: 'Nutty Spot', categoryId: 'snacks',
    description: 'Almendra, cashew y pasa. Energía limpia para la carretera.',
    images: ['/img/products/snacks.svg'],
    variants: [{ name: 'Doypack 200 g', sku: 'SNK-MIX-200', priceUsd: 4.5, stock: 18, weightKg: 0.25 }],
  },
  // 08 · Café
  {
    name: 'Café espresso doble', brand: 'SPOT 24 Café', categoryId: 'cafe',
    description: 'Grano venezolano de tueste medio, extracción de 30 ml doble. Lo tomamos al pasar o para quedarte un rato.',
    images: ['/img/products/cafe.svg'],
    variants: [{ name: 'Taza 60 ml', sku: 'CAF-ESP-DBL', priceUsd: 1.5, stock: 999, weightKg: 0.1 }],
  },
  {
    name: 'Café molido tostado natural', brand: 'Fama de América', categoryId: 'cafe',
    description: 'El café de la casa para llevar a tu cocina. Molido medio para colado.',
    images: ['/img/products/cafe.svg'],
    variants: [{ name: 'Paquete 500 g', sku: 'CAF-FAM-500', priceUsd: 6.9, stock: 24, weightKg: 0.55 }],
  },
];

function buildProduct(input: SeedInput, index: number): Product & { variants: ProductVariant[] } {
  const id = `demo-${slugify(input.name)}`;
  const activeVariants = input.variants;
  const prices = activeVariants.map((v) => v.priceUsd);
  const product: Product = {
    id,
    slug: slugify(input.name),
    name: input.name,
    brand: input.brand,
    description: input.description,
    categoryId: input.categoryId,
    basePriceUsd: Math.min(...prices),
    images: input.images,
    searchTerms: [
      ...deaccent(input.name).split(/\s+/).filter((w) => w.length >= 3),
      deaccent(input.brand),
      deaccent(input.categoryId),
      slugify(input.name),
    ].filter((t, i, arr) => arr.indexOf(t) === i),
    stockTotal: activeVariants.reduce((acc, v) => acc + v.stock, 0),
    variantCount: activeVariants.length,
    active: true,
    createdAt: 1_700_000_000_000 + index * 86_400_000,
    updatedAt: 1_700_000_000_000 + index * 86_400_000,
  };
  const variants: ProductVariant[] = activeVariants.map((v, i) => ({
    id: `${id}--v${i + 1}`,
    name: v.name,
    sku: v.sku,
    priceUsd: v.priceUsd,
    stock: v.stock,
    weightKg: v.weightKg,
    active: true,
  }));
  return { ...product, variants };
}

export const DEMO_PRODUCTS: Array<Product & { variants: ProductVariant[] }> = RAW.map(buildProduct);

export const DEMO_ZONES: Zone[] = [
  {
    id: 'caracas-este', name: 'Caracas Este (Chacao, Baruta, El Hatillo)', state: 'Distrito Capital',
    feeUsd: 2.5, freeFromUsd: 40, weightRateUsdPerKg: 0.4, baseWeightKg: 5, maxWeightKg: 40,
    etaMinMinutes: 45, etaMaxMinutes: 90,
    windows: [
      { start: '08:00', end: '12:00', label: 'Mañana' },
      { start: '12:00', end: '18:00', label: 'Tarde' },
      { start: '18:00', end: '23:59', label: 'Noche 24/7' },
    ],
    active: true,
  },
  {
    id: 'caracas-centro', name: 'Caracas Centro y Libertador', state: 'Distrito Capital',
    feeUsd: 2.5, freeFromUsd: 35, weightRateUsdPerKg: 0.4, baseWeightKg: 5, maxWeightKg: 40,
    etaMinMinutes: 45, etaMaxMinutes: 100,
    windows: [
      { start: '08:00', end: '12:00', label: 'Mañana' },
      { start: '12:00', end: '18:00', label: 'Tarde' },
      { start: '18:00', end: '23:59', label: 'Noche 24/7' },
    ],
    active: true,
  },
  {
    id: 'caracas-oeste', name: 'Caracas Oeste (Propatria, Catia, 23 de Enero)', state: 'Distrito Capital',
    feeUsd: 3.0, freeFromUsd: 35, weightRateUsdPerKg: 0.5, baseWeightKg: 5, maxWeightKg: 40,
    etaMinMinutes: 60, etaMaxMinutes: 110,
    windows: [
      { start: '09:00', end: '13:00', label: 'Mañana' },
      { start: '13:00', end: '19:00', label: 'Tarde' },
      { start: '19:00', end: '23:59', label: 'Noche 24/7' },
    ],
    active: true,
  },
  {
    id: 'los-teques', name: 'Los Teques y San Antonio', state: 'Miranda',
    feeUsd: 4.0, freeFromUsd: 50, weightRateUsdPerKg: 0.6, baseWeightKg: 5, maxWeightKg: 35,
    etaMinMinutes: 90, etaMaxMinutes: 150,
    windows: [
      { start: '09:00', end: '14:00', label: 'Mañana' },
      { start: '14:00', end: '20:00', label: 'Tarde' },
    ],
    active: true,
  },
  {
    id: 'guarenas-guatire', name: 'Guarenas y Guatire', state: 'Miranda',
    feeUsd: 4.5, freeFromUsd: 55, weightRateUsdPerKg: 0.6, baseWeightKg: 5, maxWeightKg: 35,
    etaMinMinutes: 90, etaMaxMinutes: 160,
    windows: [
      { start: '09:00', end: '14:00', label: 'Mañana' },
      { start: '14:00', end: '20:00', label: 'Tarde' },
    ],
    active: true,
  },
];

/** Tasa demo (en producción la fija la Cloud Function programada del BCV). */
export const DEMO_BCV_RATE: BcvRate = {
  usdToVes: 232.5,
  updatedAt: Date.now() - 30 * 60 * 1000,
  source: 'fallback',
};
