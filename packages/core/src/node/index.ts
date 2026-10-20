// Partes del núcleo que solo funcionan en Node (proceso principal de
// Electron): ejecutan programas y leen archivos. La interfaz gráfica
// importa solo "@ohmlab/core".
export { NgspiceCliEngine, parsePrintOutput, type NgspiceCliOptions } from "./ngspice-cli.ts";
export { runSelfTest, formatSelfTestReport, hidePersonalPaths } from "./self-test.ts";
