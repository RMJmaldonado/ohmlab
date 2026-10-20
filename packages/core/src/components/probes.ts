// Puntas de prueba: se sueltan sobre un cable y muestran un valor, sin armar
// el multímetro. Sirven para revisar muchos puntos rápido (por ejemplo, las
// corrientes que llegan a un nodo, para comprobar Kirchhoff).
import type { ComponentDef } from "./types.ts";

/**
 * Punta de tensión: un solo pin. Marca la tensión de ese punto respecto a
 * tierra. No forma parte del circuito: no cambia nada de lo que mide.
 */
export const voltageProbe: ComponentDef = {
  type: "voltage-probe",
  label: "Punta de tensión",
  category: "instruments",
  prefix: "PV",
  meter: "V",
  probe: true,
  pins: [{ id: "tip", label: "", description: "la punta" }],
  symbol: { pins: { tip: [0, 0] } },
  params: [],
  dc: "open",
};

/**
 * Punta de corriente: un amperímetro ideal pequeño (una fuente de 0 V). Al
 * soltarla sobre un cable queda en serie. Marca positivo si la corriente va
 * en el sentido de su flecha (entra por "in" y sale por "out").
 */
export const currentProbe: ComponentDef = {
  type: "current-probe",
  label: "Punta de corriente",
  category: "instruments",
  prefix: "PI",
  spicePrefix: "V",
  meter: "A",
  probe: true,
  pins: [
    { id: "in", label: "", description: "la cola de la flecha" },
    { id: "out", label: "", description: "la punta de la flecha" },
  ],
  symbol: { pins: { in: [-1, 0], out: [1, 0] } },
  params: [],
  dc: "voltage",
  toSpice: (name, [inNode, outNode]) => `${name} ${inNode} ${outNode} DC 0`,
  currentVector: (name) => `@${name}[i]`,
};
