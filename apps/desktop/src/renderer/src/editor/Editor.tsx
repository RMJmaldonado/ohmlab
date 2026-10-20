// Editor de esquemáticos: paleta, lienzo con cables, propiedades y
// simulación en vivo (lo que marcan los multímetros se ve sobre el dibujo).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addComponent,
  addWire,
  analyzeConnectivity,
  clipAnchor,
  copyItems,
  changeType,
  deleteItems,
  emptySchematic,
  flipComponents,
  getComponentDef,
  insertIntoWire,
  moveItems,
  nextId,
  pasteItems,
  renameComponent,
  rotate,
  rotateComponents,
  schematicToCircuit,
  setParam,
  type Clip,
  type Connectivity,
  type DcOutcome,
  type PlacedComponent,
  type Point,
  type Schematic,
} from "@ohmlab/core";
import { useLiveSimulation } from "../useLiveSimulation";
import { Canvas, isLoose, isTyping, MAX_SCALE, MIN_SCALE, type CanvasResults, type Placing, type View } from "./Canvas";
import { Palette } from "./Palette";
import { PropertiesPanel } from "./PropertiesPanel";
import { MeterWindow } from "./MeterWindow";
import { meterText, SimulationPanel } from "./SimulationPanel";
import { GRID, worldBounds } from "./symbols";
import { useHistory } from "./useHistory";

