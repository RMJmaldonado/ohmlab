// Pruebas del esquemático: posiciones, giros, volteos y cambios.
import { describe, expect, it } from "vitest";
import {
  addComponent,
  changeType,
  componentDefs,
  deleteItems,
  emptySchematic,
  flipComponents,
  moveItems,
  nextId,
  pinPositions,
  renameComponent,
  rotateComponents,
  setParam,
  type PlacedComponent,
  type Rotation,
  type Schematic,
} from "../src/index.ts";

const resistorAt = (x: number, y: number, rotation: Rotation = 0, mirror = false): PlacedComponent => ({
  id: "R1", type: "resistor", params: { resistance: 1000 }, x, y, rotation, mirror,
});
const withOne = (c: PlacedComponent): Schematic => ({ version: 1, components: [c], wires: [] });
/** Posición de cada pin relativa al origen del componente. */
const relative = (c: PlacedComponent) =>
  Object.fromEntries(Object.entries(pinPositions(c)).map(([pin, [x, y]]) => [pin, [x - c.x, y - c.y]]));

describe("geometría", () => {
  it("una resistencia sin girar es horizontal", () => {
    expect(pinPositions(resistorAt(10, 5))).toEqual({ a: [8, 5], b: [12, 5] });
  });

  it("girada 90° en sentido horario queda vertical, con el terminal 1 arriba", () => {
    expect(pinPositions(resistorAt(10, 5, 90))).toEqual({ a: [10, 3], b: [10, 7] });
  });

  it("todos los pines de todos los componentes tienen posición en el símbolo", () => {
    for (const def of componentDefs) {
      for (const pin of def.pins) expect(def.symbol.pins[pin.id], `${def.type}.${pin.id}`).toBeDefined();
    }
  });
});

describe("girar y voltear", () => {
  const all: [Rotation, boolean][] = [0, 90, 180, 270].flatMap((r) => [[r as Rotation, false], [r as Rotation, true]] as [Rotation, boolean][]);
  const source = (rotation: Rotation, mirror: boolean): PlacedComponent => ({
    id: "V1", type: "dc-voltage-source", params: { voltage: 12 }, x: 3, y: 4, rotation, mirror,
  });

  it("cuatro giros horarios vuelven a la posición inicial", () => {
    let s = withOne(resistorAt(0, 0));
    for (let i = 0; i < 4; i++) s = rotateComponents(s, ["R1"], "cw");
    expect(s.components[0].rotation).toBe(0);
  });

  it("girar a la derecha y luego a la izquierda no cambia nada", () => {
    const s = rotateComponents(rotateComponents(withOne(resistorAt(0, 0, 90)), ["R1"], "cw"), ["R1"], "ccw");
    expect(s.components[0].rotation).toBe(90);
  });

  it.each(all)("voltear en horizontal refleja los pines de izquierda a derecha (giro %s°, volteado %s)", (rotation, mirror) => {
    const before = source(rotation, mirror);
    const after = flipComponents(withOne(before), ["V1"], "horizontal").components[0];
    const [rb, ra] = [relative(before), relative(after)];
    for (const pin of Object.keys(rb)) expect(ra[pin]).toEqual([-rb[pin][0] + 0, rb[pin][1]]);
  });

  it.each(all)("voltear en vertical refleja los pines de arriba a abajo (giro %s°, volteado %s)", (rotation, mirror) => {
    const before = source(rotation, mirror);
    const after = flipComponents(withOne(before), ["V1"], "vertical").components[0];
    const [rb, ra] = [relative(before), relative(after)];
    for (const pin of Object.keys(rb)) expect(ra[pin]).toEqual([rb[pin][0], -rb[pin][1] + 0]);
  });
});

describe("cambios en el esquemático", () => {
  it("los nombres nuevos reutilizan los huecos: R1, R3 → R2", () => {
    const s: Schematic = { version: 1, components: [resistorAt(0, 0), { ...resistorAt(5, 0), id: "R3" }], wires: [] };
    expect(nextId(s, "R")).toBe("R2");
  });

  it("agregar un componente usa los valores por defecto y posiciones enteras", () => {
    const { schematic, id } = addComponent(emptySchematic(), "resistor", 3.4, 7.6);
    expect(id).toBe("R1");
    expect(schematic.components[0]).toMatchObject({ x: 3, y: 8, params: { resistance: 1000 }, rotation: 0 });
  });

  it("los cambios no modifican el esquemático anterior (para poder deshacer)", () => {
    const before = withOne(resistorAt(0, 0));
    const after = moveItems(before, ["R1"], 2, 3);
    expect(before.components[0]).toMatchObject({ x: 0, y: 0 });
    expect(after.components[0]).toMatchObject({ x: 2, y: 3 });
    expect(setParam(before, "R1", "resistance", 47).components[0].params.resistance).toBe(47);
    expect(before.components[0].params.resistance).toBe(1000);
    expect(deleteItems(before, ["R1"]).components).toEqual([]);
    expect(before.components).toHaveLength(1);
  });

  it("cambiar el nombre valida que sea único y que tenga un formato válido", () => {
    const s: Schematic = { version: 1, components: [resistorAt(0, 0), { ...resistorAt(5, 0), id: "R2" }], wires: [] };
    expect(renameComponent(s, "R1", "R2")).toBe("Ya hay un componente llamado R2.");
    expect(renameComponent(s, "R1", "1R")).toMatch(/empezar con una letra/);
    const renamed = renameComponent(s, "R1", "Rcarga");
    expect(typeof renamed === "string" ? renamed : renamed.components[0].id).toBe("Rcarga");
  });

  it("cambiar el modo del multímetro conserva nombre y posición", () => {
    const { schematic } = addComponent(emptySchematic(), "voltmeter", 4, 4);
    const ammeter = changeType(schematic, "MM1", "ammeter").components[0];
    expect(ammeter).toMatchObject({ id: "MM1", type: "ammeter", x: 4, y: 4, params: {} });
    const back = changeType(changeType(schematic, "MM1", "ammeter"), "MM1", "voltmeter").components[0];
    expect(back.params).toEqual({ resistance: 1e9 });
  });
});
