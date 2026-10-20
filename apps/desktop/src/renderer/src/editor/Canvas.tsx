// Lienzo del editor: grilla, zoom, desplazamiento, selección, arrastre,
// colocación de componentes y cables. Todo lo que se mueve se ajusta a la grilla.
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  analyzeConnectivity,
  findInsertion,
  getComponentDef,
  moveItems,
  onWire,
  pinAxis,
  pinKey,
  pinPositions,
  pointKey,
  routeAround,
  samePoint,
  type Connectivity,
  type Insertion,
  type PlacedComponent,
  type Point,
  type Rotation,
  type Schematic,
} from "@ohmlab/core";
import { GRID, shapeOf, symbolTransform, valueText, worldBounds } from "./symbols";

/** Pantalla = mundo × scale + (x, y). */
export interface View {
  x: number;
  y: number;
  scale: number;
}

export interface Placing {
  type: string;
  rotation: Rotation;
  mirror: boolean;
}

/**
 * Lo que la simulación muestra sobre el dibujo. Los voltajes no se escriben
 * en los nodos: se miden con el multímetro, como en el laboratorio.
 */
export interface CanvasResults {
  /** Texto de la pantalla de cada multímetro ("MM1" → "6 V"). */
  meters: Record<string, string>;
  errors: Set<string>;
  warnings: Set<string>;
  /** Los números son de hace un instante: el circuito cambió y se está volviendo a simular. */
  stale: boolean;
}

/** Tipo de dato al arrastrar desde la paleta. */
export const DRAG_TYPE = "application/x-ohmlab-component";

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 4;

interface Props {
  schematic: Schematic;
  selection: Set<string>;
  placing: Placing | null;
  view: View;
  onViewChange(view: View): void;
  onSelectionChange(ids: Set<string>): void;
  onMove(ids: string[], dx: number, dy: number): void;
  onPlace(type: string, x: number, y: number): void;
  onWire(points: Point[]): void;
  onEdit(id: string): void;
  onCursor(point: Point | null): void;
  onHoverNet(net: string | null): void;
  onHoverComponent(id: string | null): void;
  results: CanvasResults | null;
}

type Gesture =
  | { kind: "none" }
  | { kind: "pan"; startX: number; startY: number; view: View }
  | { kind: "drag"; ids: string[]; start: Point; delta: Point }
  | { kind: "box"; start: Point; current: Point; base: Set<string> }
  /**
   * Dibujando un cable. Con el botón apretado se suelta en el destino; si se
   * suelta en el mismo pin, el cable sigue al ratón y cada clic hace una
   * esquina, hasta hacer clic en un pin o un cable (o doble clic).
   */
  | { kind: "wire"; points: Point[]; axis: "h" | "v" | null; clicked: boolean };

