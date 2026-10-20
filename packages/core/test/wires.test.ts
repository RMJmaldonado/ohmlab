// Pruebas de los cables y de la detección de nodos.
import { describe, expect, it } from "vitest";
import {
  addComponent,
  addWire,
  analyzeConnectivity,
  deleteItems,
  emptySchematic,
  findInsertion,
  flipComponents,
  insertIntoWire,
  isHorizontal,
  moveItems,
  pinPositions,
  rotateComponents,
  routeAround,
  schematicToCircuit,
  type PlacedComponent,
  type Point,
  type Rotation,
  type Schematic,
} from "../src/index.ts";
import { close, simulateOk } from "./helpers.ts";

const part = (id: string, type: string, x: number, y: number, rotation: Rotation = 0, params: Record<string, number> = {}): PlacedComponent => ({
  id, type, params, x, y, rotation, mirror: false,
});

/**
 * Divisor de tensión dibujado:
 *
 *   (0,-2) ── R1 ── (5,-2)          V1 en (0,0): + arriba, − abajo
 *     V1            R2 (vertical)   R1 de (1,-2) a (5,-2); R2 de (5,-2) a (5,2)
 *   (0,2) ────────── (5,2)          R1.b y R2.a se tocan pin con pin
 *     GND (0,3)
 */
function divider(): Schematic {
  let s: Schematic = {
    version: 1,
    components: [
      part("V1", "dc-voltage-source", 0, 0, 0, { voltage: 12 }),
      part("R1", "resistor", 3, -2, 0, { resistance: 1000 }),
      part("R2", "resistor", 5, 0, 90, { resistance: 1000 }),
      part("GND1", "ground", 0, 3),
    ],
    wires: [],
  };
  s = addWire(s, [[0, -2], [1, -2]]);
  s = addWire(s, [[5, 2], [0, 2]]);
  s = addWire(s, [[0, 2], [0, 3]]);
  return s;
}

