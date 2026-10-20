import type { ComponentDef } from "./types.ts";

export const dcVoltageSource: ComponentDef = {
  type: "dc-voltage-source",
  label: "Fuente de tensión DC",
  category: "sources",
  prefix: "V",
  pins: [
    { id: "plus", label: "+" },
    { id: "minus", label: "−" },
  ],
  params: [{ id: "voltage", label: "Tensión", unit: "V", default: 12 }],
  // Vertical, con el + arriba
  symbol: { pins: { plus: [0, -2], minus: [0, 2] } },
  dc: "voltage",
  isSource: true,
  toSpice: (name, [plus, minus], p) => `${name} ${plus} ${minus} DC ${p.voltage}`,
  // @v1[i]: corriente que entra por + y atraviesa la fuente hacia −.
  // Cuando la fuente entrega energía este valor es negativo.
  currentVector: (name) => `@${name}[i]`,
};
