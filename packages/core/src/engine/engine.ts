// Interfaz del motor de simulación. Hoy la implementa ngspice como programa
// aparte (node/ngspice-cli.ts); más adelante podrá implementarla libngspice
// cargada como librería, sin cambiar nada del resto del núcleo.

export interface SimulationEngine {
  /** Nombre y versión del simulador, por ejemplo "ngspice 47". */
  version(): Promise<string>;
  /**
   * Análisis de punto de operación (.op). Recibe las líneas de elementos y
   * los vectores que se quieren leer; devuelve el valor de cada uno.
   */
  operatingPoint(lines: string[], vectors: string[]): Promise<Record<string, number>>;
}

/**
 *  - "not-found": no se encontró el programa del simulador.
 *  - "timeout": tardó demasiado y se detuvo.
 *  - "failed": se ejecutó, pero no dio un resultado válido.
 */
export type SimulationErrorKind = "not-found" | "timeout" | "failed";

export class SimulationError extends Error {
  constructor(
    message: string,
    readonly kind: SimulationErrorKind,
    /** Texto que devolvió el simulador, para mostrarlo o traducirlo. */
    readonly simulatorOutput = "",
  ) {
    super(message);
    this.name = "SimulationError";
  }
}
