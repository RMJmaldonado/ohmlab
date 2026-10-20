// Prueba de humo: abre la ventana real, enciende la simulación, usa el
// multímetro como voltímetro y como amperímetro, prueba un error a
// propósito, abre el diagnóstico y guarda capturas de pantalla.
// Se activa con la variable OHMLAB_SMOKE_TEST=<archivo.png>; sirve para
// comprobar la app completa sin tocarla a mano (y, más adelante, en el CI).
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { BrowserWindow } from "electron";
import { parseSchematicFile } from "@ohmlab/core";
import { CHANNELS, type MenuCommand } from "../shared/api";

/** Funciones que se inyectan en la página para esperar y hacer clic. */
const HELPERS = `
  const waitFor = (test, what) => new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const value = test();
      if (value) resolve(value);
      else if (Date.now() - start > 15000) reject(new Error("No apareció: " + what));
      else setTimeout(tick, 50);
    };
    tick();
  });
  const $ = (selector) => document.querySelector(selector);
  const click = (selector) => {
    const el = $(selector);
    if (!el) throw new Error("No existe: " + selector);
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  };
  // Pausa corta entre acciones: una persona nunca hace clic tan rápido como el script.
  const pause = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
  const reading = (pattern) => waitFor(() => pattern.test($("[data-testid=lectura]").innerText) && $("[data-testid=lectura]").innerText, "lectura " + pattern);
`;

