// Simulación DC: revisa el circuito, calcula el punto de operación y las
// lecturas de los multímetros.
import type { Circuit } from "./circuit.ts";
import { findComponentDef, type MeterMode } from "./components/index.ts";
import { hasErrors, type Diagnostic } from "./diagnostics.ts";
import { SimulationError, type SimulationEngine } from "./engine/engine.ts";
import { checkCircuit } from "./erc.ts";
import { measureResistance } from "./measure-resistance.ts";
import { runOperatingPoint, type OperatingPoint } from "./operating-point.ts";
import { describeSimulationError } from "./simulator-errors.ts";

export type { ElementResult } from "./operating-point.ts";

export interface MeterReading {
  mode: MeterMode;
  /** En V, A u Ω. Infinity = circuito abierto (OL); NaN = no se pudo medir. */
  value: number;
}

export interface DcResult extends OperatingPoint {
  /** Lectura de cada multímetro, indexada por su id ("MM1"). */
  meters: Record<string, MeterReading>;
}

/** Si salió bien: resultados y avisos. Si no: los errores que lo impidieron. */
export type DcOutcome =
  | { ok: true; result: DcResult; warnings: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };

export async function simulateDc(circuit: Circuit, engine: SimulationEngine): Promise<DcOutcome> {
  const check = checkCircuit(circuit);
  if (hasErrors(check.diagnostics)) return { ok: false, diagnostics: check.diagnostics };
  try {
    // Si el circuito está apagado (solo se mide con el ohmímetro), todo vale 0.
    const op = check.powered ? await runOperatingPoint(check.simulable, engine) : zeroOperatingPoint(check.simulable);
    const warnings = [...check.diagnostics];
    const meters: Record<string, MeterReading> = {};

    for (const c of circuit.components) {
      const def = findComponentDef(c.type);
      const mode = def?.meter;
      if (!def || !mode) continue;
      if (def.probe && mode === "V") {
        // Punta de tensión: la tensión de su nodo respecto a tierra.
        const node = c.connections[def.pins[0].id];
        meters[c.id] = { mode, value: node !== undefined && node in op.nodeVoltages ? op.nodeVoltages[node] : Number.NaN };
      } else if (mode === "Ω") {
        const reading = await measureResistance(circuit, c.id, engine);
        meters[c.id] = { mode, value: reading.value };
        if (reading.problem) {
          warnings.push({
            ...reading.problem,
            severity: "warning",
            code: "ohmmeter-failed",
            message: `${c.id} no pudo medir la resistencia: ${reading.problem.message}`,
            components: [c.id, ...reading.problem.components.filter((id) => id !== c.id)],
          });
        }
      } else {
        const element = op.elements[c.id];
        meters[c.id] = { mode, value: element ? (mode === "V" ? element.voltage : element.current) : 0 };
      }
    }

    return { ok: true, result: { ...op, meters }, warnings };
  } catch (error) {
    if (!(error instanceof SimulationError)) throw error;
    return { ok: false, diagnostics: [describeSimulationError(error), ...check.diagnostics] };
  }
}

function zeroOperatingPoint(circuit: Circuit): OperatingPoint {
  const nodeVoltages: Record<string, number> = {};
  const elements: OperatingPoint["elements"] = {};
  for (const c of circuit.components) {
    const def = findComponentDef(c.type);
    for (const node of Object.values(c.connections)) nodeVoltages[node] = 0;
    if (def?.currentVector && def.pins.length === 2) elements[c.id] = { current: 0, voltage: 0, power: 0 };
  }
  return { nodeVoltages, elements };
}
