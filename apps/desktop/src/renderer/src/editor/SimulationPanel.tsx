// Panel de simulación del editor: errores y avisos, y lo que marcan los
// multímetros. Las demás piezas no muestran valores: todo se mide con el
// multímetro, como en el laboratorio.
import { Fragment } from "react";
import { formatSI, getComponentDef, type DcOutcome, type MeterReading, type PlacedComponent } from "@ohmlab/core";
import { DiagnosticList } from "../DiagnosticList";

const locale = navigator.language;

/** Lo que marca la pantalla de un multímetro: "6 V", "OL" o "— —". */
export function meterText(reading: MeterReading | undefined): string {
  if (!reading || Number.isNaN(reading.value)) return "— —";
  if (reading.value === Infinity) return "OL";
  return formatSI(reading.value, reading.mode, locale);
}

interface Props {
  running: boolean;
  outcome: DcOutcome | null;
  selected: PlacedComponent[];
  components: PlacedComponent[];
}

export function SimulationPanel({ running, outcome, selected, components }: Props) {
  if (!running) {
    return (
      <section className="sim-panel">
        <h3>Simulación</h3>
        <p className="muted small">
          Pulsa <strong>▶ Simular</strong> (F5) para encender el circuito y medir con el multímetro. Puedes seguir
          editando mientras simula: las lecturas se actualizan solas.
        </p>
      </section>
    );
  }
  if (!outcome) {
    return (
      <section className="sim-panel">
        <h3>Simulación</h3>
        <p className="muted small">Simulando…</p>
      </section>
    );
  }

  const diagnostics = outcome.ok ? outcome.warnings : outcome.diagnostics;
  const single = selected.length === 1 ? selected[0] : null;
  const def = single ? getComponentDef(single.type) : null;
  const meters = components.filter((c) => getComponentDef(c.type).meter);

  return (
    <section className="sim-panel" data-testid="simulacion-editor">
      <h3>Simulación</h3>
      {!outcome.ok && <p className="sim-state error-text">No se puede simular: corrige el error de abajo.</p>}

      {outcome.ok && single && def?.meter && (
        <>
          <div className="display" data-testid="lectura-editor">{meterText(outcome.result.meters[single.id])}</div>
          {outcome.result.meters[single.id]?.value < 0 && !(def.probe && def.meter === "V") && (
            <p className="note" data-testid="nota-signo">
              Marca negativo porque{" "}
              {def.probe
                ? "la corriente va al revés de la flecha"
                : def.meter === "A"
                  ? "la corriente entra por la punta COM (negra) y no por la + (roja)"
                  : "la punta + (roja) está en el punto de menor tensión"}
              . Es correcto, como en un multímetro real. Para verlo positivo, voltéalo (Alt+X).
            </p>
          )}
        </>
      )}
      {outcome.ok && single && !def?.meter && !def?.isGround && (
        <p className="muted small">
          Para medir {single.id}, usa el multímetro: en paralelo para su tensión, o suéltalo sobre un cable en serie con{" "}
          {single.id} para su corriente.
        </p>
      )}
      {outcome.ok && !single &&
        (meters.length > 0 ? (
          <dl className="values" data-testid="lecturas-editor">
            {meters.map((c) => (
              <Fragment key={c.id}>
                <dt>{c.id}</dt>
                <dd>{meterText(outcome.result.meters[c.id])}</dd>
              </Fragment>
            ))}
          </dl>
        ) : (
          <p className="muted small">Para medir, arrastra el multímetro desde la paleta y conéctalo al circuito.</p>
        ))}
      <DiagnosticList diagnostics={diagnostics} />
    </section>
  );
}
