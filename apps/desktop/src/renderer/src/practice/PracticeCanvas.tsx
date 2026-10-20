// Lienzo de la práctica: el circuito del ejercicio (fijo) y un multímetro
// con dos cables. Las puntas se arrastran hasta un punto del circuito; el
// multímetro entero se arrastra sobre un cable para intercalarlo en serie.
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  analyzeConnectivity,
  cutWire,
  getComponentDef,
  onWire,
  pinPositions,
  samePoint,
  type PlacedComponent,
  type Point,
  type PracticeMeter,
  type Schematic,
} from "@ohmlab/core";
import { GRID, shapeOf, symbolTransform, valueText, worldBounds } from "../editor/symbols";

type Px = [number, number];
type Tip = "plus" | "com";

const BOX_W = 110;
const BOX_H = 78;
/** Donde salen los cables del multímetro, respecto a su esquina. */
const JACKS: Record<Tip, Px> = { plus: [32, BOX_H], com: [78, BOX_H] };

interface Props {
  /** El circuito con los cambios del estudiante (sin la pieza quitada, etc.). */
  schematic: Schematic;
  /** El circuito completo: fija el encuadre para que no salte al quitar piezas. */
  frame: Schematic;
  meter: PracticeMeter;
  /** Extremos del hueco donde está intercalado el multímetro. */
  gap?: [Point, Point];
  /** Nombres de puntos que menciona el enunciado. */
  labels?: { text: string; at: Point; side: "left" | "right" }[];
  /** Lo que marca la pantalla. */
  screen: string;
  /** Cambia cuando hay que guardar las puntas junto al multímetro. */
  parkRequest: number;
  onMeterChange(meter: PracticeMeter): void;
}

type Drag = { kind: "tip"; tip: Tip; at: Px } | { kind: "box"; offset: Px; at: Px; insertAt: Point | null };