export function Canvas(props: Props) {
  const { schematic, selection, placing, view } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  // El gesto en curso también va en una referencia: si el botón se suelta
  // antes de que React vuelva a dibujar, los eventos leen el valor nuevo.
  const [gesture, setGestureState] = useState<Gesture>({ kind: "none" });
  const gestureRef = useRef(gesture);
  const setGesture = (next: Gesture) => {
    gestureRef.current = next;
    setGestureState(next);
  };
  const [cursor, setCursor] = useState<Point | null>(null);
  const [hoverNet, setHoverNet] = useState<string | null>(null);
  const [hoverComponent, setHoverComponent] = useState<string | null>(null);
  const spaceHeld = useRef(false);

  // Tamaño del lienzo, para dibujar la grilla solo donde se ve.
  useEffect(() => {
    const svg = svgRef.current!;
    const observer = new ResizeObserver(() => setSize({ width: svg.clientWidth, height: svg.clientHeight }));
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  // Barra espaciadora + arrastrar = mover la vista. Esc cancela el cable a medio dibujar.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e.target)) spaceHeld.current = true;
      if (e.key === "Escape" && gestureRef.current.kind === "wire") setGesture({ kind: "none" });
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceHeld.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Rueda del ratón = zoom alrededor del cursor. Se registra a mano para poder
  // impedir que la página se desplace.
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    const svg = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      const rect = svg.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const scale = clamp(v.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), MIN_SCALE, MAX_SCALE);
      const k = scale / v.scale;
      props.onViewChange({ scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [props.onViewChange]);

  // Lo que se dibuja: durante un arrastre, el esquemático ya movido (con los cables siguiéndolo).
  const [dx, dy] = gesture.kind === "drag" ? gesture.delta : [0, 0];
  const display = useMemo(
    () => (gesture.kind === "drag" && (dx !== 0 || dy !== 0) ? moveItems(schematic, gesture.ids, dx, dy) : schematic),
    [schematic, gesture, dx, dy],
  );
  const connectivity = useMemo(() => analyzeConnectivity(display), [display]);
  const real = useMemo(() => analyzeConnectivity(schematic), [schematic]);

  const toWorld = (clientX: number, clientY: number): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return [(clientX - rect.left - view.x) / view.scale, (clientY - rect.top - view.y) / view.scale];
  };
  const snap = ([wx, wy]: Point): Point => [Math.round(wx / GRID), Math.round(wy / GRID)];

  const finishWire = (points: Point[]) => {
    setGesture({ kind: "none" });
    if (points.length >= 2) props.onWire(points);
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const gesture = gestureRef.current;
    const target = e.target as Element;
    const world = toWorld(e.clientX, e.clientY);
    const point = snap(world);
    capture(e);

    if (e.button === 1 || (e.button === 0 && spaceHeld.current)) {
      e.preventDefault();
      setGesture({ kind: "pan", startX: e.clientX, startY: e.clientY, view });
      return;
    }
    if (gesture.kind === "wire" && gesture.clicked) {
      if (e.button !== 0) setGesture({ kind: "none" }); // clic derecho: cancelar
      else continueWire(gesture, point);
      return;
    }
    if (e.button !== 0) return;

    if (placing) {
      props.onPlace(placing.type, point[0], point[1]);
      return;
    }

    // Clic en un pin o en la punta suelta de un cable: empieza un cable.
    const pinEl = target.closest("[data-pin]");
    const endEl = target.closest("[data-end]");
    if (pinEl) {
      const [id, pin] = pinEl.getAttribute("data-pin")!.split(".");
      const component = schematic.components.find((c) => c.id === id)!;
      setGesture({ kind: "wire", points: [pinPositions(component)[pin]], axis: pinAxis(component, pin), clicked: false });
      return;
    }
    if (endEl) {
      const [x, y] = endEl.getAttribute("data-end")!.split(",").map(Number);
      setGesture({ kind: "wire", points: [[x, y]], axis: null, clicked: false });
      return;
    }

    const item = target.closest("[data-component],[data-wire]");
    if (item) {
      const id = item.getAttribute("data-component") ?? item.getAttribute("data-wire")!;
      let selected = selection;
      if (e.shiftKey || e.ctrlKey) {
        selected = new Set(selection);
        if (selected.has(id)) selected.delete(id);
        else selected.add(id);
        props.onSelectionChange(selected);
        if (!selected.has(id)) return;
      } else if (!selection.has(id)) {
        selected = new Set([id]);
        props.onSelectionChange(selected);
      }
      setGesture({ kind: "drag", ids: [...selected], start: world, delta: [0, 0] });
      return;
    }

    // Clic en un lugar vacío: empieza un recuadro de selección.
    const base = e.shiftKey ? selection : new Set<string>();
    if (!e.shiftKey) props.onSelectionChange(new Set());
    setGesture({ kind: "box", start: world, current: world, base });
  };

  /** Clic con un cable en curso: termina en un pin o cable, o hace una esquina. */
  const continueWire = (g: Extract<Gesture, { kind: "wire" }>, point: Point) => {
    const path = wirePath(schematic, g, point);
    const last = g.points[g.points.length - 1];
    if (samePoint(point, last)) {
      // Segundo clic en el mismo punto (doble clic): el cable termina aquí.
      if (g.points.length >= 2) finishWire(g.points);
      return;
    }
    if (!samePoint(point, g.points[0]) && connectsAt(schematic, point)) {
      finishWire(path);
      return;
    }
    const [p, q] = path.slice(-2);
    setGesture({ kind: "wire", points: path, axis: p[1] === q[1] ? "v" : "h", clicked: true });
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const gesture = gestureRef.current;
    const world = toWorld(e.clientX, e.clientY);
    const point = snap(world);
    if (!cursor || !samePoint(cursor, point)) {
      setCursor(point);
      props.onCursor(point);
    }
    const net = (e.target as Element).closest("[data-net]")?.getAttribute("data-net") ?? null;
    if (net !== hoverNet) {
      setHoverNet(net);
      props.onHoverNet(net);
    }
    const component = net ? null : ((e.target as Element).closest("[data-component]")?.getAttribute("data-component") ?? null);
    if (component !== hoverComponent) {
      setHoverComponent(component);
      props.onHoverComponent(component);
    }

    if (gesture.kind === "pan") {
      props.onViewChange({
        ...gesture.view,
        x: gesture.view.x + e.clientX - gesture.startX,
        y: gesture.view.y + e.clientY - gesture.startY,
      });
    } else if (gesture.kind === "drag") {
      const delta: Point = [
        Math.round((world[0] - gesture.start[0]) / GRID),
        Math.round((world[1] - gesture.start[1]) / GRID),
      ];
      if (delta[0] !== gesture.delta[0] || delta[1] !== gesture.delta[1]) setGesture({ ...gesture, delta });
    } else if (gesture.kind === "box") {
      setGesture({ ...gesture, current: world });
    }
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const gesture = gestureRef.current;
    if (gesture.kind === "wire") {
      if (gesture.clicked) return;
      const point = snap(toWorld(e.clientX, e.clientY));
      // Se soltó en el mismo pin: fue un clic, el cable sigue al ratón.
      if (samePoint(point, gesture.points[0])) setGesture({ ...gesture, clicked: true });
      else finishWire(wirePath(schematic, gesture, point));
      return;
    }
    if (gesture.kind === "drag") {
      const [mx, my] = gesture.delta;
      if (mx !== 0 || my !== 0) props.onMove(gesture.ids, mx, my);
    } else if (gesture.kind === "box") {
      const [x1, y1, x2, y2] = boxCorners(gesture.start, gesture.current);
      if (x2 - x1 > 3 || y2 - y1 > 3) {
        const inside = schematic.components.filter((c) => {
          const [bx, by, bw, bh] = worldBounds(c);
          return bx < x2 && bx + bw > x1 && by < y2 && by + bh > y1;
        });
        const wires = schematic.wires.filter((w) => {
          const [wx1, wy1, wx2, wy2] = boxCorners([w.a[0] * GRID, w.a[1] * GRID], [w.b[0] * GRID, w.b[1] * GRID]);
          return wx1 <= x2 && wx2 >= x1 && wy1 <= y2 && wy2 >= y1;
        });
        props.onSelectionChange(new Set([...gesture.base, ...inside.map((c) => c.id), ...wires.map((w) => w.id)]));
      }
    }
    setGesture({ kind: "none" });
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (gestureRef.current.kind === "wire") return;
    const id = (e.target as Element).closest("[data-component]")?.getAttribute("data-component");
    if (id) props.onEdit(id);
  };

  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };
  const onDrop = (e: React.DragEvent) => {
    const type = e.dataTransfer.getData(DRAG_TYPE);
    if (!type) return;
    e.preventDefault();
    const [gx, gy] = snap(toWorld(e.clientX, e.clientY));
    props.onPlace(type, gx, gy);
  };

  // Vista previa de "intercalar": el tramo de cable que se quitará al soltar.
  let cut: Insertion | null = null;
  if (placing && cursor) {
    const ghost: PlacedComponent = { id: "~", type: placing.type, params: {}, x: cursor[0], y: cursor[1], rotation: placing.rotation, mirror: placing.mirror };
    cut = findInsertion({ ...schematic, components: [...schematic.components, ghost] }, ghost.id);
  } else if (gesture.kind === "drag" && gesture.ids.length === 1) {
    const moved = schematic.components.find((c) => c.id === gesture.ids[0]);
    if (moved && isLoose(real, moved)) cut = findInsertion(display, moved.id);
  }

  // Zona visible en coordenadas del lienzo, para la grilla.
  const visible = {
    x: -view.x / view.scale,
    y: -view.y / view.scale,
    width: size.width / view.scale,
    height: size.height / view.scale,
  };
  const openEnds = new Set(connectivity.openEnds.map(pointKey));
  const pinSpots = new Set(display.components.flatMap((c) => Object.values(pinPositions(c)).map(pointKey)));
  const preview = gesture.kind === "wire" && cursor ? wirePath(schematic, gesture, cursor) : null;

  const classes = ["canvas"];
  if (placing) classes.push("placing");
  if (gesture.kind === "pan") classes.push("panning");
  if (gesture.kind === "wire") classes.push("wiring");

  return (
    <svg
      ref={svgRef}
      className={classes.join(" ")}
      data-testid="lienzo"
      data-nets={connectivity.nets.filter((n) => n.pins.length > 0).length}
      data-wires={display.wires.length}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => {
        setCursor(null);
        props.onCursor(null);
      }}
      onDoubleClick={onDoubleClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <defs>
        <pattern id="grid-dots" x={-GRID / 2} y={-GRID / 2} width={GRID} height={GRID} patternUnits="userSpaceOnUse">
          <circle className="grid-dot" cx={GRID / 2} cy={GRID / 2} r={1.3 / Math.sqrt(view.scale)} />
        </pattern>
      </defs>
      <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
        <rect fill="url(#grid-dots)" {...visible} />
        {display.wires.map((w) => {
          const net = connectivity.netOfWire.get(w.id);
          const cls = ["wire"];
          if (selection.has(w.id)) cls.push("selected");
          if (net && net === hoverNet) cls.push("hl");
          const [x1, y1, x2, y2] = [w.a[0] * GRID, w.a[1] * GRID, w.b[0] * GRID, w.b[1] * GRID];
          return (
            <g key={w.id} data-wire={w.id} data-net={net}>
              <line className="wire-hit" x1={x1} y1={y1} x2={x2} y2={y2} />
              <line className={cls.join(" ")} x1={x1} y1={y1} x2={x2} y2={y2} />
              {selection.has(w.id) &&
                [w.a, w.b].map(([px, py], i) => <rect key={i} className="wire-handle" x={px * GRID - 3} y={py * GRID - 3} width={6} height={6} />)}
            </g>
          );
        })}
        {cut && (
          <line className="cut-preview" x1={cut.from[0] * GRID} y1={cut.from[1] * GRID} x2={cut.to[0] * GRID} y2={cut.to[1] * GRID} />
        )}
        {display.components.map((c) => (
          <ComponentView
            key={c.id}
            component={c}
            selected={selection.has(c.id)}
            flag={props.results?.errors.has(c.id) ? "error" : props.results?.warnings.has(c.id) ? "warning" : undefined}
            connectivity={connectivity}
            openEnds={openEnds}
            hoverNet={hoverNet}
          />
        ))}
        {connectivity.junctions.map(([x, y]) => (
          <circle key={`${x},${y}`} className="junction" cx={x * GRID} cy={y * GRID} r={4} />
        ))}
        {connectivity.openEnds
          .filter((p) => !pinSpots.has(pointKey(p)))
          .map(([x, y]) => (
            <g key={`${x},${y}`} data-end={`${x},${y}`}>
              <circle className="pin-hit" cx={x * GRID} cy={y * GRID} r={7} />
              <circle className="open-end" cx={x * GRID} cy={y * GRID} r={3} />
            </g>
          ))}
        {props.results && (
          <g className={props.results.stale ? "results stale" : "results"}>
            {display.components.map((c) => {
              const text = props.results!.meters[c.id];
              if (text === undefined) return null;
              const [bx, by, bw, bh] = worldBounds(c);
              const def = getComponentDef(c.type);
              if (def.probe) return <ProbeTag key={c.id} id={c.id} x={bx + bw / 2} y={by - 4} text={text} kind={def.meter === "V" ? "v" : "a"} />;
              // Encima del multímetro: la caja es chica y la lectura no debe tapar su nombre.
              return <MeterScreen key={c.id} id={c.id} x={bx + bw / 2} y={by - 16} text={text} />;
            })}
          </g>
        )}
        {placing && cursor && (
          <ComponentView
            ghost
            component={{ id: "", type: placing.type, params: {}, x: cursor[0], y: cursor[1], rotation: placing.rotation, mirror: placing.mirror }}
          />
        )}
        {preview && <polyline className="wire-preview" points={preview.map(([x, y]) => `${x * GRID},${y * GRID}`).join(" ")} />}
        {gesture.kind === "box" && <SelectionBox start={gesture.start} current={gesture.current} />}
      </g>
      {schematic.components.length === 0 && !placing && (
        <text className="empty-hint" x="50%" y="50%">
          Arrastra un componente desde la paleta, o haz clic en él y luego en el lienzo.
        </text>
      )}
    </svg>
  );
}

