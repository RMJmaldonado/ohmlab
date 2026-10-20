// Lectura del ohmímetro.
//
// Como en el laboratorio, la resistencia se mide con el circuito apagado:
// las fuentes de tensión quedan como un cable y las de corriente como un
// circuito abierto. Entre las puntas se pone una fuente de corriente de
// prueba y se mide la tensión que aparece: R = V / I. El resultado es
// exactamente la resistencia de Thévenin vista desde las puntas.
import type { Circuit, ComponentInstance } from "./circuit.ts";
import { findComponentDef } from "./components/index.ts";
import type { Diagnostic } from "./diagnostics.ts";
import type { SimulationEngine } from "./engine/engine.ts";
import { checkCircuit, nodesWithPathToGround } from "./erc.ts";
import { runOperatingPoint } from "./operating-point.ts";
import { UnionFind } from "./union-find.ts";

const TEST_CURRENT = 1e-3;

/** Errores que, en el circuito de prueba, significan "no hay camino entre las puntas". */
const OPEN_CIRCUIT = new Set(["current-source-open", "current-sources-series", "no-path-to-ground"]);

export interface ResistanceReading {
  /** En ohmios. Infinity = circuito abierto (OL); NaN = no se pudo medir. */
  value: number;
  /** Por qué no se pudo medir, si fue así. */
  problem?: Diagnostic;
}

export async function measureResistance(
  circuit: Circuit,
  ohmmeterId: string,
  engine: SimulationEngine,
): Promise<ResistanceReading> {
  const meter = circuit.components.find((c) => c.id === ohmmeterId)!;
  const { plus, com } = meter.connections;
  if (!plus || !com) return { value: Infinity };

  // 1. Circuito apagado, con la fuente de prueba en lugar del ohmímetro.
  let components: ComponentInstance[] = [];
  for (const c of circuit.components) {
    const def = findComponentDef(c.type);
    if (c.id === ohmmeterId || def?.meter === "Ω") continue;
    const off = def?.isSource ? { ...c, params: Object.fromEntries(Object.keys(c.params).map((k) => [k, 0])) } : c;
    components.push(off);
  }
  const testSource: ComponentInstance = {
    id: ohmmeterId,
    type: "dc-current-source",
    params: { current: TEST_CURRENT },
    connections: { from: com, to: plus },
  };
  components.push(testSource);

  // 2. Solo importa lo que está conectado a las puntas.
  components = connectedTo(components, [plus, com]);

  // 3. Si lo que se mide no tiene tierra, se le pone en la punta COM: así
  //    tiene referencia, y la resistencia entre las puntas no cambia.
  const grounded = nodesWithPathToGround({ components });
  if (!grounded.has(plus) && !grounded.has(com)) {
    components.push({ id: `${ohmmeterId}:tierra`, type: "ground", params: {}, connections: { gnd: com } });
  }

  const check = checkCircuit({ components });
  const errors = check.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    if (errors.some((d) => OPEN_CIRCUIT.has(d.code) && d.components.includes(ohmmeterId))) return { value: Infinity };
    return { value: Number.NaN, problem: errors[0] };
  }

  const result = await runOperatingPoint(check.simulable, engine);
  // La fuente de prueba va de COM a +: su "tensión" es V(COM) − V(+) = −I·R.
  const voltage = result.elements[ohmmeterId].voltage;
  return { value: Math.max(0, -voltage / TEST_CURRENT) };
}

/** Componentes conectados (por cualquier camino) a alguno de los nodos dados. */
function connectedTo(components: ComponentInstance[], start: string[]): ComponentInstance[] {
  const uf = new UnionFind();
  const GROUND = "\u0000tierra"; // todas las tierras son el mismo nodo
  const nodesOf = (c: ComponentInstance) => {
    const def = findComponentDef(c.type);
    const nodes = Object.values(c.connections).filter(Boolean);
    return def?.isGround ? [...nodes, GROUND] : nodes;
  };
  for (const c of components) {
    const nodes = nodesOf(c);
    for (const n of nodes.slice(1)) uf.union(nodes[0], n);
  }
  const roots = new Set(start.map((n) => uf.find(n)));
  return components.filter((c) => nodesOf(c).some((n) => roots.has(uf.find(n))));
}
