// Revisión del circuito antes de simular (en inglés, ERC: "electrical rules check").
//
// ngspice no siempre avisa cuando un circuito no tiene sentido: sin tierra,
// con una fuente de corriente abierta o con fuentes de corriente en serie
// devuelve números inventados sin dar ningún error. Por eso revisamos
// nosotros antes y explicamos el problema en español.
import type { Circuit, ComponentInstance } from "./circuit.ts";
import { findComponentDef, type ComponentDef, type PinDef } from "./components/index.ts";
import { joinNames, type Diagnostic } from "./diagnostics.ts";
import { UnionFind } from "./union-find.ts";

export interface CircuitCheck {
  /** Primero los errores y después los avisos. */
  diagnostics: Diagnostic[];
  /**
   * Circuito listo para la simulación normal: sin ohmímetros, sin los
   * componentes desconectados y con cada pin sin conexión en su propio nodo.
   * Solo sirve si no hay errores.
   */
  simulable: Circuit;
  /**
   * false cuando no hay fuentes y solo se mide con el ohmímetro: el circuito
   * está "apagado" y no hace falta la simulación normal.
   */
  powered: boolean;
}

/** Un componente con su definición y el nodo de cada pin (en el orden de def.pins). */
interface Item {
  instance: ComponentInstance;
  def: ComponentDef;
  nodes: string[];
}

interface PinRef {
  item: Item;
  pin: PinDef;
}

/** Prefijo de los nodos que se inventan para pines sin conexión. */
const LOOSE_PREFIX = "~";

