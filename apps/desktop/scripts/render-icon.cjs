// Dibuja build/icon.svg como PNG de 512×512, que es lo que pide
// electron-builder para crear los íconos de Windows y Linux.
// Uso (desde apps/desktop): npx electron scripts/render-icon.cjs
const { app, BrowserWindow } = require("electron");
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

app.whenReady().then(async () => {
  const svg = readFileSync(join(__dirname, "../build/icon.svg"), "utf8");
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: { offscreen: true },
  });
  const html = `<html><body style="margin:0;background:transparent;overflow:hidden">${svg}</body></html>`;
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const image = (await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 })).resize({ width: 512, height: 512 });
  writeFileSync(join(__dirname, "../build/icon.png"), image.toPNG());
  console.log("build/icon.png", image.getSize());
  app.quit();
});