/** Los nodos como listas ordenadas de pines, para comparar sin depender de los nombres. */
function groups(s: Schematic): string[][] {
  return analyzeConnectivity(s)
    .nets.map((n) => n.pins.map((p) => `${p.component}.${p.pin}`).sort())
    .filter((g) => g.length > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
}

const sortedPoints = (points: Point[]) => points.map(([x, y]) => `${x},${y}`).sort();

describe("agregar cables", () => {
  it("un cable entre puntos no alineados se dobla en una esquina", () => {
    const s = addWire(emptySchematic(), [[0, 0], [3, 2]]);
    expect(s.wires.map((w) => [w.a, w.b])).toEqual([
      [[0, 0], [3, 0]],
      [[3, 0], [3, 2]],
    ]);
    expect(s.wires.every((w) => w.a[0] === w.b[0] || w.a[1] === w.b[1])).toBe(true);
  });

  it("dos tramos en línea recta que se tocan en un punto libre se unen en uno", () => {
    const s = addWire(addWire(emptySchematic(), [[0, 0], [2, 0]]), [[2, 0], [5, 0]]);
    expect(s.wires).toHaveLength(1);
    expect(sortedPoints([s.wires[0].a, s.wires[0].b])).toEqual(["0,0", "5,0"]);
  });

  it("no une tramos si en el punto hay un pin", () => {
    let s: Schematic = { ...emptySchematic(), components: [part("R1", "resistor", 2, 2, 90)] }; // pines en (2,0) y (2,4)
    s = addWire(addWire(s, [[0, 0], [2, 0]]), [[2, 0], [5, 0]]);
    expect(s.wires).toHaveLength(2);
  });

  it("un cable de largo cero no agrega nada", () => {
    const s = emptySchematic();
    expect(addWire(s, [[1, 1], [1, 1]])).toBe(s);
  });
});

describe("los cables no pasan por encima de las piezas", () => {
  // R1 horizontal con pines en (8,6) y (12,6); el multímetro arriba, con las
  // puntas en (9,2) y (11,2), dentro del largo de R1.
  const s: Schematic = {
    ...emptySchematic(),
    components: [part("R1", "resistor", 10, 6), part("MM1", "ammeter", 10, 0)],
  };

  it("de la punta + al pin de R1: va por el costado, no sobre la resistencia", () => {
    // Bajando primero, el tramo horizontal quedaría sobre R1: se dobla al otro lado.
    expect(routeAround(s, [9, 2], [8, 6], "v")).toEqual([[8, 2], [8, 6]]);
    expect(routeAround(s, [11, 2], [12, 6], "v")).toEqual([[12, 2], [12, 6]]);
  });

  it("desde el pin de R1 hacia el multímetro, igual", () => {
    expect(routeAround(s, [8, 6], [9, 2], "h")).toEqual([[8, 2], [9, 2]]);
  });

  it("si el camino pedido no toca ninguna pieza, lo respeta", () => {
    expect(routeAround(s, [8, 6], [4, 9], "h")).toEqual([[4, 6], [4, 9]]); // sale del pin de R1 hacia afuera
    expect(routeAround(s, [0, 0], [4, 3], "h")).toEqual([[4, 0], [4, 3]]);
  });

  it("un cable que cruza la resistencia por el medio también cuenta", () => {
    // De (10,4) a (14,8): bajando primero cruzaría R1 en (10,6).
    expect(routeAround(s, [10, 4], [14, 8], "v")).toEqual([[14, 4], [14, 8]]);
  });
});

describe("detección de nodos", () => {
  it("el divisor dibujado tiene tres nodos, y uno es la tierra", () => {
    const s = divider();
    expect(groups(s)).toEqual([
      ["GND1.gnd", "R2.b", "V1.minus"],
      ["R1.a", "V1.plus"],
      ["R1.b", "R2.a"],
    ]);
    const nets = analyzeConnectivity(s).nets;
    expect(nets.map((n) => n.name)).toEqual(["N1", "N2", "N3"]);
    expect(nets.filter((n) => n.ground).flatMap((n) => n.pins.map((p) => p.component)).sort()).toEqual(["GND1", "R2", "V1"]);
  });

  it("un cable que llega al medio de otro se une en T y lleva un punto de unión", () => {
    let s = addWire(emptySchematic(), [[0, 0], [6, 0]]);
    s = addWire(s, [[3, 0], [3, 4]]);
    const c = analyzeConnectivity(s);
    expect(c.nets).toHaveLength(1);
    expect(sortedPoints(c.junctions)).toEqual(["3,0"]);
  });

  it("dos cables que solo se cruzan no se unen", () => {
    let s = addWire(emptySchematic(), [[0, 0], [6, 0]]);
    s = addWire(s, [[3, -3], [3, 3]]);
    const c = analyzeConnectivity(s);
    expect(c.nets).toHaveLength(2);
    expect(c.junctions).toEqual([]);
  });

  it("marca los pines y extremos que no tocan nada", () => {
    const s: Schematic = { ...addWire(emptySchematic(), [[0, 0], [2, 0]]), components: [part("R1", "resistor", 4, 0)] };
    // R1 va de (2,0) a (6,0): el cable llega a R1.a, y quedan sueltos (0,0) y R1.b.
    expect(sortedPoints(analyzeConnectivity(s).openEnds)).toEqual(["0,0", "6,0"]);
  });

  it("el circuito resultante se simula con ngspice: 6 V en el medio del divisor", async () => {
    const s = divider();
    const circuit = schematicToCircuit(s);
    expect(circuit.components.find((c) => c.id === "R1")!.connections).toEqual({ a: "N1", b: "N3" });
    const { result } = await simulateOk(circuit);
    expect(close(result.nodeVoltages.N3, 6)).toBe(true);
    expect(close(result.elements.R1.current, 0.006)).toBe(true);
  });

  it("un pin sin conexión no recibe nodo, y el chequeo lo trata como suelto", () => {
    const s: Schematic = { ...emptySchematic(), components: [part("R1", "resistor", 0, 0)] };
    expect(schematicToCircuit(s).components[0].connections).toEqual({});
  });
});

describe("los cables siguen a los componentes", () => {
  it("al mover un componente, sus cables se doblan y el circuito sigue igual", () => {
    const s = divider();
    const moved = moveItems(s, ["V1"], -2, 1);
    expect(groups(moved)).toEqual(groups(s));
    expect(moved.wires.every((w) => w.a[0] === w.b[0] || w.a[1] === w.b[1])).toBe(true);
    // Ningún tramo queda encima de otro.
    const cells = moved.wires.flatMap((w) => {
      const [x1, x2] = [w.a[0], w.b[0]].sort((m, n) => m - n);
      const [y1, y2] = [w.a[1], w.b[1]].sort((m, n) => m - n);
      return x1 === x2
        ? Array.from({ length: y2 - y1 }, (_, k) => `v${x1},${y1 + k}`)
        : Array.from({ length: x2 - x1 }, (_, k) => `h${x1 + k},${y1}`);
    });
    expect(new Set(cells).size).toBe(cells.length);
  });

  it("tramos que se pisan quedan como uno solo", () => {
    const s = addWire(addWire(emptySchematic(), [[0, 0], [6, 0]]), [[2, 0], [9, 0]]);
    expect(s.wires.map((w) => [w.a, w.b])).toEqual([[[0, 0], [9, 0]]]);
  });

  it("al girar un componente, sus cables lo siguen", () => {
    // R2 ─── R1 ─── R3 en una fila; R1 gira y queda vertical.
    let s: Schematic = {
      ...emptySchematic(),
      components: [part("R1", "resistor", 0, 0), part("R2", "resistor", -7, 0), part("R3", "resistor", 7, 0)],
    };
    s = addWire(addWire(s, [[-5, 0], [-2, 0]]), [[2, 0], [5, 0]]);
    const before = groups(s);
    expect(before).toEqual([["R1.a", "R2.b"], ["R1.b", "R3.a"]]);
    const turned = rotateComponents(s, ["R1"], "cw");
    expect(groups(turned)).toEqual(before);
    expect(turned.wires.every((w) => w.a[0] === w.b[0] || w.a[1] === w.b[1])).toBe(true);
  });

  it("al voltear una fuente, los cables se quedan y la polaridad se invierte", () => {
    const s = divider();
    const flipped = flipComponents(s, ["V1"], "vertical");
    expect(flipped.wires).toEqual(s.wires);
    expect(groups(flipped)).toContainEqual(["GND1.gnd", "R2.b", "V1.plus"]);
  });

  it("al mover un cable, los cables que llegan a él en T también se mueven", () => {
    let s = addWire(emptySchematic(), [[0, 0], [6, 0]]);
    s = addWire(s, [[3, 0], [3, 4]]);
    const horizontal = s.wires.find(isHorizontal)!;
    const moved = moveItems(s, [horizontal.id], 0, -2);
    expect(analyzeConnectivity(moved).nets).toHaveLength(1);
  });

  it("al borrar un componente sus cables quedan, y al borrar un cable desaparece", () => {
    const s = divider();
    expect(deleteItems(s, ["R2"]).wires).toHaveLength(s.wires.length);
    expect(deleteItems(s, [s.wires[0].id]).wires).toHaveLength(s.wires.length - 1);
  });
});

describe("intercalar un componente soltándolo sobre un cable", () => {
  it("una resistencia soltada sobre un cable queda en serie", () => {
    const base = addWire(emptySchematic(), [[0, 0], [10, 0]]);
    const { schematic, id } = addComponent(base, "resistor", 5, 0); // pines en (3,0) y (7,0)
    expect(findInsertion(schematic, id)).toEqual({ wire: base.wires[0].id, from: [3, 0], to: [7, 0] });
    const inserted = insertIntoWire(schematic, id);
    expect(inserted.wires).toHaveLength(2);
    expect(groups(inserted)).toEqual([["R1.a"], ["R1.b"]]);
  });

  it("el multímetro como amperímetro se intercala con sus dos puntas", () => {
    const base = addWire(emptySchematic(), [[-5, 2], [5, 2]]);
    const { schematic, id } = addComponent(base, "ammeter", 0, 0); // puntas en (-1,2) y (1,2)
    expect(Object.values(pinPositions(schematic.components[0]))).toEqual([[-1, 2], [1, 2]]);
    const inserted = insertIntoWire(schematic, id);
    expect(groups(inserted)).toEqual([["MM1.com"], ["MM1.plus"]]);
  });

  it("no intercala si algo más llega al tramo que habría que cortar", () => {
    let base = addWire(emptySchematic(), [[0, 0], [10, 0]]);
    base = addWire(base, [[5, 0], [5, 4]]); // una T justo en el medio
    const { schematic, id } = addComponent(base, "resistor", 5, 0);
    expect(findInsertion(schematic, id)).toBeNull();
    expect(insertIntoWire(schematic, id)).toBe(schematic);
  });

  it("un componente que solo toca el cable con un pin no se intercala", () => {
    const base = addWire(emptySchematic(), [[0, 0], [10, 0]]);
    const { schematic, id } = addComponent(base, "resistor", 5, 2, { rotation: 90, mirror: false }); // de (5,0) a (5,4)
    expect(findInsertion(schematic, id)).toBeNull();
    expect(groups(schematic)).toEqual([["R1.a"]]);
  });
});