export function Editor({ active }: { active: boolean }) {
  const { schematic, apply, undo, redo, canUndo, canRedo, reset } = useHistory();
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [view, setView] = useState<View>({ x: 320, y: 220, scale: 1 });
  const [cursor, setCursor] = useState<Point | null>(null);
  const [hoverNet, setHoverNet] = useState<string | null>(null);
  const [hoverComponent, setHoverComponent] = useState<string | null>(null);
  const [editRequest, setEditRequest] = useState(0);
  // Archivo: el esquemático tal como se guardó o abrió por última vez. Si el
  // actual es otro objeto, hay cambios sin guardar (deshacer hasta ahí los quita).
  const [saved, setSaved] = useState(schematic);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fitRequest, setFitRequest] = useState(0);
  const dirty = schematic !== saved;
  useEffect(() => {
    window.ohmlab.setDirty(dirty);
    document.title = `${fileName ?? "Sin título"}${dirty ? " •" : ""} — OhmLab`;
  }, [dirty, fileName]);

  // Ventanas de multímetro abiertas (con doble clic), con su posición sobre el lienzo.
  const [meterWindows, setMeterWindows] = useState<{ id: string; x: number; y: number }[]>([]);
  const connectivity = useMemo(() => analyzeConnectivity(schematic), [schematic]);

  // Simulación en vivo: cada cambio del dibujo se vuelve a simular solo.
  const [running, setRunning] = useState(false);
  const circuit = useMemo(() => schematicToCircuit(schematic, connectivity), [schematic, connectivity]);
  const { outcome, fresh } = useLiveSimulation(circuit, running);
  const results = useMemo(() => canvasResults(outcome, fresh, schematic.components), [outcome, fresh, schematic]);

  // F5 (menú Simulación) enciende o apaga la simulación de la vista que se ve.
  useEffect(() => {
    if (!active) return;
    return window.ohmlab.onToggleSimulation(() => setRunning((r) => !r));
  }, [active]);

  // Si algo seleccionado deja de existir (borrar, deshacer), se quita de la selección.
  useEffect(() => {
    const ids = new Set([...schematic.components.map((c) => c.id), ...schematic.wires.map((w) => w.id)]);
    if ([...selection].some((id) => !ids.has(id))) setSelection(new Set([...selection].filter((id) => ids.has(id))));
  }, [schematic, selection]);

  /** Abre la ventana de un multímetro a su derecha (o la trae si ya estaba abierta). */
  const openMeterWindow = (component: PlacedComponent) => {
    const [bx, by, bw] = worldBounds(component);
    // A la derecha, dejando ver el nombre del multímetro, sin salirse del lienzo.
    const width = document.querySelector("[data-testid=lienzo]")?.clientWidth ?? 800;
    const x = Math.max(8, Math.min((bx + bw) * view.scale + view.x + 110, width - 258));
    const y = Math.max(8, by * view.scale + view.y);
    setMeterWindows((ws) => [...ws.filter((w) => w.id !== component.id), { id: component.id, x, y }]);
  };

  // Si se borra un multímetro, su ventana se cierra.
  useEffect(() => {
    const ids = new Set(schematic.components.map((c) => c.id));
    if (meterWindows.some((w) => !ids.has(w.id))) setMeterWindows((ws) => ws.filter((w) => ids.has(w.id)));
  }, [schematic, meterWindows]);

  const place = (type: string, x: number, y: number) => {
    const orientation = placing?.type === type ? { rotation: placing.rotation, mirror: placing.mirror } : undefined;
    // Mismo nombre que le pondrá addComponent: el primero libre con su prefijo.
    const id = nextId(schematic, getComponentDef(type).prefix);
    // Si cae con sus dos pines sobre un cable, queda intercalado en serie.
    apply((s) => insertIntoWire(addComponent(s, type, x, y, orientation).schematic, id));
    setPlacing(null);
    setSelection(new Set([id]));
  };

  const move = (ids: string[], dx: number, dy: number) =>
    apply((s) => {
      const moved = moveItems(s, ids, dx, dy);
      // Un componente suelto que se arrastra encima de un cable también se intercala.
      const single = ids.length === 1 ? s.components.find((c) => c.id === ids[0]) : undefined;
      return single && isLoose(analyzeConnectivity(s), single) ? insertIntoWire(moved, single.id) : moved;
    });

  const rotateSelection = useCallback(
    (direction: "cw" | "ccw") => {
      // Actualización funcional: dos Ctrl+R muy seguidos suman dos giros.
      if (placing) setPlacing((p) => p && { ...p, rotation: rotate(p.rotation, direction) });
      else apply((s) => rotateComponents(s, selection, direction));
    },
    [placing, selection, apply],
  );
  const flipSelection = useCallback(
    (axis: "horizontal" | "vertical") => apply((s) => flipComponents(s, selection, axis)),
    [selection, apply],
  );
  const deleteSelection = useCallback(() => apply((s) => deleteItems(s, selection)), [selection, apply]);

  // Copiar y pegar (Ctrl+C / Ctrl+V / Ctrl+X). Lo copiado queda dentro de OhmLab.
  const clipboard = useRef<Clip | null>(null);
  const pastes = useRef(0);
  const [hasClip, setHasClip] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const copySelection = (): Clip | null => {
    const clip = copyItems(schematic, selection);
    if (!clip) {
      setNotice("Selecciona algo para copiarlo.");
      return null;
    }
    clipboard.current = clip;
    pastes.current = 0;
    setHasClip(true);
    setNotice(`Copiado: ${describeClip(clip)}. Ctrl+V para pegar.`);
    return clip;
  };
  const cutSelection = () => {
    const clip = copySelection();
    if (!clip) return;
    deleteSelection();
    setNotice(`Cortado: ${describeClip(clip)}. Ctrl+V para pegarlo; si fue sin querer, Ctrl+Z lo devuelve.`);
  };
  const paste = () => {
    const clip = clipboard.current;
    if (!clip) {
      setNotice("No hay nada copiado: selecciona algo y pulsa Ctrl+C.");
      return;
    }
    // Con el ratón sobre el lienzo, se pega donde está el ratón; si no, un poco al lado del original.
    const [ax, ay] = clipAnchor(clip);
    pastes.current += 1;
    const [dx, dy] = cursor ? [cursor[0] - ax, cursor[1] - ay] : [2 * pastes.current, 2 * pastes.current];
    const { schematic: next, ids } = pasteItems(schematic, clip, dx, dy);
    apply(() => next);
    setSelection(new Set(ids));
    setNotice(`Pegado: ${describeClip(clip)}. Arrástralo a su lugar.`);
  };

  // Atajos de teclado habituales en los simuladores de circuitos.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      let handled = true;
      if (ctrl && key === "r") rotateSelection(e.shiftKey ? "ccw" : "cw");
      else if (e.altKey && key === "x") flipSelection("horizontal");
      else if (e.altKey && key === "y") flipSelection("vertical");
      else if (ctrl && key === "z" && !e.shiftKey) undo();
      else if (ctrl && (key === "y" || (key === "z" && e.shiftKey))) redo();
      else if (ctrl && key === "c") copySelection();
      else if (ctrl && key === "x") cutSelection();
      else if (ctrl && key === "v") paste();
      else if (ctrl && key === "a") setSelection(new Set([...schematic.components.map((c) => c.id), ...schematic.wires.map((w) => w.id)]));
      else if (key === "delete" || key === "backspace") deleteSelection();
      else if (key === "escape") {
        if (placing) setPlacing(null);
        else setSelection(new Set());
      } else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rotateSelection, flipSelection, deleteSelection, undo, redo, schematic, placing, selection, cursor]);

  const zoomBy = (factor: number) =>
    setView((v) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      // Zoom alrededor del centro del lienzo (aprox. donde está la vista inicial)
      const cx = 320;
      const cy = 220;
      return { scale, x: cx - (cx - v.x) * (scale / v.scale), y: cy - (cy - v.y) * (scale / v.scale) };
    });

  const fitToContent = () => {
    const boxes = [
      ...schematic.components.map(worldBounds),
      ...schematic.wires.map((w): [number, number, number, number] => [
        Math.min(w.a[0], w.b[0]) * GRID,
        Math.min(w.a[1], w.b[1]) * GRID,
        Math.abs(w.a[0] - w.b[0]) * GRID,
        Math.abs(w.a[1] - w.b[1]) * GRID,
      ]),
    ];
    if (boxes.length === 0) {
      setView({ x: 320, y: 220, scale: 1 });
      return;
    }
    const x1 = Math.min(...boxes.map(([x]) => x)) - 60;
    const y1 = Math.min(...boxes.map(([, y]) => y)) - 60;
    const x2 = Math.max(...boxes.map(([x, , w]) => x + w)) + 60;
    const y2 = Math.max(...boxes.map(([, y, , h]) => y + h)) + 60;
    const canvas = document.querySelector("[data-testid=lienzo]")!.getBoundingClientRect();
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(canvas.width / (x2 - x1), canvas.height / (y2 - y1))));
    setView({ scale, x: (canvas.width - (x2 + x1) * scale) / 2, y: (canvas.height - (y2 + y1) * scale) / 2 });
  };

  // Archivo → Nuevo, Abrir, Guardar, Guardar como (menú y Ctrl+N, Ctrl+O, Ctrl+S).
  const startFresh = (next: Schematic, name: string | null) => {
    reset(next);
    setSaved(next);
    setFileName(name);
    setFileError(null);
    setSelection(new Set());
    setMeterWindows([]);
    setPlacing(null);
    setRunning(false);
    setFitRequest((n) => n + 1);
  };
  const save = async (saveAs: boolean): Promise<boolean> => {
    const current = schematic;
    const result = await window.ohmlab.saveFile(current, saveAs);
    if (!result.ok) {
      if (result.error) setFileError(result.error);
      return false;
    }
    setSaved(current);
    setFileName(result.name);
    setFileError(null);
    setNotice(`Guardado en «${result.name}».`);
    return true;
  };
  const newFile = async () => {
    if (await window.ohmlab.newFile()) startFresh(emptySchematic(), null);
  };
  const openFile = async () => {
    const result = await window.ohmlab.openFile();
    if (!result.ok) {
      if (result.error) setFileError(result.error);
      return;
    }
    startFresh(result.schematic, result.name);
    setNotice(`Abierto «${result.name}».`);
  };
  const fileCommands = useRef({ save, newFile, openFile });
  fileCommands.current = { save, newFile, openFile };
  useEffect(
    () =>
      window.ohmlab.onMenuCommand(async (command) => {
        const c = fileCommands.current;
        if (command === "new") await c.newFile();
        else if (command === "open") await c.openFile();
        else if (command === "save") await c.save(false);
        else if (command === "save-as") await c.save(true);
        else if (command === "save-and-close" && (await c.save(false))) window.ohmlab.closeWindow();
      }),
    [],
  );
  useEffect(() => {
    if (fitRequest > 0) fitToContent();
  }, [fitRequest]);
  // Si OhmLab se abrió con doble clic en un .ohmlab, se abre ese circuito.
  useEffect(() => {
    window.ohmlab.openStartupFile().then((result) => {
      if (result.ok) startFresh(result.schematic, result.name);
      else if (result.error) setFileError(result.error);
    });
  }, []);

  const selected = schematic.components.filter((c) => selection.has(c.id));
  const selectedWires = schematic.wires.filter((w) => selection.has(w.id)).length;
  const nodeCount = connectivity.nets.filter((n) => n.pins.length > 0).length;

  return (
    <div className="editor">
      <div className="toolbar">
        <button onClick={undo} disabled={!canUndo} title="Deshacer (Ctrl+Z)">↶ Deshacer</button>
        <button onClick={redo} disabled={!canRedo} title="Rehacer (Ctrl+Y)">↷ Rehacer</button>
        <span className="sep" />
        <button onClick={() => rotateSelection("cw")} disabled={selected.length === 0 && !placing} title="Girar 90° a la derecha (Ctrl+R)">↻ Girar</button>
        <button onClick={deleteSelection} disabled={selection.size === 0} title="Borrar (Supr)">Borrar</button>
        <button onClick={copySelection} disabled={selection.size === 0} title="Copiar (Ctrl+C)">Copiar</button>
        <button onClick={paste} disabled={!hasClip} title="Pegar (Ctrl+V)">Pegar</button>
        <span className="sep" />
        <button onClick={() => zoomBy(1 / 1.25)} title="Alejar (rueda del ratón)">−</button>
        <span className="zoom">{Math.round(view.scale * 100)} %</span>
        <button onClick={() => zoomBy(1.25)} title="Acercar (rueda del ratón)">+</button>
        <button onClick={fitToContent} title="Ver todo el circuito">Ajustar</button>
        <button
          className={running ? "run running" : "run"}
          data-testid="simular-editor"
          onClick={() => setRunning((r) => !r)}
          title={running ? "Detener la simulación (F5)" : "Simular (F5): las lecturas se actualizan solas"}
        >
          {running ? "■ Detener" : "▶ Simular"}
        </button>
      </div>

      <Palette active={placing?.type ?? null} onPick={(type) => setPlacing({ type, rotation: 0, mirror: false })} />

      <div className="canvas-area">
        <Canvas
          schematic={schematic}
          selection={selection}
          placing={placing}
          view={view}
          onViewChange={setView}
          onSelectionChange={setSelection}
          onMove={move}
          onPlace={place}
          onWire={(points) => apply((s) => addWire(s, points))}
          onRotate={rotateSelection}
          onEdit={(id) => {
            setSelection(new Set([id]));
            const component = schematic.components.find((c) => c.id === id);
            const def = component && getComponentDef(component.type);
            if (component && def?.meter && !def.probe) openMeterWindow(component);
            else setEditRequest((n) => n + 1);
          }}
          onCursor={setCursor}
          onHoverNet={setHoverNet}
          onHoverComponent={setHoverComponent}
          results={results}
        />
        {meterWindows.map((w) => {
          const component = schematic.components.find((c) => c.id === w.id);
          if (!component) return null;
          return (
            <MeterWindow
              key={w.id}
              component={component}
              reading={outcome?.ok ? outcome.result.meters[w.id] : undefined}
              running={running}
              x={w.x}
              y={w.y}
              onMove={(x, y) => setMeterWindows((ws) => ws.map((o) => (o.id === w.id ? { ...o, x, y } : o)))}
              onMode={(type) => apply((s) => changeType(s, w.id, type))}
              onResistance={(value) => apply((s) => setParam(s, w.id, "resistance", value))}
              onClose={() => setMeterWindows((ws) => ws.filter((o) => o.id !== w.id))}
            />
          );
        })}
        {fileError && (
          <div className="file-banner" role="alert" data-testid="error-archivo">
            <span>{fileError}</span>
            <button className="close" onClick={() => setFileError(null)} aria-label="Cerrar aviso">×</button>
          </div>
        )}
        {outcome && !outcome.ok && (
          <div className="canvas-banner" role="alert" data-testid="aviso-lienzo">
            No se puede simular: {outcome.diagnostics.find((d) => d.severity === "error")?.message ?? "hay un error"} Más detalles a la derecha.
          </div>
        )}
      </div>

      <div className="side-panel">
        <PropertiesPanel
          selected={selected}
          wireCount={selectedWires}
          editRequest={editRequest}
          compact={running}
          onRename={(id, name) => {
            const result = renameComponent(schematic, id, name);
            if (typeof result === "string") return result;
            apply(() => result);
            setSelection(new Set([name.trim()]));
            setMeterWindows((ws) => ws.map((w) => (w.id === id ? { ...w, id: name.trim() } : w)));
            return null;
          }}
          onParam={(id, param, value) => apply((s) => setParam(s, id, param, value))}
          onType={(id, type) => apply((s) => changeType(s, id, type))}
          onRotate={rotateSelection}
          onFlip={flipSelection}
          onDelete={deleteSelection}
        />
        <SimulationPanel running={running} outcome={outcome} selected={selected} components={schematic.components} />
      </div>

      <div className="editor-status" data-testid="estado-editor">
        <span>
          {notice ??
            (hoverNet
              ? describeNet(schematic, connectivity, hoverNet)
              : (hoverComponent && outcome?.ok && describeMeter(hoverComponent, outcome)) ||
                statusHint(placing, selected, schematic.components.length))}
        </span>
        <span>{cursor ? `x ${cursor[0]}, y ${cursor[1]}` : ""}</span>
        <span>
          {schematic.components.length} componentes · {nodeCount} {nodeCount === 1 ? "nodo" : "nodos"}
        </span>
      </div>
    </div>
  );
}

