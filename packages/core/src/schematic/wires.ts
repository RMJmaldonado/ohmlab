// Cables: agregarlos, ordenarlos, hacer que sigan a los pines que se mueven
// e intercalar un componente soltado encima de un cable.
import { isHorizontal, onInterior, onWire, pinPositions, pointKey, route, samePoint, type Point } from "./geometry.ts";
import type { Schematic, Wire } from "./types.ts";

/** Genera nombres de cable libres: wire-1, wire-2... (reutiliza los huecos). */
export function wireIdMaker(wires: Wire[]): () => string {
  const used = new Set(wires.map((w) => w.id));
  let n = 0;
  return () => {
    do n++;
    while (used.has(`wire-${n}`));
    used.add(`wire-${n}`);
    return `wire-${n}`;
  };
}

/**
 * Agrega un cable que pasa por esos puntos, un tramo recto por cada par.
 * Si dos puntos seguidos no están alineados, se agrega una esquina.
 */
export function addWire(schematic: Schematic, points: Point[]): Schematic {
  const nextId = wireIdMaker(schematic.wires);
  const added: Wire[] = [];
  for (let i = 1; i < points.length; i++) {
    let from = points[i - 1];
    for (const to of route(from, points[i], "h")) {
      added.push({ id: nextId(), a: [from[0], from[1]], b: [to[0], to[1]] });
      from = to;
    }
  }
  if (added.length === 0) return schematic;
  return normalizeWires({ ...schematic, wires: [...schematic.wires, ...added] });
}

/**
 * Camino en L hasta un punto sin pasar por encima de ninguna pieza. Prueba
 * primero el sentido pedido; si ese camino cruza el cuerpo de una pieza (la
 * línea entre sus pines) y el otro sentido no, usa el otro.
 */
export function routeAround(schematic: Schematic, from: Point, to: Point, first: "h" | "v"): Point[] {
  const preferred = route(from, to, first);
  if (preferred.length < 2) return preferred;
  const other = route(from, to, first === "h" ? "v" : "h");
  const bodies = schematic.components.flatMap((c) => {
    const [p, q] = Object.values(pinPositions(c));
    return q && (p[0] === q[0] || p[1] === q[1]) ? [[p, q] as const] : [];
  });
  const crosses = (path: Point[]) =>
    path.some((b, i) => {
      const a = i === 0 ? from : path[i - 1];
      return bodies.some(([p, q]) => overBody(a, b, p, q));
    });
  return crosses(preferred) && !crosses(other) ? other : preferred;
}

/** El tramo a-b toca el interior del cuerpo p-q (tocar sus pines no cuenta). */
function overBody(a: Point, b: Point, p: Point, q: Point): boolean {
  const axis = p[1] === q[1] ? 0 : 1; // 0: cuerpo horizontal, 1: vertical
  const across = 1 - axis;
  const [lo, hi] = [Math.min(p[axis], q[axis]), Math.max(p[axis], q[axis])];
  const [from, to] = [Math.min(a[axis], b[axis]), Math.max(a[axis], b[axis])];
  if (a[across] === p[across] && b[across] === p[across]) return from < hi && to > lo; // en la misma línea
  if (a[axis] !== b[axis]) return false; // paralelo, en otra línea
  // Perpendicular: lo cruza si pasa por dentro del cuerpo.
  const [c1, c2] = [Math.min(a[across], b[across]), Math.max(a[across], b[across])];
  return a[axis] > lo && a[axis] < hi && c1 <= p[across] && c2 >= p[across];
}

/**
 * Ordena los cables sin cambiar lo que se ve: quita los tramos de largo cero
 * y los repetidos, y une dos tramos en línea recta que se tocan en un punto
 * donde no hay nada más. Si no hay nada que ordenar, devuelve el mismo objeto.
 */
export function normalizeWires(schematic: Schematic): Schematic {
  const seen = new Set<string>();
  let wires = schematic.wires.filter((w) => {
    const ends = [pointKey(w.a), pointKey(w.b)].sort().join("|");
    if (samePoint(w.a, w.b) || seen.has(ends)) return false;
    seen.add(ends);
    return true;
  });
  const pins = new Set(schematic.components.flatMap((c) => Object.values(pinPositions(c)).map(pointKey)));

  for (let merged = true; merged; ) {
    merged = false;
    // Dos tramos sobre la misma línea que se pisan: queda uno que cubre a ambos.
    const overlap = findOverlap(wires);
    if (overlap) {
      const [w1, w2, union] = overlap;
      wires = wires.filter((w) => w !== w2).map((w) => (w === w1 ? union : w));
      merged = true;
      continue;
    }
    const endsAt = new Map<string, Wire[]>();
    for (const w of wires) for (const p of [w.a, w.b]) endsAt.set(pointKey(p), [...(endsAt.get(pointKey(p)) ?? []), w]);
    for (const [key, here] of endsAt) {
      if (here.length !== 2 || pins.has(key)) continue;
      const [w1, w2] = here;
      if (isHorizontal(w1) !== isHorizontal(w2)) continue; // es una esquina
      const point = samePoint(w1.a, w2.a) || samePoint(w1.a, w2.b) ? w1.a : w1.b;
      if (wires.some((w) => onInterior(point, w))) continue; // hay una unión en T
      const p = samePoint(w1.a, point) ? w1.b : w1.a;
      const q = samePoint(w2.a, point) ? w2.b : w2.a;
      wires = wires.filter((w) => w !== w1 && w !== w2);
      if (!samePoint(p, q)) wires.push({ id: w1.id, a: p, b: q });
      merged = true;
      break;
    }
  }

  const unchanged = wires.length === schematic.wires.length && wires.every((w, i) => w === schematic.wires[i]);
  return unchanged ? schematic : { ...schematic, wires };
}

