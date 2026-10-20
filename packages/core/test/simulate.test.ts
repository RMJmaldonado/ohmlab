// Pruebas de simulateDc: qué pasa cuando hay errores y cuando falla el simulador.
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  describeSimulationError,
  simulateDc,
  SimulationError,
  type SimulationEngine,
  type SimulationErrorKind,
} from "../src/index.ts";
import { NgspiceCliEngine } from "../src/node/index.ts";
import { GND, R, V, circuit, engine } from "./helpers.ts";

const divider = circuit(V("V1", "a", "0", 12), R("R1", "a", "b"), R("R2", "b", "0"), GND("GND1", "0"));

/** Motor falso que siempre falla de la forma indicada. */
function failingEngine(kind: SimulationErrorKind, output: string): SimulationEngine {
  return {
    version: async () => "falso",
    operatingPoint: async () => {
      throw new SimulationError("fallo de prueba", kind, output);
    },
  };
}

describe("simulateDc", () => {
  it("si la revisión encuentra errores, no llama al simulador", async () => {
    const untouchable: SimulationEngine = {
      version: async () => { throw new Error("no debía llamarse"); },
      operatingPoint: async () => { throw new Error("no debía llamarse"); },
    };
    const outcome = await simulateDc(circuit(V("V1", "a", "b"), R("R1", "a", "b")), untouchable);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.diagnostics.map((d) => d.code)).toEqual(["no-ground"]);
  });

  it("devuelve los avisos junto con el resultado", async () => {
    const outcome = await simulateDc(circuit(...divider.components, R("R3", "b", "c")), engine);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.warnings.map((w) => w.code)).toEqual(["pin-dangling"]);
  });

  it.each([
    ["failed", "Warning: singular matrix:  check node y", "simulator-singular"],
    ["failed", "DC solution failed -", "simulator-no-convergence"],
    ["failed", "algo raro que nadie esperaba", "simulator-failed"],
    ["not-found", "", "simulator-not-found"],
    ["timeout", "", "simulator-timeout"],
  ] as const)("un fallo %s con «%s» se explica como %s", async (kind, output, code) => {
    const outcome = await simulateDc(divider, failingEngine(kind, output));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.diagnostics[0].code).toBe(code);
  });

  it("si no encuentra ngspice, lo dice claramente", async () => {
    const missing = new NgspiceCliEngine({ executable: join(tmpdir(), "no-existe", "ngspice") });
    const outcome = await simulateDc(divider, missing);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.diagnostics[0].code).toBe("simulator-not-found");
  });
});

describe("red de seguridad con ngspice real", () => {
  it("un circuito sin tierra que se salta la revisión no devuelve números inventados", async () => {
    // Sin la revisión, ngspice "resuelve" este circuito y da V(n1) ≈ 12,012 V.
    const attempt = engine.operatingPoint(["v1 n1 n2 DC 12", "r1 n1 n2 1000"], ["n1", "n2"]);
    const error = await attempt.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SimulationError);
    expect(describeSimulationError(error as SimulationError).code).toBe("simulator-singular");
  });
});
