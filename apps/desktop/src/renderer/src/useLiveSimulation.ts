// Simulación en vivo: mientras está encendida, cada cambio del circuito se
// vuelve a simular solo (con una espera corta para no simular en cada tecla).
// La usan el editor y la práctica con el multímetro.
import { useEffect, useRef, useState } from "react";
import type { Circuit, DcOutcome, Diagnostic } from "@ohmlab/core";

export interface LiveSimulation {
  outcome: DcOutcome | null;
  /** El resultado corresponde al circuito actual (no a uno de hace un instante). */
  fresh: boolean;
}

export function useLiveSimulation(circuit: Circuit, running: boolean): LiveSimulation {
  const [state, setState] = useState<{ key: string; outcome: DcOutcome } | null>(null);
  const request = useRef(0);
  // Se compara el contenido: mover un componente sin cambiar sus conexiones no vuelve a simular.
  const key = JSON.stringify(circuit);

  useEffect(() => {
    const id = ++request.current;
    if (!running) {
      setState(null);
      return;
    }
    const timer = setTimeout(async () => {
      let outcome: DcOutcome;
      try {
        outcome = await window.ohmlab.simulateDc(JSON.parse(key) as Circuit);
      } catch (error) {
        outcome = { ok: false, diagnostics: [unexpectedError(error)] };
      }
      if (id === request.current) setState({ key, outcome }); // descarta respuestas viejas
    }, 120);
    return () => clearTimeout(timer);
  }, [key, running]);

  return { outcome: running ? (state?.outcome ?? null) : null, fresh: state?.key === key };
}

function unexpectedError(error: unknown): Diagnostic {
  return {
    severity: "error",
    code: "simulator-failed",
    message: "Ocurrió un error inesperado al simular.",
    hint: "Abre Ayuda → Diagnóstico y repórtalo en GitHub.",
    components: [],
    details: error instanceof Error ? error.message : String(error),
  };
}
