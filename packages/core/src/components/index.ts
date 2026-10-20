// Registro de componentes: la paleta y el generador de netlist leen de aquí.
import type { ComponentDef } from "./types.ts";
import { resistor } from "./resistor.ts";
import { dcVoltageSource } from "./dc-voltage-source.ts";
import { dcCurrentSource } from "./dc-current-source.ts";
import { ground } from "./ground.ts";
import { ammeter, ohmmeter, voltmeter } from "./multimeter.ts";
import { currentProbe, voltageProbe } from "./probes.ts";

export const componentDefs: ComponentDef[] = [
  resistor,
  dcVoltageSource,
  dcCurrentSource,
  ground,
  voltmeter,
  ammeter,
  ohmmeter,
  voltageProbe,
  currentProbe,
];

const byType = new Map(componentDefs.map((d) => [d.type, d]));

/** Devuelve la definición, o undefined si el tipo no existe. */
export function findComponentDef(type: string): ComponentDef | undefined {
  return byType.get(type);
}

export function getComponentDef(type: string): ComponentDef {
  const def = byType.get(type);
  if (!def) throw new Error(`Tipo de componente desconocido: "${type}"`);
  return def;
}

export type { ComponentDef, ParamDef, PinDef, Category, DcBehavior, MeterMode, SymbolGeometry } from "./types.ts";
