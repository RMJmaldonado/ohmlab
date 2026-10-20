// Lo que hace el estudiante en un ejercicio: los cambios al circuito, dónde
// puso las puntas del multímetro (o dónde lo intercaló) y el valor que leyó.
// Aquí se arma el circuito que se simula y se revisa la respuesta.
import type { Circuit } from "../circuit.ts";
import { formatSI } from "../format.ts";
import type { DcOutcome } from "../simulate.ts";
import { analyzeConnectivity, pinKey, schematicToCircuit, type Connectivity } from "../schematic/connectivity.ts";
import { onInterior, onWire, pinPositions, pointKey, samePoint } from "../schematic/geometry.ts";
import type { Point, Schematic, Wire } from "../schematic/types.ts";
import { parseValue } from "../values.ts";
import type { MeterMode } from "../components/index.ts";
import type { Change, ExerciseInstance } from "./exercises.ts";

export const PRACTICE_METER = "MM1";

/** El multímetro de la práctica. */
export interface PracticeMeter {
  mode: MeterMode;
  /** Dónde toca la punta roja (+), si toca algo. */
  plus?: Point;
  /** Dónde toca la punta negra (COM). */
  com?: Point;
  /**
   * Intercalado en serie: el cable se corta en ese punto y el multímetro queda
   * en el hueco. `flipped` intercambia las puntas.
   */
  series?: { at: Point; flipped: boolean };
}

const changeKey = (c: Change) => `${c.action}:${c.component}`;

/** El circuito del ejercicio con los cambios que eligió el estudiante. */
export function applyChanges(instance: ExerciseInstance, changes: Change[]): Schematic {
  const keys = new Set(changes.map(changeKey));
  const { schematic } = instance;
  const components = schematic.components.filter(
    (c) => !keys.has(`remove:${c.id}`) && !keys.has(`turn-off:${c.id}`),
  );
  // Una fuente apagada es un cable entre sus terminales.
  const shorts: Wire[] = schematic.components
    .filter((c) => keys.has(`turn-off:${c.id}`))
    .map((c, i) => {
      const [a, b] = Object.values(pinPositions(c));
      return { id: `wire-apagada-${i + 1}`, a, b };
    });
  return { ...schematic, components, wires: [...schematic.wires, ...shorts] };
}

/**
 * Corta el cable en `at` para intercalar el multímetro. Se quita el tramo
 * entre los dos puntos de unión más cercanos (lo que haya a cada lado sigue
 * conectado igual) y se devuelven los extremos del hueco, en orden: primero el
 * de la izquierda o el de arriba. Devuelve null si ahí no hay un cable que
 * cortar (o si es justo un punto de unión).
 */
export function cutWire(schematic: Schematic, at: Point): { schematic: Schematic; gap: [Point, Point] } | null {
  const wire = schematic.wires.find((w) => onWire(at, w));
  if (!wire || samePoint(at, wire.a) || samePoint(at, wire.b)) return null;
  const horizontal = wire.a[1] === wire.b[1];
  const axis = horizontal ? 0 : 1;
  // Puntos del cable donde llega algo: sus extremos, otros cables y pines.
  const touching = [
    ...schematic.wires.filter((w) => w !== wire).flatMap((w) => [w.a, w.b]),
    ...schematic.components.flatMap((c) => Object.values(pinPositions(c))),
  ].filter((p) => onInterior(p, wire));
  if (touching.some((p) => samePoint(p, at))) return null;
  const stops = [wire.a, wire.b, ...touching].sort((p, q) => p[axis] - q[axis]);
  const after = stops.findIndex((p) => p[axis] > at[axis]);
  const gap: [Point, Point] = [stops[after - 1], stops[after]];
  const pieces: Wire[] = [];
  for (let i = 1; i < stops.length; i++) {
    if (i === after || samePoint(stops[i - 1], stops[i])) continue;
    pieces.push({ id: `${wire.id}.${i}`, a: stops[i - 1], b: stops[i] });
  }
  return { schematic: { ...schematic, wires: [...schematic.wires.filter((w) => w !== wire), ...pieces] }, gap };
}