function ComponentView(props: {
  component: PlacedComponent;
  selected?: boolean;
  ghost?: boolean;
  flag?: "error" | "warning";
  connectivity?: Connectivity;
  openEnds?: Set<string>;
  hoverNet?: string | null;
}) {
  const { component, selected = false, ghost = false } = props;
  const shape = shapeOf(component.type);
  const [bx, by, bw, bh] = worldBounds(component);
  const classes = ["component"];
  if (selected) classes.push("selected");
  if (ghost) classes.push("ghost");
  if (props.flag) classes.push(`flag-${props.flag}`);

  return (
    <g className={classes.join(" ")} data-component={ghost ? undefined : component.id} data-rotation={component.rotation}>
      {selected && <rect className="selection" x={bx - 6} y={by - 6} width={bw + 12} height={bh + 12} rx={4} />}
      <rect className="hit" x={bx - 4} y={by - 4} width={bw + 8} height={bh + 8} />
      <g transform={symbolTransform(component)}>{shape.draw(component)}</g>
      {!ghost && (
        <>
          <Label component={component} bounds={[bx, by, bw, bh]} />
          {Object.entries(pinPositions(component)).map(([pin, [px, py]]) => {
            const net = props.connectivity?.netOfPin.get(pinKey(component.id, pin));
            return (
              <g key={pin}>
                {props.openEnds?.has(`${px},${py}`) && <circle className="open-end" cx={px * GRID} cy={py * GRID} r={3} />}
                {net && net === props.hoverNet && <circle className="pin-hl" cx={px * GRID} cy={py * GRID} r={4.5} />}
                <circle className="pin-hit" data-pin={pinKey(component.id, pin)} data-net={net} cx={px * GRID} cy={py * GRID} r={7} />
              </g>
            );
          })}
        </>
      )}
    </g>
  );
}

