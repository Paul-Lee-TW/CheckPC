const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const http = require('http');

process.env.PORT = '3001';
process.env.NODE_ENV = 'production';

let mainWindow;

function getAppRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar');
  }
  return path.join(__dirname, '..');
}

function startServer() {
  return new Promise((resolve, reject) => {
    const appRoot = getAppRoot();
    process.env.CHECKPC_ROOT = appRoot;

    try {
      require(path.join(appRoot, 'src', 'server.js'));
    } catch (err) {
      return reject(err);
    }

    // Wait for server to be ready
    const check = (attempts) => {
      if (attempts <= 0) return resolve();
      http.get('http://localhost:3001/api/health', (res) => {
        if (res.statusCode === 200) resolve();
        else setTimeout(() => check(attempts - 1), 300);
      }).on('error', () => {
        setTimeout(() => check(attempts - 1), 300);
      });
    };
    check(20);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'CheckPC',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    show: false,
  });

  mainWindow.loadURL('http://localhost:3001');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      await startServer();
      createWindow();
    } catch (err) {
      dialog.showErrorBox('CheckPC Startup Error', err.message);
      app.quit();
    }
  });
}

app.on('window-all-closed', () => {
  app.quit();
});
