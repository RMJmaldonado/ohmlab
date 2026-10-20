// Formato de valores con prefijos del SI: 0.006 A → "6 mA".

const PREFIXES: [number, string][] = [
  [1e9, "G"],
  [1e6, "M"],
  [1e3, "k"],
  [1, ""],
  [1e-3, "m"],
  [1e-6, "µ"],
  [1e-9, "n"],
  [1e-12, "p"],
];

/**
 * Escribe un valor con prefijo SI y 4 cifras significativas.
 * `locale` decide el separador decimal ("es-PE" → 4.615, "es-ES" → 4,615);
 * si falta, se usa el del sistema.
 */
export function formatSI(value: number, unit: string, locale?: string): string {
  if (!Number.isFinite(value)) return "—";
  // Por debajo de 1 fA se considera cero: evita mostrar restos de redondeo.
  if (Math.abs(value) < 1e-15) return `0 ${unit}`;
  const abs = Math.abs(value);
  // 0.9995 para que 999.96 se muestre como "1 k" y no como "1000".
  const [factor, prefix] = PREFIXES.find(([f]) => abs >= f * 0.9995) ?? PREFIXES[PREFIXES.length - 1];
  const number = new Intl.NumberFormat(locale, { maximumSignificantDigits: 4 }).format(value / factor);
  return `${number} ${prefix}${unit}`;
}
