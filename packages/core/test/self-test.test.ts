// Pruebas del autodiagnóstico.
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SimulationEngine } from "../src/index.ts";
import { formatSelfTestReport, hidePersonalPaths, NgspiceCliEngine, runSelfTest } from "../src/node/index.ts";
import { engine } from "./helpers.ts";

describe("runSelfTest", () => {
  it("con ngspice instalado, todo sale bien y rápido", async () => {
    const report = await runSelfTest(engine);
    const text = formatSelfTestReport(report);
    console.log(text);
    expect(report.checks.filter((c) => !c.ok)).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.checks.find((c) => c.id === "simulator")!.detail).toMatch(/^ngspice \d+/);
    expect(report.totalMs).toBeLessThan(5000);
    expect(text).toContain("Resultado: todo funciona");
    expect(text).not.toContain(homedir());
  });

  it("sin ngspice, avisa que no lo encuentra", async () => {
    const missing = new NgspiceCliEngine({ executable: join(tmpdir(), "no-existe", "ngspice") });
    const report = await runSelfTest(missing);
    expect(report.ok).toBe(false);
    const simulator = report.checks.find((c) => c.id === "simulator")!;
    expect(simulator.ok).toBe(false);
    expect(simulator.detail).toMatch(/No se encontró/);
    expect(report.checks.find((c) => c.id === "temp-folder")!.ok).toBe(true);
    expect(formatSelfTestReport(report)).toContain("[FALLA]");
  });

  it("si el simulador da un resultado incorrecto, lo detecta", async () => {
    const wrong: SimulationEngine = {
      version: async () => "falso 1",
      operatingPoint: async (_lines, vectors) => Object.fromEntries(vectors.map((v) => [v.toLowerCase(), 5])),
    };
    const report = await runSelfTest(wrong);
    const reference = report.checks.find((c) => c.id === "reference-circuit")!;
    expect(reference.ok).toBe(false);
    expect(reference.detail).toMatch(/dio 5 V en lugar de 6 V/);
  });
});

describe("hidePersonalPaths", () => {
  it("cambia la carpeta personal por ~", () => {
    expect(hidePersonalPaths(join(homedir(), "Documentos", "circuito.json"))).toBe(
      join("~", "Documentos", "circuito.json"),
    );
    expect(hidePersonalPaths(`${homedir().replaceAll("\\", "/")}/x`)).toBe("~/x");
  });
});
