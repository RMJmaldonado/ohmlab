// Ejercicios de la práctica con el multímetro. Cada uno tiene un circuito
// dibujado en la grilla (como en el editor), lo que hay que medir y lo que
// hay que hacer antes (quitar una pieza o apagar una fuente). Los valores se
// eligen al azar cada vez, para que no se puedan copiar las respuestas.
import type { MeterMode } from "../components/index.ts";
import { pinPositions } from "../schematic/geometry.ts";
import type { PlacedComponent, Point, Rotation, Schematic, Wire } from "../schematic/types.ts";

/** Lo que pide medir el ejercicio. */
export type Target =
  /** Tensión entre dos puntos (los extremos de una pieza, o dos nodos). */
  | { mode: "V"; across: [Point, Point]; what: string }
  /** Corriente que pasa por una pieza. */
  | { mode: "A"; through: string; what: string }
  /** Resistencia entre dos puntos. */
  | { mode: "Ω"; across: [Point, Point]; what: string };

/** Algo que el estudiante puede hacer al circuito antes de medir. */
export interface Change {
  component: string;
  /** Quitarla (queda abierto) o apagarla (una fuente reemplazada por un cable). */
  action: "remove" | "turn-off";
}

export interface Exercise {
  id: string;
  title: string;
  /** Lo que se le pide al estudiante. */
  task: string;
  /** Qué es cada valor que se elige al azar. */
  values: Record<string, "R" | "V">;
  /** El circuito con esos valores. */
  build(values: Record<string, number>): Schematic;
  target: Target;
  /** Cambios que ofrece el ejercicio (casillas en la pantalla). */
  changes: Change[];
  /** Cambios que hay que hacer para que la medición sea correcta. */
  required: Change[];
  /** Nombres de puntos que menciona el enunciado ("c", "d"), con el lado donde se escriben. */
  labels?: { text: string; at: Point; side: "left" | "right" }[];
  /** Condición extra sobre los valores (por ejemplo, que no queden iguales). */
  valid?(values: Record<string, number>): boolean;
}

/** Un ejercicio con sus valores ya elegidos. */
export interface ExerciseInstance {
  exercise: Exercise;
  values: Record<string, number>;
  schematic: Schematic;
}

// Valores comerciales de la serie E12, de 1 kΩ a 8,2 kΩ, y fuentes típicas.
export const RESISTOR_VALUES = [1000, 1200, 1500, 1800, 2200, 2700, 3300, 3900, 4700, 5600, 6800, 8200];
export const SOURCE_VALUES = [5, 6, 9, 10, 12, 15];

/** Elige valores al azar, todos distintos entre sí, hasta cumplir la condición del ejercicio. */
export function newExercise(exercise: Exercise, random: () => number = Math.random): ExerciseInstance {
  for (;;) {
    const values: Record<string, number> = {};
    const used = new Set<number>();
    for (const [id, kind] of Object.entries(exercise.values)) {
      const pool = (kind === "R" ? RESISTOR_VALUES : SOURCE_VALUES).filter((v) => !used.has(v));
      const value = pool[Math.floor(random() * pool.length)];
      used.add(value);
      values[id] = value;
    }
    if (!exercise.valid || exercise.valid(values)) return { exercise, values, schematic: exercise.build(values) };
  }
}

// ── Ayudas para dibujar los circuitos ──────────────────────────────────────

const part = (id: string, type: string, x: number, y: number, rotation: Rotation, params: Record<string, number> = {}): PlacedComponent => ({
  id, type, params, x, y, rotation, mirror: false,
});
const resistor = (id: string, x: number, y: number, vertical: boolean, values: Record<string, number>) =>
  part(id, "resistor", x, y, vertical ? 90 : 0, { resistance: values[id] });
const source = (id: string, x: number, y: number, values: Record<string, number>) =>
  part(id, "dc-voltage-source", x, y, 0, { voltage: values[id] });
const ground = (x: number, y: number) => part("GND1", "ground", x, y, 0);

/** Cables que pasan por los puntos dados, un tramo por cada par. */
function wires(...paths: Point[][]): Wire[] {
  const result: Wire[] = [];
  for (const path of paths) {
    for (let i = 1; i < path.length; i++) result.push({ id: `wire-${result.length + 1}`, a: path[i - 1], b: path[i] });
  }
  return result;
}

/** Los dos pines de una pieza, para medir entre sus extremos. */
function endsOf(schematic: Schematic, id: string): [Point, Point] {
  const [a, b] = Object.values(pinPositions(schematic.components.find((c) => c.id === id)!));
  return [a, b];
}

// ── Circuitos ──────────────────────────────────────────────────────────────

/**
 * Serie: V1 a la izquierda, R1 arriba y R2 a la derecha.
 *
 *   ┌──R1──┐
 *   V1     R2
 *   └──⏚───┘
 */
function seriesCircuit(v: Record<string, number>): Schematic {
  return {
    version: 1,
    components: [source("V1", 0, 4, v), resistor("R1", 4, 0, false, v), resistor("R2", 8, 4, true, v), ground(4, 6)],
    wires: wires([[0, 2], [0, 0], [2, 0]], [[6, 0], [8, 0], [8, 2]], [[8, 6], [0, 6]]),
  };
}

/**
 * Serie y paralelo: R1 en serie con R2 ∥ R3.
 *
 *   ┌──R1──┬────┐
 *   V1     R2   R3
 *   └──⏚───┴────┘
 */
function parallelCircuit(v: Record<string, number>): Schematic {
  return {
    version: 1,
    components: [
      source("V1", 0, 4, v),
      resistor("R1", 4, 0, false, v),
      resistor("R2", 8, 4, true, v),
      resistor("R3", 12, 4, true, v),
      ground(4, 6),
    ],
    wires: wires([[0, 2], [0, 0], [2, 0]], [[6, 0], [12, 0], [12, 2]], [[8, 0], [8, 2]], [[12, 6], [0, 6]]),
  };
}

