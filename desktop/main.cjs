const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  session,
  powerMonitor,
  screen,
  dialog,
  systemPreferences,
} = require("electron");
const path = require("node:path");
// The desktop process deliberately does not read .env or the OpenAI key.
const origin = "http://localhost:3030";
let window;
let tray;
let quitting = false;
function allowed(event) {
  return (
    event.sender === window?.webContents &&
    event.senderFrame?.url.startsWith(`${origin}/`)
  );
}
function suspend() {
  window?.webContents.send("miette:suspend");
}
function show() {
  window?.show();
  window?.focus();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", show);
  app.whenReady().then(async () => {
    if (process.platform === "darwin") app.dock.hide();
    const icon = nativeImage.createFromPath(
      path.join(__dirname, "trayTemplate.png"),
    );
    icon.setTemplateImage(true);
    tray = new Tray(icon);
    tray.setToolTip("Miette — French practice");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Show Miette", click: show },
        {
          label: "Hide (ends microphone)",
          click: () => {
            suspend();
            window?.hide();
          },
        },
        { type: "separator" },
        { label: "Quit Miette", click: () => app.quit() },
      ]),
    );
    tray.on("click", show);
    window = new BrowserWindow({
      width: 450,
      height: 850,
      minWidth: 220,
      minHeight: 280,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        backgroundThrottling: true,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event, url) => {
      if (url !== `${origin}/`) event.preventDefault();
    });
    window.webContents.on("will-attach-webview", (event) =>
      event.preventDefault(),
    );
    session.defaultSession.setPermissionCheckHandler(
      (_contents, permission, requestingOrigin) =>
        permission === "media" && requestingOrigin === origin,
    );
    session.defaultSession.setPermissionRequestHandler(
      async (contents, permission, callback, details) => {
        const permitted =
          contents === window.webContents &&
          permission === "media" &&
          new URL(details.requestingUrl).origin === origin &&
          details.mediaTypes?.length === 1 &&
          details.mediaTypes[0] === "audio";
        if (!permitted) {
          callback(false);
          return;
        }
        if (process.platform === "darwin")
          callback(await systemPreferences.askForMediaAccess("microphone"));
        else callback(true);
      },
    );
    ipcMain.on("miette:compact", (event, value) => {
      if (!allowed(event) || typeof value !== "boolean") return;
      const bounds = window.getBounds(),
        area = screen.getDisplayMatching(bounds).workArea;
      const width = value ? 230 : 450,
        height = value ? 280 : Math.min(850, area.height);
      window.setBounds({
        x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
        y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
        width,
        height,
      });
    });
    ipcMain.on("miette:hide", (event) => {
      if (allowed(event)) {
        suspend();
        window.hide();
      }
    });
    window.on("close", (event) => {
      if (!quitting) {
        event.preventDefault();
        suspend();
        window.hide();
      }
    });
    powerMonitor.on("suspend", suspend);
    powerMonitor.on("lock-screen", suspend);
    window.webContents.on("render-process-gone", () => window.hide());
    try {
      await window.loadURL(`${origin}/`);
      show();
    } catch {
      dialog.showErrorBox(
        "Could not reach the Miette server",
        "Close this app, then run npm run desktop from the French Tutor folder. That command starts the local server and waits for it before opening Miette. Keep its Terminal open while using the app.",
      );
      app.quit();
    }
  });
  app.on("before-quit", () => {
    quitting = true;
    suspend();
  });
  app.on("window-all-closed", () => {
    /* Menu-bar lifecycle: Quit is explicit. */
  });
}
