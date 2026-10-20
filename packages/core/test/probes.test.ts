// Pruebas de las puntas de prueba (tensión y corriente).
import { describe, expect, it } from "vitest";
import {
  addComponent,
  addWire,
  emptySchematic,
  insertIntoWire,
  schematicToCircuit,
  simulateDc,
  type Circuit,
  type ComponentInstance,
  type Schematic,
} from "../src/index.ts";
import { close, engine, GND, R, simulateOk, V } from "./helpers.ts";

const PV = (id: string, node?: string): ComponentInstance => ({
  id, type: "voltage-probe", params: {}, connections: node ? { tip: node } : {},
});
const PI = (id: string, from: string, to: string): ComponentInstance => ({
  id, type: "current-probe", params: {}, connections: { in: from, out: to },
});

/** Divisor de 12 V con dos resistencias de 1 kΩ: 6 V en "medio", 6 mA. */
const V12 = (plus: string, minus: string) => V("V1", plus, minus, 12);
const divider = (...extra: ComponentInstance[]): Circuit => ({
  components: [V12("arriba", "0"), R("R1", "arriba", "medio"), R("R2", "medio", "0"), GND("GND1", "0"), ...extra],
});

describe("punta de tensión", () => {
  it("marca la tensión de su punto respecto a tierra", async () => {
    const { result } = await simulateOk(divider(PV("PV1", "medio"), PV("PV2", "arriba"), PV("PV3", "0")));
    expect(close(result.meters.PV1.value, 6)).toBe(true);
    expect(close(result.meters.PV2.value, 12)).toBe(true);
    expect(result.meters.PV3.value).toBe(0);
    expect(result.meters.PV1.mode).toBe("V");
  });

  it("no cambia el circuito que mide", async () => {
    const without = await simulateOk(divider());
    const withProbe = await simulateOk(divider(PV("PV1", "medio")));
    expect(withProbe.result.elements.R1).toEqual(without.result.elements.R1);
  });

  it("si no toca ningún cable, avisa y no marca nada", async () => {
    const outcome = await simulateOk(divider(PV("PV1")));
    expect(Number.isNaN(outcome.result.meters.PV1.value)).toBe(true);
    expect(outcome.warnings.map((w) => w.code)).toContain("pin-dangling");
  });
});

describe("punta de corriente", () => {
  it("en serie marca la corriente, positiva en el sentido de la flecha", async () => {
    const circuit: Circuit = {
      components: [V12("arriba", "0"), PI("PI1", "arriba", "a"), R("R1", "a", "medio"), R("R2", "medio", "0"), GND("GND1", "0")],
    };
    const { result } = await simulateOk(circuit);
    expect(close(result.meters.PI1.value, 0.006)).toBe(true);
  });

  it("al revés marca negativo", async () => {
    const circuit: Circuit = {
      components: [V12("arriba", "0"), PI("PI1", "a", "arriba"), R("R1", "a", "medio"), R("R2", "medio", "0"), GND("GND1", "0")],
    };
    const { result } = await simulateOk(circuit);
    expect(close(result.meters.PI1.value, -0.006)).toBe(true);
  });

  it("soltada sobre un cable del dibujo queda en serie y mide", async () => {
    // V1 en (0,0): + en (0,-2), − en (0,2). R1 vertical en (6,0): de (6,-2) a (6,2).
    let s: Schematic = {
      ...emptySchematic(),
      components: [
        { id: "V1", type: "dc-voltage-source", params: { voltage: 12 }, x: 0, y: 0, rotation: 0, mirror: false },
        { id: "R1", type: "resistor", params: { resistance: 2000 }, x: 6, y: 0, rotation: 90, mirror: false },
        { id: "GND1", type: "ground", params: {}, x: 0, y: 3, rotation: 0, mirror: false },
      ],
    };
    s = addWire(s, [[0, -2], [6, -2]]);
    s = addWire(s, [[6, 2], [0, 2]]);
    s = addWire(s, [[0, 2], [0, 3]]);
    const { schematic, id } = addComponent(s, "current-probe", 3, -2); // pines en (2,-2) y (4,-2)
    const outcome = await simulateDc(schematicToCircuit(insertIntoWire(schematic, id)), engine);
    if (!outcome.ok) throw new Error(outcome.diagnostics.map((d) => d.message).join("\n"));
    expect(id).toBe("PI1");
    expect(close(outcome.result.meters.PI1.value, 0.006)).toBe(true);
  });
});