/**
 * Puente de Wheatstone: R1–R2 a la izquierda (nodo c), R3–R4 a la derecha
 * (nodo d) y R5 entre c y d.
 */
function bridgeCircuit(v: Record<string, number>): Schematic {
  return {
    version: 1,
    components: [
      source("V1", 0, 6, v),
      resistor("R1", 4, 2, true, v),
      resistor("R2", 4, 10, true, v),
      resistor("R3", 12, 2, true, v),
      resistor("R4", 12, 10, true, v),
      resistor("R5", 8, 6, false, v),
      ground(8, 12),
    ],
    wires: wires(
      [[0, 4], [0, 0], [12, 0]],
      [[0, 8], [0, 12], [12, 12]],
      [[4, 4], [4, 8]],
      [[12, 4], [12, 8]],
      [[4, 6], [6, 6]],
      [[10, 6], [12, 6]],
    ),
  };
}

const SERIES = { V1: "V", R1: "R", R2: "R" } as const;
const PARALLEL = { V1: "V", R1: "R", R2: "R", R3: "R" } as const;
const BRIDGE = { V1: "V", R1: "R", R2: "R", R3: "R", R4: "R", R5: "R" } as const;
/** El puente no debe quedar equilibrado: por R5 pasaría 0 A y no habría nada que medir. */
const unbalanced = (v: Record<string, number>) => Math.abs(v.R1 * v.R4 - v.R2 * v.R3) > 0.2 * v.R1 * v.R4;

// Puntos de los nodos c y d del puente (sobre los cables, sigan o no R5).
const NODE_C: Point = [4, 6];
const NODE_D: Point = [12, 6];
const BRIDGE_LABELS: Exercise["labels"] = [
  { text: "c", at: NODE_C, side: "left" },
  { text: "d", at: NODE_D, side: "right" },
];

export const EXERCISES: Exercise[] = [
  {
    id: "tension-serie",
    title: "Tensión en un divisor",
    task: "Mide la tensión en R2.",
    values: SERIES,
    build: seriesCircuit,
    target: { mode: "V", across: endsOf(seriesCircuit({}), "R2"), what: "la tensión en R2" },
    changes: [],
    required: [],
  },
  {
    id: "corriente-serie",
    title: "Corriente en serie",
    task: "Mide la corriente que circula por el circuito.",
    values: SERIES,
    build: seriesCircuit,
    target: { mode: "A", through: "R1", what: "la corriente del circuito" },
    changes: [],
    required: [],
  },
  {
    id: "tension-paralelo",
    title: "Tensión en paralelo",
    task: "Mide la tensión en R3.",
    values: PARALLEL,
    build: parallelCircuit,
    target: { mode: "V", across: endsOf(parallelCircuit({}), "R3"), what: "la tensión en R3" },
    changes: [],
    required: [],
  },
  {
    id: "corriente-rama",
    title: "Corriente de una rama",
    task: "Mide la corriente que pasa por R3.",
    values: PARALLEL,
    build: parallelCircuit,
    target: { mode: "A", through: "R3", what: "la corriente por R3" },
    changes: [],
    required: [],
  },
  {
    id: "corriente-total",
    title: "Corriente total",
    task: "Mide la corriente que entrega la fuente V1.",
    values: PARALLEL,
    build: parallelCircuit,
    target: { mode: "A", through: "R1", what: "la corriente de la fuente" },
    changes: [],
    required: [],
  },
  {
    id: "resistencia-equivalente",
    title: "Resistencia equivalente",
    task: "Mide la resistencia equivalente que ve la fuente, entre sus dos terminales.",
    values: PARALLEL,
    build: parallelCircuit,
    target: { mode: "Ω", across: endsOf(parallelCircuit({}), "V1"), what: "la resistencia equivalente" },
    changes: [{ component: "V1", action: "remove" }],
    required: [{ component: "V1", action: "remove" }],
  },
  {
    id: "corriente-puente",
    title: "Corriente por el puente",
    task: "Mide la corriente que pasa por R5, el puente entre c y d.",
    values: BRIDGE,
    build: bridgeCircuit,
    target: { mode: "A", through: "R5", what: "la corriente por R5" },
    changes: [],
    required: [],
    valid: unbalanced,
    labels: BRIDGE_LABELS,
  },
  {
    id: "tension-thevenin",
    title: "Tensión de Thévenin",
    task: "Quita R5 y mide la tensión de Thévenin entre c y d.",
    values: BRIDGE,
    build: bridgeCircuit,
    target: { mode: "V", across: [NODE_C, NODE_D], what: "la tensión de Thévenin" },
    changes: [{ component: "R5", action: "remove" }],
    required: [{ component: "R5", action: "remove" }],
    valid: unbalanced,
    labels: BRIDGE_LABELS,
  },
  {
    id: "resistencia-thevenin",
    title: "Resistencia de Thévenin",
    task: "Quita R5, apaga V1 (en su lugar va un cable) y mide la resistencia de Thévenin entre c y d.",
    values: BRIDGE,
    build: bridgeCircuit,
    target: { mode: "Ω", across: [NODE_C, NODE_D], what: "la resistencia de Thévenin" },
    changes: [
      { component: "R5", action: "remove" },
      { component: "V1", action: "turn-off" },
    ],
    required: [
      { component: "R5", action: "remove" },
      { component: "V1", action: "turn-off" },
    ],
    valid: unbalanced,
    labels: BRIDGE_LABELS,
  },
];

export type { MeterMode };
