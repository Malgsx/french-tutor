const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  compact: (value) => ipcRenderer.send("miette:compact", value),
  hide: () => ipcRenderer.send("miette:hide"),
  onSuspend: (callback) => ipcRenderer.on("miette:suspend", () => callback()),
});
