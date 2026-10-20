// Cambios sobre el esquemático. Cada función devuelve un esquemático nuevo
// sin modificar el anterior: así deshacer y rehacer es guardar versiones.
import { componentDefs, getComponentDef } from "../components/index.ts";
import { onInterior, pinPositions, pointKey, rotate, samePoint, type Point } from "./geometry.ts";
import type { PlacedComponent, Schematic } from "./types.ts";
import { followPoints, normalizeWires, wireIdMaker } from "./wires.ts";

/** Primer nombre libre con ese prefijo: R1, R2... (reutiliza los huecos). */
export function nextId(schematic: Schematic, prefix: string): string {
  const used = new Set(schematic.components.map((c) => c.id));
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
}

export function addComponent(
  schematic: Schematic,
  type: string,
  x: number,
  y: number,
  orientation: Pick<PlacedComponent, "rotation" | "mirror"> = { rotation: 0, mirror: false },
): { schematic: Schematic; id: string } {
  const def = getComponentDef(type);
  const id = nextId(schematic, def.prefix);
  const params = Object.fromEntries(def.params.map((p) => [p.id, p.default]));
  const component: PlacedComponent = { id, type, params, x: Math.round(x), y: Math.round(y), ...orientation };
  return { schematic: { ...schematic, components: [...schematic.components, component] }, id };
}

/**
 * Mueve componentes y cables (por su nombre). Los cables unidos a lo que se
 * mueve lo siguen: se estiran o se doblan para no desconectarse.
 */
export function moveItems(schematic: Schematic, ids: Iterable<string>, dx: number, dy: number): Schematic {
  const set = new Set(ids);
  [dx, dy] = [Math.round(dx), Math.round(dy)];
  if (set.size === 0 || (dx === 0 && dy === 0)) return schematic;

  const moves = new Map<string, Point>();
  const shift = (p: Point) => moves.set(pointKey(p), [p[0] + dx, p[1] + dy]);
  for (const c of schematic.components) if (set.has(c.id)) Object.values(pinPositions(c)).forEach(shift);
  const movedWires = schematic.wires.filter((w) => set.has(w.id));
  for (const w of movedWires) [w.a, w.b].forEach(shift);
  // Los cables que llegan en T a un cable que se mueve también lo siguen.
  for (const w of schematic.wires) {
    for (const p of [w.a, w.b]) if (movedWires.some((m) => onInterior(p, m))) shift(p);
  }

  const components = schematic.components.map((c) => (set.has(c.id) ? { ...c, x: c.x + dx, y: c.y + dy } : c));
  const wires = followPoints(schematic.wires, moves, wireIdMaker(schematic.wires));
  return normalizeWires({ ...schematic, components, wires });
}

/** Gira cada componente sobre su propio origen (Ctrl+R / Ctrl+Shift+R). */
export function rotateComponents(schematic: Schematic, ids: Iterable<string>, direction: "cw" | "ccw"): Schematic {
  return update(schematic, new Set(ids), (c) => ({ ...c, rotation: rotate(c.rotation, direction) }));
}

/**
 * Voltea cada componente como en un espejo (Alt+X horizontal, Alt+Y
 * vertical). Voltear en vertical es voltear en horizontal y girar 180°.
 */
export function flipComponents(schematic: Schematic, ids: Iterable<string>, axis: "horizontal" | "vertical"): Schematic {
  return update(schematic, new Set(ids), (c) => {
    const turned = c.rotation === 90 || c.rotation === 270;
    // Con el componente girado 90°, el espejo "horizontal" de la pantalla es el vertical del símbolo.
    const needsHalfTurn = (axis === "vertical") !== turned;
    return { ...c, mirror: !c.mirror, rotation: needsHalfTurn ? rotate(rotate(c.rotation, "cw"), "cw") : c.rotation };
  });
}

/** Borra componentes y cables. Los cables que llegaban a un componente borrado quedan sueltos. */
export function deleteItems(schematic: Schematic, ids: Iterable<string>): Schematic {
  const set = new Set(ids);
  if (set.size === 0) return schematic;
  return normalizeWires({
    ...schematic,
    components: schematic.components.filter((c) => !set.has(c.id)),
    wires: schematic.wires.filter((w) => !set.has(w.id)),
  });
}

export function setParam(schematic: Schematic, id: string, param: string, value: number): Schematic {
  return update(schematic, new Set([id]), (c) => ({ ...c, params: { ...c.params, [param]: value } }));
}

/**
 * Cambia el nombre de un componente. Devuelve un mensaje si no se puede
 * (vacío, con caracteres raros o repetido).
 */
export function renameComponent(schematic: Schematic, id: string, newId: string): Schematic | string {
  const name = newId.trim();
  if (name === id) return schematic;
  if (!/^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(name)) {
    return "El nombre debe empezar con una letra y tener solo letras, números o _ (máximo 16).";
  }
  if (schematic.components.some((c) => c.id === name)) return `Ya hay un componente llamado ${name}.`;
  return update(schematic, new Set([id]), (c) => ({ ...c, id: name }));
}

/**
 * Cambia el tipo manteniendo nombre y posición (lo usa el selector V / A / Ω
 * del multímetro). Los parámetros que no existan en el tipo nuevo se
 * reemplazan por sus valores por defecto.
 */
export function changeType(schematic: Schematic, id: string, type: string): Schematic {
  const def = componentDefs.find((d) => d.type === type);
  if (!def) return schematic;
  return update(schematic, new Set([id]), (c) => ({
    ...c,
    type,
    params: Object.fromEntries(def.params.map((p) => [p.id, c.params[p.id] ?? p.default])),
  }));
}

/**
 * Aplica un cambio a algunos componentes. Si sus pines cambian de lugar (al
 * girar o voltear), los cables que llegaban a ellos los siguen. Un cable no
 * se mueve si en su punto queda otro pin del mismo componente: así, voltear
 * una fuente invierte su polaridad sin enredar los cables.
 */
function update(schematic: Schematic, ids: Set<string>, change: (c: PlacedComponent) => PlacedComponent): Schematic {
  if (ids.size === 0) return schematic;
  const moves = new Map<string, Point>();
  const components = schematic.components.map((c) => {
    if (!ids.has(c.id)) return c;
    const changed = change(c);
    const before = pinPositions(c);
    const after = pinPositions(changed);
    const stillUsed = new Set(Object.values(after).map(pointKey));
    for (const [pin, old] of Object.entries(before)) {
      if (!samePoint(old, after[pin]) && !stillUsed.has(pointKey(old))) moves.set(pointKey(old), after[pin]);
    }
    return changed;
  });
  if (moves.size === 0) return { ...schematic, components };
  const wires = followPoints(schematic.wires, moves, wireIdMaker(schematic.wires));
  return normalizeWires({ ...schematic, components, wires });
}
