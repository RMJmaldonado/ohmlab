// Pruebas del multímetro con ngspice real.
import { describe, expect, it } from "vitest";
import { AM, GND, OM, R, V, VM, circuit, close, simulateOk } from "./helpers.ts";

const divider = [V("V1", "a", "0", 12), R("R1", "a", "b"), R("R2", "b", "0"), GND("GND1", "0")];
const codes = (warnings: { code: string }[]) => warnings.map((w) => w.code);

describe("voltímetro", () => {
  it("mide la tensión de R2 en el divisor", async () => {
    const { result, warnings } = await simulateOk(circuit(...divider, VM("MM1", "b", "0")));
    expect(warnings).toEqual([]);
    expect(result.meters.MM1.mode).toBe("V");
    // 1 GΩ en paralelo con 1 kΩ cambia la lectura en unos 3 µV
    expect(Math.abs(result.meters.MM1.value - 6)).toBeLessThan(1e-5);
  });

  it("con las puntas al revés marca negativo", async () => {
    const { result } = await simulateOk(circuit(...divider, VM("MM1", "0", "b")));
    expect(Math.abs(result.meters.MM1.value + 6)).toBeLessThan(1e-5);
  });

  it("con 10 MΩ, como uno de laboratorio, se nota el efecto de carga", async () => {
    // Divisor de 1 MΩ + 1 MΩ: R2 queda en paralelo con 10 MΩ (0,909 MΩ) y marca 5,714 V, no 6 V.
    const c = circuit(V("V1", "a", "0", 12), R("R1", "a", "b", 1e6), R("R2", "b", "0", 1e6), GND("GND1", "0"), VM("MM1", "b", "0", 1e7));
    const { result } = await simulateOk(c);
    const loaded = (1e6 * 1e7) / (1e6 + 1e7);
    expect(close(result.meters.MM1.value, (12 * loaded) / (1e6 + loaded))).toBe(true);
  });

  it("en serie: avisa, y marca casi toda la tensión de la fuente", async () => {
    const c = circuit(V("V1", "a", "0", 12), VM("MM1", "a", "b"), R("R1", "b", "0"), GND("GND1", "0"));
    const { result, warnings } = await simulateOk(c);
    expect(codes(warnings)).toEqual(["voltmeter-series"]);
    expect(warnings[0].message).toMatch(/^MM1 está en serie entre V1 y R1/);
    expect(result.meters.MM1.value).toBeGreaterThan(11.99);
  });
});

describe("amperímetro", () => {
  const series = [V("V1", "a", "0", 12), R("R1", "x", "b"), R("R2", "b", "0"), GND("GND1", "0")];

  it("en serie con R1 mide su corriente", async () => {
    const { result, warnings } = await simulateOk(circuit(...series, AM("MM1", "a", "x")));
    expect(warnings).toEqual([]);
    expect(result.meters.MM1.mode).toBe("A");
    expect(close(result.meters.MM1.value, 0.006)).toBe(true);
  });

  it("con las puntas al revés marca negativo", async () => {
    const { result } = await simulateOk(circuit(...series, AM("MM1", "x", "a")));
    expect(close(result.meters.MM1.value, -0.006)).toBe(true);
  });

  it("en paralelo con R2: avisa que la cortocircuita", async () => {
    const { result, warnings } = await simulateOk(circuit(...divider, AM("MM1", "b", "0")));
    expect(codes(warnings)).toEqual(["ammeter-parallel"]);
    expect(warnings[0].message).toMatch(/^MM1 está en paralelo con R2/);
    // Con R2 cortocircuitada solo queda R1: 12 V / 1 kΩ = 12 mA
    expect(close(result.meters.MM1.value, 0.012)).toBe(true);
  });

  it("conectado directo a la fuente: error", async () => {
    const { checkCircuit } = await import("../src/index.ts");
    const check = checkCircuit(circuit(V("V1", "a", "0"), R("R1", "a", "0"), GND("GND1", "0"), AM("MM1", "a", "0")));
    expect(check.diagnostics.map((d) => d.code)).toEqual(["ammeter-loop"]);
    expect(check.diagnostics[0].message).toBe(
      "MM1 está conectado directamente a V1, sin ninguna resistencia: es un cortocircuito.",
    );
  });

  it("con las dos puntas en el mismo punto: error", async () => {
    const { checkCircuit } = await import("../src/index.ts");
    expect(checkCircuit(circuit(...divider, AM("MM1", "b", "b"))).diagnostics.map((d) => d.code)).toEqual(["ammeter-shorted"]);
  });

  it("con una punta suelta: avisa y marca 0", async () => {
    const { result, warnings } = await simulateOk(circuit(...divider, AM("MM1", "b", "z")));
    expect(codes(warnings)).toEqual(["pin-dangling"]);
    expect(warnings[0].message).toMatch(/el multímetro marca 0/);
    expect(result.meters.MM1.value).toBe(0);
  });
});

