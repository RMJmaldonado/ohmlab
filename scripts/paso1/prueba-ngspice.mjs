// Paso 1: ejecuta ngspice como proceso aparte, lee sus resultados
// y los compara con el archivo .esperado.json del circuito.
// Uso: node scripts/paso1/prueba-ngspice.mjs scripts/paso1/divisor.cir
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";

const NGSPICE =
  process.env.NGSPICE_PATH ?? "F:/Herramientas/ngspice/Spice64/bin/ngspice_con.exe";
const TOLERANCIA = 1e-6; // error relativo aceptado

function simular(archivoCir) {
  return new Promise((resolve, reject) => {
    execFile(NGSPICE, ["-b", archivoCir], (error, stdout, stderr) => {
      if (error) reject(new Error(`ngspice falló: ${stderr || error.message}`));
      else resolve(stdout);
    });
  });
}

// ngspice imprime líneas como "salida = 6.000000e+00"
function leerResultados(texto) {
  const resultados = {};
  for (const linea of texto.split(/\r?\n/)) {
    const m = linea.match(/^\s*(\S+)\s*=\s*([-+0-9.eE]+)\s*$/);
    if (m) resultados[m[1]] = Number(m[2]);
  }
  return resultados;
}

const archivoCir = process.argv[2];
if (!archivoCir) {
  console.error("Falta el circuito. Ejemplo: node scripts/paso1/prueba-ngspice.mjs scripts/paso1/divisor.cir");
  process.exit(1);
}

const resultados = leerResultados(await simular(archivoCir));
const esperado = JSON.parse(await readFile(archivoCir.replace(/\.cir$/, ".esperado.json"), "utf8"));

let fallos = 0;
console.log(esperado.descripcion + "\n");
for (const [nombre, valorEsperado] of Object.entries(esperado.valores)) {
  const obtenido = resultados[nombre];
  const ok =
    obtenido !== undefined &&
    Math.abs(obtenido - valorEsperado) <= TOLERANCIA * Math.max(1, Math.abs(valorEsperado));
  if (!ok) fallos++;
  console.log(`${ok ? "OK   " : "FALLA"} ${nombre.padEnd(12)} esperado ${valorEsperado}  obtenido ${obtenido}`);
}
console.log(fallos ? `\n${fallos} valor(es) no coinciden.` : "\nTodo coincide.");
process.exit(fallos ? 1 : 0);
