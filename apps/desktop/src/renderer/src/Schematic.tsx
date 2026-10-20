// Dibuja un circuito de práctica. Los puntos y cables se pueden tocar con
// las puntas del multímetro; los componentes, para medir sobre ellos.
import { formatSI, getComponentDef } from "@ohmlab/core";
import type { Layout, PartDrawing, Point } from "./layouts";
import type { MeterState } from "./meter";

const locale = navigator.language;

interface Props {
  layout: Layout;
  values: Record<string, number>;
  removed: Set<string>;
  meter: MeterState;
  /** Componentes con errores o avisos, para resaltarlos. */
  flagged: Set<string>;
  onNodeClick(node: string): void;
  onPartClick(id: string): void;
}

export function Schematic({ layout, values, removed, meter, flagged, onNodeClick, onPartClick }: Props) {
  const dotOf = (node: string) => layout.dots.find((d) => d.node === node)?.at;
  const seriesPart = meter.mode === "A" ? meter.series : undefined;

  return (
    <svg className="schematic" viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={`Esquema: ${layout.title}`}>
      {layout.wires.map((w, i) => (
        <g key={i} className="clickable" data-node={w.node} onClick={() => onNodeClick(w.node)}>
          <polyline className="hit" points={toPoints(w.points)} />
          <polyline className="wire" points={toPoints(w.points)} />
        </g>
      ))}

      {layout.parts.map((p) => {
        const component = layout.components.find((c) => c.id === p.id)!;
        const param = getComponentDef(component.type).params[0];
        const classes = ["clickable", "part-group"];
        if (removed.has(p.id)) classes.push("removed");
        if (flagged.has(p.id)) classes.push("flagged");
        if (seriesPart === p.id) classes.push("measured");
        return (
          <g key={p.id} className={classes.join(" ")} data-part={p.id} onClick={() => onPartClick(p.id)}>
            <PartShape part={p} />
            <PartLabel part={p} value={param ? formatValue(values[p.id], param.unit) : ""} />
          </g>
        );
      })}

      {layout.grounds.map(([x, y], i) => (
        <g key={i} className="ground">
          <line x1={x - 14} y1={y} x2={x + 14} y2={y} />
          <line x1={x - 9} y1={y + 6} x2={x + 9} y2={y + 6} />
          <line x1={x - 4} y1={y + 12} x2={x + 4} y2={y + 12} />
        </g>
      ))}

      {layout.dots.map((d) => (
        <circle key={d.node} className="node clickable" data-node={d.node} cx={d.at[0]} cy={d.at[1]} r={4} onClick={() => onNodeClick(d.node)} />
      ))}

      {/* Puntas del multímetro */}
      {meter.plus && dotOf(meter.plus) && <Probe at={dotOf(meter.plus)!} kind="plus" />}
      {meter.com && dotOf(meter.com) && <Probe at={dotOf(meter.com)!} kind="com" />}
      {seriesPart && <SeriesBadge part={layout.parts.find((p) => p.id === seriesPart)!} />}
    </svg>
  );
}

function PartShape({ part }: { part: PartDrawing }) {
  const [x1, y1] = part.from;
  const [x2, y2] = part.to;
  const length = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / length;
  const uy = (y2 - y1) / length;
  const at = (d: number, across = 0): Point => [x1 + ux * d - uy * across, y1 + uy * d + ux * across];
  // Zona amplia para hacer clic sobre el componente
  const hit = <line className="hit" x1={x1} y1={y1} x2={x2} y2={y2} />;

  if (part.kind === "vsource") {
    const [cx, cy] = at(length / 2);
    const [px, py] = at(length / 2 - 10);
    const [mx, my] = at(length / 2 + 10);
    return (
      <>
        {hit}
        <circle className="part" cx={cx} cy={cy} r={22} />
        <text className="sign" x={px} y={py}>+</text>
        <text className="sign" x={mx} y={my}>−</text>
      </>
    );
  }

  const lead = Math.max(6, (length - 60) / 2);
  const zig: Point[] = [at(lead)];
  for (let i = 1; i < 6; i++) zig.push(at(lead + i * 10, i % 2 ? -8 : 8));
  zig.push(at(lead + 60));
  return (
    <>
      {hit}
      <line className="wire" x1={x1} y1={y1} x2={zig[0][0]} y2={zig[0][1]} />
      <polyline className="part" points={toPoints(zig)} />
      <line className="wire" x1={zig[zig.length - 1][0]} y1={zig[zig.length - 1][1]} x2={x2} y2={y2} />
    </>
  );
}

function PartLabel({ part, value }: { part: PartDrawing; value: string }) {
  const cx = (part.from[0] + part.to[0]) / 2;
  const cy = (part.from[1] + part.to[1]) / 2;
  const offset = part.kind === "vsource" ? 30 : 16;
  if (part.label === "above") {
    return (
      <>
        <text className="label" x={cx} y={cy - 22}>{part.id}</text>
        <text className="value" x={cx} y={cy + 26}>{value}</text>
      </>
    );
  }
  const x = part.label === "left" ? cx - offset : cx + offset;
  const anchor = part.label === "left" ? "end" : "start";
  return (
    <>
      <text className="label" x={x} y={cy - 4} textAnchor={anchor}>{part.id}</text>
      <text className="value" x={x} y={cy + 12} textAnchor={anchor}>{value}</text>
    </>
  );
}

function Probe({ at: [x, y], kind }: { at: Point; kind: "plus" | "com" }) {
  // La punta roja se dibuja arriba a la izquierda y la negra abajo a la derecha,
  // para que no se tapen si están cerca.
  const [dx, dy] = kind === "plus" ? [-16, -16] : [16, 16];
  return (
    <g className={`probe probe-${kind}`} pointerEvents="none">
      <line x1={x} y1={y} x2={x + dx} y2={y + dy} />
      <circle cx={x + dx} cy={y + dy} r={10} />
      <text x={x + dx} y={y + dy}>{kind === "plus" ? "+" : "C"}</text>
    </g>
  );
}

function SeriesBadge({ part }: { part: PartDrawing }) {
  const [x, y] = part.from;
  return (
    <g className="probe probe-series" pointerEvents="none">
      <circle cx={x} cy={y} r={11} />
      <text x={x} y={y}>A</text>
    </g>
  );
}

function formatValue(value: number | undefined, unit: string) {
  return value !== undefined && Number.isFinite(value) ? formatSI(value, unit, locale) : "?";
}

function toPoints(points: Point[]) {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}
