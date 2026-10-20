import { existsSync } from "node:fs";
import { simulateDc, type Circuit, type ComponentInstance } from "../src/index.ts";
import { NgspiceCliEngine } from "../src/node/index.ts";

// Dónde buscar ngspice para las pruebas: la variable NGSPICE_PATH si existe,
// si no la instalación local en F:, y si tampoco, "ngspice" del PATH (Linux).
const LOCAL_WINDOWS = "F:/Herramientas/ngspice/Spice64/bin/ngspice_con.exe";

export const ngspicePath =
  process.env.NGSPICE_PATH ?? (existsSync(LOCAL_WINDOWS) ? LOCAL_WINDOWS : "ngspice");

export const engine = new NgspiceCliEngine({ executable: ngspicePath });

/** Compara con error relativo 1e-6 y un mínimo absoluto de 1e-9. */
export function close(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= 1e-6 * Math.abs(expected) + 1e-9;
}

/** Simula y falla la prueba con los mensajes si hubo errores. */
export async function simulateOk(circuit: Circuit) {
  const outcome = await simulateDc(circuit, engine);
  if (!outcome.ok) {
    throw new Error(outcome.diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n"));
  }
  return outcome;
}

// Atajos para escribir circuitos cortos en las pruebas.
export const R = (id: string, a: string, b: string, resistance = 1000): ComponentInstance => ({
  id, type: "resistor", params: { resistance }, connections: { a, b },
});
export const V = (id: string, plus: string, minus: string, voltage = 10): ComponentInstance => ({
  id, type: "dc-voltage-source", params: { voltage }, connections: { plus, minus },
});
export const I = (id: string, from: string, to: string, current = 0.001): ComponentInstance => ({
  id, type: "dc-current-source", params: { current }, connections: { from, to },
});
export const GND = (id: string, node: string): ComponentInstance => ({
  id, type: "ground", params: {}, connections: { gnd: node },
});
export const circuit = (...components: ComponentInstance[]): Circuit => ({ components });
/** Multímetro en modo voltímetro (por defecto 1 GΩ, casi ideal). */
export const VM = (id: string, plus: string, com: string, resistance = 1e9): ComponentInstance => ({
  id, type: "voltmeter", params: { resistance }, connections: { plus, com },
});
export const AM = (id: string, plus: string, com: string): ComponentInstance => ({
  id, type: "ammeter", params: {}, connections: { plus, com },
});
export const OM = (id: string, plus: string, com: string): ComponentInstance => ({
  id, type: "ohmmeter", params: {}, connections: { plus, com },
});
