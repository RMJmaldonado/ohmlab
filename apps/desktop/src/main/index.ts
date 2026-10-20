// Proceso principal de OhmLab: crea la ventana, el menú, y atiende los
// pedidos de la ventana (simular, autodiagnóstico, copiar, archivos).
import { dirname, join } from "node:path";
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu } from "electron";
import { simulateDc } from "@ohmlab/core";
import { formatSelfTestReport, NgspiceCliEngine, runSelfTest } from "@ohmlab/core/node";
import { CHANNELS, type MenuCommand, type SelfTestResult } from "../shared/api";
import { DocumentFile, fileFromArgs } from "./files";
import { findNgspice } from "./ngspice-path";
import { runSmokeTest } from "./smoke-test";
import { isCircuit, isTrustedSender } from "./validate";

const engine = new NgspiceCliEngine({ executable: findNgspice() });
const smokeFile = process.env.OHMLAB_SMOKE_TEST;

// En la prueba de humo la ventana puede quedar tapada por otras: que siga
// dibujando igual, o las capturas saldrían con un cuadro viejo.
if (smokeFile) {
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
  app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
  app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 760,
    minHeight: 520,
    title: "OhmLab",
    show: false,
    backgroundColor: "#f5f6f8",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      // Lista de seguridad de Electron: la página no tiene acceso a Node
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: !smokeFile,
    },
  });
  win.once("ready-to-show", () => win.show());
  // La ventana solo muestra OhmLab: no abre ni navega a otras páginas.
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(__dirname, "../renderer/index.html"));
  return win;
}

function registerHandlers(win: BrowserWindow, file: DocumentFile) {
  ipcMain.handle(CHANNELS.simulateDc, async (event, circuit: unknown) => {
    if (!isTrustedSender(event.senderFrame)) throw new Error("Origen no permitido");
    if (!isCircuit(circuit)) throw new Error("El circuito recibido no es válido");
    return simulateDc(circuit, engine);
  });

  ipcMain.handle(CHANNELS.selfTest, async (event): Promise<SelfTestResult> => {
    if (!isTrustedSender(event.senderFrame)) throw new Error("Origen no permitido");
    const report = await runSelfTest(engine, app.getVersion());
    return { report, text: formatSelfTestReport(report) };
  });

  ipcMain.handle(CHANNELS.copyText, (event, text: unknown) => {
    if (!isTrustedSender(event.senderFrame)) throw new Error("Origen no permitido");
    if (typeof text === "string" && text.length <= 100_000) clipboard.writeText(text);
  });

  // Archivos: el esquemático que llega se revisa entero antes de escribirlo.
  ipcMain.handle(CHANNELS.saveFile, (event, schematic: unknown, saveAs: unknown) => {
    if (!isTrustedSender(event.senderFrame)) throw new Error("Origen no permitido");
    return file.save(schematic, saveAs === true);
  });
  ipcMain.handle(CHANNELS.openFile, (event) => {
    if (!isTrustedSender(event.senderFrame)) throw new Error("Origen no permitido");
    return file.open();
  });
  ipcMain.handle(CHANNELS.openStartupFile, (event) => {
    if (!isTrustedSender(event.senderFrame)) throw new Error("Origen no permitido");
    return file.pending ? file.open() : { ok: false, canceled: true };
  });
  ipcMain.handle(CHANNELS.newFile, (event) => {
    if (!isTrustedSender(event.senderFrame)) throw new Error("Origen no permitido");
    return file.startNew();
  });
  ipcMain.on(CHANNELS.setDirty, (event, dirty: unknown) => {
    if (isTrustedSender(event.senderFrame) && typeof dirty === "boolean") file.dirty = dirty;
  });
  ipcMain.on(CHANNELS.closeWindow, (event) => {
    if (!isTrustedSender(event.senderFrame)) return;
    file.dirty = false;
    win.close();
  });

  // Antes de cerrar con cambios sin guardar, se pregunta.
  win.on("close", (event) => {
    if (!file.dirty) return;
    event.preventDefault();
    const response = dialog.showMessageBoxSync(win, {
      type: "warning",
      title: "Cambios sin guardar",
      message: `¿Guardar los cambios de «${file.name}» antes de salir?`,
      buttons: ["Guardar", "Salir sin guardar", "Cancelar"],
      defaultId: 0,
      cancelId: 2,
    });
    if (response === 0) win.webContents.send(CHANNELS.menuCommand, "save-and-close" satisfies MenuCommand);
    if (response === 1) {
      file.dirty = false;
      setImmediate(() => win.close());
    }
  });
}