/** Busca dos tramos en la misma línea que comparten más que un punto. */
function findOverlap(wires: Wire[]): [Wire, Wire, Wire] | null {
  const span = (w: Wire) => {
    const axis = isHorizontal(w) ? 0 : 1;
    return { axis, line: w.a[1 - axis], lo: Math.min(w.a[axis], w.b[axis]), hi: Math.max(w.a[axis], w.b[axis]) };
  };
  for (let i = 0; i < wires.length; i++) {
    const s1 = span(wires[i]);
    for (let j = i + 1; j < wires.length; j++) {
      const s2 = span(wires[j]);
      if (s1.axis !== s2.axis || s1.line !== s2.line || Math.max(s1.lo, s2.lo) >= Math.min(s1.hi, s2.hi)) continue;
      const point = (t: number): Point => (s1.axis === 0 ? [t, s1.line] : [s1.line, t]);
      const union = { id: wires[i].id, a: point(Math.min(s1.lo, s2.lo)), b: point(Math.max(s1.hi, s2.hi)) };
      return [wires[i], wires[j], union];
    }
  }
  return null;
}

/**
 * Mueve los extremos de cable que están en los puntos de `moves`. Si un
 * tramo queda en diagonal, se parte en dos con una esquina; el tramo que toca
 * el punto movido conserva su dirección, para que el cable siga entrando
 * igual al pin.
 */
export function followPoints(wires: Wire[], moves: Map<string, Point>, nextId: () => string): Wire[] {
  if (moves.size === 0) return wires;
  return wires.flatMap((w): Wire[] => {
    const a = moves.get(pointKey(w.a)) ?? w.a;
    const b = moves.get(pointKey(w.b)) ?? w.b;
    if (a === w.a && b === w.b) return [w];
    if (a[0] === b[0] || a[1] === b[1]) return [{ ...w, a, b }];
    const horizontal = isHorizontal(w);
    let corner: Point;
    if (a === w.a) corner = horizontal ? [a[0], b[1]] : [b[0], a[1]];
    else if (b === w.b) corner = horizontal ? [b[0], a[1]] : [a[0], b[1]];
    else corner = horizontal ? [b[0], a[1]] : [a[0], b[1]];
    return [
      { ...w, a, b: corner },
      { id: nextId(), a: corner, b },
    ];
  });
}

/** Tramo de cable que se quitaría al intercalar un componente. */
export interface Insertion {
  wire: string;
  from: Point;
  to: Point;
}

/**
 * Si un componente de dos pines quedó con ambos pines sobre el mismo cable,
 * devuelve el tramo entre los pines: quitándolo, el componente queda en
 * serie. No intercala si algo más toca ese tramo, porque se desconectaría.
 */
export function findInsertion(schematic: Schematic, componentId: string): Insertion | null {
  const component = schematic.components.find((c) => c.id === componentId);
  if (!component) return null;
  const pins = Object.values(pinPositions(component));
  if (pins.length !== 2) return null;
  const [p, q] = pins;
  const wire = schematic.wires.find((w) => onWire(p, w) && onWire(q, w));
  if (!wire) return null;

  const span = { a: p, b: q };
  const others = [
    ...schematic.components.filter((c) => c.id !== componentId).flatMap((c) => Object.values(pinPositions(c))),
    ...schematic.wires.filter((w) => w !== wire).flatMap((w) => [w.a, w.b]),
  ];
  if (others.some((point) => onInterior(point, span))) return null;
  return { wire: wire.id, from: p, to: q };
}

/** Intercala el componente en el cable que tiene debajo (ver findInsertion). */
export function insertIntoWire(schematic: Schematic, componentId: string): Schematic {
  const insertion = findInsertion(schematic, componentId);
  if (!insertion) return schematic;
  const wire = schematic.wires.find((w) => w.id === insertion.wire)!;
  const axis = isHorizontal(wire) ? 0 : 1;
  const coord = (point: Point) => point[axis];
  // Extremos del cable y de los pines, ordenados a lo largo del cable.
  const [start, end] = [wire.a, wire.b].sort((m, n) => coord(m) - coord(n));
  const [near, far] = [insertion.from, insertion.to].sort((m, n) => coord(m) - coord(n));
  const nextId = wireIdMaker(schematic.wires);
  const pieces: Wire[] = [
    { id: wire.id, a: start, b: near },
    { id: nextId(), a: far, b: end },
  ].filter((w) => !samePoint(w.a, w.b));
  const wires = schematic.wires.flatMap((w) => (w === wire ? pieces : [w]));
  return normalizeWires({ ...schematic, wires });
}