export function checkCircuit(circuit: Circuit): CircuitCheck {
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  const error = (d: Omit<Diagnostic, "severity">) => errors.push({ severity: "error", ...d });
  const warn = (d: Omit<Diagnostic, "severity">) => warnings.push({ severity: "warning", ...d });

  // 1. Cada componente por separado: nombre, tipo y valores.
  const idCount = new Map<string, number>();
  for (const c of circuit.components) idCount.set(c.id, (idCount.get(c.id) ?? 0) + 1);
  for (const [id, count] of idCount) {
    if (count < 2) continue;
    error({
      code: "duplicate-id",
      message: `Hay ${count} componentes llamados ${id}.`,
      hint: "Cada componente necesita un nombre distinto: cambia el nombre de uno de ellos.",
      components: [id],
    });
  }

  const items: Item[] = [];
  circuit.components.forEach((instance, index) => {
    const def = findComponentDef(instance.type);
    if (!def) {
      error({
        code: "unknown-component",
        message: `${instance.id} es de un tipo que esta versión de OhmLab no conoce ("${instance.type}").`,
        hint: "Puede que el archivo se haya creado con una versión más nueva: actualiza OhmLab.",
        components: [instance.id],
      });
      return;
    }
    for (const param of def.params) {
      const value = instance.params[param.id];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        error({
          code: "invalid-value",
          message: `${instance.id} no tiene un valor válido de ${param.label.toLowerCase()}.`,
          hint: `Haz doble clic en ${instance.id} y escribe un número.`,
          components: [instance.id],
        });
      } else if (param.positive && value <= 0) {
        error({
          code: "value-must-be-positive",
          message: `${param.label} de ${instance.id} debe ser mayor que 0 ${param.unit} (ahora vale ${value} ${param.unit}).`,
          hint:
            param.id === "resistance" && value === 0
              ? "Para unir dos puntos directamente, usa un cable en lugar de una resistencia de 0 Ω."
              : `Haz doble clic en ${instance.id} y corrige el valor.`,
          components: [instance.id],
        });
      }
    }
    // Un pin sin conexión recibe un nodo propio, que nadie más toca.
    const nodes = def.pins.map((pin) => instance.connections[pin.id] || `${LOOSE_PREFIX}${index}:${pin.id}`);
    items.push({ instance, def, nodes });
  });

  // El ohmímetro no forma parte del circuito en la simulación normal: mide
  // aparte, con las fuentes apagadas (measure-resistance.ts).
  const ohmmeters = items.filter((i) => i.def.meter === "Ω");
  // La punta de tensión tampoco: solo lee la tensión del punto que toca.
  const isVoltageProbe = (i: Item) => i.def.probe === true && i.def.meter === "V";
  const voltageProbes = items.filter(isVoltageProbe);
  const wired = items.filter((i) => i.def.meter !== "Ω" && !isVoltageProbe(i));
  const parts = wired.filter((i) => !i.def.isGround);
  const grounds = wired.filter((i) => i.def.isGround);
  const finish = (ignored = new Set<Item>(), powered = true): CircuitCheck => ({
    diagnostics: [...errors, ...warnings],
    simulable: { components: wired.filter((i) => !ignored.has(i)).map(toInstance) },
    powered,
  });

  // 2. Qué pines toca cada nodo.
  const pinsAt = new Map<string, PinRef[]>();
  for (const item of wired) {
    item.def.pins.forEach((pin, k) => {
      const node = item.nodes[k];
      if (!pinsAt.has(node)) pinsAt.set(node, []);
      pinsAt.get(node)!.push({ item, pin });
    });
  }

  for (const probe of voltageProbes) {
    if (pinsAt.has(probe.nodes[0])) continue;
    warn({
      code: "pin-dangling",
      message: `${probe.instance.id} no toca ningún cable del circuito, así que no marca nada.`,
      hint: "Suelta la punta de tensión sobre el cable cuyo voltaje quieres ver.",
      components: [probe.instance.id],
    });
  }

  const probedNodes = new Set(ohmmeters.flatMap((o) => o.nodes));
  const checkOhmmeterProbes = () => {
    for (const o of ohmmeters) {
      o.def.pins.forEach((pin, k) => {
        if (pinsAt.has(o.nodes[k])) return;
        warn({
          code: "pin-dangling",
          message: `${capitalize(describePin(pin))} de ${o.instance.id} no tiene ninguna conexión, así que el ohmímetro marca OL (circuito abierto).`,
          hint: "Toca con las dos puntas los extremos de lo que quieres medir.",
          components: [o.instance.id],
        });
      });
    }
  };

  if (parts.length === 0) {
    if (ohmmeters.length > 0) {
      checkOhmmeterProbes();
      return finish(new Set(), false);
    }
    if (errors.length === 0) {
      error({
        code: "empty-circuit",
        message: "El circuito está vacío.",
        hint: "Arrastra componentes desde la paleta y únelos con cables.",
        components: [],
      });
    }
    return finish();
  }

  // 3. Componentes que no tocan a ningún otro: se dejan fuera de la simulación.
  const isIsolated = (item: Item) => item.nodes.every((n) => pinsAt.get(n)!.every((p) => p.item === item));
  const ignored = new Set(parts.filter(isIsolated));
  const active = parts.filter((p) => !ignored.has(p));
  const powered = active.some((i) => i.def.isSource);

  if (!powered && ohmmeters.length > 0) {
    // Circuito apagado medido con el ohmímetro, como se hace en el laboratorio.
    checkOhmmeterProbes();
    return finish(ignored, false);
  }
  if (active.length === 0) {
    error({
      code: "nothing-connected",
      message: "Ningún componente está conectado a otro.",
      hint: "Une los terminales de los componentes con cables para formar un circuito.",
      components: parts.map((p) => p.instance.id),
    });
    return finish(ignored);
  }
  for (const item of ignored) {
    if (item.nodes.some((n) => probedNodes.has(n))) continue; // lo está midiendo un ohmímetro
    const id = item.instance.id;
    warn({
      code: "component-ignored",
      message: item.def.meter
        ? `${id} no está conectado al circuito, así que marca 0.`
        : `${id} no está conectado al resto del circuito, así que no se incluye en la simulación.`,
      hint: "Conéctalo con cables si quieres que forme parte del circuito.",
      components: [id],
    });
  }

  // 4. Tierra. Todos los nodos con un símbolo de tierra son el mismo nodo (0 V).
  const groundNodes = [...new Set(grounds.flatMap((g) => g.nodes))];
  const groundNodeSet = new Set(groundNodes);
  const touchesActive = (node: string) => pinsAt.get(node)!.some((p) => !p.item.def.isGround && !ignored.has(p.item));
  const hasGround = groundNodes.some(touchesActive);
  if (!hasGround) {
    error({
      code: "no-ground",
      message: grounds.length > 0 ? "La tierra no está conectada al circuito." : "Falta la tierra.",
      hint:
        grounds.length > 0
          ? "Une el símbolo de tierra (⏚) a algún punto del circuito con un cable."
          : "Agrega el símbolo de tierra (⏚) y conéctalo a algún punto del circuito: es la referencia de 0 V desde la que se miden todas las tensiones.",
      components: grounds.map((g) => g.instance.id),
    });
  }
  const withGroundsJoined = () => {
    const uf = new UnionFind();
    for (const node of groundNodes) uf.union(groundNodes[0], node);
    return uf;
  };
  const sameNode = withGroundsJoined();

  // 5. Componentes con todos sus terminales unidos (en cortocircuito).
  const shorted = new Set<Item>();
  for (const item of active) {
    if (item.nodes.length < 2) continue;
    const first = sameNode.find(item.nodes[0]);
    if (!item.nodes.every((n) => sameNode.find(n) === first)) continue;
    shorted.add(item);
    const id = item.instance.id;
    if (item.def.meter === "A") {
      error({
        code: "ammeter-shorted",
        message: `Las dos puntas de ${id} están en el mismo punto, así que no puede medir ninguna corriente.`,
        hint: "El amperímetro se conecta en serie: abre el circuito donde quieres medir y pon el amperímetro en el hueco.",
        components: [id],
      });
    } else if (item.def.dc === "voltage") {
      error({
        code: "voltage-source-shorted",
        message: `${id} está en cortocircuito: sus dos terminales están unidos.`,
        hint: "Una fuente de tensión ideal en cortocircuito daría una corriente infinita. Quita el cable que une sus terminales o agrega una resistencia.",
        components: [id],
      });
    } else {
      warn({
        code: "component-shorted",
        message: item.def.meter
          ? `Las dos puntas de ${id} están en el mismo punto, así que marca 0.`
          : item.def.dc === "current"
            ? `${id} tiene sus dos terminales unidos: su corriente vuelve a la fuente sin recorrer el circuito.`
            : `${id} tiene sus dos terminales unidos (está en cortocircuito), así que por ${id} no circula corriente.`,
        hint: `Revisa los cables: probablemente uno une los dos terminales de ${id}.`,
        components: [id],
      });
    }
  }

  // 6. Lazos formados solo por fuentes de tensión (o amperímetros, que son
  //    fuentes de 0 V): por ejemplo, dos fuentes en paralelo.
  const loops = withGroundsJoined();
  const accepted: VoltageEdge[] = [];
  const ammetersInLoops = new Set<Item>();
  for (const item of active) {
    if (item.def.dc !== "voltage" || shorted.has(item)) continue;
    const a = sameNode.find(item.nodes[0]);
    const b = sameNode.find(item.nodes[1]);
    if (loops.find(a) !== loops.find(b)) {
      loops.union(a, b);
      accepted.push({ item, a, b });
      continue;
    }
    const loop = [...pathBetween(accepted, a, b), item].sort((x, y) => items.indexOf(x) - items.indexOf(y));
    const ids = loop.map((i) => i.instance.id);
    const ammeterIds = loop.filter((i) => i.def.meter === "A").map((i) => i.instance.id);
    const otherIds = ids.filter((id) => !ammeterIds.includes(id));
    if (ammeterIds.length > 0) {
      for (const i of loop) if (i.def.meter === "A") ammetersInLoops.add(i);
      error({
        code: "ammeter-loop",
        message:
          otherIds.length > 0
            ? `${joinNames(ammeterIds)} está conectado directamente a ${joinNames(otherIds)}, sin ninguna resistencia: es un cortocircuito.`
            : `${joinNames(ammeterIds)} están en paralelo entre sí: no se sabe cuánta corriente pasa por cada uno.`,
        hint: "Un amperímetro casi no tiene resistencia, así que se conecta en serie: abre el circuito donde quieres medir y pon el amperímetro en el hueco.",
        components: ids,
      });
    } else {
      error({
        code: "voltage-source-loop",
        message:
          ids.length === 2
            ? `${joinNames(ids)} están conectadas en paralelo.`
            : `${joinNames(ids)} forman un lazo cerrado solo con fuentes de tensión.`,
        hint: "Las fuentes de tensión ideales no pueden imponer su tensión a la vez en el mismo lazo: si son distintas, la corriente sería infinita, y si son iguales, no se sabe cuánta corriente da cada una. Agrega una resistencia en serie con alguna de ellas.",
        components: ids,
      });
    }
  }

  // 7. Partes sin camino a tierra. Las resistencias y las fuentes de tensión
  //    son camino; las fuentes de corriente no.
  const floatingNodes = new Set<string>();
  if (hasGround) {
    const paths = withGroundsJoined();
    for (const item of active) {
      if (item.def.dc !== "resistive" && item.def.dc !== "voltage") continue;
      for (const node of item.nodes.slice(1)) paths.union(item.nodes[0], node);
    }
    const groundRoot = paths.find(groundNodes[0]);
    const groups = new Map<string, Set<string>>();
    for (const item of active) {
      for (const node of item.nodes) {
        const root = paths.find(node);
        if (root === groundRoot) continue;
        if (!groups.has(root)) groups.set(root, new Set());
        groups.get(root)!.add(node);
        floatingNodes.add(node);
      }
    }
    for (const nodes of groups.values()) reportFloatingGroup(nodes);
  }

  function reportFloatingGroup(nodes: Set<string>) {
    const pins = [...nodes].flatMap((n) => pinsAt.get(n)!).filter((p) => !ignored.has(p.item));
    const touching = [...new Set(pins.map((p) => p.item))].sort((x, y) => items.indexOf(x) - items.indexOf(y));
    const inside = touching.filter((c) => c.nodes.every((n) => nodes.has(n)));
    const border = touching.filter((c) => !inside.includes(c));
    const insideIds = inside.map((c) => c.instance.id);
    const borderIds = border.map((c) => c.instance.id);

    if (inside.length === 0 && border.every((c) => c.def.dc === "current")) {
      if (pins.length === 1) {
        const { item, pin } = pins[0];
        error({
          code: "current-source-open",
          message: `${capitalize(describePin(pin))} de ${item.instance.id} no tiene ninguna conexión.`,
          hint: "Una fuente de corriente necesita un camino cerrado por donde circular; sin él, su tensión sería infinita. Conecta ese terminal al circuito.",
          components: [item.instance.id],
        });
      } else {
        error({
          code: "current-sources-series",
          message: `${joinNames(borderIds)} están en serie: se unen en un punto al que no llega ningún otro componente.`,
          hint: "Por ese punto tendría que pasar a la vez la corriente que impone cada fuente, y su tensión queda indefinida. Usa una sola fuente o conecta una resistencia desde ese punto a otra parte del circuito.",
          components: borderIds,
        });
      }
    } else if (border.length === 0) {
      error({
        code: "floating-section",
        message: `${joinNames(insideIds)} ${insideIds.length === 1 ? "forma" : "forman"} una parte separada del circuito, sin tierra.`,
        hint: "Únela al resto del circuito con un cable o agrégale su propia tierra (⏚).",
        components: insideIds,
      });
    } else {
      const ids = insideIds.length > 0 ? insideIds : borderIds;
      const sources = border.length === 1 ? `la fuente de corriente ${borderIds[0]}` : `las fuentes de corriente ${joinNames(borderIds)}`;
      error({
        code: "no-path-to-ground",
        message: `${joinNames(ids)} solo ${ids.length === 1 ? "se conecta" : "se conectan"} al resto del circuito a través de ${sources}.`,
        hint: "Una fuente de corriente no fija ninguna tensión, así que la tensión de esa parte queda indefinida. Agrega una resistencia o un cable desde esa parte hasta el resto del circuito.",
        components: [...ids, ...borderIds.filter((id) => !ids.includes(id))],
      });
    }
  }

  // 8. Terminales sueltos: se puede simular, pero suele ser un descuido.
  for (const [node, pins] of pinsAt) {
    if (pins.length !== 1) continue;
    const { item, pin } = pins[0];
    if (item.def.isGround || ignored.has(item) || shorted.has(item) || floatingNodes.has(node)) continue;
    const id = item.instance.id;
    warn({
      code: "pin-dangling",
      message: item.def.meter
        ? `${capitalize(describePin(pin))} de ${id} no tiene ninguna conexión, así que el multímetro marca 0.`
        : `${capitalize(describePin(pin))} de ${id} no tiene ninguna conexión, así que por ${id} no circula corriente.`,
      hint: "Si no es a propósito, conéctalo con un cable.",
      components: [id],
    });
  }

  // 9. Errores típicos al conectar el multímetro.
  for (const meter of active) {
    if (shorted.has(meter) || ammetersInLoops.has(meter)) continue;
    if (meter.def.meter !== "A" && meter.def.meter !== "V") continue;
    const [plus, com] = meter.nodes;
    const id = meter.instance.id;

    if (meter.def.meter === "A") {
      // Amperímetro en paralelo con un componente: lo cortocircuita.
      const ends = new Set([sameNode.find(plus), sameNode.find(com)]);
      const bypassed = active.filter(
        (other) =>
          other !== meter &&
          !other.def.meter &&
          other.def.dc !== "voltage" &&
          other.nodes.length === 2 &&
          other.nodes.every((n) => ends.has(sameNode.find(n))) &&
          sameNode.find(other.nodes[0]) !== sameNode.find(other.nodes[1]),
      );
      if (bypassed.length > 0) {
        const names = bypassed.map((b) => b.instance.id);
        warn({
          code: "ammeter-parallel",
          message: `${id} está en paralelo con ${joinNames(names)}: el amperímetro ${names.length === 1 ? "lo" : "los"} cortocircuita, así que no mide su corriente.`,
          hint: "El amperímetro se conecta en serie: abre el circuito donde quieres medir y pon el amperímetro en el hueco.",
          components: [id, ...names],
        });
      }
    } else {
      // Voltímetro en serie: cada punta toca un solo componente, y son distintos.
      // Todas las tierras son un mismo punto: si una punta está en tierra, cuenta
      // lo que llega a cualquier tierra (sin contar los símbolos ⏚).
      const neighbour = (node: string) => {
        const pins = groundNodeSet.has(node) ? groundNodes.flatMap((g) => pinsAt.get(g)!) : pinsAt.get(node)!;
        const others = pins.filter((p) => p.item !== meter && !p.item.def.isGround);
        return others.length === 1 ? others[0].item : undefined;
      };
      const a = neighbour(plus);
      const b = neighbour(com);
      if (a && b && a !== b) {
        warn({
          code: "voltmeter-series",
          message: `${id} está en serie entre ${a.instance.id} y ${b.instance.id}: el voltímetro corta el paso de la corriente.`,
          hint: "Para medir tensión, toca con las puntas los dos extremos del componente (en paralelo), sin abrir el circuito.",
          components: [id, a.instance.id, b.instance.id],
        });
      }
    }
  }

  // 10. Sin fuentes todo vale 0: no es un error, pero seguramente falta algo.
  if (!powered) {
    warn({
      code: "no-sources",
      message: "No hay ninguna fuente, así que todas las tensiones y corrientes serán 0.",
      hint: "Agrega una fuente de tensión o de corriente desde la paleta.",
      components: [],
    });
  }

  checkOhmmeterProbes();
  return finish(ignored);
}

