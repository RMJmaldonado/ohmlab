// Pruebas de los valores escritos con prefijos.
import { describe, expect, it } from "vitest";
import { formatInput, parseValue } from "../src/index.ts";

describe("parseValue", () => {
  it.each([
    ["4700", 4700],
    ["4.7k", 4700],
    ["4,7k", 4700],
    ["4k7", 4700],
    ["2M2", 2.2e6],
    ["1M", 1e6],
    ["1meg", 1e6],
    ["10m", 0.01],
    ["2u", 2e-6],
    ["2µ", 2e-6],
    ["100n", 1e-7],
    ["47p", 4.7e-11],
    ["1G", 1e9],
    ["1K", 1000],
    ["1e3", 1000],
    ["-5", -5],
    [".5", 0.5],
    [" 4.7 k ", 4700],
    ["0", 0],
  ])("%s → %s", (text, value) => {
    expect(parseValue(text)).toBeCloseTo(value, 15);
  });

  it("acepta la unidad al final", () => {
    expect(parseValue("4.7kΩ", "Ω")).toBe(4700);
    expect(parseValue("100ohm", "Ω")).toBe(100);
    expect(parseValue("1kΩ", "Ω")).toBe(1000); // signo de ohmio, distinto de la omega griega
    expect(parseValue("12V", "V")).toBe(12);
    expect(parseValue("2mA", "A")).toBe(0.002);
    expect(parseValue("10F", "F")).toBe(10); // F de faradio, no f de femto
    expect(parseValue("1mF", "F")).toBe(0.001);
  });

  it("la M mayúscula es mega y la m minúscula es mili", () => {
    expect(parseValue("1M")).toBe(1e6);
    expect(parseValue("1m")).toBe(0.001);
  });

  it.each(["", "abc", "k", "4.7x", "1.2.3", "1,2.3", "1,2,3", "4kk", "Ω"])("«%s» no es un valor", (text) => {
    expect(parseValue(text, "Ω")).toBeNull();
  });
});

describe("formatInput", () => {
  it.each([
    [2200, "2.2k"],
    [1e9, "1G"],
    [1e6, "1M"],
    [12, "12"],
    [0.01, "10m"],
    [1e-6, "1µ"],
    [4.7e-11, "47p"],
    [0, "0"],
    [-0.5, "-500m"],
    [1000, "1k"],
  ])("%s → %s", (value, text) => {
    expect(formatInput(value)).toBe(text);
  });

  it("lo que escribe se vuelve a leer igual", () => {
    for (const value of [2200, 1e9, 12, 0.01, 1e-6, 4.7e-11, 33000, 0.0047]) {
      expect(parseValue(formatInput(value))).toBeCloseTo(value, 15);
    }
  });
});
