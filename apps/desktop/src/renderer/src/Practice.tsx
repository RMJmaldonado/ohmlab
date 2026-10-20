// Práctica con el multímetro: circuitos con dibujo fijo y un multímetro que
// se conecta haciendo clic. Es un ejercicio guiado; en el editor el
// multímetro se arrastra y se conecta con cables.
import { useEffect, useMemo, useState } from "react";
import { getComponentDef } from "@ohmlab/core";
import { DiagnosticList } from "./DiagnosticList";
import { LAYOUTS, type Layout } from "./layouts";
import { buildCircuit, METER_ID, type MeterState } from "./meter";
import { MultimeterPanel } from "./MultimeterPanel";
import { Schematic } from "./Schematic";
import { useLiveSimulation } from "./useLiveSimulation";

function initialValues(layout: Layout): Record<string, number> {
  return Object.fromEntries(
    layout.components.filter((c) => Object.keys(c.params).length > 0).map((c) => [c.id, Object.values(c.params)[0]]),
  );
}

export function Practice({ active }: { active: boolean }) {
  const [layout, setLayout] = useState<Layout>(LAYOUTS[0]);
  const [values, setValues] = useState(() => initialValues(LAYOUTS[0]));
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [meter, setMeter] = useState<MeterState>({ mode: "V", voltmeterResistance: 1e9 });
  const [running, setRunning] = useState(false);

  // Mientras la simulación está encendida, cada cambio se vuelve a simular solo.
  const circuit = useMemo(() => buildCircuit(layout, values, removed, meter), [layout, values, removed, meter]);
  const { outcome } = useLiveSimulation(circuit, running);

  // F5 (menú Simulación) enciende o apaga la simulación de la vista que se ve.
  useEffect(() => {
    if (!active) return;
    return window.ohmlab.onToggleSimulation(() => setRunning((r) => !r));
  }, [active]);

  const chooseLayout = (next: Layout) => {
    setLayout(next);
    setValues(initialValues(next));
    setRemoved(new Set());
    setMeter((m) => ({ ...m, plus: undefined, com: undefined, series: undefined }));
  };

  const touchNode = (node: string) =>
    setMeter((m) => {
      const fresh = { ...m, series: undefined };
      if (!m.plus || (m.plus && m.com)) return { ...fresh, plus: node, com: undefined };
      return { ...fresh, com: node };
    });

  const touchPart = (id: string) => {
    if (removed.has(id)) return;
    const component = layout.components.find((c) => c.id === id)!;
    const [first, second] = Object.values(component.connections);
    // En modo A se intercala en serie; en V y Ω, las puntas van a sus extremos.
    setMeter((m) =>
      m.mode === "A"
        ? { ...m, series: id, plus: undefined, com: undefined }
        : { ...m, plus: first, com: second, series: undefined },
    );
  };

  const diagnostics = outcome ? (outcome.ok ? outcome.warnings : outcome.diagnostics) : [];
  const flagged = new Set(diagnostics.flatMap((d) => d.components));
  const reading = outcome?.ok ? outcome.result.meters[METER_ID] : undefined;

  return (
    <div className="practice">
      <div className="practice-bar">
        <nav className="tabs" aria-label="Circuito de práctica">
          {LAYOUTS.map((l) => (
            <button key={l.id} className={l.id === layout.id ? "tab active" : "tab"} onClick={() => chooseLayout(l)}>
              {l.title}
            </button>
          ))}
        </nav>
        <button
          className={running ? "run running" : "run"}
          data-testid="simular"
          onClick={() => setRunning((r) => !r)}
          title={running ? "Detener la simulación" : "Simular: las lecturas se actualizan solas"}
        >
          {running ? "■ Detener" : "▶ Simular"}
        </button>
      </div>

      <main className="content">
        <section className="card">
          <h1>{layout.title}</h1>
          <p className="muted">{layout.description}</p>
          <Schematic
            layout={layout}
            values={values}
            removed={removed}
            meter={meter}
            flagged={flagged}
            onNodeClick={touchNode}
            onPartClick={touchPart}
          />
          <div className="fields">
            {Object.entries(values).map(([id, value]) => {
              const component = layout.components.find((c) => c.id === id)!;
              const unit = getComponentDef(component.type).params[0].unit;
              return (
                <NumberField
                  key={id}
                  label={id}
                  unit={unit}
                  value={value}
                  disabled={removed.has(id)}
                  onChange={(n) => setValues((v) => ({ ...v, [id]: n }))}
                />
              );
            })}
          </div>
          {layout.removable?.map((id) => (
            <label key={id} className="check">
              <input
                type="checkbox"
                checked={!removed.has(id)}
                onChange={(e) =>
                  setRemoved((r) => {
                    const next = new Set(r);
                    if (e.target.checked) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
              />
              Incluir {id}
            </label>
          ))}
        </section>

        <div className="side">
          <MultimeterPanel meter={meter} reading={reading} running={running} onChange={setMeter} />
          {running && (!outcome || diagnostics.length > 0) && (
            <section className="card">
              {!outcome && <p className="muted">Simulando…</p>}
              <DiagnosticList diagnostics={diagnostics} />
            </section>
          )}
          {!running && <p className="muted hint-run">Pulsa ▶ Simular para encender el circuito y medir con el multímetro.</p>}
        </div>
      </main>
    </div>
  );
}

function NumberField(props: { label: string; unit: string; value: number; disabled?: boolean; onChange: (n: number) => void }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type="number"
        disabled={props.disabled}
        value={Number.isFinite(props.value) ? props.value : ""}
        onChange={(e) => props.onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))}
      />
      <span className="unit">{props.unit}</span>
    </label>
  );
}
