// El esquemático tal como lo dibuja el estudiante: componentes con posición
// y giro, y cables. Es lo que se guardará en los archivos de OhmLab (paso 9).
// Las posiciones van en cuadros de la grilla, siempre números enteros.

export type Rotation = 0 | 90 | 180 | 270;

/** Punto de la grilla: [x, y], con y hacia abajo. */
export type Point = [number, number];

export interface PlacedComponent {
  /** Nombre visible y único: "R1", "V1", "MM1"... */
  id: string;
  type: string;
  params: Record<string, number>;
  /** Posición del origen del símbolo, en cuadros de la grilla. */
  x: number;
  y: number;
  /** Giro en sentido horario, en grados. */
  rotation: Rotation;
  /** Volteado horizontalmente (antes de girar). */
  mirror: boolean;
}

/**
 * Un tramo recto de cable, siempre horizontal o vertical. Un cable con
 * esquinas son varios tramos que comparten sus extremos.
 */
export interface Wire {
  /** "wire-1", "wire-2"... El guion impide que choque con un nombre de componente. */
  id: string;
  a: Point;
  b: Point;
}

export interface Schematic {
  /** Versión del formato, para poder leer archivos viejos en el futuro. */
  version: 1;
  components: PlacedComponent[];
  wires: Wire[];
}

export const emptySchematic = (): Schematic => ({ version: 1, components: [], wires: [] });
