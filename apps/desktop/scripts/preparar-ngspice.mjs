// Copia lo mínimo de ngspice para el instalador de Windows: el programa de
// consola, las tres DLL que necesita y su licencia. No se copian los modelos
// de terceros (.osdi) ni los "code models": OhmLab no los usa.
//
// Origen: la variable NGSPICE_HOME (carpeta Spice64 del paquete oficial), o
// F:/Herramientas/ngspice/Spice64. Destino: vendor/ (no se guarda en git).
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = process.env.NGSPICE_HOME ?? "F:/Herramientas/ngspice/Spice64";
const vendor = join(here, "..", "vendor");
const files = ["ngspice_con.exe", "sndfile.dll", "samplerate.dll", "libomp140.x86_64.dll"];

if (!existsSync(join(source, "bin", "ngspice_con.exe"))) {
  console.error(`No encuentro ngspice en ${source}. Indica la carpeta Spice64 con la variable NGSPICE_HOME.`);
  process.exit(1);
}
rmSync(vendor, { recursive: true, force: true });
mkdirSync(join(vendor, "ngspice", "bin"), { recursive: true });
mkdirSync(join(vendor, "licencias"), { recursive: true });
for (const file of files) copyFileSync(join(source, "bin", file), join(vendor, "ngspice", "bin", file));
copyFileSync(join(source, "docs", "COPYING"), join(vendor, "licencias", "ngspice-COPYING.txt"));
copyFileSync(join(here, "..", "..", "..", "LICENSE"), join(vendor, "licencias", "LICENSE.txt"));
console.log(`ngspice copiado de ${source} a ${vendor}`);
