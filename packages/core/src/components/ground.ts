import type { ComponentDef } from "./types.ts";

export const ground: ComponentDef = {
  type: "ground",
  label: "Tierra",
  category: "basic",
  prefix: "GND",
  pins: [{ id: "gnd", label: "" }],
  params: [],
  // El pin está arriba; las rayas de la tierra se dibujan debajo.
  symbol: { pins: { gnd: [0, 0] } },
  isGround: true,
};
