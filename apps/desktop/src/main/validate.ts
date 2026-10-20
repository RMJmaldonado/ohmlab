// Revisa lo que llega desde la ventana antes de usarlo. Aunque la ventana
// es nuestra, el proceso principal no confía en nada que venga de fuera
// (lista de seguridad de Electron).
import type { WebFrameMain } from "electron";
import type { Circuit } from "@ohmlab/core";

const MAX_COMPONENTS = 5000;

export function isCircuit(value: unknown): value is Circuit {
  if (!isObject(value) || !Array.isArray(value.components)) return false;
  if (value.components.length > MAX_COMPONENTS) return false;
  return value.components.every(
    (c) =>
      isObject(c) &&
      typeof c.id === "string" &&
      typeof c.type === "string" &&
      isObject(c.params) &&
      Object.values(c.params).every((v) => typeof v === "number") &&
      isObject(c.connections) &&
      Object.values(c.connections).every((v) => typeof v === "string"),
  );
}

/** Solo se aceptan mensajes de la página de OhmLab, nunca de otra. */
export function isTrustedSender(frame: WebFrameMain | null): boolean {
  if (!frame) return false;
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  return devUrl ? frame.url.startsWith(devUrl) : frame.url.startsWith("file://");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