/** "Nodo N2: une R1 (2), R2 (1) y V1 (+)". Explica qué es un mismo punto. */
function describeNet(schematic: Schematic, connectivity: Connectivity, name: string): string {
  const net = connectivity.nets.find((n) => n.name === name);
  if (!net) return "";
  const pins = net.pins.map((p) => {
    const type = schematic.components.find((c) => c.id === p.component)?.type;
    const label = type ? getComponentDef(type).pins.find((pin) => pin.id === p.pin)?.label : "";
    return label ? `${p.component} (${label})` : p.component;
  });
  const title = net.ground ? `Nodo ${name}, la tierra (0 V)` : `Nodo ${name}`;
  if (pins.length === 0) return `${title}: este cable no llega a ningún componente.`;
  if (pins.length === 1) return `${title}: solo llega a ${pins[0]}. Falta unirlo con otro componente.`;
  return `${title}: une ${pins.slice(0, -1).join(", ")} y ${pins[pins.length - 1]}. Todo lo resaltado es un mismo punto.`;
}

/**
 * "MM1 marca 6 V" al pasar el ratón por un multímetro mientras simula. Las
 * demás piezas no muestran valores: todo se mide con el multímetro.
 */
function describeMeter(id: string, outcome: Extract<DcOutcome, { ok: true }>): string | null {
  const meter = outcome.result.meters[id];
  return meter ? `${id} marca ${meterText(meter)}` : null;
}