/** Nombre y valor, siempre derechos aunque el componente esté girado. */
function Label({ component, bounds: [bx, by, bw, bh] }: { component: PlacedComponent; bounds: [number, number, number, number] }) {
  const def = getComponentDef(component.type);
  if (def.isGround) return null;
  // Las puntas son pequeñas: solo su nombre, a la derecha.
  if (def.probe) {
    return <text className="label probe-label" x={bx + bw + 4} y={by + bh / 2} textAnchor="start">{component.id}</text>;
  }
  const value = valueText(component);
  if (bw >= bh) {
    return (
      <>
        <text className="label" x={bx + bw / 2} y={by - 8}>{component.id}</text>
        <text className="value" x={bx + bw / 2} y={by + bh + 14}>{value}</text>
      </>
    );
  }
  return (
    <>
      <text className="label" x={bx + bw + 8} y={by + bh / 2 - 3} textAnchor="start">{component.id}</text>
      <text className="value" x={bx + bw + 8} y={by + bh / 2 + 13} textAnchor="start">{value}</text>
    </>
  );
}

function SelectionBox({ start, current }: { start: Point; current: Point }) {
  const [x1, y1, x2, y2] = boxCorners(start, current);
  return <rect className="selection-box" x={x1} y={y1} width={x2 - x1} height={y2 - y1} />;
}