/** Nodo de un punto: el del cable o el pin que hay ahí. Un pin suelto recibe un nodo propio. */
function nodeAt(schematic: Schematic, connectivity: Connectivity, circuit: Circuit, point: Point): string | undefined {
  const wire = schematic.wires.find((w) => onWire(point, w));
  if (wire) return connectivity.netOfWire.get(wire.id);
  for (const c of schematic.components) {
    for (const [pin, p] of Object.entries(pinPositions(c))) {
      if (!samePoint(p, point)) continue;
      const net = connectivity.netOfPin.get(pinKey(c.id, pin));
      if (net) return net;
      // Pin sin nada más: se le da un nodo para que la punta lo toque.
      const own = `P${pointKey(point)}`;
      const instance = circuit.components.find((i) => i.id === c.id);
      if (instance) instance.connections = { ...instance.connections, [pin]: own };
      return own;
    }
  }
  return undefined;
}

const METER_TYPE: Record<MeterMode, string> = { V: "voltmeter", A: "ammeter", Ω: "ohmmeter" };

export interface PracticeSetup {
  /** El circuito que se simula, con el multímetro. */
  circuit: Circuit;
  /** Si el multímetro está intercalado: los extremos del hueco. */
  gap?: [Point, Point];
  /** Nodos que tocan las puntas (si no está intercalado). */
  nodes: { plus?: string; com?: string };
}

/** Arma el circuito a simular: el ejercicio, los cambios y el multímetro. */
export function practiceCircuit(schematic: Schematic, meter: PracticeMeter): PracticeSetup {
  const params: Record<string, number> = meter.mode === "V" ? { resistance: 1e9 } : {};
  if (meter.series) {
    const cut = cutWire(schematic, meter.series.at);
    if (cut) {
      const connectivity = analyzeConnectivity(cut.schematic);
      const circuit = schematicToCircuit(cut.schematic, connectivity);
      let [plus, com] = cut.gap.map((p) => nodeAt(cut.schematic, connectivity, circuit, p));
      if (meter.series.flipped) [plus, com] = [com, plus];
      circuit.components.push({ id: PRACTICE_METER, type: METER_TYPE[meter.mode], params, connections: connectionsOf(plus, com) });
      return { circuit, gap: cut.gap, nodes: {} };
    }
  }
  const connectivity = analyzeConnectivity(schematic);
  const circuit = schematicToCircuit(schematic, connectivity);
  const plus = meter.plus && nodeAt(schematic, connectivity, circuit, meter.plus);
  const com = meter.com && nodeAt(schematic, connectivity, circuit, meter.com);
  circuit.components.push({ id: PRACTICE_METER, type: METER_TYPE[meter.mode], params, connections: connectionsOf(plus, com) });
  return { circuit, nodes: { plus, com } };
}

function connectionsOf(plus: string | undefined, com: string | undefined): Record<string, string> {
  const connections: Record<string, string> = {};
  if (plus) connections.plus = plus;
  if (com) connections.com = com;
  return connections;
}

export interface Verdict {
  ok: boolean;
  message: string;
}

const NAMES: Record<MeterMode, string> = { V: "voltímetro (V)", A: "amperímetro (A)", Ω: "ohmímetro (Ω)" };
const QUANTITY: Record<MeterMode, string> = { V: "tensión", A: "corriente", Ω: "resistencia" };

/**
 * Revisa el intento: modo, cambios al circuito, conexión y el valor escrito.
 * Devuelve la primera cosa que está mal, explicada, o que está bien.
 */
