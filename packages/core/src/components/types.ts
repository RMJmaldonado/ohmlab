// Cómo se describe un tipo de componente. Añadir un componente nuevo
// (capacitor, diodo...) es escribir un archivo con uno de estos objetos
// y registrarlo en components/index.ts.

export type Category = "basic" | "sources" | "instruments";

/** Lo que mide un multímetro: tensión, corriente o resistencia. */
export type MeterMode = "V" | "A" | "Ω";

/**
 * Cómo se comporta el componente en corriente continua. La revisión del
 * circuito (erc.ts) lo usa para encontrar lazos de fuentes de tensión y
 * partes sin camino a tierra.
 *  - "resistive": deja pasar corriente (resistencias; más adelante, diodos...).
 *  - "voltage": fija la tensión entre sus terminales (fuentes de tensión;
 *    en continua, también las bobinas).
 *  - "current": fija la corriente, pero no ofrece camino propio (fuentes de corriente).
 *  - "open": no deja pasar corriente continua (capacitores).
 */
export type DcBehavior = "resistive" | "voltage" | "current" | "open";

export interface PinDef {
  id: string;
  /** Marca corta junto al pin en el símbolo: "1", "+", "−". */
  label: string;
  /** Cómo se nombra el pin en los mensajes, con artículo. Si falta: "el terminal <label>". */
  description?: string;
}

export interface ParamDef {
  id: string;
  label: string;
  /** Unidad SI que se muestra al usuario: "Ω", "V", "A". */
  unit: string;
  default: number;
  /** Si el valor debe ser estrictamente mayor que cero (p. ej. una resistencia). */
  positive?: boolean;
}

/**
 * Dónde está cada pin en el símbolo, en cuadros de la grilla, con el
 * componente sin girar. El origen (0, 0) es el punto por el que se agarra.
 */
export interface SymbolGeometry {
  pins: Record<string, [number, number]>;
}

export interface ComponentDef {
  type: string;
  /** Nombre en la paleta, en español. */
  label: string;
  category: Category;
  /** Letras con las que se numera en el esquemático: "R" → R1, R2... */
  prefix: string;
  /** Letra del elemento en SPICE, si no es la misma que `prefix` (p. ej. un voltímetro es una "R"). */
  spicePrefix?: string;
  /**
   * Pines del componente. En los de dos pines, la corriente se mide
   * entrando por pins[0] y saliendo por pins[1] (convención pasiva de signos).
   */
  pins: PinDef[];
  params: ParamDef[];
  symbol: SymbolGeometry;
  /** Obligatorio en todos los componentes salvo la tierra. */
  dc?: DcBehavior;
  /** Fuente independiente: es lo que "alimenta" el circuito. */
  isSource?: boolean;
  /** Si es un modo del multímetro (o una punta de prueba), qué mide. */
  meter?: MeterMode;
  /**
   * Punta de prueba: se suelta sobre un cable. Con meter "V" marca la tensión
   * de su punto respecto a tierra, sin formar parte del circuito; con "A" es
   * un amperímetro pequeño que queda en serie.
   */
  probe?: boolean;
  /** La tierra no genera línea SPICE: solo marca su nodo como nodo 0. */
  isGround?: boolean;
  /** Línea SPICE del elemento. `nodes` va en el mismo orden que `pins`. */
  toSpice?(name: string, nodes: string[], params: Record<string, number>): string;
  /** Vector de ngspice con la corriente que entra por pins[0]. */
  currentVector?(name: string): string;
}
