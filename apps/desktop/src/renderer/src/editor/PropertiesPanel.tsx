// Panel de propiedades: nombre y valores del componente seleccionado. Con
// doble clic sobre un componente, el cursor salta al primer valor.
import { useEffect, useRef, useState } from "react";
import { formatInput, getComponentDef, parseValue, type MeterMode, type PlacedComponent } from "@ohmlab/core";

const METER_TYPES: Record<MeterMode, string> = { V: "voltmeter", A: "ammeter", Ω: "ohmmeter" };

interface Props {
  selected: PlacedComponent[];
  /** Cuántos tramos de cable hay seleccionados. */
  wireCount: number;
  /** Cambia cada vez que se hace doble clic en un componente. */
  editRequest: number;
  /** Mientras se simula, la ayuda se oculta para que se vean las lecturas y los errores. */
  compact: boolean;
  onRename(id: string, name: string): string | null;
  onParam(id: string, param: string, value: number): void;
  onType(id: string, type: string): void;
  onRotate(direction: "cw" | "ccw"): void;
  onFlip(axis: "horizontal" | "vertical"): void;
  onDelete(): void;
}

export function PropertiesPanel(props: Props) {
  const { selected, wireCount } = props;

  if (selected.length === 0 && wireCount > 0) {
    return (
      <aside className="properties">
        <h3>Cable</h3>
        <p>{wireCount === 1 ? "1 tramo de cable seleccionado." : `${wireCount} tramos de cable seleccionados.`}</p>
        <p className="muted small">Arrástralo para moverlo: los cables unidos a él lo siguen.</p>
        <div className="prop-actions">
          <button className="danger" onClick={props.onDelete} title="Borrar (Supr)">Borrar</button>
        </div>
      </aside>
    );
  }

  if (selected.length === 0) {
    return (
      <aside className="properties">
        <h3>Propiedades</h3>
        <p className="muted small">Selecciona un componente para ver y cambiar sus valores.</p>
        {!props.compact && <Help />}
      </aside>
    );
  }

  const actions = (
    <div className="prop-actions">
      <button onClick={() => props.onRotate("cw")} title="Girar 90° a la derecha (Ctrl+R)">↻ Girar</button>
      <button onClick={() => props.onRotate("ccw")} title="Girar 90° a la izquierda (Ctrl+Shift+R)">↺</button>
      <button onClick={() => props.onFlip("horizontal")} title="Voltear horizontal (Alt+X)">⇋</button>
      <button onClick={() => props.onFlip("vertical")} title="Voltear vertical (Alt+Y)">⇵</button>
      <button className="danger" onClick={props.onDelete} title="Borrar (Supr)">Borrar</button>
    </div>
  );

  if (selected.length > 1 || wireCount > 0) {
    return (
      <aside className="properties">
        <h3>Propiedades</h3>
        <p>
          {selected.length} {selected.length === 1 ? "componente" : "componentes"}
          {wireCount > 0 ? ` y ${wireCount} ${wireCount === 1 ? "tramo" : "tramos"} de cable` : ""} seleccionados.
        </p>
        {actions}
      </aside>
    );
  }

  const c = selected[0];
  const def = getComponentDef(c.type);
  return (
    <aside className="properties" key={c.id}>
      <h3>{def.meter && !def.probe ? "Multímetro" : def.label}</h3>
      <NameField id={c.id} onRename={props.onRename} focusRequest={def.params.length === 0 ? props.editRequest : 0} />
      {def.probe && (
        <p className="muted small">
          {def.meter === "V"
            ? "Marca la tensión del punto que toca, respecto a tierra. Suéltala sobre un cable."
            : "Marca la corriente que pasa por el cable: suéltala sobre él y queda en serie. Es positiva en el sentido de la flecha; Alt+X la voltea."}
        </p>
      )}
      {def.meter && !def.probe && (
        <div className="prop-row">
          <span>Modo</span>
          <div className="modes">
            {(Object.keys(METER_TYPES) as MeterMode[]).map((mode) => (
              <button
                key={mode}
                data-meter-mode={mode}
                className={def.meter === mode ? "mode active" : "mode"}
                onClick={() => props.onType(c.id, METER_TYPES[mode])}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      )}
      {def.params.map((param, i) => (
        <NumberField
          key={`${param.id}:${c.params[param.id]}`}
          label={param.label}
          unit={param.unit}
          value={c.params[param.id]}
          focusRequest={i === 0 ? props.editRequest : 0}
          onCommit={(value) => props.onParam(c.id, param.id, value)}
        />
      ))}
      {def.params.length > 0 && (
        <p className="muted small prefix-help">
          Puedes usar prefijos: p, n, µ (o u), m, k, M, G. Ojo: <strong>M</strong> es mega y <strong>m</strong> es mili.
          Ejemplos: 4.7k, 4k7, 10m, 2u.
        </p>
      )}
      {actions}
    </aside>
  );
}

function NameField({ id, onRename, focusRequest }: { id: string; onRename: Props["onRename"]; focusRequest: number }) {
  const [draft, setDraft] = useState(id);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(id), [id]);
  useFocus(ref, focusRequest);

  const commit = () => {
    const problem = onRename(id, draft);
    setError(problem);
    if (problem) setDraft(id);
  };
  return (
    <label className="prop-row">
      <span>Nombre</span>
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
      {error && <small className="error-text">{error}</small>}
    </label>
  );
}

/**
 * Campo de valor con prefijos (4.7k, 10m, 1M = mega). Se aplica al salir o
 * con Enter, así cada cambio es un solo paso para deshacer.
 */
function NumberField(props: { label: string; unit: string; value: number; focusRequest: number; onCommit(value: number): void }) {
  const [draft, setDraft] = useState(formatInput(props.value));
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useFocus(ref, props.focusRequest);

  const commit = () => {
    const value = parseValue(draft, props.unit);
    if (value === null) {
      setError(
        draft.trim() === ""
          ? "Escribe un valor."
          : `No entiendo «${draft.trim()}». Escribe un número, por ejemplo 4.7k o 10m.`,
      );
      return;
    }
    setError(null);
    if (value !== props.value) props.onCommit(value);
    else setDraft(formatInput(props.value));
  };
  return (
    <label className="prop-row">
      <span>{props.label}</span>
      <span className="with-unit">
        <input
          ref={ref}
          type="text"
          spellCheck={false}
          aria-invalid={error !== null}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
        />
        <span className="unit">{props.unit}</span>
      </span>
      {error && <small className="error-text">{error}</small>}
    </label>
  );
}

function useFocus(ref: React.RefObject<HTMLInputElement | null>, request: number) {
  useEffect(() => {
    if (request > 0) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [request]);
}

/** Ayuda para empezar: cómo cablear y los atajos. */
function Help() {
  return (
    <>
      <h3>Cables</h3>
      <dl className="shortcuts">
        <dt>Pin + arrastrar</dt><dd>Une dos pines con un cable</dd>
        <dt>Clic en un pin</dt><dd>El cable sigue al ratón; cada clic hace una esquina</dd>
        <dt>Doble clic</dt><dd>Termina el cable donde está</dd>
        <dt>Soltar sobre un cable</dt><dd>El componente queda en serie</dd>
      </dl>
      <h3>Atajos</h3>
      <dl className="shortcuts">
        <dt>Ctrl+R</dt><dd>Girar 90° a la derecha</dd>
        <dt>Ctrl+Shift+R</dt><dd>Girar 90° a la izquierda</dd>
        <dt>Alt+X / Alt+Y</dt><dd>Voltear horizontal / vertical</dd>
        <dt>Supr</dt><dd>Borrar</dd>
        <dt>Ctrl+C / Ctrl+V</dt><dd>Copiar / pegar (se pega donde está el ratón)</dd>
        <dt>Ctrl+X</dt><dd>Cortar (copiar y borrar)</dd>
        <dt>Ctrl+Z / Ctrl+Y</dt><dd>Deshacer / rehacer</dd>
        <dt>Ctrl+A</dt><dd>Seleccionar todo</dd>
        <dt>Esc</dt><dd>Cancelar (también el cable a medio dibujar)</dd>
        <dt>Rueda</dt><dd>Acercar o alejar</dd>
        <dt>Espacio + arrastrar</dt><dd>Mover la vista (también con el botón central)</dd>
      </dl>
    </>
  );
}
