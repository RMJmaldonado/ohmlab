// Archivos de OhmLab (.ohmlab): el esquemático en JSON legible. Un archivo
// puede venir de cualquier lado, así que al abrirlo se revisa todo: si algo
// no cuadra, se explica qué y no se abre (nunca se abre "a medias").
import { findComponentDef } from "../components/index.ts";
import type { PlacedComponent, Point, Rotation, Schematic, Wire } from "./types.ts";
import { normalizeWires } from "./wires.ts";

export const FILE_EXTENSION = "ohmlab";
/** Más que esto no es un circuito de estudiante: se rechaza sin leerlo entero. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_COMPONENTS = 5000;
const MAX_WIRES = 20000;
const MAX_COORD = 100000;

/** Escribe el esquemático como texto para guardarlo. */
export function serializeSchematic(schematic: Schematic): string {
  const file = { format: "ohmlab", version: schematic.version, components: schematic.components, wires: schematic.wires };
  return `${JSON.stringify(file, null, 2)}\n`;
}

export type ParsedFile = { ok: true; schematic: Schematic } | { ok: false; error: string };

/** Lee un archivo .ohmlab. Devuelve el esquemático o por qué no se puede abrir. */
export function parseSchematicFile(text: string): ParsedFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "El archivo está dañado o no es un circuito de OhmLab (no se puede leer como texto JSON)." };
  }
  if (!isObject(data) || data.format !== "ohmlab") return { ok: false, error: "El archivo no es un circuito de OhmLab." };
  if (typeof data.version !== "number") return { ok: false, error: "Al archivo le falta la versión del formato." };
  if (data.version > 1) {
    return { ok: false, error: "El archivo se guardó con una versión más nueva de OhmLab. Actualiza OhmLab para abrirlo." };
  }
  const result = validateSchematic({ version: 1, components: data.components, wires: data.wires });
  return typeof result === "string" ? { ok: false, error: result } : { ok: true, schematic: result };
}

/**
 * Revisa que algo sea un esquemático válido (lo usa el proceso principal
 * con lo que llega de la ventana y de los archivos). Devuelve el esquemático
 * limpio o un mensaje con el problema.
 */
export function validateSchematic(value: unknown): Schematic | string {
  if (!isObject(value) || !Array.isArray(value.components) || !Array.isArray(value.wires)) {
    return "Faltan los componentes o los cables.";
  }
  if (value.components.length > MAX_COMPONENTS || value.wires.length > MAX_WIRES) {
    return "El circuito es demasiado grande para OhmLab.";
  }

  const components: PlacedComponent[] = [];
  const ids = new Set<string>();
  for (const [i, c] of value.components.entries()) {
    const where = isObject(c) && typeof c.id === "string" ? `El componente ${c.id}` : `El componente n.º ${i + 1}`;
    if (!isObject(c)) return `${where} está dañado.`;
    if (typeof c.id !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(c.id)) return `${where} tiene un nombre no válido.`;
    if (ids.has(c.id)) return `Hay dos componentes llamados ${c.id}.`;
    ids.add(c.id);
    const def = typeof c.type === "string" ? findComponentDef(c.type) : undefined;
    if (!def) return `${where} es de un tipo que esta versión de OhmLab no conoce («${String(c.type)}»).`;
    if (!isCoord(c.x) || !isCoord(c.y)) return `${where} tiene una posición no válida.`;
    if (![0, 90, 180, 270].includes(c.rotation as number) || typeof c.mirror !== "boolean") return `${where} tiene un giro no válido.`;
    const params: Record<string, number> = {};
    const given = isObject(c.params) ? c.params : {};
    for (const p of def.params) {
      // Si falta, se usa el valor de fábrica; si está pero vacío (null), el archivo está dañado.
      const v = p.id in given ? given[p.id] : p.default;
      if (typeof v !== "number" || !Number.isFinite(v)) return `${where} tiene un valor no válido en «${p.label}».`;
      params[p.id] = v;
    }
    components.push({ id: c.id, type: def.type, params, x: c.x as number, y: c.y as number, rotation: c.rotation as Rotation, mirror: c.mirror });
  }

  const wires: Wire[] = [];
  const wireIds = new Set<string>();
  for (const [i, w] of value.wires.entries()) {
    const where = `El cable n.º ${i + 1}`;
    if (!isObject(w) || typeof w.id !== "string" || !/^wire-\d{1,9}$/.test(w.id) || wireIds.has(w.id)) return `${where} está dañado.`;
    wireIds.add(w.id);
    if (!isPoint(w.a) || !isPoint(w.b)) return `${where} tiene una posición no válida.`;
    if (w.a[0] !== w.b[0] && w.a[1] !== w.b[1]) return `${where} está en diagonal: los cables de OhmLab son horizontales o verticales.`;
    wires.push({ id: w.id, a: [w.a[0], w.a[1]], b: [w.b[0], w.b[1]] });
  }

  return normalizeWires({ version: 1, components, wires });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCoord(value: unknown): value is number {
  return Number.isInteger(value) && Math.abs(value as number) <= MAX_COORD;
}

function isPoint(value: unknown): value is Point {
  return Array.isArray(value) && value.length === 2 && isCoord(value[0]) && isCoord(value[1]);
}