/** Valor de una punta de prueba, encima de ella. */
function ProbeTag({ id, x, y, text, kind }: { id: string; x: number; y: number; text: string; kind: "v" | "a" }) {
  const width = text.length * 7.5 + 12;
  return (
    <g className={`probe-tag ${kind}`} data-probe-tag={id} transform={`translate(${x - width / 2} ${y - 20})`}>
      <rect width={width} height={18} rx={4} />
      <text x={width / 2} y={10}>{text}</text>
    </g>
  );
}

/** Pantalla del multímetro centrada en (x, y), sobre su caja, siempre derecha. */
function MeterScreen({ id, x, y, text }: { id: string; x: number; y: number; text: string }) {
  const width = Math.max(56, text.length * 9 + 12);
  return (
    <g className="meter-screen" data-meter={id} transform={`translate(${x - width / 2} ${y - 12})`}>
      <rect width={width} height={24} rx={3} />
      <text x={width - 6} y={13}>{text}</text>
    </g>
  );
}

/** Camino del cable en curso hasta el cursor, con ángulos rectos. */
function wirePath(schematic: Schematic, g: Extract<Gesture, { kind: "wire" }>, to: Point): Point[] {
  const last = g.points[g.points.length - 1];
  const axis = g.axis ?? (Math.abs(to[0] - last[0]) >= Math.abs(to[1] - last[1]) ? "h" : "v");
  // Si la esquina dejaría el cable encima de una pieza, se dobla al otro lado.
  return [...g.points, ...routeAround(schematic, last, to, axis)];
}

/** En ese punto hay algo a lo que un cable se puede unir: un pin o un cable. */
function connectsAt(schematic: Schematic, point: Point): boolean {
  return (
    schematic.wires.some((w) => onWire(point, w)) ||
    schematic.components.some((c) => Object.values(pinPositions(c)).some((p) => samePoint(p, point)))
  );
}

/** Ningún pin del componente está conectado a nada (se puede intercalar al soltarlo). */
export function isLoose(connectivity: Connectivity, component: PlacedComponent): boolean {
  return Object.keys(pinPositions(component)).every((pin) => !connectivity.netOfPin.has(pinKey(component.id, pin)));
}

function boxCorners([ax, ay]: Point, [bx, by]: Point) {
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
}

function capture(e: ReactPointerEvent<SVGSVGElement>) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    // Eventos sintéticos (pruebas) no tienen un puntero real que capturar.
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Si el usuario está escribiendo en un campo, los atajos no deben actuar. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable));
}
