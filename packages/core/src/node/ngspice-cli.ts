// Motor que ejecuta ngspice como un proceso aparte, en modo batch (-b).
// Si ngspice falla o se cuelga, solo muere ese proceso, no la aplicación.
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SimulationError, type SimulationEngine } from "../engine/engine.ts";

export interface NgspiceCliOptions {
  /** Ruta al ejecutable de consola de ngspice. */
  executable: string;
  /** Tiempo máximo de una simulación, en milisegundos. */
  timeoutMs?: number;
}

export class NgspiceCliEngine implements SimulationEngine {
  constructor(private readonly options: NgspiceCliOptions) {}

  async version(): Promise<string> {
    const output = await this.exec(["-v"]);
    const m = output.match(/ngspice-(\S+)/);
    if (!m) throw new SimulationError("ngspice no informó su versión", "failed", output);
    return `ngspice ${m[1]}`;
  }

  async operatingPoint(lines: string[], vectors: string[]): Promise<Record<string, number>> {
    const netlist = [
      "* OhmLab",
      ...lines,
      ".control",
      // Por defecto ngspice imprime 7 cifras; pedimos 15 para no perder precisión
      "set numdgt=15",
      "op",
      ...vectors.map((v) => `print ${v}`),
      ".endc",
      ".end",
      "",
    ].join("\n");

    const output = await this.runNetlist(netlist);
    // Con "singular matrix" ngspice a veces igual devuelve números, pero no
    // tienen sentido físico: es mejor no mostrarlos.
    if (/singular matrix/i.test(output)) {
      throw new SimulationError("ngspice: matriz singular", "failed", output);
    }
    const values = parsePrintOutput(output);
    const missing = vectors.filter((v) => !(v.toLowerCase() in values));
    if (missing.length > 0) {
      throw new SimulationError(`ngspice no devolvió: ${missing.join(", ")}`, "failed", output);
    }
    return values;
  }

  private async runNetlist(netlist: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "ohmlab-"));
    try {
      const file = join(dir, "circuito.cir");
      await writeFile(file, netlist, "utf8");
      return await this.exec(["-b", file]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private exec(args: string[]): Promise<string> {
    const { executable, timeoutMs = 10_000 } = this.options;
    return new Promise((resolve, reject) => {
      execFile(
        executable,
        args,
        { timeout: timeoutMs, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, stderr) => {
          const output = `${stdout}\n${stderr}`;
          if (!error) return resolve(output);
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            reject(new SimulationError(`No se encontró ngspice en ${executable}`, "not-found", output));
          } else if (error.killed) {
            reject(new SimulationError(`ngspice tardó más de ${timeoutMs} ms`, "timeout", output));
          } else {
            reject(new SimulationError(`ngspice terminó con error: ${error.message}`, "failed", output));
          }
        },
      );
    });
  }
}

/** Lee líneas del tipo "n1 = 6.000000e+00" o "@r1[i] = 6.0e-03". */
export function parsePrintOutput(text: string): Record<string, number> {
  const values: Record<string, number> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(\S+)\s*=\s*([-+]?[0-9.]+(?:e[-+]?\d+)?)\s*$/i);
    if (m) values[m[1].toLowerCase()] = Number(m[2]);
  }
  return values;
}