export async function runSmokeTest(win: BrowserWindow, outFile: string): Promise<boolean> {
  const wc = win.webContents;
  if (wc.isLoading()) await new Promise<void>((resolve) => wc.once("did-finish-load", () => resolve()));
  // Los errores de la página llegan como texto: Electron solo diría "Script failed to execute".
  const run = async (body: string) => {
    const result = await wc.executeJavaScript(
      `(async () => { ${HELPERS} try { ${body} } catch (e) { return { smokeError: String((e && e.stack) || e) }; } })()`,
    );
    if (result && typeof result === "object" && "smokeError" in result) throw new Error(result.smokeError);
    return result;
  };
  const shot = (suffix: string) => capture(win, suffix ? outFile.replace(/\.png$/i, `-${suffix}.png`) : outFile);

  const selfTest: string = await run(`
    return (await waitFor(() => $("[data-selftest]:not([data-selftest='running'])"), "autodiagnóstico")).dataset.selftest;
  `);
  if (selfTest !== "ok") {
    // El autodiagnóstico falló: se captura el aviso y el informe, y termina.
    await shot("");
    wc.send(CHANNELS.openDiagnostics);
    await shot("diagnostico");
    console.log(JSON.stringify({ selfTest }));
    return false;
  }

  // Variante: OhmLab lanzado con un .ohmlab, como al hacer doble clic en el explorador.
  const startupFile = process.env.OHMLAB_SMOKE_STARTUP_FILE;
  if (startupFile) {
    const name = JSON.stringify(basename(startupFile));
    const components: number = await run(`
      return waitFor(() => document.title.startsWith(${name}) && document.querySelectorAll("[data-component]").length, "abrir al arrancar");
    `);
    await shot("abrir-al-arrancar");
    console.log(JSON.stringify({ selfTest, startupFile: basename(startupFile), components }));
    return components > 0;
  }

  // Editor: colocar, girar, borrar, deshacer y cambiar un valor.
  const editor = await run(`
    const svg = $("[data-testid=lienzo]");
    const rect = svg.getBoundingClientRect();
    const pointer = (target, type, x, y) => target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, clientX: rect.left + x, clientY: rect.top + y, button: 0,
      buttons: type === "pointerup" ? 0 : 1, pointerId: 1, isPrimary: true,
    }));
    const tap = async (target, x, y) => {
      pointer(svg, "pointermove", x, y);
      await pause();
      pointer(target, "pointerdown", x, y);
      pointer(svg, "pointerup", x, y);
      await pause();
    };
    const key = (k, extra = {}) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...extra }));
    const place = async (type, x, y, id) => {
      click("[data-palette='" + type + "']");
      await pause();
      await tap(svg, x, y);
      return waitFor(() => $("[data-component=" + id + "]"), id);
    };
    const hit = (id) => $("[data-component=" + id + "] .hit");

    await place("dc-voltage-source", 160, 220, "V1");
    await place("resistor", 240, 160, "R1");
    await place("resistor", 340, 220, "R2");
    key("r", { ctrlKey: true });
    await waitFor(() => $("[data-component=R2]").dataset.rotation === "90", "R2 girada");
    await place("ground", 160, 280, "GND1");

    await tap(hit("R1"), 240, 160);
    key("Delete");
    await waitFor(() => !$("[data-component=R1]"), "R1 borrada");
    await pause();
    key("z", { ctrlKey: true });
    await waitFor(() => $("[data-component=R1]"), "R1 de vuelta con Ctrl+Z");

    hit("R1").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const input = await waitFor(() => document.activeElement?.closest?.(".with-unit") && document.activeElement, "foco en el valor");
    // Con prefijo, como en clase: 2.2k = 2200 Ω.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "2.2k");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await pause();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await waitFor(() => $("[data-component=R1]").textContent.includes("2.2 kΩ"), "R1 = 2.2 kΩ");
    // Arrastrar desde la paleta (arrastrar y soltar).
    const data = new DataTransfer();
    data.setData("application/x-ohmlab-component", "dc-current-source");
    const at = { bubbles: true, cancelable: true, clientX: rect.left + 460, clientY: rect.top + 220, dataTransfer: data };
    svg.dispatchEvent(new DragEvent("dragover", at));
    svg.dispatchEvent(new DragEvent("drop", at));
    await waitFor(() => $("[data-component=I1]"), "I1 soltada desde la paleta");

    // Voltear en vertical (Alt+Y): la fuente queda con el + abajo (giro de 180°).
    await tap(hit("V1"), 160, 220);
    key("y", { altKey: true });
    await waitFor(() => $("[data-component=V1]").dataset.rotation === "180", "V1 volteada");
    key("y", { altKey: true });
    await waitFor(() => $("[data-component=V1]").dataset.rotation === "0", "V1 como al principio");

    // Cables. Un punto de la grilla (gx, gy) está en la pantalla en (320 + 20·gx, 220 + 20·gy).
    const cell = (gx, gy) => [320 + 20 * gx, 220 + 20 * gy];
    const pin = (name) => $("[data-pin='" + name + "']");
    const nets = () => Number(svg.dataset.nets);
    const drag = async (target, [x1, y1], [x2, y2]) => {
      pointer(svg, "pointermove", x1, y1);
      await pause();
      pointer(target, "pointerdown", x1, y1);
      await pause();
      pointer(svg, "pointermove", x2, y2);
      await pause();
      pointer(svg, "pointerup", x2, y2);
      await pause();
    };
    // 1) Arrastrando de pin a pin: V1 (+) → R1 (1).
    await drag(pin("V1.plus"), cell(-8, -2), cell(-6, -3));
    // 2) Con clics: clic en R1 (2), el cable sigue al ratón, clic en R2 (1).
    await tap(pin("R1.b"), ...cell(-2, -3));
    await waitFor(() => svg.classList.contains("wiring"), "cable en curso");
    await tap(pin("R2.a"), ...cell(1, -2));
    // 3) y 4) Cierra el circuito por abajo y lo lleva a tierra.
    await drag(pin("R2.b"), cell(1, 2), cell(-8, 2));
    await drag(pin("V1.minus"), cell(-8, 2), cell(-8, 3));
    await waitFor(() => nets() === 3, "3 nodos (I1 queda suelta)");

    // Pasar el ratón por un cable explica su nodo en la barra de estado.
    const wire = $("[data-wire] .wire-hit");
    // Se repite el movimiento en cada intento: si el ratón real pasa por la ventana, cambia lo resaltado.
    const hover = await waitFor(() => {
      wire.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: rect.left + 200, clientY: rect.top + 160 }));
      return /une/.test($("[data-testid=estado-editor]").innerText) && $("[data-testid=estado-editor]").innerText;
    }, "nodo resaltado");

    // Soltar el multímetro sobre el cable de abajo lo intercala en serie. Va
    // girado 180° (Ctrl+R dos veces antes de soltarlo) para que cuelgue debajo
    // del cable, con la punta + del lado de R2: así la corriente entra por +.
    click("[data-palette='voltmeter']");
    await pause();
    key("r", { ctrlKey: true });
    key("r", { ctrlKey: true });
    await pause();
    await tap(svg, ...cell(-4, 4));
    await waitFor(() => $("[data-component=MM1]"), "MM1");
    await waitFor(() => nets() === 4, "multímetro intercalado: 4 nodos");

    // Mover R2: sus cables la siguen y no se pierde ninguna conexión.
    await drag(hit("R2"), cell(1, 0), cell(3, 0));
    await waitFor(() => $("[data-component=R2] g[transform]").getAttribute("transform").startsWith("translate(60 0)"), "R2 movida");
    if (nets() !== 4) throw new Error("Al mover R2 cambiaron los nodos: " + nets());
    const wires = Number(svg.dataset.wires);

    // Copiar y pegar: Ctrl+C sobre R1 y Ctrl+V con el ratón en un lugar libre.
    await tap(hit("R1"), ...cell(-4, -3));
    key("c", { ctrlKey: true });
    await pause();
    pointer(svg, "pointermove", ...cell(5, -6));
    await pause();
    key("v", { ctrlKey: true });
    const pasted = await waitFor(() => $("[data-component=R3]")?.textContent, "R3 pegada");
    if (!/2[.,]2 kΩ/.test(pasted)) throw new Error("La copia no conservó el valor: " + pasted);
    // Ctrl+X la corta (copia y borra) y la barra de estado lo explica.
    await pause();
    key("x", { ctrlKey: true });
    await waitFor(() => !$("[data-component=R3]"), "R3 cortada");
    const cutNotice = await waitFor(() => {
      const status = $("[data-testid=estado-editor]").innerText;
      return /Cortado/.test(status) && status.split("\\n")[0];
    }, "aviso de cortar");
    if (nets() !== 4) throw new Error("Copiar y cortar cambiaron los nodos: " + nets());

    await tap(hit("R1"), ...cell(-4, -3));
    return {
      components: [...document.querySelectorAll("[data-component]")].map((g) => g.dataset.component + "@" + g.dataset.rotation),
      r1: $("[data-component=R1]").textContent,
      nets: nets(),
      wires,
      hover,
      pasted,
      cutNotice,
    };
  `);
  await shot("editor");

  // Un nodo resaltado: el ratón sobre el cable de tierra.
  const groundNode: string = await run(`
    const rect = $("[data-testid=lienzo]").getBoundingClientRect();
    const [x, y] = [rect.left + 190, rect.top + 260];
    const target = document.elementFromPoint(x, y);
    return waitFor(() => {
      target.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: x, clientY: y }));
      const status = $("[data-testid=estado-editor]").innerText;
      return /tierra/.test(status) && status.split("\\n")[0];
    }, "nodo de tierra: " + target.tagName + "." + target.getAttribute("class"));
  `);
  await shot("nodo");

  // Simular desde el editor. El multímetro quedó intercalado abajo: como
  // amperímetro debe marcar 12 V / (2,2 kΩ + 1 kΩ) = 3,75 mA.
  const EDITOR_POINTER = `
    const svg = $("[data-testid=lienzo]");
    const rect = svg.getBoundingClientRect();
    const pointer = (target, type, x, y) => target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, clientX: rect.left + x, clientY: rect.top + y, button: 0,
      buttons: type === "pointerup" ? 0 : 1, pointerId: 1, isPrimary: true,
    }));
    const tap = async (target, x, y) => {
      pointer(svg, "pointermove", x, y);
      await pause();
      pointer(target, "pointerdown", x, y);
      pointer(svg, "pointerup", x, y);
      await pause();
    };
    const screen = () => $("[data-meter=MM1]")?.textContent ?? "";
    const cell = (gx, gy) => [320 + 20 * gx, 220 + 20 * gy];
    const place = async (type, [x, y], id) => {
      click("[data-palette='" + type + "']");
      await pause();
      await tap(svg, x, y);
      return waitFor(() => $("[data-component=" + id + "]"), id);
    };
    const tag = (id) => $("[data-probe-tag=" + id + "]")?.textContent ?? "";
  `;
  const simulation = await run(`
    ${EDITOR_POINTER}
    click("[data-testid=simular-editor]");
    const asVoltmeter = await waitFor(() => /V$/.test(screen()) && screen(), "MM1 como voltímetro");
    // Doble clic abre la ventana del multímetro; ahí se elige el modo.
    await tap($("[data-component=MM1] .hit"), 240, 300);
    $("[data-component=MM1] .hit").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await waitFor(() => $("[data-meter-window=MM1]"), "ventana del multímetro");
    click("[data-meter-window=MM1] [data-window-mode=A]");
    const asAmmeter = await waitFor(() => /^3[.,]75 mA$/.test(screen()) && screen(), "MM1 como amperímetro: 3,75 mA");
    // Voltear el multímetro intercambia las puntas: la lectura cambia de signo, y el panel lo explica.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "x", altKey: true, bubbles: true }));
    const flipped = await waitFor(() => /^-3[.,]75 mA$/.test(screen()) && screen(), "lectura negativa al voltear");
    const negativeNote = await waitFor(() => $("[data-testid=nota-signo]")?.innerText, "nota del signo");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "x", altKey: true, bubbles: true }));
    await waitFor(() => /^3[.,]75 mA$/.test(screen()), "lectura positiva otra vez");
    const display = $("[data-testid=lectura-editor]").innerText;
    const meterWindow = $("[data-testid=pantalla-ventana]").innerText;
    if (meterWindow !== screen()) throw new Error("La ventana marca " + meterWindow + " y el símbolo " + screen());

    // Puntas de prueba sobre el cable de arriba, entre R1 y R2 (de x = -2 a x = 3, en y = -3).
    // La de corriente se intercala en serie; la de tensión toca la esquina que llega a R2.
    await place("current-probe", cell(0, -3), "PI1");
    const currentProbe = await waitFor(() => /^3[.,]75 mA$/.test(tag("PI1")) && tag("PI1"), "punta de corriente: 3,75 mA");
    await place("voltage-probe", cell(3, -3), "PV1");
    const voltageProbe = await waitFor(() => /^3[.,]75 V$/.test(tag("PV1")) && tag("PV1"), "punta de tensión: 3,75 V");
    if (!/^3[.,]75 mA$/.test(screen())) throw new Error("Las puntas cambiaron la lectura del amperímetro: " + screen());
    // Los voltajes no se escriben en los nodos: se miden con el multímetro.
    if ($("[data-node-tag]")) throw new Error("No debería haber etiquetas de voltaje en los nodos");
    return { asVoltmeter, asAmmeter, flipped, negativeNote, display, meterWindow, currentProbe, voltageProbe };
  `);
  await shot("simulacion");

  // La rueda del ratón gira la pieza mientras se coloca y mientras se arrastra.
  const wheelRotation = await run(`
    ${EDITOR_POINTER}
    const wheel = ([x, y]) => svg.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true, cancelable: true, deltaY: 100, clientX: rect.left + x, clientY: rect.top + y,
    }));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const spot = cell(-4, 10);
    const moved = cell(-2, 10);
    click("[data-palette='resistor']");
    await pause();
    pointer(svg, "pointermove", ...spot);
    await pause();
    wheel(spot);
    await pause();
    await tap(svg, ...spot);
    const whilePlacing = (await waitFor(() => $("[data-component=R3]"), "R3")).dataset.rotation;
    await wait(250);
    pointer($("[data-component=R3] .hit"), "pointerdown", ...spot);
    pointer(svg, "pointermove", ...moved);
    await pause();
    wheel(moved);
    await pause();
    pointer(svg, "pointerup", ...moved);
    await pause();
    const whileDragging = $("[data-component=R3]").dataset.rotation;
    if (whilePlacing !== "90" || whileDragging !== "180") {
      throw new Error("La rueda no giró la pieza: al colocar " + whilePlacing + "°, al arrastrar " + whileDragging + "°");
    }
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    await waitFor(() => !$("[data-component=R3]"), "borrar R3");
    return { whilePlacing, whileDragging };
  `);

  // Sin tierra: error en español y ningún número en la pantalla del multímetro.
  const noGround: string = await run(`
    ${EDITOR_POINTER}
    await tap($("[data-component=GND1] .hit"), 160, 292);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    const message = await waitFor(() => $("[data-testid=simulacion-editor] .diagnostics li.error")?.innerText, "error sin tierra");
    await waitFor(() => screen() === "— —", "pantalla sin números");
    const banner = await waitFor(() => $("[data-testid=aviso-lienzo]")?.innerText, "aviso sobre el lienzo");
    return message + " | " + banner;
  `);
  await shot("simulacion-error");

  await run(`
    ${EDITOR_POINTER}
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    await waitFor(() => /3[.,]75 mA/.test(screen()), "Ctrl+Z devuelve la tierra y la lectura");
    click("[data-testid=simular-editor]");
    return true;
  `);

  // Archivo: Guardar como, Nuevo y Abrir. En la prueba, los diálogos usan
  // siempre <carpeta de la prueba>/circuito.ohmlab sin preguntar.
  const menu = (command: MenuCommand) => wc.send(CHANNELS.menuCommand, command);
  const savedPath = join(dirname(outFile), "circuito.ohmlab");
  const before: number = await run(`return document.querySelectorAll("[data-component]").length;`);
  menu("save-as");
  const savedTitle: string = await run(`
    return waitFor(() => document.title.startsWith("circuito.ohmlab") && !document.title.includes("•") && document.title, "título tras guardar");
  `);
  const parsed = parseSchematicFile(await readFile(savedPath, "utf8"));
  if (!parsed.ok || parsed.schematic.components.length !== before) {
    throw new Error("El archivo guardado no tiene el circuito: " + (parsed.ok ? parsed.schematic.components.length : parsed.error));
  }
  menu("new");
  await run(`return waitFor(() => !document.querySelector("[data-component]") && document.title.startsWith("Sin título"), "circuito nuevo vacío");`);
  menu("open");
  const reopened: number = await run(`
    return waitFor(() => document.title.startsWith("circuito.ohmlab") && document.querySelectorAll("[data-component]").length, "circuito abierto");
  `);
  if (reopened !== before) throw new Error(`Se guardaron ${before} componentes y se abrieron ${reopened}`);
  // Un archivo dañado no se abre: se explica por qué y el circuito abierto no cambia.
  await writeFile(savedPath, "esto no es un circuito");
  menu("open");
  const brokenFile: string = await run(`return waitFor(() => $("[data-testid=error-archivo]")?.innerText, "aviso de archivo dañado");`);
  const stillThere: number = await run(`return document.querySelectorAll("[data-component]").length;`);
  if (stillThere !== before) throw new Error("Abrir un archivo dañado cambió el circuito");
  await shot("archivo-danado");
  const files = { before, savedTitle, reopened, brokenFile };

  // Voltímetro sobre R2 del divisor: punta roja en "salida", negra en tierra.
  const voltmeter: string = await run(`
    click("[data-view=practice]");
    click("[data-testid=simular]");
    click("circle[data-node=salida]");
    click("circle[data-node='0']");
    return reading(/6 V/);
  `);
  await shot("");

  // Amperímetro intercalado en serie con R1.
  const ammeter: string = await run(`
    click("[data-mode=A]");
    click("[data-part=R1]");
    return reading(/6 mA/);
  `);
  await shot("amperimetro");

  // Un error a propósito: R1 = 0 Ω debe mostrar un mensaje, no números.
  const error: string = await run(`
    const input = document.querySelectorAll(".field input")[1];
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "0");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return (await waitFor(() => $(".diagnostics li.error"), "error")).innerText;
  `);
  await shot("error");

  // Thévenin del puente: sin R5, el ohmímetro entre c y d marca 1,167 kΩ.
  const thevenin: string = await run(`
    [...document.querySelectorAll(".tab")].find((b) => b.innerText.includes("Wheatstone")).click();
    await waitFor(() => $("[data-part=R5]"), "puente");
    click("[data-mode=Ω]");
    $(".check input").click();
    click("circle[data-node=c]");
    click("circle[data-node=d]");
    return reading(/1.167 kΩ/);
  `);
  await shot("thevenin");

  wc.send(CHANNELS.openDiagnostics);
  const report: string = await run(`return (await waitFor(() => $("[data-testid=informe]"), "informe")).innerText;`);
  await shot("diagnostico");

  console.log(JSON.stringify({ selfTest, editor, groundNode, simulation, wheelRotation, noGround, files, voltmeter, ammeter, error, thevenin, report }, null, 2));
  return /mayor que 0/.test(error);
}

async function capture(win: BrowserWindow, file: string) {
  await new Promise((resolve) => setTimeout(resolve, 400)); // deja que se dibuje
  // Fuerza un cuadro nuevo: si la ventana está tapada, Electron puede devolver uno viejo.
  win.webContents.invalidate();
  // Con un límite: si la ventana está minimizada, requestAnimationFrame no llega nunca.
  await win.webContents.executeJavaScript("new Promise((r) => { requestAnimationFrame(() => requestAnimationFrame(r)); setTimeout(r, 500); })");
  const image = await win.webContents.capturePage();
  await writeFile(file, image.toPNG());
}
