// Valores escritos por el estudiante: "4.7k", "4,7k", "4k7", "10m", "2u",
// "1M", "12V"... Como en clase y en la mayoría de los simuladores para
// estudiantes, la M mayúscula es mega y la m minúscula es mili (en SPICE "M"
// es mili: OhmLab siempre le pasa a ngspice el número ya convertido).

const FACTORS: Record<string, number> = {
  f: 1e-15,
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  "µ": 1e-6, // signo micro
  "μ": 1e-6, // letra griega mu
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
};

const PREFIX = "[fpnuµμmkKMGT]";
const NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?`;
const WITH_PREFIX = new RegExp(`^(${NUMBER})(${PREFIX})?$`);
/** Notación de los códigos de resistencias: 4k7 = 4.7k, 2M2 = 2.2M. */
const PREFIX_AS_POINT = new RegExp(`^([+-]?\\d+)(${PREFIX})(\\d+)$`);

/**
 * Lee un valor con prefijo SI y, opcionalmente, su unidad al final. Acepta
 * coma o punto decimal. Devuelve null si no es un número.
 */
export function parseValue(text: string, unit = ""): number | null {
  let s = text.replace(/\s+/g, "");
  // La unidad al final es opcional: "4.7kΩ", "12V", "100ohm".
  const units = [unit, "ohms", "ohm", "Ω", "Ω"].filter(Boolean).sort((a, b) => b.length - a.length);
  const suffix = units.find((u) => s.toLowerCase().endsWith(u.toLowerCase()) && s.length > u.length);
  if (suffix) s = s.slice(0, -suffix.length);
  if (s === "") return null;

  // Coma decimal (4,7k). Con coma y punto a la vez no se sabe cuál es cuál.
  if (s.includes(",")) {
    if (s.includes(".") || s.indexOf(",") !== s.lastIndexOf(",")) return null;
    s = s.replace(",", ".");
  }
  // "meg" es como SPICE escribe mega.
  s = s.replace(/meg$/i, "M");

  let value: number | null = null;
  const asPoint = PREFIX_AS_POINT.exec(s);
  const plain = WITH_PREFIX.exec(s);
  if (asPoint) value = Number(`${asPoint[1]}.${asPoint[3]}`) * FACTORS[asPoint[2]];
  else if (plain) value = Number(plain[1]) * (plain[2] ? FACTORS[plain[2]] : 1);
  return value !== null && Number.isFinite(value) ? value : null;
}

const INPUT_PREFIXES: [number, string][] = [
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
 * Escribe un valor para editarlo en una casilla: con prefijo, sin unidad y
 * sin redondear de más (2200 → "2.2k", 1e9 → "1G", 0.01 → "10m").
 */
export function formatInput(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "0";
  const abs = Math.abs(value);
  const [factor, prefix] = INPUT_PREFIXES.find(([f]) => abs >= f * (1 - 1e-9)) ?? INPUT_PREFIXES[INPUT_PREFIXES.length - 1];
  return `${Number((value / factor).toPrecision(6))}${prefix}`;
}
