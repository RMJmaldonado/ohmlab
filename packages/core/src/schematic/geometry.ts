// Geometría de los símbolos: dónde queda cada pin según la posición, el giro
// y el volteo del componente. En la pantalla el eje y apunta hacia abajo,
// así que "horario" es lo que se ve como horario.
import { getComponentDef } from "../components/index.ts";
import type { PlacedComponent, Point, Rotation, Wire } from "./types.ts";

export type { Point };

/** Aplica volteo y giro a un punto del símbolo (sin mover el origen). */
export function orient([x, y]: Point, rotation: Rotation, mirror: boolean): Point {
  let px = mirror ? -x : x;
  let py = y;
  for (let r = 0; r < rotation; r += 90) [px, py] = [-py, px]; // 90° en sentido horario
  return [px + 0, py + 0]; // "+ 0" convierte -0 en 0
}

/** Posición de cada pin en la grilla. */
export function pinPositions(component: PlacedComponent): Record<string, Point> {
  const def = getComponentDef(component.type);
  const result: Record<string, Point> = {};
  for (const [pin, offset] of Object.entries(def.symbol.pins)) {
    const [dx, dy] = orient(offset, component.rotation, component.mirror);
    result[pin] = [component.x + dx, component.y + dy];
  }
  return result;
}

/**
 * Hacia dónde sale el cable de un pin: horizontal si el pin está a un lado
 * del símbolo (resistencia), vertical si está arriba o abajo (fuente).
 */
export function pinAxis(component: PlacedComponent, pin: string): "h" | "v" {
  const [dx, dy] = orient(getComponentDef(component.type).symbol.pins[pin], component.rotation, component.mirror);
  return Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
}

export function rotate(rotation: Rotation, direction: "cw" | "ccw"): Rotation {
  return (((rotation + (direction === "cw" ? 90 : 270)) % 360) as Rotation);
}

/** Clave de texto de un punto, para usarlo en Map y Set. */
export const pointKey = ([x, y]: Point): string => `${x},${y}`;

export const samePoint = (p: Point, q: Point): boolean => p[0] === q[0] && p[1] === q[1];

export const isHorizontal = (w: Pick<Wire, "a" | "b">): boolean => w.a[1] === w.b[1];

/** El punto está sobre el tramo, sin contar sus extremos. */
export function onInterior([x, y]: Point, { a, b }: Pick<Wire, "a" | "b">): boolean {
  if (a[1] === b[1]) return y === a[1] && x > Math.min(a[0], b[0]) && x < Math.max(a[0], b[0]);
  return x === a[0] && y > Math.min(a[1], b[1]) && y < Math.max(a[1], b[1]);
}

/** El punto está sobre el tramo, contando sus extremos. */
export const onWire = (p: Point, w: Pick<Wire, "a" | "b">): boolean => samePoint(p, w.a) || samePoint(p, w.b) || onInterior(p, w);

/**
 * Camino con ángulos rectos de un punto a otro: recto si están alineados, o
 * con una esquina. `first` dice si el primer tramo va horizontal o vertical.
 * Devuelve los puntos después del inicio (la esquina, si hay, y el final).
 */
export function route(from: Point, to: Point, first: "h" | "v"): Point[] {
  if (samePoint(from, to)) return [];
  if (from[0] === to[0] || from[1] === to[1]) return [to];
  return [first === "h" ? [to[0], from[1]] : [from[0], to[1]], to];
}
