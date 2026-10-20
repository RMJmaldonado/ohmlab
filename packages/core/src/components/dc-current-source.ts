import type { ComponentDef } from "./types.ts";

export const dcCurrentSource: ComponentDef = {
  type: "dc-current-source",
  label: "Fuente de corriente DC",
  category: "sources",
  prefix: "I",
  // La flecha del símbolo apunta de "from" a "to": la corriente entra por
  // "from", atraviesa la fuente y sale por "to" hacia el circuito.
  pins: [
    { id: "from", label: "", description: "el terminal de entrada (cola de la flecha)" },
    { id: "to", label: "", description: "el terminal de salida (punta de la flecha)" },
  ],
  params: [{ id: "current", label: "Corriente", unit: "A", default: 0.001 }],
  // Vertical, con la flecha hacia arriba
  symbol: { pins: { from: [0, 2], to: [0, -2] } },
  dc: "current",
  isSource: true,
  toSpice: (name, [from, to], p) => `${name} ${from} ${to} DC ${p.current}`,
  currentVector: (name) => `@${name}[current]`,
};
