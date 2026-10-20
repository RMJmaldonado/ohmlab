// Paleta de componentes por categorías. Se puede arrastrar un componente al
// lienzo, o hacer clic en él y luego en el lienzo.
import { getComponentDef } from "@ohmlab/core";
import { DRAG_TYPE } from "./Canvas";
import { shapeOf } from "./symbols";

const GROUPS: { title: string; items: { type: string; label?: string }[] }[] = [
  { title: "Básicos", items: [{ type: "resistor" }, { type: "ground" }] },
  { title: "Fuentes", items: [{ type: "dc-voltage-source" }, { type: "dc-current-source" }] },
  {
    title: "Instrumentos",
    items: [{ type: "voltmeter", label: "Multímetro" }, { type: "voltage-probe" }, { type: "current-probe" }],
  },
];

interface Props {
  /** Tipo que se está colocando (resaltado en la paleta). */
  active: string | null;
  onPick(type: string): void;
}

export function Palette({ active, onPick }: Props) {
  return (
    <aside className="palette" aria-label="Componentes">
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h3>{group.title}</h3>
          {group.items.map(({ type, label }) => {
            const def = getComponentDef(type);
            const [bx, by, bw, bh] = shapeOf(type).bounds;
            const pad = 6;
            return (
              <button
                key={type}
                className={active === type ? "palette-item active" : "palette-item"}
                data-palette={type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_TYPE, type);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => onPick(type)}
                title={`${label ?? def.label}: arrástralo al lienzo, o haz clic aquí y luego en el lienzo`}
              >
                <svg className="palette-icon" viewBox={`${bx - pad} ${by - pad} ${bw + 2 * pad} ${bh + 2 * pad}`}>
                  {shapeOf(type).draw({ type })}
                </svg>
                <span>{label ?? def.label}</span>
              </button>
            );
          })}
        </section>
      ))}
    </aside>
  );
}