describe("ohmímetro", () => {
  it("en un circuito encendido mide con las fuentes apagadas: R1 ∥ R2 = 500 Ω", async () => {
    const { result, warnings } = await simulateOk(circuit(...divider, OM("MM1", "b", "0")));
    expect(warnings).toEqual([]);
    expect(result.meters.MM1.mode).toBe("Ω");
    expect(close(result.meters.MM1.value, 500)).toBe(true);
    // La simulación normal no cambia por tener el ohmímetro conectado
    expect(close(result.nodeVoltages.b, 6)).toBe(true);
  });

  it("una resistencia sola, sin tierra ni fuentes, marca su valor", async () => {
    const { result, warnings } = await simulateOk(circuit(R("R1", "x", "y", 4700), OM("MM1", "x", "y")));
    expect(warnings).toEqual([]);
    expect(close(result.meters.MM1.value, 4700)).toBe(true);
  });

  it("con una punta suelta marca OL (circuito abierto)", async () => {
    const { result, warnings } = await simulateOk(circuit(R("R1", "x", "y"), OM("MM1", "x", "z")));
    expect(codes(warnings)).toEqual(["pin-dangling"]);
    expect(warnings[0].message).toMatch(/marca OL/);
    expect(result.meters.MM1.value).toBe(Infinity);
  });

  it("entre dos partes que no se tocan marca OL", async () => {
    const { result, warnings } = await simulateOk(circuit(...divider, R("R9", "x", "y"), OM("MM1", "b", "x")));
    expect(warnings).toEqual([]);
    expect(result.meters.MM1.value).toBe(Infinity);
  });

  it("con las dos puntas en el mismo punto marca 0 Ω", async () => {
    const { result } = await simulateOk(circuit(...divider, OM("MM1", "b", "b")));
    expect(result.meters.MM1.value).toBe(0);
  });
});

describe("Thévenin y Norton con el multímetro", () => {
  // Puente de Wheatstone sin la resistencia central (R5): se mide entre c y d.
  const bridge = [
    V("V1", "a", "0", 10), R("R1", "a", "c"), R("R2", "c", "0"), R("R3", "a", "d", 2000), R("R4", "d", "0"), GND("GND1", "0"),
  ];
  const vth = 5 - 10 / 3; // 5/3 V
  const rth = 500 + 2000 / 3; // 1k ∥ 1k + 2k ∥ 1k = 3500/3 Ω

  it("el voltímetro da la tensión de Thévenin (5/3 V)", async () => {
    const { result } = await simulateOk(circuit(...bridge, VM("MM1", "c", "d")));
    expect(Math.abs(result.meters.MM1.value - vth)).toBeLessThan(1e-5);
  });

  it("el ohmímetro da la resistencia de Thévenin (3500/3 Ω)", async () => {
    const { result } = await simulateOk(circuit(...bridge, OM("MM1", "c", "d")));
    expect(close(result.meters.MM1.value, rth)).toBe(true);
  });

  it("el amperímetro da la corriente de Norton, y Vth / Rth = In", async () => {
    const { result } = await simulateOk(circuit(...bridge, AM("MM1", "c", "d")));
    expect(close(result.meters.MM1.value, vth / rth)).toBe(true);
  });
});
