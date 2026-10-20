import { describe, expect, it } from "vitest";
import { formatSI } from "../src/index.ts";

describe("formatSI", () => {
  it.each([
    [12, "V", "12 V"],
    [0.006, "A", "6 mA"],
    [0.036, "W", "36 mW"],
    [-0.072, "W", "-72 mW"],
    [0.000769230769, "A", "769.2 µA"],
    [4.615384615, "V", "4.615 V"],
    [4700, "Ω", "4.7 kΩ"],
    [2.2e6, "Ω", "2.2 MΩ"],
    [999.96, "Ω", "1 kΩ"],
    [0, "A", "0 A"],
    [1e-18, "A", "0 A"],
  ])("%s %s → %s", (value, unit, text) => {
    expect(formatSI(value, unit, "es-PE")).toBe(text);
  });

  it("usa el separador decimal del idioma", () => {
    expect(formatSI(4.615384615, "V", "es-ES")).toBe("4,615 V");
  });

  it("no inventa números si el valor no es válido", () => {
    expect(formatSI(Number.NaN, "V")).toBe("—");
  });
});
