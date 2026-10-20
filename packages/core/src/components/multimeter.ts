// El multímetro tiene tres modos, y cada uno es un tipo de componente
// distinto porque se comporta distinto en el circuito. La interfaz los
// muestra como un solo instrumento: cambiar de modo cambia el tipo.
import type { ComponentDef, PinDef } from "./types.ts";

/** Las dos puntas salen por abajo del multímetro: + a la izquierda, COM a la derecha. */
const symbol = { pins: { plus: [-1, 2], com: [1, 2] } } satisfies ComponentDef["symbol"];

const probes: PinDef[] = [
  { id: "plus", label: "+", description: "la punta + (roja)" },
  { id: "com", label: "COM", description: "la punta COM (negra)" },
];

/**
 * Voltímetro: una resistencia muy grande entre las puntas, casi ideal
 * (1 GΩ). Se puede cambiar para ver el "efecto de carga" de un multímetro
 * real (unos 10 MΩ). Mide V(+) − V(COM).
 */
export const voltmeter: ComponentDef = {
  type: "voltmeter",
  label: "Multímetro (voltímetro)",
  category: "instruments",
  prefix: "MM",
  spicePrefix: "R",
  meter: "V",
  pins: probes,
  symbol,
  params: [{ id: "resistance", label: "Resistencia interna", unit: "Ω", default: 1e9, positive: true }],
  dc: "resistive",
  toSpice: (name, [plus, com], p) => `${name} ${plus} ${com} ${p.resistance}`,
  currentVector: (name) => `@${name}[i]`,
};

/**
 * Amperímetro ideal: una fuente de 0 V, que no cambia el circuito.
 * Mide la corriente que entra por + y sale por COM.
 */
export const ammeter: ComponentDef = {
  type: "ammeter",
  label: "Multímetro (amperímetro)",
  category: "instruments",
  prefix: "MM",
  spicePrefix: "V",
  meter: "A",
  pins: probes,
  symbol,
  params: [],
  dc: "voltage",
  toSpice: (name, [plus, com]) => `${name} ${plus} ${com} DC 0`,
  currentVector: (name) => `@${name}[i]`,
};

/**
 * Ohmímetro: no toca el circuito durante la simulación normal. Su lectura
 * se calcula aparte, con las fuentes apagadas (ver measure-resistance.ts).
 */
export const ohmmeter: ComponentDef = {
  type: "ohmmeter",
  label: "Multímetro (ohmímetro)",
  category: "instruments",
  prefix: "MM",
  meter: "Ω",
  pins: probes,
  symbol,
  params: [],
  dc: "open",
};
