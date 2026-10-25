const { contextBridge } = require("electron");

// Puente mínimo y aislado. No expone Node.js ni permite ejecutar comandos desde la web.
contextBridge.exposeInMainWorld("papusDesktop", Object.freeze({
  platform: "windows",
  appName: "Papus Chat"
}));
