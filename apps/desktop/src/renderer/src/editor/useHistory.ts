// Historial para deshacer y rehacer (Ctrl+Z / Ctrl+Y). Como cada cambio del
// núcleo devuelve un esquemático nuevo, basta con guardar las versiones.
import { useReducer } from "react";
import { emptySchematic, type Schematic } from "@ohmlab/core";

const LIMIT = 200;

interface History {
  past: Schematic[];
  present: Schematic;
  future: Schematic[];
}

type Action =
  | { type: "apply"; change: (s: Schematic) => Schematic }
  | { type: "undo" }
  | { type: "redo" }
  /** Empezar de nuevo con otro esquemático (Nuevo, Abrir): se olvida el historial. */
  | { type: "reset"; schematic: Schematic };

function reducer(h: History, action: Action): History {
  switch (action.type) {
    case "apply": {
      const next = action.change(h.present);
      if (next === h.present) return h;
      return { past: [...h.past, h.present].slice(-LIMIT), present: next, future: [] };
    }
    case "undo":
      if (h.past.length === 0) return h;
      return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
    case "redo":
      if (h.future.length === 0) return h;
      return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
    case "reset":
      return { past: [], present: action.schematic, future: [] };
  }
}

export function useHistory() {
  const [history, dispatch] = useReducer(reducer, undefined, () => ({
    past: [],
    present: emptySchematic(),
    future: [],
  }));
  return {
    schematic: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    apply: (change: (s: Schematic) => Schematic) => dispatch({ type: "apply", change }),
    undo: () => dispatch({ type: "undo" }),
    redo: () => dispatch({ type: "redo" }),
    reset: (schematic: Schematic) => dispatch({ type: "reset", schematic }),
  };
}
