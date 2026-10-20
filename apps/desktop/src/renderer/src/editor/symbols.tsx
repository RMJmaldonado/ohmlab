// Dibujo de cada símbolo, en píxeles, sin girar y con el origen en (0, 0).
// Los pines coinciden con SymbolGeometry del núcleo (1 cuadro = GRID píxeles).
import type { ReactNode } from "react";
import { formatSI, getComponentDef, orient, type PlacedComponent } from "@ohmlab/core";

export const GRID = 20;

const locale = navigator.language;

type Orientation = Partial<Pick<PlacedComponent, "rotation" | "mirror">>;

interface SymbolShape {
  /** Rectángulo que ocupa el dibujo: [x, y, ancho, alto]. */
  bounds: [number, number, number, number];
  draw(component: Pick<PlacedComponent, "type"> & Orientation): ReactNode;
}

/**
 * Texto dentro del símbolo que siempre se lee derecho, aunque el componente
 * esté girado o volteado: deshace el giro alrededor de su propia posición.
 */
function Upright({ x, y, c, className, children }: { x: number; y: number; c: Orientation; className: string; children: ReactNode }) {
  // El símbolo se voltea con scale(-1 1): se pone el texto en la x volteada y
  // se voltea otra vez, así queda en su lugar sin escribirse al revés.
  const m = c.mirror ? -1 : 1;
  const qx = m * x;
  const transform = `scale(${m} 1) rotate(${-(c.rotation ?? 0)} ${qx} ${y})`;
  return <text className={className} x={qx} y={y} transform={transform}>{children}</text>;
}

const meterBox = (letter: string): SymbolShape => ({
  bounds: [-32, -36, 64, 76],
  draw: (c) => (
    <>
      <rect className="part meter-box" x={-30} y={-34} width={60} height={56} rx={6} />
      <Upright className="meter-letter" x={0} y={-6} c={c}>{letter}</Upright>
      <line className="lead lead-plus" x1={-20} y1={22} x2={-20} y2={40} />
      <line className="lead lead-com" x1={20} y1={22} x2={20} y2={40} />
      <Upright className="pin-mark" x={-20} y={14} c={c}>+</Upright>
      <Upright className="pin-mark" x={20} y={14} c={c}>COM</Upright>
    </>
  ),
});

const SHAPES: Record<string, SymbolShape> = {
  resistor: {
    bounds: [-40, -12, 80, 24],
    draw: () => (
      <>
        <line className="lead" x1={-40} y1={0} x2={-30} y2={0} />
        <polyline className="part" points="-30,0 -25,-8 -15,8 -5,-8 5,8 15,-8 25,8 30,0" />
        <line className="lead" x1={30} y1={0} x2={40} y2={0} />
      </>
    ),
  },
  "dc-voltage-source": {
    bounds: [-20, -40, 40, 80],
    draw: (c) => (
      <>
        <line className="lead" x1={0} y1={-40} x2={0} y2={-18} />
        <circle className="part" r={18} />
        <Upright className="sign" x={0} y={-7} c={c}>+</Upright>
        <Upright className="sign" x={0} y={9} c={c}>−</Upright>
        <line className="lead" x1={0} y1={18} x2={0} y2={40} />
      </>
    ),
  },
  "dc-current-source": {
    bounds: [-20, -40, 40, 80],
    draw: () => (
      <>
        <line className="lead" x1={0} y1={-40} x2={0} y2={-18} />
        <circle className="part" r={18} />
        <line className="part" x1={0} y1={10} x2={0} y2={-8} />
        <polyline className="part" points="-6,-2 0,-10 6,-2" />
        <line className="lead" x1={0} y1={18} x2={0} y2={40} />
      </>
    ),
  },
  ground: {
    bounds: [-15, -2, 30, 26],
    draw: () => (
      <>
        <line className="lead" x1={0} y1={0} x2={0} y2={10} />
        <line className="part" x1={-14} y1={10} x2={14} y2={10} />
        <line className="part" x1={-9} y1={16} x2={9} y2={16} />
        <line className="part" x1={-4} y1={22} x2={4} y2={22} />
      </>
    ),
  },
  // Punta de tensión: la punta toca el cable y la cabeza muestra una V.
  "voltage-probe": {
    bounds: [-4, -30, 27, 34],
    draw: (c) => (
      <>
        <line className="lead" x1={0} y1={0} x2={8} y2={-12} />
        <circle className="part probe-head probe-v" cx={12} cy={-19} r={8} />
        <Upright className="probe-letter probe-v" x={12} y={-19} c={c}>V</Upright>
        <circle className="probe-tip" r={2.5} />
      </>
    ),
  },
  // Punta de corriente: un círculo sobre el cable con la flecha del sentido positivo.
  "current-probe": {
    bounds: [-20, -11, 40, 22],
    draw: () => (
      <>
        <line className="lead" x1={-20} y1={0} x2={-9} y2={0} />
        <circle className="part probe-head probe-a" r={9} />
        <line className="part probe-a" x1={-5} y1={0} x2={5} y2={0} />
        <polyline className="part probe-a" points="1,-4 5,0 1,4" />
        <line className="lead" x1={9} y1={0} x2={20} y2={0} />
      </>
    ),
  },
  voltmeter: meterBox("V"),
  ammeter: meterBox("A"),
  ohmmeter: meterBox("Ω"),
};

export function shapeOf(type: string): SymbolShape {
  return SHAPES[type] ?? SHAPES.resistor;
}

/** Transformación SVG del símbolo: primero el volteo, luego el giro, luego la posición. */
export function symbolTransform(c: Pick<PlacedComponent, "x" | "y" | "rotation" | "mirror">): string {
  return `translate(${c.x * GRID} ${c.y * GRID}) rotate(${c.rotation}) scale(${c.mirror ? -1 : 1} 1)`;
}

/** Rectángulo que ocupa el componente ya girado, en píxeles del lienzo. */
export function worldBounds(c: PlacedComponent): [number, number, number, number] {
  const [bx, by, bw, bh] = shapeOf(c.type).bounds;
  const corners = [
    [bx, by],
    [bx + bw, by],
    [bx, by + bh],
    [bx + bw, by + bh],
  ].map((p) => orient(p as [number, number], c.rotation, c.mirror));
  const xs = corners.map(([x]) => x + c.x * GRID);
  const ys = corners.map(([, y]) => y + c.y * GRID);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
}

/** Texto bajo el nombre: el valor principal, o el modo del multímetro. */
export function valueText(c: PlacedComponent): string {
  const def = getComponentDef(c.type);
  if (def.meter) return { V: "Voltímetro", A: "Amperímetro", Ω: "Ohmímetro" }[def.meter];
  const param = def.params[0];
  return param ? formatSI(c.params[param.id], param.unit, locale) : "";
}