function buildMenu(win: BrowserWindow): Menu {
  const send = (command: MenuCommand) => () => win.webContents.send(CHANNELS.menuCommand, command);
  return Menu.buildFromTemplate([
    {
      label: "Archivo",
      submenu: [
        { label: "Nuevo", accelerator: "CmdOrCtrl+N", click: send("new") },
        { label: "Abrir…", accelerator: "CmdOrCtrl+O", click: send("open") },
        { type: "separator" },
        { label: "Guardar", accelerator: "CmdOrCtrl+S", click: send("save") },
        { label: "Guardar como…", accelerator: "CmdOrCtrl+Shift+S", click: send("save-as") },
        { type: "separator" },
        { role: "quit", label: "Salir" },
      ],
    },
    {
      label: "Ver",
      submenu: [
        { role: "resetZoom", label: "Tamaño normal" },
        { role: "zoomIn", label: "Acercar" },
        { role: "zoomOut", label: "Alejar" },
        { type: "separator" },
        // Ctrl+R gira componentes y F5 simula (atajos habituales en los simuladores), así que recargar va con Ctrl+F5
        { role: "reload", label: "Recargar", accelerator: "CmdOrCtrl+F5" },
        { role: "toggleDevTools", label: "Herramientas de desarrollo" },
      ],
    },
    {
      label: "Simulación",
      submenu: [
        {
          label: "Simular / detener",
          accelerator: "F5",
          click: () => win.webContents.send(CHANNELS.toggleSimulation),
        },
      ],
    },
    {
      label: "Ayuda",
      submenu: [
        { label: "Diagnóstico…", click: () => win.webContents.send(CHANNELS.openDiagnostics) },
        { type: "separator" },
        {
          label: "Acerca de OhmLab",
          click: () =>
            dialog.showMessageBox(win, {
              title: "Acerca de OhmLab",
              message: `OhmLab ${app.getVersion()}`,
              detail:
                "Simulador de circuitos libre y gratuito (licencia MIT).\n" +
                "Motor de simulación: ngspice (licencia BSD).\n" +
                "Desarrollado por estudiantes de la UNT.",
            }),
        },
      ],
    },
  ]);
}

// Una sola ventana de OhmLab: si se abre otro .ohmlab con doble clic, se abre
// en la que ya está (la prueba de humo corre aparte, aunque OhmLab esté abierto).
const firstInstance = smokeFile ? true : app.requestSingleInstanceLock();
if (!firstInstance) app.quit();

app.whenReady().then(() => {
  if (!firstInstance) return;
  const win = createWindow();
  const file = new DocumentFile(win, smokeFile ? dirname(smokeFile) : null);
  // En la prueba de humo solo se abre un archivo al arrancar si se pide (OHMLAB_SMOKE_STARTUP_FILE).
  file.pending = !smokeFile || process.env.OHMLAB_SMOKE_STARTUP_FILE ? fileFromArgs(process.argv) : null;
  registerHandlers(win, file);
  app.on("second-instance", (_event, argv) => {
    if (win.isMinimized()) win.restore();
    win.focus();
    const path = fileFromArgs(argv);
    if (path) {
      file.pending = path;
      win.webContents.send(CHANNELS.menuCommand, "open" satisfies MenuCommand);
    }
  });
  Menu.setApplicationMenu(buildMenu(win));

  if (smokeFile) {
    // El ratón real no debe mezclarse con los clics simulados de la prueba.
    win.setIgnoreMouseEvents(true);
    runSmokeTest(win, smokeFile).then(
      (ok) => app.exit(ok ? 0 : 1),
      (error) => {
        console.error(error);
        app.exit(1);
      },
    );
  }
});

app.on("window-all-closed", () => app.quit());
