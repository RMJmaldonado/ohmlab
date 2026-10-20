// Comprueba que el registro de componentes esté bien armado. Si alguien
// añade un componente y olvida algo, esta prueba lo avisa.
import { describe, expect, it } from "vitest";
import { componentDefs } from "../src/index.ts";

describe("registro de componentes", () => {
  it("no repite tipos ni prefijos (los modos del multímetro comparten «MM»)", () => {
    const types = componentDefs.map((d) => d.type);
    const multimeter = (d: (typeof componentDefs)[number]) => d.meter !== undefined && !d.probe;
    const prefixes = componentDefs.filter((d) => !multimeter(d)).map((d) => d.prefix);
    expect(new Set(types).size).toBe(types.length);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    expect(new Set(componentDefs.filter(multimeter).map((d) => d.prefix))).toEqual(new Set(["MM"]));
  });

  // El ohmímetro no genera línea SPICE: mide aparte (measure-resistance.ts).
  // La punta de tensión tampoco: solo lee la tensión de su punto.
  const readsOnly = (d: (typeof componentDefs)[number]) => d.meter === "Ω" || (d.probe === true && d.meter === "V");
  it.each(componentDefs.filter((d) => !d.isGround && !readsOnly(d)).map((d) => [d.type, d] as const))(
    "%s dice cómo se comporta en continua y cómo se escribe en SPICE",
    (_type, def) => {
      expect(def.dc).toBeDefined();
      expect(def.toSpice).toBeTypeOf("function");
      expect(def.currentVector).toBeTypeOf("function");
    },
  );

  it("los valores por defecto son válidos", () => {
    for (const def of componentDefs) {
      for (const param of def.params) {
        expect(Number.isFinite(param.default), `${def.type}.${param.id}`).toBe(true);
        if (param.positive) expect(param.default, `${def.type}.${param.id}`).toBeGreaterThan(0);
      }
    }
  });
});
