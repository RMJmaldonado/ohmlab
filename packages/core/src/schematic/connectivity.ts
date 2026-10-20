// Detección de nodos: qué pines y cables quedan unidos en el dibujo, y el
// circuito que resulta, listo para simular.
//
// Reglas (las mismas que en la mayoría de los editores de esquemáticos):
// - Todo lo que coincide en un mismo punto queda unido: pines y extremos de cable.
// - Un pin o un extremo de cable sobre el medio de otro cable se une a él (en T).
// - Dos cables que solo se cruzan por el medio NO se unen.
import type { Circuit } from "../circuit.ts";
import { getComponentDef } from "../components/index.ts";
import { UnionFind } from "../union-find.ts";
import { onInterior, pinPositions, pointKey, type Point } from "./geometry.ts";
import type { Schematic } from "./types.ts";

export interface PinRef {
  component: string;
  pin: string;
}

export interface Net {
  /** "N1", "N2"... en el orden en que aparecen los componentes. */
  name: string;
  pins: PinRef[];
  wires: string[];
  /** Toca una tierra: es la referencia de 0 V. */
  ground: boolean;
}

export interface Connectivity {
  nets: Net[];
  /** "R1.a" → nombre del nodo. Los pines que no tocan nada no aparecen. */
  netOfPin: Map<string, string>;
  netOfWire: Map<string, string>;
  /** Puntos donde se unen tres o más conexiones: se dibujan con un punto. */
  junctions: Point[];
  /** Pines y extremos de cable que no tocan nada. */
  openEnds: Point[];
}

export const pinKey = (component: string, pin: string): string => `${component}.${pin}`;

export function analyzeConnectivity(schematic: Schematic): Connectivity {
  // Qué hay en cada punto de la grilla.
  const spots = new Map<string, { point: Point; members: string[]; pins: number; ends: number; passes: number }>();
  const spot = (point: Point) => {
    const key = pointKey(point);
    if (!spots.has(key)) spots.set(key, { point, members: [], pins: 0, ends: 0, passes: 0 });
    return spots.get(key)!;
  };
  const pinOrder: PinRef[] = [];
  for (const c of schematic.components) {
    for (const [pin, point] of Object.entries(pinPositions(c))) {
      pinOrder.push({ component: c.id, pin });
      const s = spot(point);
      s.members.push(pinKey(c.id, pin));
      s.pins++;
    }
  }
  for (const w of schematic.wires) {
    for (const point of [w.a, w.b]) {
      const s = spot(point);
      s.members.push(w.id);
      s.ends++;
    }
  }

  const groups = new UnionFind();
  for (const s of spots.values()) {
    for (const member of s.members.slice(1)) groups.union(s.members[0], member);
    for (const w of schematic.wires) {
      if (!onInterior(s.point, w)) continue;
      groups.union(s.members[0], w.id);
      s.passes++;
    }
  }

  // Nodos, nombrados en el orden de los componentes. Un pin que no toca nada
  // no forma un nodo; un cable suelto sí (para poder resaltarlo).
  const byRoot = new Map<string, Net>();
  const netFor = (member: string) => {
    const root = groups.find(member);
    if (!byRoot.has(root)) byRoot.set(root, { name: "", pins: [], wires: [], ground: false });
    return byRoot.get(root)!;
  };
  for (const ref of pinOrder) netFor(pinKey(ref.component, ref.pin)).pins.push(ref);
  for (const w of schematic.wires) netFor(w.id).wires.push(w.id);
  const nets = [...byRoot.values()].filter((n) => n.wires.length > 0 || n.pins.length > 1);

  const types = new Map(schematic.components.map((c) => [c.id, c.type]));
  const netOfPin = new Map<string, string>();
  const netOfWire = new Map<string, string>();
  nets.forEach((net, i) => {
    net.name = `N${i + 1}`;
    net.ground = net.pins.some((p) => getComponentDef(types.get(p.component)!).isGround === true);
    for (const p of net.pins) netOfPin.set(pinKey(p.component, p.pin), net.name);
    for (const w of net.wires) netOfWire.set(w, net.name);
  });

  const all = [...spots.values()];
  const degree = (s: (typeof all)[number]) => s.pins + s.ends + 2 * s.passes;
  return {
    nets,
    netOfPin,
    netOfWire,
    junctions: all.filter((s) => degree(s) >= 3).map((s) => s.point),
    openEnds: all.filter((s) => degree(s) === 1).map((s) => s.point),
  };
}

/** El circuito que dibuja el esquemático: cada pin con el nombre de su nodo. */
export function schematicToCircuit(schematic: Schematic, connectivity = analyzeConnectivity(schematic)): Circuit {
  return {
    components: schematic.components.map((c) => ({
      id: c.id,
      type: c.type,
      params: { ...c.params },
      connections: Object.fromEntries(
        getComponentDef(c.type).pins.flatMap((pin) => {
          const net = connectivity.netOfPin.get(pinKey(c.id, pin.id));
          return net ? [[pin.id, net]] : [];
        }),
      ),
    })),
  };
}
