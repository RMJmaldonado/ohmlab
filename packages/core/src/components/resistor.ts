import type { ComponentDef } from "./types.ts";

export const resistor: ComponentDef = {
  type: "resistor",
  label: "Resistencia",
  category: "basic",
  prefix: "R",
  pins: [
    { id: "a", label: "1" },
    { id: "b", label: "2" },
  ],
  params: [{ id: "resistance", label: "Resistencia", unit: "Ω", default: 1000, positive: true }],
  // Horizontal, de 4 cuadros de largo
  symbol: { pins: { a: [-2, 0], b: [2, 0] } },
  dc: "resistive",
  toSpice: (name, [a, b], p) => `${name} ${a} ${b} ${p.resistance}`,
  // @r1[i]: corriente de a hacia b por dentro de la resistencia
  currentVector: (name) => `@${name}[i]`,
};
