// Puente entre la ventana y el proceso principal. Solo expone estas
// funciones concretas (lista de seguridad de Electron: contextBridge).
import { contextBridge, ipcRenderer } from "electron";
import { CHANNELS, MENU_COMMANDS, type MenuCommand, type OhmlabApi } from "../shared/api";

const api: OhmlabApi = {
  simulateDc: (circuit) => ipcRenderer.invoke(CHANNELS.simulateDc, circuit),
  selfTest: () => ipcRenderer.invoke(CHANNELS.selfTest),
  copyText: (text) => ipcRenderer.invoke(CHANNELS.copyText, text),
  onOpenDiagnostics: (callback) => {
    const listener = () => callback();
    ipcRenderer.on(CHANNELS.openDiagnostics, listener);
    return () => ipcRenderer.removeListener(CHANNELS.openDiagnostics, listener);
  },
  saveFile: (schematic, saveAs) => ipcRenderer.invoke(CHANNELS.saveFile, schematic, saveAs),
  openFile: () => ipcRenderer.invoke(CHANNELS.openFile),
  openStartupFile: () => ipcRenderer.invoke(CHANNELS.openStartupFile),
  newFile: () => ipcRenderer.invoke(CHANNELS.newFile),
  setDirty: (dirty) => ipcRenderer.send(CHANNELS.setDirty, dirty),
  closeWindow: () => ipcRenderer.send(CHANNELS.closeWindow),
  onMenuCommand: (callback) => {
    const listener = (_event: unknown, command: MenuCommand) => {
      if (MENU_COMMANDS.includes(command)) callback(command);
    };
    ipcRenderer.on(CHANNELS.menuCommand, listener);
    return () => ipcRenderer.removeListener(CHANNELS.menuCommand, listener);
  },
  onToggleSimulation: (callback) => {
    const listener = () => callback();
    ipcRenderer.on(CHANNELS.toggleSimulation, listener);
    return () => ipcRenderer.removeListener(CHANNELS.toggleSimulation, listener);
  },
};

contextBridge.exposeInMainWorld("ohmlab", api);
