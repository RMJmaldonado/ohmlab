// Convierte un Circuit en las líneas de elementos de un netlist SPICE.
//
// Los nombres que eligió el usuario no se pasan tal cual a ngspice: los nodos
// se renombran a n1, n2... y los elementos a R1, V1... por orden de aparición.
// Así un nombre raro (espacios, tildes, "0") nunca rompe la sintaxis SPICE,
// y guardamos las tablas para traducir los resultados de vuelta.
import type { Circuit, ComponentInstance } from "./circuit.ts";
import { getComponentDef, type ComponentDef } from "./components/index.ts";

export interface NetlistElement {
  instance: ComponentInstance;
  def: ComponentDef;
  /** Nombre del elemento en SPICE, en minúsculas como lo devuelve ngspice. */
  spiceName: string;
  /** Nodo SPICE de cada pin, en el orden de def.pins. */
  spiceNodes: string[];
}

export interface Netlist {
  /** Líneas de elementos, sin título, .control ni .end. */
  lines: string[];
  elements: NetlistElement[];
  /** Nodo del usuario → nodo SPICE ("0" para tierra). */
  nodeMap: Map<string, string>;
}

export function buildNetlist(circuit: Circuit): Netlist {
  const defs = circuit.components.map((c) => ({ instance: c, def: getComponentDef(c.type) }));

  // 1. Todos los nodos tocados por una tierra pasan a ser el nodo 0.
  const nodeMap = new Map<string, string>();
  for (const { instance, def } of defs) {
    if (!def.isGround) continue;
    for (const pin of def.pins) nodeMap.set(pinNode(instance, pin.id), "0");
  }

  // 2. El resto se numera n1, n2... en el orden en que aparecen.
  let nodeCount = 0;
  for (const { instance, def } of defs) {
    for (const pin of def.pins) {
      const node = pinNode(instance, pin.id);
      if (!nodeMap.has(node)) nodeMap.set(node, `n${++nodeCount}`);
    }
  }

  // 3. Una línea por elemento (la tierra no genera línea).
  const counters = new Map<string, number>();
  const lines: string[] = [];
  const elements: NetlistElement[] = [];
  for (const { instance, def } of defs) {
    if (def.isGround || !def.toSpice) continue;
    for (const param of def.params) checkParam(instance, param.id, param.positive);
    // Cada letra SPICE lleva su propia cuenta: r1, r2... aunque una "r" sea un voltímetro.
    const letter = def.spicePrefix ?? def.prefix;
    const n = (counters.get(letter) ?? 0) + 1;
    counters.set(letter, n);
    const spiceName = `${letter}${n}`.toLowerCase();
    const spiceNodes = def.pins.map((pin) => nodeMap.get(pinNode(instance, pin.id))!);
    lines.push(def.toSpice(spiceName, spiceNodes, instance.params));
    elements.push({ instance, def, spiceName, spiceNodes });
  }

  return { lines, elements, nodeMap };
}

function pinNode(instance: ComponentInstance, pinId: string): string {
  const node = instance.connections[pinId];
  if (node === undefined || node === "") {
    throw new Error(`El pin "${pinId}" de ${instance.id} no está conectado`);
  }
  return node;
}

function checkParam(instance: ComponentInstance, paramId: string, positive?: boolean) {
  const value = instance.params[paramId];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${instance.id}: falta el valor de "${paramId}"`);
  }
  if (positive && value <= 0) {
    throw new Error(`${instance.id}: "${paramId}" debe ser mayor que cero`);
  }
}
