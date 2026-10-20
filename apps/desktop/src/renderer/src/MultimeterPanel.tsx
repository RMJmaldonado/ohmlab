// Panel del multímetro: selector de modo, pantalla y cómo están conectadas
// las puntas. Diseño propio de OhmLab.
import { formatSI, type MeterMode, type MeterReading } from "@ohmlab/core";
import { nodeName } from "./layouts";
import { isConnected, VOLTMETER_PRESETS, type MeterState } from "./meter";

const locale = navigator.language;

const MODES: { mode: MeterMode; name: string }[] = [
  { mode: "V", name: "Voltímetro" },
  { mode: "A", name: "Amperímetro" },
  { mode: "Ω", name: "Ohmímetro" },
];

interface Props {
  meter: MeterState;
  reading?: MeterReading;
  running: boolean;
  onChange(meter: MeterState): void;
}

export function MultimeterPanel({ meter, reading, running, onChange }: Props) {
  const connected = isConnected(meter);

  return (
    <section className="card meter">
      <div className="meter-head">
        <h2>Multímetro MM1</h2>
        <div className="modes" role="radiogroup" aria-label="Modo del multímetro">
          {MODES.map(({ mode, name }) => (
            <button
              key={mode}
              role="radio"
              aria-checked={meter.mode === mode}
              title={name}
              data-mode={mode}
              className={meter.mode === mode ? "mode active" : "mode"}
              onClick={() => onChange({ ...meter, mode, series: mode === "A" ? meter.series : undefined })}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="display" data-testid="lectura" aria-live="polite">
        {display(meter, reading, running, connected)}
      </div>

      <p className="connection">{describeConnection(meter)}</p>
      <p className="muted small">{instructions(meter.mode)}</p>

      {meter.mode === "V" && (
        <label className="field">
          <span>Resistencia interna</span>
          <select
            value={meter.voltmeterResistance}
            onChange={(e) => onChange({ ...meter, voltmeterResistance: Number(e.target.value) })}
          >
            {VOLTMETER_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
      )}
      {meter.mode === "Ω" && (
        <p className="note">Mide con las fuentes apagadas, como se debe hacer en el laboratorio.</p>
      )}

      {connected && (
        <button onClick={() => onChange({ ...meter, plus: undefined, com: undefined, series: undefined })}>
          Quitar las puntas
        </button>
      )}
    </section>
  );
}

function display(meter: MeterState, reading: MeterReading | undefined, running: boolean, connected: boolean) {
  if (!running) return <span className="idle">— —</span>;
  if (!connected || !reading) return <span className="idle">— —</span>;
  if (reading.value === Infinity) return "OL";
  if (Number.isNaN(reading.value)) return <span className="idle">— —</span>;
  return formatSI(reading.value, meter.mode, locale);
}

function describeConnection(meter: MeterState): string {
  if (meter.mode === "A" && meter.series) return `Intercalado en serie con ${meter.series}.`;
  if (!meter.plus && !meter.com) return "Puntas sin conectar.";
  const plus = meter.plus ? nodeName(meter.plus) : "sin conectar";
  const com = meter.com ? nodeName(meter.com) : "sin conectar";
  return `Punta roja (+): ${plus} · Punta negra (COM): ${com}`;
}

function instructions(mode: MeterMode): string {
  if (mode === "A") {
    return "Haz clic en un componente para intercalar el amperímetro en serie con él. También puedes tocar dos puntos con las puntas (cuidado: así queda en paralelo).";
  }
  return "Haz clic en un punto o cable del circuito para la punta roja (+) y en otro para la negra (COM). Si haces clic en un componente, las puntas van a sus extremos.";
}
