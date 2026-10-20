// Ventana de un multímetro: se abre con doble clic sobre él, como el
// instrumento de la mesa del laboratorio. Pantalla, selector de modo y, en
// voltímetro, la resistencia interna. Diseño propio de OhmLab.
import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { getComponentDef, type MeterMode, type MeterReading, type PlacedComponent } from "@ohmlab/core";
import { meterText } from "./SimulationPanel";

export const METER_TYPES: Record<MeterMode, string> = { V: "voltmeter", A: "ammeter", Ω: "ohmmeter" };

const MODES: { mode: MeterMode; name: string; how: string }[] = [
  { mode: "V", name: "Voltímetro", how: "Mide tensión. Va en paralelo: una punta a cada lado de lo que mides." },
  { mode: "A", name: "Amperímetro", how: "Mide corriente. Va en serie: suéltalo sobre el cable por donde pasa la corriente." },
  { mode: "Ω", name: "Ohmímetro", how: "Mide resistencia entre las puntas, con las fuentes apagadas (OhmLab las apaga solo)." },
];

const RESISTANCES = [
  { value: 1e9, label: "1 GΩ (casi ideal)" },
  { value: 1e7, label: "10 MΩ (como uno de laboratorio)" },
  { value: 1e6, label: "1 MΩ (analógico sencillo)" },
];

interface Props {
  component: PlacedComponent;
  /** Lo que marca, si la simulación está encendida y salió bien. */
  reading: MeterReading | undefined;
  running: boolean;
  x: number;
  y: number;
  onMove(x: number, y: number): void;
  onMode(type: string): void;
  onResistance(value: number): void;
  onClose(): void;
}

export function MeterWindow(props: Props) {
  const { component } = props;
  const mode = getComponentDef(component.type).meter!;
  const drag = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null);

  // Se arrastra por la barra de título.
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("button")) return;
    drag.current = { startX: e.clientX, startY: e.clientY, x: props.x, y: props.y };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Eventos sintéticos (pruebas) no tienen un puntero real.
    }
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d) props.onMove(Math.max(0, d.x + e.clientX - d.startX), Math.max(0, d.y + e.clientY - d.startY));
  };

  const reading = props.reading;
  const text = props.running ? meterText(reading) : "— —";
  const current = MODES.find((m) => m.mode === mode)!;

  return (
    <div className="meter-window" data-meter-window={component.id} style={{ left: props.x, top: props.y }} role="dialog" aria-label={`Multímetro ${component.id}`}>
      <div className="meter-window-title" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => (drag.current = null)}>
        <span>Multímetro {component.id}</span>
        <button className="close" onClick={props.onClose} aria-label="Cerrar" title="Cerrar">×</button>
      </div>

      <div className={props.running ? "display" : "display idle-display"} data-testid="pantalla-ventana">{text}</div>
      {!props.running && <p className="muted small">Pulsa ▶ Simular (F5) para encender el circuito.</p>}
      {props.running && reading && reading.value < 0 && (
        <p className="note small">Marca negativo: las puntas están al revés. Alt+X lo voltea.</p>
      )}

      <div className="window-modes" role="radiogroup" aria-label="Modo del multímetro">
        {MODES.map((m) => (
          <button
            key={m.mode}
            role="radio"
            aria-checked={mode === m.mode}
            data-window-mode={m.mode}
            className={mode === m.mode ? "window-mode active" : "window-mode"}
            onClick={() => props.onMode(METER_TYPES[m.mode])}
          >
            <span className="letter">{m.mode}</span>
            <span className="name">{m.name}</span>
          </button>
        ))}
      </div>
      <p className="muted small">{current.how}</p>

      {mode === "V" && (
        <label className="window-field">
          <span>Resistencia interna</span>
          <select value={component.params.resistance} onChange={(e) => props.onResistance(Number(e.target.value))}>
            {RESISTANCES.some((r) => r.value === component.params.resistance) ? null : (
              <option value={component.params.resistance}>{component.params.resistance} Ω</option>
            )}
            {RESISTANCES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
