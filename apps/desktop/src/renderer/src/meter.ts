// Estado del multímetro y cómo se agrega al circuito antes de simular.
import type { Circuit, ComponentInstance, MeterMode } from "@ohmlab/core";
import type { Layout } from "./layouts";

export const METER_ID = "MM1";

export interface MeterState {
  mode: MeterMode;
  /** Nodo que toca la punta roja (+). */
  plus?: string;
  /** Nodo que toca la punta negra (COM). */
  com?: string;
  /** Amperímetro intercalado en serie con este componente (solo en modo A). */
  series?: string;
  /** Resistencia interna del voltímetro. */
  voltmeterResistance: number;
}

export const VOLTMETER_PRESETS = [
  { value: 1e9, label: "1 GΩ (casi ideal)" },
  { value: 1e7, label: "10 MΩ (como un multímetro de laboratorio)" },
  { value: 1e6, label: "1 MΩ (multímetro analógico sencillo)" },
];

const TYPE: Record<MeterMode, string> = { V: "voltmeter", A: "ammeter", Ω: "ohmmeter" };

export function isConnected(meter: MeterState): boolean {
  return Boolean(meter.plus || meter.com || (meter.mode === "A" && meter.series));
}

/** El circuito de práctica con los valores elegidos y el multímetro conectado. */
export function buildCircuit(layout: Layout, values: Record<string, number>, removed: Set<string>, meter: MeterState): Circuit {
  const components: ComponentInstance[] = layout.components
    .filter((c) => !removed.has(c.id))
    .map((c) => {
      const [param] = Object.keys(c.params);
      return param ? { ...c, params: { [param]: values[c.id] } } : c;
    });
  if (!isConnected(meter)) return { components };

  if (meter.mode === "A" && meter.series) {
    // Se abre el circuito en el terminal 1 del componente y se intercala el amperímetro.
    const target = components.find((c) => c.id === meter.series);
    if (target) {
      const [pin] = Object.keys(target.connections);
      const original = target.connections[pin];
      const gap = `${target.id}·amperímetro`;
      target.connections = { ...target.connections, [pin]: gap };
      components.push({ id: METER_ID, type: "ammeter", params: {}, connections: { plus: original, com: gap } });
    }
    return { components };
  }

  const connections: Record<string, string> = {};
  if (meter.plus) connections.plus = meter.plus;
  if (meter.com) connections.com = meter.com;
  const params: Record<string, number> = meter.mode === "V" ? { resistance: meter.voltmeterResistance } : {};
  components.push({ id: METER_ID, type: TYPE[meter.mode], params, connections });
  return { components };
}
