// Pruebas de copiar y pegar.
import { describe, expect, it } from "vitest";
import {
  addWire,
  analyzeConnectivity,
  clipAnchor,
  copyItems,
  emptySchematic,
  pasteItems,
  type PlacedComponent,
  type Schematic,
} from "../src/index.ts";

const resistor = (id: string, x: number, y: number, resistance = 1000, rotation: 0 | 90 = 0): PlacedComponent => ({
  id, type: "resistor", params: { resistance }, x, y, rotation, mirror: false,
});

/** R1 horizontal y R2 vertical, unidas por un cable con esquina; R3 aparte, unida a R2. */
function sample(): Schematic {
  let s: Schematic = {
    ...emptySchematic(),
    components: [resistor("R1", 0, 0, 2200), resistor("R2", 6, 3, 1000, 90), resistor("R3", 12, 5)],
  };
  // R1.b (2,0) → esquina (6,0) → R2.a (6,1); R2.b (6,5) → R3.a (10,5)
  s = addWire(s, [[2, 0], [6, 0], [6, 1]]);
  s = addWire(s, [[6, 5], [10, 5]]);
  return s;
}

const pinGroups = (s: Schematic, only: string[]) =>
  analyzeConnectivity(s)
    .nets.map((n) => n.pins.filter((p) => only.includes(p.component)).map((p) => `${p.component}.${p.pin}`).sort())
    .filter((g) => g.length > 1);

describe("copiar", () => {
  it("copia las piezas y los cables que las unen, aunque tengan esquinas", () => {
    const clip = copyItems(sample(), ["R1", "R2"])!;
    expect(clip.components.map((c) => c.id)).toEqual(["R1", "R2"]);
    expect(clip.wires).toHaveLength(2); // los dos tramos de la L, no el que va a R3
  });

  it("lo copiado no cambia si después se edita el dibujo", () => {
    const s = sample();
    const clip = copyItems(s, ["R1"])!;
    s.components[0].params.resistance = 1;
    expect(clip.components[0].params.resistance).toBe(2200);
  });

  it("sin nada seleccionado no copia nada", () => {
    expect(copyItems(sample(), [])).toBeNull();
  });
});

describe("pegar", () => {
  it("pega con nombres nuevos, los mismos valores y desplazado", () => {
    const s = sample();
    const { schematic, ids } = pasteItems(s, copyItems(s, ["R1"])!, 0, 10);
    expect(ids).toEqual(["R4"]);
    expect(schematic.components.find((c) => c.id === "R4")).toMatchObject({ x: 0, y: 10, params: { resistance: 2200 } });
    expect(s.components).toHaveLength(3); // el original no cambia
  });

  it("la copia queda conectada igual que el original, sin tocarlo", () => {
    const s = sample();
    const clip = copyItems(s, ["R1", "R2"])!;
    const [ax, ay] = clipAnchor(clip);
    const { schematic, ids } = pasteItems(s, clip, 20 - ax, 20 - ay);
    expect(ids.filter((id) => id.startsWith("R"))).toEqual(["R4", "R5"]);
    expect(pinGroups(schematic, ["R4", "R5"])).toEqual([["R4.b", "R5.a"]]);
    expect(pinGroups(schematic, ["R1", "R2", "R3"])).toEqual(pinGroups(s, ["R1", "R2", "R3"]));
  });

  it("la esquina superior izquierda de lo copiado es el punto que va al cursor", () => {
    expect(clipAnchor(copyItems(sample(), ["R1", "R2"])!)).toEqual([0, 0]);
  });
});