export function PracticeCanvas({ schematic, frame, meter, gap, labels = [], screen, parkRequest, onMeterChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [minX, minY, maxX, maxY] = useMemo(() => extent(frame), [frame]);
  const parked: Px = [maxX + 90, minY];
  const [box, setBox] = useState<Px>(parked);
  const [loose, setLoose] = useState<Partial<Record<Tip, Px>>>({});
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (next: Drag | null) => {
    dragRef.current = next;
    setDragState(next);
  };

  useEffect(() => {
    setBox(parked);
    setLoose({});
  }, [parkRequest]);

  const connectivity = useMemo(() => analyzeConnectivity(schematic), [schematic]);
  const shown = gap ? (cutWire(schematic, meter.series!.at)?.schematic ?? schematic) : schematic;
  const preview = drag?.kind === "box" && drag.insertAt ? cutWire(schematic, drag.insertAt)?.gap : undefined;

  const toWorld = (e: { clientX: number; clientY: number }): Px => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svgRef.current!.getScreenCTM()!.inverse());
    return [p.x, p.y];
  };
  const snap = ([x, y]: Px): Point => [Math.round(x / GRID), Math.round(y / GRID)];
  /** En ese punto hay un cable o un pin que la punta puede tocar. */
  const touchable = (p: Point) =>
    schematic.wires.some((w) => onWire(p, w)) ||
    schematic.components.some((c) => Object.values(pinPositions(c)).some((q) => samePoint(p, q)));

  const boxAt: Px = drag?.kind === "box" ? [drag.at[0] - drag.offset[0], drag.at[1] - drag.offset[1]] : box;
  const tipAt = (tip: Tip): Px => {
    if (drag?.kind === "tip" && drag.tip === tip) return drag.at;
    if (gap) {
      const end = gap[(tip === "plus") === !meter.series!.flipped ? 0 : 1];
      return [end[0] * GRID, end[1] * GRID];
    }
    const point = meter[tip];
    if (point) return [point[0] * GRID, point[1] * GRID];
    return loose[tip] ?? [parked[0] + JACKS[tip][0], parked[1] + BOX_H + 56];
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const target = (e.target as Element).closest("[data-tip],[data-meter-box]");
    if (!target || e.button !== 0) return;
    capture(e);
    const at = toWorld(e);
    const tip = target.getAttribute("data-tip") as Tip | null;
    if (tip && !gap) setDrag({ kind: "tip", tip, at });
    else if (!tip) setDrag({ kind: "box", offset: [at[0] - box[0], at[1] - box[1]], at, insertAt: null });
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const at = toWorld(e);
    if (d.kind === "tip") setDrag({ ...d, at });
    else {
      const point = snap(at);
      setDrag({ ...d, at, insertAt: !gap && cutWire(schematic, point) ? point : null });
    }
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    setDrag(null);
    if (!d) return;
    if (d.kind === "tip") {
      const point = snap(d.at);
      if (touchable(point)) {
        setLoose((l) => ({ ...l, [d.tip]: undefined }));
        onMeterChange({ ...meter, [d.tip]: point, series: undefined });
      } else {
        setLoose((l) => ({ ...l, [d.tip]: d.at }));
        onMeterChange({ ...meter, [d.tip]: undefined });
      }
      return;
    }
    const cut = d.insertAt && cutWire(schematic, d.insertAt);
    if (d.insertAt && cut) {
      // Intercalado: el multímetro se corre a un lado del hueco para no tapar el circuito.
      setBox(besideGap(cut.gap, [(minX + maxX) / 2, (minY + maxY) / 2]));
      onMeterChange({ mode: meter.mode, series: { at: d.insertAt, flipped: false } });
    } else {
      setBox([d.at[0] - d.offset[0], d.at[1] - d.offset[1]]);
    }
  };

  // Margen alrededor del circuito: arriba y a los lados cabe el multímetro intercalado; a la derecha, guardado.
  const viewBox = [minX - 150, minY - 150, maxX - minX + 150 + 230, maxY - minY + 150 + 120];

  return (
    <svg
      ref={svgRef}
      className={drag ? "canvas practice-canvas dragging" : "canvas practice-canvas"}
      data-testid="lienzo-practica"
      viewBox={viewBox.join(" ")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {shown.wires.map((w) => (
        <line key={w.id} className="wire" x1={w.a[0] * GRID} y1={w.a[1] * GRID} x2={w.b[0] * GRID} y2={w.b[1] * GRID} />
      ))}
      {preview && (
        <line className="cut-preview" x1={preview[0][0] * GRID} y1={preview[0][1] * GRID} x2={preview[1][0] * GRID} y2={preview[1][1] * GRID} />
      )}
      {connectivity.junctions.map(([x, y]) => (
        <circle key={`${x},${y}`} className="junction" cx={x * GRID} cy={y * GRID} r={3.5} />
      ))}
      {labels.map(({ text, at: [x, y], side }) => (
        <text key={text} className="node-name" x={x * GRID + (side === "left" ? -10 : 10)} y={y * GRID - 10} textAnchor={side === "left" ? "end" : "start"}>
          {text}
        </text>
      ))}
      {shown.components.map((c) => (
        <g key={c.id} className="component" data-part={c.id}>
          <g transform={symbolTransform(c)}>{shapeOf(c.type).draw(c)}</g>
          <Label component={c} />
        </g>
      ))}

      {(["com", "plus"] as Tip[]).map((tip) => {
        const [jx, jy] = [boxAt[0] + JACKS[tip][0], boxAt[1] + JACKS[tip][1]];
        const [tx, ty] = tipAt(tip);
        const sag = Math.max(jy, ty) + 50;
        return (
          <path key={tip} className={`lead-cable lead-${tip}`} d={`M ${jx} ${jy} Q ${(jx + tx) / 2} ${sag} ${tx} ${ty}`} />
        );
      })}

      <g className="practice-meter" data-meter-box transform={`translate(${boxAt[0]} ${boxAt[1]})`}>
        <rect className="meter-body" width={BOX_W} height={BOX_H} rx={8} />
        <rect className="meter-display" x={8} y={8} width={BOX_W - 16} height={30} rx={4} />
        <text className="meter-reading" data-testid="pantalla-practica" x={BOX_W - 14} y={24}>{screen}</text>
        <text className="meter-mode" x={BOX_W / 2} y={48}>{meter.mode === "Ω" ? "Ohmímetro" : meter.mode === "A" ? "Amperímetro" : "Voltímetro"}</text>
        <circle className="jack jack-plus" cx={JACKS.plus[0]} cy={BOX_H - 8} r={4} />
        <circle className="jack jack-com" cx={JACKS.com[0]} cy={BOX_H - 8} r={4} />
        <text className="jack-label" x={JACKS.plus[0]} y={BOX_H - 20}>+</text>
        <text className="jack-label" x={JACKS.com[0]} y={BOX_H - 20}>COM</text>
      </g>

      {(["com", "plus"] as Tip[]).map((tip) => {
        const [x, y] = tipAt(tip);
        const attached = Boolean(gap || meter[tip]);
        return (
          <g key={tip} className={`probe-tip tip-${tip}${attached ? " attached" : ""}${gap ? " locked" : ""}`} data-tip={tip}>
            <circle className="tip-hit" cx={x} cy={y} r={14} />
            <circle className="tip-dot" cx={x} cy={y} r={6} />
          </g>
        );
      })}
    </svg>
  );
}

/** Nombre y valor de cada pieza, al lado (como en el editor). */
function Label({ component }: { component: PlacedComponent }) {
  if (getComponentDef(component.type).isGround) return null;
  const [bx, by, bw, bh] = worldBounds(component);
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

/** Rectángulo que ocupa el circuito, en píxeles. */
function extent(schematic: Schematic): [number, number, number, number] {
  const boxes = [
    ...schematic.components.map(worldBounds),
    ...schematic.wires.map((w): [number, number, number, number] => [
      Math.min(w.a[0], w.b[0]) * GRID,
      Math.min(w.a[1], w.b[1]) * GRID,
      Math.abs(w.a[0] - w.b[0]) * GRID,
      Math.abs(w.a[1] - w.b[1]) * GRID,
    ]),
  ];
  return [
    Math.min(...boxes.map(([x]) => x)),
    Math.min(...boxes.map(([, y]) => y)),
    Math.max(...boxes.map(([x, , w]) => x + w)),
    Math.max(...boxes.map(([, y, , h]) => y + h)),
  ];
}

/** Lugar para el multímetro junto al hueco: afuera del circuito, del lado más cercano. */
function besideGap([a, b]: [Point, Point], [cx, cy]: Px): Px {
  const mx = ((a[0] + b[0]) / 2) * GRID;
  const my = ((a[1] + b[1]) / 2) * GRID;
  if (a[1] === b[1]) return [mx - BOX_W / 2, my <= cy ? my - BOX_H - 70 : my + 70];
  return [mx <= cx ? mx - BOX_W - 70 : mx + 70, my - BOX_H / 2];
}

function capture(e: ReactPointerEvent<SVGSVGElement>) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    // Eventos sintéticos (pruebas) no tienen un puntero real que capturar.
  }
}
