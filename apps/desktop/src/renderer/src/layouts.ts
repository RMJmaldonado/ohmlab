// Circuitos de práctica con su dibujo fijo. Son temporales: cuando exista
// el editor (pasos 5 y 6) se dibujarán arrastrando componentes.
import type { ComponentInstance } from "@ohmlab/core";

export type Point = [number, number];

export interface PartDrawing {
  id: string;
  kind: "resistor" | "vsource";
  /** Posición del primer pin (resistencia: terminal 1; fuente: +). */
  from: Point;
  /** Posición del segundo pin. */
  to: Point;
  /** Dónde va el nombre y el valor. */
  label: "left" | "right" | "above";
}

export interface Layout {
  id: string;
  title: string;
  description: string;
  width: number;
  height: number;
  components: ComponentInstance[];
  parts: PartDrawing[];
  /** Cables, cada uno con el nodo al que pertenece. */
  wires: { node: string; points: Point[] }[];
  /** Punto de cada nodo donde se dibujan las puntas del multímetro. */
  dots: { node: string; at: Point }[];
  grounds: Point[];
  /** Componentes que se pueden quitar, por ejemplo para medir Thévenin. */
  removable?: string[];
}

const R = (id: string, a: string, b: string, resistance: number): ComponentInstance => ({
  id, type: "resistor", params: { resistance }, connections: { a, b },
});
const V = (id: string, plus: string, minus: string, voltage: number): ComponentInstance => ({
  id, type: "dc-voltage-source", params: { voltage }, connections: { plus, minus },
});
const GND: ComponentInstance = { id: "GND1", type: "ground", params: {}, connections: { gnd: "0" } };

export const LAYOUTS: Layout[] = [
  {
    id: "divisor",
    title: "Divisor de tensión",
    description: "Dos resistencias en serie reparten la tensión de la fuente.",
    width: 420,
    height: 240,
    components: [V("V1", "entrada", "0", 12), R("R1", "entrada", "salida", 1000), R("R2", "salida", "0", 1000), GND],
    parts: [
      { id: "V1", kind: "vsource", from: [70, 95], to: [70, 145], label: "left" },
      { id: "R1", kind: "resistor", from: [160, 40], to: [250, 40], label: "above" },
      { id: "R2", kind: "resistor", from: [320, 90], to: [320, 170], label: "right" },
    ],
    wires: [
      { node: "entrada", points: [[70, 95], [70, 40], [160, 40]] },
      { node: "salida", points: [[250, 40], [320, 40], [320, 90]] },
      { node: "0", points: [[320, 170], [320, 200], [70, 200], [70, 145]] },
      { node: "0", points: [[195, 200], [195, 212]] },
    ],
    dots: [
      { node: "entrada", at: [70, 40] },
      { node: "salida", at: [320, 40] },
      { node: "0", at: [320, 200] },
    ],
    grounds: [[195, 212]],
  },
  {
    id: "wheatstone",
    title: "Puente de Wheatstone",
    description: "Quita R5 para medir el equivalente de Thévenin entre c y d.",
    width: 440,
    height: 290,
    components: [
      V("V1", "a", "0", 10),
      R("R1", "a", "c", 1000),
      R("R2", "c", "0", 1000),
      R("R3", "a", "d", 2000),
      R("R4", "d", "0", 1000),
      R("R5", "c", "d", 1000),
      GND,
    ],
    parts: [
      { id: "V1", kind: "vsource", from: [80, 115], to: [80, 175], label: "left" },
      { id: "R1", kind: "resistor", from: [170, 70], to: [170, 125], label: "left" },
      { id: "R2", kind: "resistor", from: [170, 165], to: [170, 220], label: "left" },
      { id: "R3", kind: "resistor", from: [330, 70], to: [330, 125], label: "right" },
      { id: "R4", kind: "resistor", from: [330, 165], to: [330, 220], label: "right" },
      { id: "R5", kind: "resistor", from: [210, 145], to: [290, 145], label: "above" },
    ],
    wires: [
      { node: "a", points: [[80, 115], [80, 40], [330, 40], [330, 70]] },
      { node: "a", points: [[170, 40], [170, 70]] },
      { node: "c", points: [[170, 125], [170, 165]] },
      { node: "c", points: [[170, 145], [210, 145]] },
      { node: "d", points: [[330, 125], [330, 165]] },
      { node: "d", points: [[290, 145], [330, 145]] },
      { node: "0", points: [[170, 220], [170, 250], [330, 250], [330, 220]] },
      { node: "0", points: [[170, 250], [80, 250], [80, 175]] },
      { node: "0", points: [[250, 250], [250, 262]] },
    ],
    dots: [
      { node: "a", at: [170, 40] },
      { node: "c", at: [170, 145] },
      { node: "d", at: [330, 145] },
      { node: "0", at: [170, 250] },
    ],
    grounds: [[250, 262]],
    removable: ["R5"],
  },
];

/** Nombre que el estudiante ve para cada nodo. */
export function nodeName(node: string): string {
  return node === "0" ? "tierra" : node;
}