export function checkAttempt(
  instance: ExerciseInstance,
  changes: Change[],
  meter: PracticeMeter,
  outcome: DcOutcome | null,
  typed: string,
  locale = "es",
): Verdict {
  const { target, required } = instance.exercise;
  const no = (message: string): Verdict => ({ ok: false, message });

  if (meter.mode !== target.mode) {
    return no(`Para medir ${QUANTITY[target.mode]} el multímetro va como ${NAMES[target.mode]}.`);
  }
  const chosen = new Set(changes.map(changeKey));
  for (const change of required) {
    if (chosen.has(changeKey(change))) continue;
    if (change.action === "turn-off") {
      return no(`Antes de medir, apaga ${change.component}: la resistencia se mide con las fuentes apagadas (en su lugar queda un cable).`);
    }
    const isSource = instance.schematic.components.some((c) => c.id === change.component && c.type.includes("source"));
    return no(
      isSource && target.mode === "Ω"
        ? `Antes de medir, quita ${change.component}: el ohmímetro se usa con el circuito sin alimentación.`
        : `Antes de medir, quita ${change.component}: el ejercicio pide medir sin esa pieza.`,
    );
  }
  for (const change of changes) {
    if (!required.some((r) => changeKey(r) === changeKey(change))) {
      return no(`Este ejercicio se mide con ${change.component} en su lugar: deshaz ese cambio.`);
    }
  }

  const schematic = applyChanges(instance, changes);
  if (target.mode === "A") {
    if (!meter.series) {
      return no(
        meter.plus || meter.com
          ? "El amperímetro va en serie: no toques dos puntos con las puntas. Arrastra el multímetro sobre un cable para abrir el circuito ahí."
          : "Arrastra el multímetro sobre un cable para intercalarlo en serie.",
      );
    }
    if (!cutWire(schematic, meter.series.at)) return no("Ahí no se puede abrir el circuito: suelta el multímetro sobre un tramo de cable.");
  } else {
    if (meter.series) {
      return no(`El ${NAMES[target.mode].split(" ")[0]} no se intercala: vuelve a cerrar el circuito y toca con las puntas los dos puntos que quieres medir.`);
    }
    if (!meter.plus || !meter.com) return no("Toca con las dos puntas, la roja y la negra, los puntos que quieres medir.");
    const setup = practiceCircuit(schematic, meter);
    const connectivity = analyzeConnectivity(schematic);
    const wanted = target.across.map((p) => nodeAt(schematic, connectivity, schematicToCircuit(schematic, connectivity), p));
    const touched = [setup.nodes.plus, setup.nodes.com];
    const sameSet = touched.every((n) => n && wanted.includes(n)) && touched[0] !== touched[1];
    if (!sameSet) return no(`Las puntas no están en los extremos de lo que pide el ejercicio: ${target.what}.`);
  }

  if (!outcome) return no("Espera a que el multímetro marque un valor.");
  if (!outcome.ok) return no("El circuito tiene un error y no se puede simular: revisa los avisos.");
  const reading = outcome.result.meters[PRACTICE_METER]?.value;
  if (reading === undefined || !Number.isFinite(reading)) return no("El multímetro no marca un valor que se pueda leer.");

  if (target.mode === "A") {
    const through = outcome.result.elements[target.through]?.current ?? Number.NaN;
    if (!close(Math.abs(reading), Math.abs(through))) {
      return no(`El amperímetro está en serie, pero en un cable por donde no pasa ${target.what}. Busca la rama correcta.`);
    }
  }

  const unit = target.mode;
  const shown = formatSI(reading, unit, locale);
  if (typed.trim() === "") return no("Escribe el valor que marca el multímetro.");
  const value = parseValue(typed, unit);
  if (value === null) return no(`«${typed}» no es un número. Escribe lo que marca la pantalla, por ejemplo ${shown}.`);
  if (!close(Math.abs(value), Math.abs(reading))) {
    for (const factor of [1e3, 1e6, 1e-3, 1e-6]) {
      if (close(Math.abs(value) * factor, Math.abs(reading))) {
        return no(`Revisa el prefijo: el multímetro marca ${shown} y escribiste ${typed.trim()}, que es ${formatSI(value, unit, locale)}.`);
      }
    }
    return no(`El valor no coincide con lo que marca el multímetro. Vuelve a leer la pantalla.`);
  }
  const sign =
    reading < 0
      ? target.mode === "A"
        ? " Marca negativo porque la corriente entra por COM: en el laboratorio se invierten las puntas."
        : " Marca negativo porque la punta roja está en el punto de menor tensión: el valor es el mismo, con las puntas invertidas."
      : "";
  return { ok: true, message: `¡Correcto! ${capitalize(target.what)} es ${formatSI(Math.abs(reading), unit, locale)}.${sign}` };
}

/** Iguales con 1 % de diferencia (lo que se pierde al leer la pantalla). */
function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.01 * Math.max(Math.abs(a), Math.abs(b)) + 1e-12;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
