// Autodiagnóstico: comprobaciones rápidas que la app hace al abrirse y que
// también se pueden ver en Ayuda → Diagnóstico. Si algo falla, el informe
// se puede copiar y pegar en un reporte de GitHub.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { arch, homedir, platform, release, tmpdir } from "node:os";
import { join } from "node:path";
import type { Circuit } from "../circuit.ts";
import { SimulationError, type SimulationEngine } from "../engine/engine.ts";
import type { SelfTestCheck, SelfTestReport } from "../self-test-report.ts";
import { simulateDc } from "../simulate.ts";

/** Divisor de 12 V con dos resistencias iguales: la salida debe dar 6 V. */
const REFERENCE: Circuit = {
  components: [
    { id: "V1", type: "dc-voltage-source", params: { voltage: 12 }, connections: { plus: "entrada", minus: "0" } },
    { id: "R1", type: "resistor", params: { resistance: 1000 }, connections: { a: "entrada", b: "salida" } },
    { id: "R2", type: "resistor", params: { resistance: 1000 }, connections: { a: "salida", b: "0" } },
    { id: "GND1", type: "ground", params: {}, connections: { gnd: "0" } },
  ],
};
const REFERENCE_EXPECTED = 6;

export async function runSelfTest(engine: SimulationEngine, appVersion = "desarrollo"): Promise<SelfTestReport> {
  const start = performance.now();
  const checks = await Promise.all([
    timed("temp-folder", "Carpeta temporal", checkTempFolder),
    timed("simulator", "Simulador", () => engine.version()),
    timed("reference-circuit", "Circuito de referencia", () => checkReference(engine)),
  ]);
  return {
    ok: checks.every((c) => c.ok),
    date: new Date().toISOString(),
    appVersion,
    system: `${platform()} ${release()} (${arch()})`,
    runtime: process.versions.electron
      ? `Electron ${process.versions.electron} (Node ${process.versions.node})`
      : `Node ${process.versions.node}`,
    checks,
    totalMs: Math.round(performance.now() - start),
  };
}

/** Texto del informe, listo para copiar. No incluye el nombre de usuario. */
export function formatSelfTestReport(report: SelfTestReport): string {
  const lines = [
    "Informe de diagnóstico de OhmLab",
    `Fecha: ${report.date}`,
    `Versión de OhmLab: ${report.appVersion}`,
    `Sistema: ${report.system}`,
    `Entorno: ${report.runtime}`,
    "",
    ...report.checks.map((c) => `${c.ok ? "[OK]   " : "[FALLA]"} ${c.label}: ${c.detail} (${c.ms} ms)`),
    "",
    report.ok
      ? `Resultado: todo funciona (${report.totalMs} ms).`
      : "Resultado: hay problemas. Copia este informe y repórtalo en GitHub.",
  ];
  return hidePersonalPaths(lines.join("\n"));
}

/** Cambia la carpeta personal (que contiene el nombre de usuario) por "~". */
export function hidePersonalPaths(text: string): string {
  const home = homedir();
  for (const variant of [home, home.replaceAll("\\", "/")]) text = text.split(variant).join("~");
  return text;
}

async function timed(
  id: SelfTestCheck["id"],
  label: string,
  run: () => Promise<string>,
): Promise<SelfTestCheck> {
  const start = performance.now();
  let ok = true;
  let detail: string;
  try {
    detail = await run();
  } catch (error) {
    ok = false;
    detail = error instanceof Error ? error.message : String(error);
  }
  return { id, label, ok, detail: hidePersonalPaths(detail), ms: Math.round(performance.now() - start) };
}

async function checkTempFolder(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ohmlab-check-"));
  try {
    const file = join(dir, "prueba.txt");
    await writeFile(file, "OhmLab", "utf8");
    if ((await readFile(file, "utf8")) !== "OhmLab") throw new Error(`No se pudo leer lo escrito en ${tmpdir()}`);
    return tmpdir();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function checkReference(engine: SimulationEngine): Promise<string> {
  const outcome = await simulateDc(REFERENCE, engine);
  if (!outcome.ok) throw new SimulationError(outcome.diagnostics[0].message, "failed");
  const v = outcome.result.nodeVoltages.salida;
  if (!(Math.abs(v - REFERENCE_EXPECTED) <= 1e-6)) {
    throw new Error(`El divisor de 12 V dio ${v} V en lugar de ${REFERENCE_EXPECTED} V`);
  }
  return `divisor de 12 V → ${v} V (esperado ${REFERENCE_EXPECTED} V)`;
}
