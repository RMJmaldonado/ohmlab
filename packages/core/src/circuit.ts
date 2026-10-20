// Modelo de circuito que entiende el núcleo.
// No sabe nada de posiciones ni de cables dibujados: solo qué componente hay
// y a qué nodo va cada uno de sus pines. Los nodos de un dibujo los calcula
// schematic/connectivity.ts (schematicToCircuit).

export interface ComponentInstance {
  /** Nombre único en el circuito, el que ve el usuario: "R1", "V1"... */
  id: string;
  /** Tipo de componente registrado: "resistor", "dc-voltage-source"... */
  type: string;
  /** Valores de los parámetros en unidades SI (ohmios, voltios, amperios). */
  params: Record<string, number>;
  /** Pin → nombre del nodo al que está conectado. */
  connections: Record<string, string>;
}

export interface Circuit {
  components: ComponentInstance[];
}
