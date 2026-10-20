// Núcleo de OhmLab, sin nada que dependa de Node: lo pueden usar tanto la
// interfaz gráfica como el proceso principal. Lo que necesita Node está en
// "@ohmlab/core/node".
export type { Circuit, ComponentInstance } from "./circuit.ts";
export { componentDefs, findComponentDef, getComponentDef } from "./components/index.ts";
export type { ComponentDef, ParamDef, PinDef, Category, DcBehavior, MeterMode } from "./components/index.ts";
export { buildNetlist, type Netlist, type NetlistElement } from "./netlist.ts";
export { checkCircuit, nodesWithPathToGround, type CircuitCheck } from "./erc.ts";
export { hasErrors, joinNames, type Diagnostic, type DiagnosticCode, type Severity } from "./diagnostics.ts";
export { simulateDc, type DcOutcome, type DcResult, type ElementResult, type MeterReading } from "./simulate.ts";
export { measureResistance, type ResistanceReading } from "./measure-resistance.ts";
export { SimulationError, type SimulationEngine, type SimulationErrorKind } from "./engine/engine.ts";
export { describeSimulationError } from "./simulator-errors.ts";
export type { SelfTestCheck, SelfTestReport } from "./self-test-report.ts";
export { formatSI } from "./format.ts";
export { formatInput, parseValue } from "./values.ts";
export * from "./schematic/index.ts";
export * from "./practice/index.ts";
