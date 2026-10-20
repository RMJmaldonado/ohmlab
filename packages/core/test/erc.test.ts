// Pruebas de la revisión del circuito. No necesitan ngspice.
import { describe, expect, it } from "vitest";
import { checkCircuit, joinNames, type Circuit, type DiagnosticCode } from "../src/index.ts";
import { GND, I, R, V, circuit } from "./helpers.ts";

const codes = (c: Circuit) => checkCircuit(c).diagnostics.map((d) => d.code);
const find = (c: Circuit, code: DiagnosticCode) => checkCircuit(c).diagnostics.find((d) => d.code === code)!;

/** Divisor correcto al que se le añaden piezas para cada caso. */
const divider = [V("V1", "a", "0", 12), R("R1", "a", "b"), R("R2", "b", "0"), GND("GND1", "0")];

describe("circuitos correctos", () => {
  it("un divisor no da errores ni avisos", () => {
    expect(codes(circuit(...divider))).toEqual([]);
  });

  it("varias tierras en nodos distintos cuentan como el mismo nodo", () => {
    const c = circuit(V("V1", "a", "g1"), R("R1", "a", "g2"), GND("GND1", "g1"), GND("GND2", "g2"));
    expect(codes(c)).toEqual([]);
  });
});

describe("errores que impiden simular", () => {
  it("circuito vacío", () => {
    expect(codes(circuit())).toEqual(["empty-circuit"]);
    expect(codes(circuit(GND("GND1", "0")))).toEqual(["empty-circuit"]);
  });

  it("ningún componente conectado", () => {
    expect(codes(circuit(R("R1", "x", "y"), GND("GND1", "0")))).toEqual(["nothing-connected"]);
  });

  it("falta la tierra", () => {
    const c = circuit(V("V1", "a", "b"), R("R1", "a", "b"));
    expect(codes(c)).toEqual(["no-ground"]);
    expect(find(c, "no-ground").message).toBe("Falta la tierra.");
  });

  it("la tierra está puesta pero sin conectar", () => {
    const c = circuit(V("V1", "a", "b"), R("R1", "a", "b"), GND("GND1", "suelta"));
    expect(codes(c)).toEqual(["no-ground"]);
    expect(find(c, "no-ground").message).toBe("La tierra no está conectada al circuito.");
    expect(find(c, "no-ground").components).toEqual(["GND1"]);
  });

  it("dos componentes con el mismo nombre", () => {
    const c = circuit(V("V1", "a", "0"), R("R1", "a", "b"), R("R1", "b", "0"), GND("GND1", "0"));
    expect(codes(c)).toEqual(["duplicate-id"]);
    expect(find(c, "duplicate-id").message).toBe("Hay 2 componentes llamados R1.");
  });

  it("tipo de componente desconocido", () => {
    const c = circuit(...divider, { id: "X1", type: "flux-capacitor", params: {}, connections: { a: "a", b: "0" } });
    expect(codes(c)).toEqual(["unknown-component"]);
  });

  it("valor que falta o no es un número", () => {
    const missing = { ...R("R3", "a", "0"), params: {} };
    expect(codes(circuit(...divider, missing))).toEqual(["invalid-value"]);
    expect(codes(circuit(...divider, R("R3", "a", "0", Number.NaN)))).toEqual(["invalid-value"]);
  });

  it("resistencia de 0 Ω: sugiere usar un cable", () => {
    const c = circuit(...divider, R("R3", "a", "0", 0));
    expect(codes(c)).toEqual(["value-must-be-positive"]);
    expect(find(c, "value-must-be-positive").hint).toMatch(/cable/);
  });

  it("resistencia negativa", () => {
    expect(codes(circuit(...divider, R("R3", "a", "0", -5)))).toEqual(["value-must-be-positive"]);
  });

  it("fuentes de tensión en paralelo", () => {
    const c = circuit(V("V1", "a", "0", 12), V("V2", "a", "0", 5), R("R1", "a", "0"), GND("GND1", "0"));
    expect(codes(c)).toEqual(["voltage-source-loop"]);
    expect(find(c, "voltage-source-loop").message).toBe("V1 y V2 están conectadas en paralelo.");
    expect(find(c, "voltage-source-loop").components).toEqual(["V1", "V2"]);
  });

  it("fuentes en paralelo a través de dos símbolos de tierra distintos", () => {
    const c = circuit(V("V1", "a", "g1"), V("V2", "a", "g2"), R("R1", "a", "g1"), GND("GND1", "g1"), GND("GND2", "g2"));
    expect(codes(c)).toEqual(["voltage-source-loop"]);
  });

  it("lazo de tres fuentes de tensión", () => {
    const c = circuit(V("V1", "a", "0"), V("V2", "a", "b"), V("V3", "b", "0"), R("R1", "a", "0"), GND("GND1", "0"));
    expect(codes(c)).toEqual(["voltage-source-loop"]);
    expect(find(c, "voltage-source-loop").message).toBe(
      "V1, V2 y V3 forman un lazo cerrado solo con fuentes de tensión.",
    );
  });

  it("fuente de tensión en cortocircuito", () => {
    const c = circuit(V("V1", "a", "a"), R("R1", "a", "0"), GND("GND1", "0"));
    expect(codes(c)).toEqual(["voltage-source-shorted"]);
  });

  it("fuente de corriente con un terminal al aire", () => {
    const c = circuit(V("V1", "a", "0"), R("R1", "a", "0"), I("I1", "0", "x"), GND("GND1", "0"));
    expect(codes(c)).toEqual(["current-source-open"]);
    expect(find(c, "current-source-open").message).toBe(
      "El terminal de salida (punta de la flecha) de I1 no tiene ninguna conexión.",
    );
  });

  it("fuentes de corriente en serie", () => {
    const c = circuit(I("I1", "0", "m"), I("I2", "m", "a"), R("R1", "a", "0"), GND("GND1", "0"));
    expect(codes(c)).toEqual(["current-sources-series"]);
    expect(find(c, "current-sources-series").message).toMatch(/^I1 e I2 están en serie/);
  });

  it("parte unida al resto solo por fuentes de corriente", () => {
    const c = circuit(
      V("V1", "a", "0"), R("R1", "a", "0"), I("I1", "a", "b"), R("R2", "b", "c"), I("I2", "c", "0"), GND("GND1", "0"),
    );
    expect(codes(c)).toEqual(["no-path-to-ground"]);
    expect(find(c, "no-path-to-ground").message).toBe(
      "R2 solo se conecta al resto del circuito a través de las fuentes de corriente I1 e I2.",
    );
    expect(find(c, "no-path-to-ground").components).toEqual(["R2", "I1", "I2"]);
  });

  it("parte separada sin tierra", () => {
    const c = circuit(...divider, V("V2", "x", "y"), R("R5", "x", "y"));
    expect(codes(c)).toEqual(["floating-section"]);
    expect(find(c, "floating-section").message).toBe("V2 y R5 forman una parte separada del circuito, sin tierra.");
  });
});

