// Guardar y abrir archivos .ohmlab. La ventana nunca elige rutas: los
// diálogos los abre el proceso principal y solo se escribe donde el
// estudiante eligió. Todo lo que se abre pasa por la revisión del núcleo.
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { app, dialog, type BrowserWindow } from "electron";
import { FILE_EXTENSION, MAX_FILE_BYTES, parseSchematicFile, serializeSchematic, validateSchematic } from "@ohmlab/core";
import type { OpenResult, SaveResult } from "../shared/api";

const FILTERS = [{ name: "Circuitos de OhmLab", extensions: [FILE_EXTENSION] }];
const UNTITLED = "Sin título";

/** El archivo abierto en la ventana: dónde está y si tiene cambios sin guardar. */
export class DocumentFile {
  private path: string | null = null;
  /** Lo avisa la ventana cada vez que cambia. */
  dirty = false;
  /** Archivo que pidió abrir el sistema (doble clic en un .ohmlab): se abre sin diálogo. */
  pending: string | null = null;

  /**
   * @param testDir En la prueba de humo no hay nadie para usar los diálogos:
   *   se guarda y se abre siempre testDir/circuito.ohmlab, sin preguntar.
   */
  constructor(
    private readonly win: BrowserWindow,
    private readonly testDir: string | null,
  ) {}

  get name(): string {
    return this.path ? basename(this.path) : UNTITLED;
  }

  async save(schematic: unknown, saveAs: boolean): Promise<SaveResult> {
    const valid = validateSchematic(schematic);
    if (typeof valid === "string") return { ok: false, error: `No se pudo guardar: ${valid}` };
    const path = saveAs || !this.path ? await this.pickSavePath() : this.path;
    if (!path) return { ok: false, canceled: true };
    try {
      await writeFile(path, serializeSchematic(valid), "utf8");
    } catch (error) {
      return { ok: false, error: `No se pudo guardar «${basename(path)}»: ${describeFsError(error)}` };
    }
    this.path = path;
    this.dirty = false;
    return { ok: true, name: this.name };
  }

  async open(): Promise<OpenResult> {
    if (!(await this.confirmDiscard())) return { ok: false, canceled: true };
    const path = this.pending ?? (await this.pickOpenPath());
    this.pending = null;
    if (!path) return { ok: false, canceled: true };
    try {
      if ((await stat(path)).size > MAX_FILE_BYTES) {
        return { ok: false, error: `«${basename(path)}» es demasiado grande para ser un circuito de OhmLab.` };
      }
      const parsed = parseSchematicFile(await readFile(path, "utf8"));
      if (!parsed.ok) return { ok: false, error: `No se pudo abrir «${basename(path)}»: ${parsed.error}` };
      this.path = path;
      this.dirty = false;
      return { ok: true, name: this.name, schematic: parsed.schematic };
    } catch (error) {
      return { ok: false, error: `No se pudo abrir «${basename(path)}»: ${describeFsError(error)}` };
    }
  }

  /** Empieza un circuito vacío. Devuelve false si el estudiante prefirió no perder sus cambios. */
  async startNew(): Promise<boolean> {
    if (!(await this.confirmDiscard())) return false;
    this.path = null;
    this.dirty = false;
    return true;
  }

  private async confirmDiscard(): Promise<boolean> {
    if (!this.dirty || this.testDir) return true;
    const { response } = await dialog.showMessageBox(this.win, {
      type: "warning",
      title: "Cambios sin guardar",
      message: `Hay cambios sin guardar en «${this.name}».`,
      detail: "Si continúas, se pierden.",
      buttons: ["Descartar los cambios", "Cancelar"],
      defaultId: 1,
      cancelId: 1,
    });
    return response === 0;
  }

  private async pickSavePath(): Promise<string | null> {
    if (this.testDir) return join(this.testDir, `circuito.${FILE_EXTENSION}`);
    const result = await dialog.showSaveDialog(this.win, {
      title: "Guardar circuito",
      defaultPath: this.path ?? join(app.getPath("documents"), `circuito.${FILE_EXTENSION}`),
      filters: FILTERS,
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath.toLowerCase().endsWith(`.${FILE_EXTENSION}`) ? result.filePath : `${result.filePath}.${FILE_EXTENSION}`;
  }

  private async pickOpenPath(): Promise<string | null> {
    if (this.testDir) return join(this.testDir, `circuito.${FILE_EXTENSION}`);
    const result = await dialog.showOpenDialog(this.win, {
      title: "Abrir circuito",
      defaultPath: this.path ?? app.getPath("documents"),
      filters: FILTERS,
      properties: ["openFile"],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  }
}

/** El archivo .ohmlab que viene en la línea de comandos (doble clic en el explorador). */
export function fileFromArgs(argv: string[]): string | null {
  return argv.slice(1).find((arg) => arg.toLowerCase().endsWith(`.${FILE_EXTENSION}`)) ?? null;
}

/** Errores del sistema de archivos explicados en español. */
function describeFsError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "ENOENT") return "el archivo no existe.";
  if (code === "EACCES" || code === "EPERM") return "no hay permiso para usar ese archivo o carpeta.";
  if (code === "EISDIR") return "eso es una carpeta, no un archivo.";
  if (code === "ENOSPC") return "el disco está lleno.";
  return error instanceof Error ? error.message : String(error);
}