/** Lo que el lienzo dibuja con el resultado: voltajes, pantallas y marcas de error. */
function canvasResults(outcome: DcOutcome | null, fresh: boolean, components: PlacedComponent[]): CanvasResults | null {
  if (!outcome) return null;
  const diagnostics = outcome.ok ? outcome.warnings : outcome.diagnostics;
  const ids = (severity: string) => new Set(diagnostics.filter((d) => d.severity === severity).flatMap((d) => d.components));
  const meters = Object.fromEntries(
    components
      .filter((c) => getComponentDef(c.type).meter)
      .map((c) => [c.id, outcome.ok ? meterText(outcome.result.meters[c.id]) : "— —"]),
  );
  return {
    meters,
    errors: ids("error"),
    warnings: ids("warning"),
    stale: !fresh,
  };
}

/** "R1" o "2 piezas y 3 tramos de cable". */
function describeClip(clip: Clip): string {
  if (clip.components.length === 1 && clip.wires.length === 0) return clip.components[0].id;
  const parts = [];
  if (clip.components.length > 0) parts.push(`${clip.components.length} ${clip.components.length === 1 ? "pieza" : "piezas"}`);
  if (clip.wires.length > 0) parts.push(`${clip.wires.length} ${clip.wires.length === 1 ? "tramo" : "tramos"} de cable`);
  return parts.join(" y ");
}

function statusHint(placing: Placing | null, selected: PlacedComponent[], count: number): string {
  if (placing) return "Haz clic en el lienzo para colocarlo (sobre un cable, queda en serie). La rueda del ratón o Ctrl+R lo gira. Esc cancela.";
  if (selected.length === 1 && getComponentDef(selected[0].type).probe) {
    return "Suelta la punta sobre un cable. Con ▶ Simular, su valor aparece encima de ella.";
  }
  if (selected.length === 1 && getComponentDef(selected[0].type).meter) {
    return "Doble clic sobre el multímetro abre su ventana para elegir el modo (V, A, Ω). Arrastra para moverlo.";
  }
  if (selected.length > 0) return "Arrastra para mover (los cables lo siguen); mientras arrastras, la rueda lo gira. Ctrl+R gira, Supr borra, doble clic edita el valor.";
  if (count >= 2) return "Para unir: haz clic en el extremo de un componente y arrastra hasta otro. Pasa el ratón por un cable para ver su nodo.";
  return "Coloca componentes desde la paleta.";
}
