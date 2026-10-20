// Recorre la carpeta test-circuits/ y simula cada circuito con ngspice.
// Para añadir un caso basta con crear otro archivo .json en esa carpeta.
//
// Además de los valores esperados, en todos los circuitos se comprueba:
//  - Kirchhoff de corrientes: en cada nodo, lo que entra es igual a lo que sale.
//  - Balance de potencia: lo que entregan las fuentes lo absorbe el resto.
//  - Que la revisión del circuito no dé avisos que no estén previstos.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildNetlist, checkCircuit, type Circuit, type DcResult, type Diagnostic } from "../src/index.ts";
import { close, simulateOk } from "./helpers.ts";

interface TestCircuit {
  name: string;
  source: string;
  circuit: Circuit;
  expected: {
    nodes?: Record<string, number>;
    elements?: Record<string, { current?: number; voltage?: number; power?: number }>;
    /** Códigos de los avisos esperados, si los hay. */
    warnings?: string[];
  };
}

const folder = join(import.meta.dirname, "../../../test-circuits");
const cases = readdirSync(folder)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({ file: f, data: JSON.parse(readFileSync(join(folder, f), "utf8")) as TestCircuit }));

describe.each(cases)("$file", ({ data }) => {
  let result: DcResult;
  let warnings: Diagnostic[];
  beforeAll(async () => {
    ({ result, warnings } = await simulateOk(data.circuit));
  });

  it(`${data.name}: coincide con lo esperado`, () => {
    const errors: string[] = [];
    for (const [node, v] of Object.entries(data.expected.nodes ?? {})) {
      const got = result.nodeVoltages[node];
      if (!close(got, v)) errors.push(`V(${node}): esperado ${v}, obtenido ${got}`);
    }
    for (const [id, exp] of Object.entries(data.expected.elements ?? {})) {
      for (const key of ["current", "voltage", "power"] as const) {
        if (exp[key] === undefined) continue;
        const got = result.elements[id]?.[key];
        if (got === undefined || !close(got, exp[key])) {
          errors.push(`${id}.${key}: esperado ${exp[key]}, obtenido ${got}`);
        }
      }
    }
    expect(errors, `Fuente de lo esperado: ${data.source}`).toEqual([]);
  });

  it("da solo los avisos previstos", () => {
    expect(warnings.map((w) => w.code)).toEqual(data.expected.warnings ?? []);
  });

  it("cumple Kirchhoff de corrientes en cada nodo", () => {
    const netlist = buildNetlist(checkCircuit(data.circuit).simulable);
    const leaving = new Map<string, number>(); // corriente neta que sale de cada nodo
    for (const e of netlist.elements) {
      const r = result.elements[e.instance.id];
      if (!r) continue;
      const [first, second] = e.spiceNodes;
      leaving.set(first, (leaving.get(first) ?? 0) + r.current);
      leaving.set(second, (leaving.get(second) ?? 0) - r.current);
    }
    for (const [node, sum] of leaving) {
      expect(Math.abs(sum), `nodo ${node}`).toBeLessThan(1e-9);
    }
  });

  it("la potencia total es cero (lo entregado = lo absorbido)", () => {
    const total = Object.values(result.elements).reduce((s, r) => s + r.power, 0);
    expect(Math.abs(total)).toBeLessThan(1e-9);
  });
});
