// Práctica con el multímetro: ejercicios con un circuito fijo y valores al
// azar. El estudiante elige el modo, conecta el multímetro arrastrando sus
// puntas (o intercalándolo en serie), lee la pantalla, escribe el valor y
// pulsa Comprobar. Si algo está mal, recibe una pista.
import { useMemo, useState } from "react";
import {
  EXERCISES,
  PRACTICE_METER,
  applyChanges,
  checkAttempt,
  newExercise,
  practiceCircuit,
  type Change,
  type MeterMode,
  type PracticeMeter,
  type Verdict,
} from "@ohmlab/core";
import { DiagnosticList } from "../DiagnosticList";
import { meterText } from "../editor/SimulationPanel";
import { useLiveSimulation } from "../useLiveSimulation";
import { PracticeCanvas } from "./PracticeCanvas";

const locale = navigator.language;
const MODES: { mode: MeterMode; label: string }[] = [
  { mode: "V", label: "Voltímetro" },
  { mode: "A", label: "Amperímetro" },
  { mode: "Ω", label: "Ohmímetro" },
];

export function Practice({ active }: { active: boolean }) {
  const [instance, setInstance] = useState(() => newExercise(EXERCISES[0]));
  const [changes, setChanges] = useState<Change[]>([]);
  const [meter, setMeterState] = useState<PracticeMeter>({ mode: "V" });
  const [typed, setTyped] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [solved, setSolved] = useState<Set<string>>(new Set());
  const [parkRequest, setParkRequest] = useState(0);

  const exercise = instance.exercise;
  const schematic = useMemo(() => applyChanges(instance, changes), [instance, changes]);
  const setup = useMemo(() => practiceCircuit(schematic, meter), [schematic, meter]);
  // El circuito está siempre encendido mientras se ve la práctica.
  const { outcome, fresh } = useLiveSimulation(setup.circuit, active);
  const screen = outcome?.ok ? meterText(outcome.result.meters[PRACTICE_METER]) : "— —";

  const setMeter = (next: PracticeMeter) => {
    setMeterState(next);
    setVerdict(null);
  };
  const open = (index: number) => {
    setInstance(newExercise(EXERCISES[index]));
    setChanges([]);
    setMeterState({ mode: "V" });
    setTyped("");
    setVerdict(null);
    setParkRequest((n) => n + 1);
  };
  const index = EXERCISES.indexOf(exercise);
  const toggle = (change: Change, on: boolean) => {
    setChanges((list) =>
      on ? [...list, change] : list.filter((c) => c.component !== change.component || c.action !== change.action),
    );
    setVerdict(null);
  };
  const check = () => {
    const result = checkAttempt(instance, changes, meter, fresh ? outcome : null, typed, locale);
    setVerdict(result);
    if (result.ok) setSolved((s) => new Set(s).add(exercise.id));
  };

  return (
    <div className="practice-grid">
      <nav className="exercise-list card" aria-label="Ejercicios">
        <h3>Ejercicios</h3>
        <ol>
          {EXERCISES.map((e, i) => (
            <li key={e.id}>
              <button className={e === exercise ? "exercise active" : "exercise"} data-exercise={e.id} onClick={() => open(i)}>
                <span className="check-mark">{solved.has(e.id) ? "✓" : ""}</span>
                {e.title}
              </button>
            </li>
          ))}
        </ol>
        <p className="muted small">
          {solved.size} de {EXERCISES.length} resueltos
        </p>
      </nav>

      <section className="card exercise-main">
        <h1>
          {index + 1}. {exercise.title}
        </h1>
        <p className="task" data-testid="enunciado">{exercise.task}</p>
        <PracticeCanvas
          key={instance.exercise.id}
          schematic={schematic}
          frame={instance.schematic}
          meter={meter}
          gap={setup.gap}
          labels={exercise.labels}
          screen={screen}
          parkRequest={parkRequest}
          onMeterChange={setMeter}
        />
        <p className="muted small">
          Arrastra las puntas roja y negra hasta los puntos que quieres medir. Para medir corriente, arrastra el
          multímetro sobre un cable: el circuito se abre ahí y el multímetro queda en serie.
        </p>
        {exercise.changes.length > 0 && (
          <div className="changes">
            {exercise.changes.map((change) => (
              <label key={`${change.action}:${change.component}`} className="check">
                <input
                  type="checkbox"
                  data-change={`${change.action}:${change.component}`}
                  checked={changes.some((c) => c.component === change.component && c.action === change.action)}
                  onChange={(e) => toggle(change, e.target.checked)}
                />
                {change.action === "remove" ? `Quitar ${change.component}` : `Apagar ${change.component} (un cable en su lugar)`}
              </label>
            ))}
          </div>
        )}
      </section>

      <aside className="side">
        <section className="card meter">
          <h2>Multímetro</h2>
          <div className="modes wide" role="radiogroup" aria-label="Modo del multímetro">
            {MODES.map(({ mode, label }) => (
              <button
                key={mode}
                role="radio"
                aria-checked={meter.mode === mode}
                className={meter.mode === mode ? "mode active" : "mode"}
                data-mode={mode}
                onClick={() => setMeter({ ...meter, mode })}
              >
                <strong>{mode}</strong>
                <span>{label}</span>
              </button>
            ))}
          </div>
          {/* Mientras se vuelve a simular, la lectura anterior se ve atenuada. */}
          <div className={fresh ? "display" : "display stale"} data-testid="lectura-practica" data-fresh={fresh}>
            {screen}
          </div>
          {meter.series ? (
            <div className="row-buttons">
              <span className="connection">Intercalado en serie</span>
              <button onClick={() => setMeter({ ...meter, series: { ...meter.series!, flipped: !meter.series!.flipped } })}>
                Invertir puntas
              </button>
            </div>
          ) : null}
          {(meter.series || meter.plus || meter.com) && (
            <button
              className="link"
              onClick={() => {
                setMeter({ mode: meter.mode });
                setParkRequest((n) => n + 1);
              }}
            >
              Desconectar el multímetro
            </button>
          )}
          {outcome && !outcome.ok && <DiagnosticList diagnostics={outcome.diagnostics.filter((d) => d.severity === "error")} />}
        </section>

        <section className="card answer">
          <label className="answer-field">
            <span>Valor que marca el multímetro</span>
            <input
              data-testid="respuesta"
              value={typed}
              placeholder="Por ejemplo: 4,5 V"
              onChange={(e) => {
                setTyped(e.target.value);
                setVerdict(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && check()}
            />
          </label>
          <button className="primary" data-testid="comprobar" onClick={check}>
            Comprobar
          </button>
          {verdict && (
            <p className={verdict.ok ? "verdict ok" : "verdict hint"} data-testid="veredicto" role="status">
              {verdict.message}
            </p>
          )}
          <div className="row-buttons">
            <button data-testid="nuevos-valores" onClick={() => open(index)}>
              Nuevos valores
            </button>
            {verdict?.ok && index < EXERCISES.length - 1 && (
              <button className="primary" data-testid="siguiente" onClick={() => open(index + 1)}>
                Siguiente ejercicio
              </button>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
