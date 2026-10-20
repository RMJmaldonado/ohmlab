// Pruebas de la práctica con el multímetro, con ngspice real.
import { describe, expect, it } from "vitest";
import {
  EXERCISES,
  applyChanges,
  checkAttempt,
  cutWire,
  formatSI,
  newExercise,
  pinPositions,
  practiceCircuit,
  simulateDc,
  type Change,
  type ExerciseInstance,
  type Point,
  type PracticeMeter,
} from "../src/index.ts";
import { engine } from "./helpers.ts";

const exercise = (id: string) => EXERCISES.find((e) => e.id === id)!;

/** Números "al azar" que siempre son los mismos, para repetir las pruebas. */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

/** Simula el intento y devuelve lo que marca el multímetro y la revisión. */
async function attempt(instance: ExerciseInstance, changes: Change[], meter: PracticeMeter, typed?: (reading: number) => string) {
  const outcome = await simulateDc(practiceCircuit(applyChanges(instance, changes), meter).circuit, engine);
  const reading = outcome.ok ? outcome.result.meters.MM1.value : Number.NaN;
  const text = typed ? typed(reading) : formatSI(reading, meter.mode, "es");
  return { reading, outcome, verdict: checkAttempt(instance, changes, meter, outcome, text) };
}

/** Un punto del cable que sale del primer pin de la pieza, al lado del pin. */
function besidePin(instance: ExerciseInstance, id: string): Point {
  const [x, y] = Object.values(pinPositions(instance.schematic.components.find((c) => c.id === id)!))[0];
  const wire = instance.schematic.wires.find((w) => (w.a[0] === x && w.a[1] === y) || (w.b[0] === x && w.b[1] === y))!;
  const other = wire.a[0] === x && wire.a[1] === y ? wire.b : wire.a;
  return [x + Math.sign(other[0] - x), y + Math.sign(other[1] - y)];
}

/** La forma correcta de resolver cada ejercicio. */
function solution(instance: ExerciseInstance): PracticeMeter {
  const { target } = instance.exercise;
  if (target.mode === "A") return { mode: "A", series: { at: besidePin(instance, target.through), flipped: false } };
  return { mode: target.mode, plus: target.across[0], com: target.across[1] };
}

describe("ejercicios", () => {
  it("los valores son comerciales, distintos entre sí, y el puente nunca queda equilibrado", () => {
    const random = seeded(7);
    for (let i = 0; i < 50; i++) {
      const { values } = newExercise(exercise("corriente-puente"), random);
      expect(new Set(Object.values(values)).size).toBe(6);
      expect(Math.abs(values.R1 * values.R4 - values.R2 * values.R3)).toBeGreaterThan(0.2 * values.R1 * values.R4);
    }
  });

  for (const ex of EXERCISES) {
    it(`${ex.title}: resuelto bien, es correcto (con varios valores al azar)`, async () => {
      const random = seeded(ex.id.length);
      for (let i = 0; i < 3; i++) {
        const instance = newExercise(ex, random);
        const { verdict, outcome } = await attempt(instance, ex.required, solution(instance));
        expect(outcome.ok && outcome.warnings).toEqual([]);
        expect(verdict).toMatchObject({ ok: true });
        expect(verdict.message).toMatch(/^¡Correcto!/);
      }
    });
  }

  it("el valor correcto es el que da la teoría (divisor y Thévenin)", async () => {
    const divider = newExercise(exercise("tension-serie"), seeded(3));
    const { V1, R1, R2 } = divider.values;
    const { reading } = await attempt(divider, [], solution(divider));
    expect(Math.abs(Math.abs(reading) - (V1 * R2) / (R1 + R2))).toBeLessThan(1e-4);

    const thevenin = newExercise(exercise("resistencia-thevenin"), seeded(5));
    const v = thevenin.values;
    const expected = (v.R1 * v.R2) / (v.R1 + v.R2) + (v.R3 * v.R4) / (v.R3 + v.R4);
    const ohms = await attempt(thevenin, thevenin.exercise.required, solution(thevenin));
    expect(Math.abs(ohms.reading - expected) / expected).toBeLessThan(1e-6);
  });
});

