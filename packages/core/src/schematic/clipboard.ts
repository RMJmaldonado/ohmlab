// Copiar y pegar (Ctrl+C / Ctrl+V): piezas y cables con nombres nuevos.
import { getComponentDef } from "../components/index.ts";
import { nextId } from "./edit.ts";
import { pinPositions, pointKey, type Point } from "./geometry.ts";
import type { PlacedComponent, Schematic, Wire } from "./types.ts";
import { normalizeWires, wireIdMaker } from "./wires.ts";

/** Lo copiado: una copia independiente, que no cambia si se edita el dibujo. */
export interface Clip {
  components: PlacedComponent[];
  wires: Wire[];
}

/**
 * Copia lo seleccionado. Además de los cables seleccionados, copia los que
 * unen piezas copiadas entre sí (aunque tengan esquinas); los que llegan a
 * piezas que no se copian se quedan fuera. Devuelve null si no hay nada.
 */
export function copyItems(schematic: Schematic, ids: Iterable<string>): Clip | null {
  const set = new Set(ids);
  const components = schematic.components.filter((c) => set.has(c.id));
  const pins = new Set(components.flatMap((c) => Object.values(pinPositions(c)).map(pointKey)));

  // Se descartan, una y otra vez, los cables con una punta que no llega ni a
  // un pin copiado ni a otro cable que se esté copiando.
  let wires = schematic.wires;
  for (let changed = true; changed; ) {
    const ends = new Map<string, number>();
    for (const w of wires) for (const p of [w.a, w.b]) ends.set(pointKey(p), (ends.get(pointKey(p)) ?? 0) + 1);
    const covered = (p: Point) => pins.has(pointKey(p)) || ends.get(pointKey(p))! > 1;
    const kept = wires.filter((w) => set.has(w.id) || (covered(w.a) && covered(w.b)));
    changed = kept.length !== wires.length;
    wires = kept;
  }

  if (components.length === 0 && wires.length === 0) return null;
  return structuredClone({ components, wires });
}

/** Esquina superior izquierda de lo copiado: el punto que se lleva al cursor al pegar. */
export function clipAnchor(clip: Clip): Point {
  const points: Point[] = [...clip.components.map((c): Point => [c.x, c.y]), ...clip.wires.flatMap((w) => [w.a, w.b])];
  return [Math.min(...points.map(([x]) => x)), Math.min(...points.map(([, y]) => y))];
}

/** Pega lo copiado desplazado (dx, dy), con nombres nuevos. Devuelve los nombres pegados. */
export function pasteItems(schematic: Schematic, clip: Clip, dx: number, dy: number): { schematic: Schematic; ids: string[] } {
  [dx, dy] = [Math.round(dx), Math.round(dy)];
  let result: Schematic = schematic;
  const ids: string[] = [];
  for (const c of clip.components) {
    const id = nextId(result, getComponentDef(c.type).prefix);
    result = { ...result, components: [...result.components, { ...structuredClone(c), id, x: c.x + dx, y: c.y + dy }] };
    ids.push(id);
  }
  const nextWire = wireIdMaker(result.wires);
  const wires = clip.wires.map((w): Wire => ({ id: nextWire(), a: [w.a[0] + dx, w.a[1] + dy], b: [w.b[0] + dx, w.b[1] + dy] }));
  ids.push(...wires.map((w) => w.id));
  result = normalizeWires({ ...result, wires: [...result.wires, ...wires] });
  // Al ordenar los cables, alguno pegado pudo unirse con otro: solo se devuelven los que siguen.
  const present = new Set([...result.components.map((c) => c.id), ...result.wires.map((w) => w.id)]);
  return { schematic: result, ids: ids.filter((id) => present.has(id)) };
}