/**
 * Nodos que tienen un camino de corriente continua hasta la tierra (a través
 * de resistencias o fuentes de tensión). El ohmímetro lo usa para saber si
 * la parte que mide está "flotando".
 */
export function nodesWithPathToGround(circuit: Circuit): Set<string> {
  const uf = new UnionFind();
  const groundNodes: string[] = [];
  const allNodes: string[] = [];
  for (const c of circuit.components) {
    const def = findComponentDef(c.type);
    if (!def) continue;
    const nodes = def.pins.map((p) => c.connections[p.id]).filter((n): n is string => Boolean(n));
    allNodes.push(...nodes);
    if (def.isGround) groundNodes.push(...nodes);
    else if (def.dc === "resistive" || def.dc === "voltage") {
      for (const n of nodes.slice(1)) uf.union(nodes[0], n);
    }
  }
  for (const n of groundNodes) uf.union(groundNodes[0], n);
  if (groundNodes.length === 0) return new Set();
  const root = uf.find(groundNodes[0]);
  return new Set(allNodes.filter((n) => uf.find(n) === root));
}

function toInstance(item: Item): ComponentInstance {
  const connections = Object.fromEntries(item.def.pins.map((pin, k) => [pin.id, item.nodes[k]]));
  return { ...item.instance, connections };
}

function describePin(pin: PinDef): string {
  return pin.description ?? `el terminal ${pin.label}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface VoltageEdge {
  item: Item;
  a: string;
  b: string;
}

/** Fuentes que unen `from` con `to` dentro de un bosque de fuentes de tensión. */
function pathBetween(edges: VoltageEdge[], from: string, to: string): Item[] {
  const previous = new Map<string, { node: string; item: Item }>();
  const queue = [from];
  const seen = new Set([from]);
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node === to) break;
    for (const e of edges) {
      const next = e.a === node ? e.b : e.b === node ? e.a : undefined;
      if (next === undefined || seen.has(next)) continue;
      seen.add(next);
      previous.set(next, { node, item: e.item });
      queue.push(next);
    }
  }
  const path: Item[] = [];
  for (let node = to; node !== from; ) {
    const step = previous.get(node);
    if (!step) break;
    path.push(step.item);
    node = step.node;
  }
  return path;
}
