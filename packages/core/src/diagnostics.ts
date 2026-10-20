// Errores y avisos que se le muestran al estudiante.

export type Severity = "error" | "warning";

export type DiagnosticCode =
  // Revisión del circuito (erc.ts)
  | "empty-circuit"
  | "nothing-connected"
  | "duplicate-id"
  | "unknown-component"
  | "invalid-value"
  | "value-must-be-positive"
  | "no-ground"
  | "voltage-source-shorted"
  | "voltage-source-loop"
  | "current-source-open"
  | "current-sources-series"
  | "no-path-to-ground"
  | "floating-section"
  | "pin-dangling"
  | "component-ignored"
  | "component-shorted"
  | "no-sources"
  // Multímetro
  | "ammeter-shorted"
  | "ammeter-loop"
  | "ammeter-parallel"
  | "voltmeter-series"
  | "ohmmeter-failed"
  // Fallos del simulador (simulator-errors.ts)
  | "simulator-not-found"
  | "simulator-timeout"
  | "simulator-singular"
  | "simulator-no-convergence"
  | "simulator-failed";

export interface Diagnostic {
  /** "error" impide simular; "warning" deja simular, pero conviene revisarlo. */
  severity: Severity;
  /** Identificador fijo, para las pruebas y para futuras traducciones. */
  code: DiagnosticCode;
  /** Qué pasa, en palabras sencillas. */
  message: string;
  /** Cómo arreglarlo. */
  hint?: string;
  /** Componentes involucrados, para resaltarlos en el esquemático. */
  components: string[];
  /** Texto técnico (salida de ngspice), para un botón "Ver detalles". */
  details?: string;
}

export function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}

/**
 * ["R1", "R2", "R3"] → "R1, R2 y R3". Antes de un nombre que suena a "i"
 * se usa "e", como pide la ortografía: "I1 e I2".
 */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  const last = names[names.length - 1];
  const and = /^h?i(?![aeouáéóú])/i.test(last) ? "e" : "y";
  return `${names.slice(0, -1).join(", ")} ${and} ${last}`;
}
