// Punto de operación (DC): arma el netlist, pide a ngspice tensiones y
// corrientes, y las devuelve con los nombres que eligió el usuario.
// Recibe un circuito ya revisado (CircuitCheck.simulable).
import type { Circuit } from "./circuit.ts";
import type { SimulationEngine } from "./engine/engine.ts";
import { buildNetlist } from "./netlist.ts";

export interface ElementResult {
  /** Corriente que entra por el primer pin (A). */
  current: number;
  /** Tensión del primer pin menos la del segundo (V). */
  voltage: number;
  /** Potencia absorbida (W). Negativa si el elemento entrega energía. */
  power: number;
}

export interface OperatingPoint {
  /** Tensión de cada nodo respecto a tierra (V). */
  nodeVoltages: Record<string, number>;
  /** Resultados por componente, indexados por su id ("R1"). */
  elements: Record<string, ElementResult>;
}

export async function runOperatingPoint(circuit: Circuit, engine: SimulationEngine): Promise<OperatingPoint> {
  const netlist = buildNetlist(circuit);

  const spiceNodes = [...new Set(netlist.nodeMap.values())].filter((n) => n !== "0");
  const currentVectors = netlist.elements
    .filter((e) => e.def.currentVector)
    .map((e) => e.def.currentVector!(e.spiceName));

  const values = await engine.operatingPoint(netlist.lines, [...spiceNodes, ...currentVectors]);
  const voltageOf = (spiceNode: string) => (spiceNode === "0" ? 0 : values[spiceNode]);

  const nodeVoltages: Record<string, number> = {};
  for (const [userNode, spiceNode] of netlist.nodeMap) nodeVoltages[userNode] = voltageOf(spiceNode);

  const elements: Record<string, ElementResult> = {};
  for (const e of netlist.elements) {
    if (!e.def.currentVector || e.spiceNodes.length !== 2) continue;
    const current = values[e.def.currentVector(e.spiceName).toLowerCase()];
    const voltage = voltageOf(e.spiceNodes[0]) - voltageOf(e.spiceNodes[1]);
    elements[e.instance.id] = { current, voltage, power: voltage * current };
  }

  return { nodeVoltages, elements };
}