describe("avisos que dejan simular", () => {
  it("resistencia con un terminal suelto", () => {
    const c = circuit(...divider, R("R3", "b", "c"));
    expect(codes(c)).toEqual(["pin-dangling"]);
    expect(find(c, "pin-dangling").message).toBe(
      "El terminal 2 de R3 no tiene ninguna conexión, así que por R3 no circula corriente.",
    );
  });

  it("un pin sin conexión asignada cuenta como suelto y recibe su propio nodo", () => {
    const loose = { ...R("R3", "b", "x"), connections: { a: "b" } };
    const check = checkCircuit(circuit(...divider, loose));
    expect(check.diagnostics.map((d) => d.code)).toEqual(["pin-dangling"]);
    const r3 = check.simulable.components.find((c) => c.id === "R3")!;
    expect(r3.connections.b).toMatch(/^~/);
  });

  it("componente sin ninguna conexión: se avisa y se deja fuera", () => {
    const check = checkCircuit(circuit(...divider, R("R9", "x", "y")));
    expect(check.diagnostics.map((d) => d.code)).toEqual(["component-ignored"]);
    expect(check.simulable.components.map((c) => c.id)).not.toContain("R9");
  });

  it("resistencia en cortocircuito", () => {
    const c = circuit(...divider, R("R4", "b", "b"));
    expect(codes(c)).toEqual(["component-shorted"]);
    expect(find(c, "component-shorted").message).toMatch(/por R4 no circula corriente/);
  });

  it("fuente de corriente en cortocircuito", () => {
    const c = circuit(...divider, I("I1", "b", "b"));
    expect(codes(c)).toEqual(["component-shorted"]);
    expect(find(c, "component-shorted").message).toMatch(/vuelve a la fuente/);
  });

  it("circuito sin fuentes", () => {
    expect(codes(circuit(R("R1", "a", "0"), R("R2", "a", "0"), GND("GND1", "0")))).toEqual(["no-sources"]);
  });

  it("los errores van antes que los avisos", () => {
    const c = circuit(V("V1", "a", "0"), V("V2", "a", "0"), R("R1", "a", "b"), GND("GND1", "0"));
    expect(codes(c)).toEqual(["voltage-source-loop", "pin-dangling"]);
  });
});

describe("joinNames", () => {
  it("une nombres como en español", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["R1"])).toBe("R1");
    expect(joinNames(["R1", "R2"])).toBe("R1 y R2");
    expect(joinNames(["R1", "R2", "R3"])).toBe("R1, R2 y R3");
  });

  it("usa «e» antes de un nombre que suena a «i»", () => {
    expect(joinNames(["I1", "I2"])).toBe("I1 e I2");
    expect(joinNames(["V1", "I1"])).toBe("V1 e I1");
  });
});
