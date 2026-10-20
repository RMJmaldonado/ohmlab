// Pruebas de los archivos .ohmlab: guardar, abrir y rechazar archivos dañados.
import { describe, expect, it } from "vitest";
import {
  addComponent,
  addWire,
  analyzeConnectivity,
  emptySchematic,
  parseSchematicFile,
  serializeSchematic,
  validateSchematic,
  type Schematic,
} from "../src/index.ts";

function sample(): Schematic {
  let s = addComponent(emptySchematic(), "dc-voltage-source", 0, 0).schematic;
  s = addComponent(s, "resistor", 4, -2).schematic;
  s = { ...s, components: s.components.map((c) => (c.id === "R1" ? { ...c, params: { resistance: 4700 }, rotation: 90 as const } : c)) };
  s = addComponent(s, "voltmeter", 8, 0).schematic;
  return addWire(addWire(s, [[0, -2], [4, -4]]), [[0, 2], [4, 2]]);
}

const reopen = (s: Schematic) => {
  const parsed = parseSchematicFile(serializeSchematic(s));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.schematic;
};

describe("guardar y abrir", () => {
  it("lo que se guarda se abre igual", () => {
    const s = sample();
    expect(reopen(s)).toEqual(s);
  });

  it("el archivo es texto legible, con su formato y versión", () => {
    const text = serializeSchematic(sample());
    expect(JSON.parse(text)).toMatchObject({ format: "ohmlab", version: 1 });
    expect(text).toContain('"resistance": 4700');
  });

  it("al abrir se conservan las conexiones", () => {
    const s = sample();
    const names = (x: Schematic) => analyzeConnectivity(x).nets.map((n) => n.pins.map((p) => `${p.component}.${p.pin}`).join(","));
    expect(names(reopen(s))).toEqual(names(s));
  });

  it("si al archivo le falta un valor, usa el de fábrica", () => {
    const data = JSON.parse(serializeSchematic(sample()));
    delete data.components[1].params.resistance;
    const parsed = parseSchematicFile(JSON.stringify(data));
    expect(parsed.ok && parsed.schematic.components[1].params.resistance).toBe(1000);
  });
});

describe("archivos que no se pueden abrir", () => {
  const broken = (change: (data: any) => void) => {
    const data = JSON.parse(serializeSchematic(sample()));
    change(data);
    const parsed = parseSchematicFile(JSON.stringify(data));
    return parsed.ok ? "se abrió" : parsed.error;
  };

  it.each([
    ["texto que no es JSON", () => parseSchematicFile("hola"), /dañado/],
    ["JSON de otro programa", () => parseSchematicFile('{"a": 1}'), /no es un circuito de OhmLab/],
  ])("%s", (_name, open, message) => {
    const parsed = open();
    expect(parsed.ok ? "se abrió" : parsed.error).toMatch(message);
  });

  it.each([
    ["de una versión más nueva", (d: any) => (d.version = 2), /versión más nueva/],
    ["con un tipo desconocido", (d: any) => (d.components[0].type = "condensador-de-flujo"), /no conoce/],
    ["con dos componentes del mismo nombre", (d: any) => (d.components[1].id = "V1"), /dos componentes llamados V1/],
    ["con un nombre raro", (d: any) => (d.components[0].id = "<script>"), /nombre no válido/],
    ["con un valor que no es número", (d: any) => (d.components[1].params.resistance = "mucho"), /valor no válido/],
    ["con un valor infinito", (d: any) => (d.components[1].params.resistance = 1e999), /valor no válido/],
    ["con un giro raro", (d: any) => (d.components[0].rotation = 45), /giro no válido/],
    ["con una posición decimal", (d: any) => (d.components[0].x = 1.5), /posición no válida/],
    ["con un cable en diagonal", (d: any) => (d.wires[0].b = [9, 9]), /diagonal/],
    ["sin la lista de cables", (d: any) => delete d.wires, /Faltan/],
  ])("%s", (_name, change, message) => {
    expect(broken(change)).toMatch(message);
  });

  it("no acepta circuitos enormes", () => {
    const huge = { version: 1, components: [], wires: Array.from({ length: 20001 }, (_, i) => ({ id: `wire-${i}`, a: [0, i], b: [1, i] })) };
    expect(validateSchematic(huge)).toMatch(/demasiado grande/);
  });
});
