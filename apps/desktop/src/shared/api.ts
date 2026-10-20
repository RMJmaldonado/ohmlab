// Lo que la ventana puede pedirle al proceso principal. Es lo único que
// cruza el "puente" (preload): la ventana no tiene acceso directo a la PC.
import type { Circuit, DcOutcome, Schematic, SelfTestReport } from "@ohmlab/core";

export interface SelfTestResult {
  report: SelfTestReport;
  /** Informe listo para copiar. */
  text: string;
}

/** Resultado de guardar: el nombre del archivo, o por qué no se guardó (o si se canceló). */
export type SaveResult = { ok: true; name: string } | { ok: false; canceled?: boolean; error?: string };
export type OpenResult = { ok: true; name: string; schematic: Schematic } | { ok: false; canceled?: boolean; error?: string };

/** Órdenes del menú Archivo. "save-and-close": guardar y, si se pudo, cerrar la ventana. */
export type MenuCommand = "new" | "open" | "save" | "save-as" | "save-and-close";
export const MENU_COMMANDS: readonly MenuCommand[] = ["new", "open", "save", "save-as", "save-and-close"];

export interface OhmlabApi {
  simulateDc(circuit: Circuit): Promise<DcOutcome>;
  selfTest(): Promise<SelfTestResult>;
  copyText(text: string): Promise<void>;
  /** Avisa cuando se elige Ayuda → Diagnóstico. Devuelve cómo dejar de escuchar. */
  onOpenDiagnostics(callback: () => void): () => void;
  /** Avisa cuando se pulsa F5 (Simulación → Simular / detener). */
  onToggleSimulation(callback: () => void): () => void;
  /** Guarda en el archivo actual; si no hay (o saveAs), pregunta dónde. */
  saveFile(schematic: Schematic, saveAs: boolean): Promise<SaveResult>;
  /** Pregunta qué archivo abrir (y antes, si hay cambios sin guardar, si se descartan). */
  openFile(): Promise<OpenResult>;
  /** Abre el archivo con el que se lanzó OhmLab (doble clic en un .ohmlab), si hubo uno. */
  openStartupFile(): Promise<OpenResult>;
  /** Empieza un circuito vacío. false si se prefirió no perder los cambios. */
  newFile(): Promise<boolean>;
  /** Avisa si hay cambios sin guardar (para preguntar antes de cerrar). */
  setDirty(dirty: boolean): void;
  /** Cierra la ventana después de "Guardar" en la pregunta de cerrar. */
  closeWindow(): void;
  onMenuCommand(callback: (command: MenuCommand) => void): () => void;
}

/** Nombres de los mensajes entre la ventana y el proceso principal. */
export const CHANNELS = {
  simulateDc: "ohmlab:simulate-dc",
  selfTest: "ohmlab:self-test",
  copyText: "ohmlab:copy-text",
  openDiagnostics: "ohmlab:open-diagnostics",
  toggleSimulation: "ohmlab:toggle-simulation",
  saveFile: "ohmlab:save-file",
  openFile: "ohmlab:open-file",
  openStartupFile: "ohmlab:open-startup-file",
  newFile: "ohmlab:new-file",
  setDirty: "ohmlab:set-dirty",
  closeWindow: "ohmlab:close-window",
  menuCommand: "ohmlab:menu-command",
} as const;
