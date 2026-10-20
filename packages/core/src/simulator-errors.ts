// Traduce los fallos del simulador a mensajes en español. La revisión del
// circuito (erc.ts) debería evitar casi todos; esto es la red de seguridad.
import type { Diagnostic } from "./diagnostics.ts";
import type { SimulationError } from "./engine/engine.ts";

export function describeSimulationError(error: SimulationError): Diagnostic {
  const output = error.simulatorOutput;
  const base = { severity: "error" as const, components: [], details: lastLines(output || error.message, 30) };

  if (error.kind === "not-found") {
    return {
      ...base,
      code: "simulator-not-found",
      message: "No se encontró el simulador (ngspice).",
      hint: "Reinstala OhmLab. Si el problema sigue, envía el informe de diagnóstico.",
    };
  }
  if (error.kind === "timeout") {
    return {
      ...base,
      code: "simulator-timeout",
      message: "La simulación tardó demasiado y se detuvo.",
      hint: "Revisa si hay valores extremos, por ejemplo una resistencia de 0,000001 Ω junto a otra de millones de ohmios.",
    };
  }
  if (/singular matrix/i.test(output)) {
    return {
      ...base,
      code: "simulator-singular",
      message: "El circuito no tiene una solución única.",
      hint: "Suele pasar cuando una parte no tiene camino a tierra, cuando hay fuentes de tensión en paralelo o fuentes de corriente en serie.",
    };
  }
  if (/DC solution failed|gmin stepping failed|source stepping failed|iteration limit|timestep too small|no convergence/i.test(output)) {
    return {
      ...base,
      code: "simulator-no-convergence",
      message: "El simulador no logró encontrar la solución del circuito.",
      hint: "Revisa que los valores de los componentes sean razonables.",
    };
  }
  return {
    ...base,
    code: "simulator-failed",
    message: "El simulador encontró un problema que OhmLab todavía no sabe explicar.",
    hint: "Abre los detalles técnicos o repórtalo en GitHub junto con el informe de diagnóstico.",
  };
}

function lastLines(text: string, count: number): string {
  return text.trim().split(/\r?\n/).slice(-count).join("\n");
}
