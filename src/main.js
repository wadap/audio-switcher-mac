const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  nativeImage
} = require('electron');
const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const Store = require('electron-store');

const execFileAsync = promisify(execFile);
const SWITCH_AUDIO_SOURCE_CANDIDATES = [
  'SwitchAudioSource',
  '/opt/homebrew/bin/SwitchAudioSource',
  '/usr/local/bin/SwitchAudioSource'
];

const store = new Store({
  defaults: {
    alwaysOnTop: true,
    startMinimized: false,
    hotkey: 'Alt+A',
    windowPosition: null,
    autoLaunch: false,
    enabledDevices: null,
    knownDevices: [],
    layout: 'vertical',
    deviceIconOverrides: {}
  }
});

let mainWindow;
let tray;
let isQuitting = false;
let switchAudioSourcePath = null;

function createWindow() {
  const savedPosition = store.get('windowPosition');
  const layout = store.get('layout');
  const isHorizontal = layout === 'horizontal';

  mainWindow = new BrowserWindow({
    width: isHorizontal ? 300 : 280,
    height: isHorizontal ? 140 : 400,
    x: savedPosition?.x,
    y: savedPosition?.y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: store.get('alwaysOnTop'),
    skipTaskbar: true,
    show: !store.get('startMinimized'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('moved', () => {
    const [x, y] = mainWindow.getPosition();
    store.set('windowPosition', { x, y });
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  tray = new Tray(createTrayIcon());

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show/Hide',
      click: () => toggleWindowVisibility()
    },
    { type: 'separator' },
    {
      label: 'Always on Top',
      type: 'checkbox',
      checked: store.get('alwaysOnTop'),
      click: (item) => {
        store.set('alwaysOnTop', item.checked);
        mainWindow.setAlwaysOnTop(item.checked);
      }
    },
    {
      label: 'Start at Login',
      type: 'checkbox',
      checked: store.get('autoLaunch'),
      click: (item) => setAutoLaunch(item.checked)
    },
    {
      label: 'Start Minimized',
      type: 'checkbox',
      checked: store.get('startMinimized'),
      click: (item) => store.set('startMinimized', item.checked)
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Audio Switcher');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => toggleWindowVisibility());
}

function createTrayIcon() {
  const traySvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
      <path fill="#000000" d="M3 9v6h4l5 5V4L7 9H3zm11.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM12 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
    </svg>
  `;
  const image = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(traySvg).toString('base64')}`
  );

  const baseImage = image.isEmpty()
    ? nativeImage.createFromNamedImage('NSTouchBarAudioOutputVolumeHighTemplate', [24, 24])
    : image;
  const resized = baseImage.resize({ width: 16, height: 16, quality: 'best' });
  resized.setTemplateImage(true);
  return resized;
}

function toggleWindowVisibility() {
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function setAutoLaunch(enable) {
  app.setLoginItemSettings({ openAtLogin: enable });
  store.set('autoLaunch', enable);
}

function registerHotkey() {
  const hotkey = store.get('hotkey');
  globalShortcut.unregisterAll();

  try {
    globalShortcut.register(hotkey, () => toggleWindowVisibility());
  } catch (error) {
    console.error('Failed to register hotkey:', error);
  }
}

async function runSwitchAudioSource(args) {
  for (const command of switchAudioSourcePath ? [switchAudioSourcePath] : SWITCH_AUDIO_SOURCE_CANDIDATES) {
    try {
      const { stdout } = await execFileAsync(command, args, {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024
      });
      switchAudioSourcePath = command;
      return { ok: true, stdout: stdout.trim() };
    } catch (error) {
      if (error.code === 'ENOENT') {
        continue;
      }

      const stderr = (error.stderr || '').toString().trim();
      const stdout = (error.stdout || '').toString().trim();
      return { ok: false, error: stderr || stdout || error.message };
    }
  }

  return {
    ok: false,
    error: 'SwitchAudioSource command not found. Install with: brew install switchaudio-osx'
  };
}

ipcMain.handle('get-audio-devices', async () => {
  const listResult = await runSwitchAudioSource(['-a', '-t', 'output']);
  if (!listResult.ok) {
    return { devices: [], error: listResult.error };
  }

  const currentResult = await runSwitchAudioSource(['-c', '-t', 'output']);
  if (!currentResult.ok) {
    return { devices: [], error: currentResult.error };
  }

  const current = currentResult.stdout;
  const devices = listResult.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => ({
      id: name,
      name,
      isDefault: name === current
    }));

  return { devices };
});

ipcMain.handle('set-audio-device', async (event, deviceId) => {
  const result = await runSwitchAudioSource(['-s', deviceId, '-t', 'output']);
  if (!result.ok) {
    return { success: false, error: result.error };
  }
  return { success: true };
});

ipcMain.handle('get-settings', () => {
  const loginSettings = app.getLoginItemSettings();
  const autoLaunch = Boolean(loginSettings.openAtLogin);
  if (autoLaunch !== store.get('autoLaunch')) {
    store.set('autoLaunch', autoLaunch);
  }

  return {
    alwaysOnTop: store.get('alwaysOnTop'),
    startMinimized: store.get('startMinimized'),
    hotkey: store.get('hotkey'),
    autoLaunch
  };
});

ipcMain.handle('set-setting', (event, key, value) => {
  store.set(key, value);

  if (key === 'alwaysOnTop') {
    mainWindow.setAlwaysOnTop(value);
  } else if (key === 'hotkey') {
    registerHotkey();
  } else if (key === 'autoLaunch') {
    setAutoLaunch(value);
  }

  return true;
});

ipcMain.on('close-window', () => {
  mainWindow.hide();
});

ipcMain.handle('get-enabled-devices', () => store.get('enabledDevices'));
ipcMain.handle('set-enabled-devices', (event, deviceIds) => {
  store.set('enabledDevices', deviceIds);
  return true;
});
ipcMain.handle('get-known-devices', () => store.get('knownDevices'));
ipcMain.handle('set-known-devices', (event, deviceIds) => {
  store.set('knownDevices', deviceIds);
  return true;
});
ipcMain.on('resize-window', (event, width, height) => mainWindow.setSize(width, height));
ipcMain.handle('get-layout', () => store.get('layout'));
ipcMain.handle('set-layout', (event, layout) => {
  store.set('layout', layout);
  return true;
});
ipcMain.handle('get-device-icon-overrides', () => store.get('deviceIconOverrides') || {});
ipcMain.handle('set-device-icon-override', (event, deviceId, iconType) => {
  const overrides = store.get('deviceIconOverrides') || {};
  if (!iconType || iconType === 'auto') {
    delete overrides[deviceId];
  } else {
    overrides[deviceId] = iconType;
  }
  store.set('deviceIconOverrides', overrides);
  return true;
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    const loginSettings = app.getLoginItemSettings();
    if (loginSettings.openAtLogin !== store.get('autoLaunch')) {
      store.set('autoLaunch', Boolean(loginSettings.openAtLogin));
    }

    createWindow();
    createTray();
    registerHotkey();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
}