describe("pistas cuando algo está mal", () => {
  const divider = newExercise(exercise("tension-serie"), seeded(11));
  const branch = newExercise(exercise("corriente-rama"), seeded(13));

  it("modo equivocado", async () => {
    const { verdict } = await attempt(divider, [], { ...solution(divider), mode: "A" });
    expect(verdict.message).toMatch(/^Para medir tensión el multímetro va como voltímetro/);
  });

  it("amperímetro con las puntas en paralelo", async () => {
    const [plus, com] = Object.values(pinPositions(branch.schematic.components.find((c) => c.id === "R3")!));
    const { verdict } = await attempt(branch, [], { mode: "A", plus, com });
    expect(verdict.message).toMatch(/^El amperímetro va en serie/);
  });

  it("amperímetro en serie, pero en otra rama", async () => {
    const { verdict } = await attempt(branch, [], { mode: "A", series: { at: besidePin(branch, "R2"), flipped: false } });
    expect(verdict.message).toMatch(/por donde no pasa la corriente por R3/);
  });

  it("voltímetro intercalado en serie", async () => {
    const { verdict } = await attempt(divider, [], { mode: "V", series: { at: besidePin(divider, "R2"), flipped: false } });
    expect(verdict.message).toMatch(/^El voltímetro no se intercala/);
  });

  it("puntas en otra pieza", async () => {
    const [plus, com] = Object.values(pinPositions(divider.schematic.components.find((c) => c.id === "R1")!));
    const { verdict } = await attempt(divider, [], { mode: "V", plus, com });
    expect(verdict.message).toMatch(/^Las puntas no están en los extremos de lo que pide el ejercicio: la tensión en R2/);
  });

  it("falta quitar la fuente o apagarla", async () => {
    const equivalent = newExercise(exercise("resistencia-equivalente"), seeded(17));
    expect((await attempt(equivalent, [], solution(equivalent))).verdict.message).toMatch(/^Antes de medir, quita V1/);
    const thevenin = newExercise(exercise("resistencia-thevenin"), seeded(19));
    const onlyR5: Change[] = [{ component: "R5", action: "remove" }];
    expect((await attempt(thevenin, onlyR5, solution(thevenin))).verdict.message).toMatch(/^Antes de medir, apaga V1/);
  });

  it("prefijo equivocado, número mal escrito y nada escrito", async () => {
    const forgotPrefix = await attempt(branch, [], solution(branch), (r) => String(Math.abs(r) * 1000).replace(".", ","));
    expect(forgotPrefix.verdict.message).toMatch(/^Revisa el prefijo: el multímetro marca .* mA/);
    expect((await attempt(divider, [], solution(divider), () => "abc")).verdict.message).toMatch(/no es un número/);
    expect((await attempt(divider, [], solution(divider), () => " ")).verdict.message).toBe("Escribe el valor que marca el multímetro.");
  });

  it("con las puntas al revés marca negativo, y es correcto", async () => {
    const { target } = divider.exercise;
    if (target.mode !== "V") throw new Error("el divisor mide tensión");
    const { reading, verdict } = await attempt(divider, [], { mode: "V", plus: target.across[1], com: target.across[0] });
    expect(reading).toBeLessThan(0);
    expect(verdict.ok).toBe(true);
    expect(verdict.message).toMatch(/Marca negativo/);
  });
});

describe("cortar un cable para intercalar el multímetro", () => {
  it("corta solo el tramo entre las uniones más cercanas", () => {
    // En el circuito en paralelo, el cable de arriba va de (6,0) a (12,0) y R2 llega en T a (8,0).
    const instance = newExercise(exercise("corriente-rama"), seeded(1));
    const cut = cutWire(instance.schematic, [10, 0])!;
    expect(cut.gap).toEqual([[8, 0], [12, 0]]);
    expect(cut.schematic.wires.some((w) => w.a[0] === 6 && w.b[0] === 8 && w.a[1] === 0)).toBe(true);
  });

  it("no corta en un punto de unión ni fuera de un cable", () => {
    const instance = newExercise(exercise("corriente-rama"), seeded(1));
    expect(cutWire(instance.schematic, [8, 0])).toBeNull();
    expect(cutWire(instance.schematic, [5, 3])).toBeNull();
  });
});
