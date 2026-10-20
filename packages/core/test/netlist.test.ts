// Pruebas del generador de netlist. No necesitan ngspice.
import { describe, expect, it } from "vitest";
import { buildNetlist, type Circuit } from "../src/index.ts";

const divider: Circuit = {
  components: [
    { id: "V1", type: "dc-voltage-source", params: { voltage: 12 }, connections: { plus: "entrada", minus: "masa" } },
    { id: "Rarriba", type: "resistor", params: { resistance: 1000 }, connections: { a: "entrada", b: "salida" } },
    { id: "R2", type: "resistor", params: { resistance: 2200 }, connections: { a: "salida", b: "masa" } },
    { id: "GND1", type: "ground", params: {}, connections: { gnd: "masa" } },
  ],
};

describe("buildNetlist", () => {
  it("genera una línea por elemento con nodos renombrados", () => {
    const netlist = buildNetlist(divider);
    expect(netlist.lines).toEqual(["v1 n1 0 DC 12", "r1 n1 n2 1000", "r2 n2 0 2200"]);
  });

  it("el nodo conectado a tierra se convierte en 0", () => {
    const netlist = buildNetlist(divider);
    expect(netlist.nodeMap.get("masa")).toBe("0");
    expect(netlist.nodeMap.get("entrada")).toBe("n1");
  });

  it("los nombres del usuario no llegan a SPICE", () => {
    const netlist = buildNetlist(divider);
    expect(netlist.lines.join("\n")).not.toContain("Rarriba");
    expect(netlist.elements[1].instance.id).toBe("Rarriba");
  });

  it("avisa si un pin no está conectado", () => {
    const broken: Circuit = {
      components: [{ id: "R1", type: "resistor", params: { resistance: 1000 }, connections: { a: "x" } }],
    };
    expect(() => buildNetlist(broken)).toThrow(/pin "b" de R1/);
  });

  it("rechaza una resistencia de 0 Ω", () => {
    const zero: Circuit = {
      components: [{ id: "R1", type: "resistor", params: { resistance: 0 }, connections: { a: "x", b: "y" } }],
    };
    expect(() => buildNetlist(zero)).toThrow(/mayor que cero/);
  });

  it("rechaza un tipo de componente desconocido", () => {
    const unknown: Circuit = { components: [{ id: "X1", type: "flux-capacitor", params: {}, connections: {} }] };
    expect(() => buildNetlist(unknown)).toThrow(/desconocido/);
  });
});
