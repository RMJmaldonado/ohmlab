import { existsSync } from "node:fs";
import { join } from "node:path";

const LOCAL_WINDOWS = "F:/Herramientas/ngspice/Spice64/bin/ngspice_con.exe";

/**
 * Dónde está ngspice, en este orden:
 *  1. la variable NGSPICE_PATH, si existe;
 *  2. el que viene dentro de OhmLab instalado (resources/ngspice);
 *  3. la instalación local en F: (desarrollo en Windows);
 *  4. "ngspice" del PATH (Linux, con el paquete del sistema).
 */
export function findNgspice(): string {
  if (process.env.NGSPICE_PATH) return process.env.NGSPICE_PATH;
  const executable = process.platform === "win32" ? "ngspice_con.exe" : "ngspice";
  if (process.resourcesPath) {
    const bundled = join(process.resourcesPath, "ngspice", "bin", executable);
    if (existsSync(bundled)) return bundled;
  }
  if (process.platform === "win32" && existsSync(LOCAL_WINDOWS)) return LOCAL_WINDOWS;
  return "ngspice";
}
