const { app, BrowserWindow, shell, Notification, session } = require("electron");
const path = require("node:path");
const config = require("./app-config.json");

const PLACEHOLDER = "https://PON-AQUI-LA-URL-DE-TU-WEB";

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 560,
    title: config.appName || "Papus Chat",
    backgroundColor: "#111827",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const target = String(config.webUrl || "").trim();
  if (!target || target === PLACEHOLDER || !/^https:\/\//i.test(target)) {
    win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`
      <html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
      <body style="font-family:Segoe UI,sans-serif;background:#111827;color:#f2f3f5;padding:32px;line-height:1.6">
      <h1>Papus Chat</h1><p>Falta configurar la dirección HTTPS pública de tu web.</p>
      <p>Abre <code>app-config.json</code> y cambia <code>webUrl</code> por la dirección real donde ya funciona Papus Chat.</p>
      <p>Esta aplicación no ha modificado tu web original.</p></body></html>`));
    return;
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("mailto:")) shell.openExternal(url);
    return { action: "deny" };
  });

  // Permisos de cámara/micrófono: solo se conceden a la URL HTTPS configurada.
  const allowedOrigin = new URL(target).origin;
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    let origin = "";
    try { origin = new URL(details.requestingUrl || webContents.getURL()).origin; } catch {}
    const supported = ["media", "notifications", "fullscreen", "display-capture"];
    callback(origin === allowedOrigin && supported.includes(permission));
  });

  win.loadURL(target);
}

app.whenReady().then(() => {
  app.setName(config.appName || "Papus Chat");
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
