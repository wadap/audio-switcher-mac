const { ipcRenderer } = require('electron');

const deviceList = document.getElementById('deviceList');
const refreshBtn = document.getElementById('refreshBtn');
const minimizeBtn = document.getElementById('minimizeBtn');
const closeBtn = document.getElementById('closeBtn');
const hotkeyDisplay = document.getElementById('hotkeyDisplay');
const statusBar = document.getElementById('statusBar');
const settingsView = document.getElementById('settingsView');
const settingsList = document.getElementById('settingsList');
const settingsBtn = document.getElementById('settingsBtn');
const settingsDoneBtn = document.getElementById('settingsDoneBtn');
const alwaysOnTopToggle = document.getElementById('alwaysOnTopToggle');
const layoutBtn = document.getElementById('layoutBtn');
const layoutIcon = document.getElementById('layoutIcon');
const container = document.querySelector('.container');
const deviceTooltip = document.getElementById('deviceTooltip');
const tooltipName = document.getElementById('tooltipName');
const tooltipDetail = document.getElementById('tooltipDetail');

let devices = [];
let allDevices = []; // All devices including disabled ones
let enabledDevices = null; // null = all enabled, array = specific IDs
let deviceIconOverrides = {};
let alwaysOnTop = true;
let currentLayout = 'vertical'; // 'vertical' or 'horizontal'
const ICON_TYPE_ORDER = ['auto', 'speaker', 'headset', 'headphones', 'display', 'digital', 'bluetooth'];
const ICON_TYPE_LABELS = {
  auto: 'Auto',
  speaker: 'Speaker',
  headset: 'Headset',
  headphones: 'Headphones',
  display: 'Display',
  digital: 'Digital',
  bluetooth: 'Bluetooth'
};

// Load devices
async function loadDevices() {
  deviceList.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <span>Scanning devices...</span>
    </div>
  `;

  try {
    const [result, savedEnabledDevices, knownDevices, savedIconOverrides] = await Promise.all([
      ipcRenderer.invoke('get-audio-devices'),
      ipcRenderer.invoke('get-enabled-devices'),
      ipcRenderer.invoke('get-known-devices'),
      ipcRenderer.invoke('get-device-icon-overrides')
    ]);

    if (result.error) {
      showError(result.error);
      return;
    }

    allDevices = result.devices;
    enabledDevices = savedEnabledDevices;
    deviceIconOverrides = savedIconOverrides || {};
    const allDeviceIds = allDevices.map(d => d.id);

    // Update known devices list
    const updatedKnownDevices = [...new Set([...knownDevices, ...allDeviceIds])];
    if (updatedKnownDevices.length !== knownDevices.length) {
      await ipcRenderer.invoke('set-known-devices', updatedKnownDevices);
    }

    // Filter devices based on enabled list
    if (enabledDevices === null) {
      devices = allDevices;
    } else {
      // Only auto-add truly new devices (never seen before)
      const newDeviceIds = allDeviceIds.filter(id => !knownDevices.includes(id));
      if (newDeviceIds.length > 0) {
        enabledDevices = enabledDevices.concat(newDeviceIds);
      }
      // Remove stale device IDs that no longer exist
      enabledDevices = enabledDevices.filter(id => allDeviceIds.includes(id));
      // Save the cleaned-up list
      await ipcRenderer.invoke('set-enabled-devices', enabledDevices);

      devices = allDevices.filter(d => enabledDevices.includes(d.id));
    }

    renderDevices();
  } catch (error) {
    showError(error.message);
  }
}

function showError(message) {
  const isCommandError = message.includes('SwitchAudioSource');

  deviceList.innerHTML = `
    <div class="error">
      <div class="error-title">⚠ Setup Required</div>
      <div class="error-message">
        ${isCommandError
          ? 'SwitchAudioSource command not found.<br>Install with Homebrew:<br><br><code>brew install switchaudio-osx</code>'
          : message
        }
      </div>
      <button class="error-action" onclick="loadDevices()">Retry</button>
    </div>
  `;
  resizeWindowToFit(2); // Compact size for error state
}

function renderDevices() {
  // Sort devices alphabetically by display name
  devices.sort((a, b) => {
    const nameA = parseDeviceName(a.name).type.toLowerCase();
    const nameB = parseDeviceName(b.name).type.toLowerCase();
    return nameA.localeCompare(nameB);
  });

  if (devices.length === 0) {
    deviceList.innerHTML = `
      <div class="empty">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
          <path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
        </svg>
        <div>No audio devices found</div>
      </div>
    `;
    resizeWindowToFit(2); // Compact size for empty state
    return;
  }
  
  deviceList.innerHTML = devices.map((device, index) => {
    const parsed = parseDeviceName(device.name);
    const icon = getDeviceIcon(device.name, device.id);
    return `
    <div class="device-item ${device.isDefault ? 'active' : ''}"
         data-id="${device.id}"
         data-index="${index}">
      <div class="device-indicator"></div>
      <svg class="device-icon-svg" viewBox="0 0 24 24">${icon}</svg>
      <div class="device-info">
        <div class="device-name">${escapeHtml(parsed.type)}</div>
        <div class="device-type">${escapeHtml(parsed.hardware) || 'Playback Device'}</div>
      </div>
    </div>
  `;
  }).join('');
  
  // Add click handlers and tooltip hover
  document.querySelectorAll('.device-item').forEach((item, i) => {
    item.addEventListener('click', () => switchDevice(item.dataset.id, item.dataset.index));

    item.addEventListener('mouseenter', () => {
      if (currentLayout !== 'horizontal') return;
      const parsed = parseDeviceName(devices[i].name);
      tooltipName.textContent = parsed.type;
      tooltipDetail.textContent = parsed.hardware || 'Playback Device';

      const rect = item.getBoundingClientRect();
      deviceTooltip.style.display = 'block';
      // Position below the item, centered
      const tipRect = deviceTooltip.getBoundingClientRect();
      let left = rect.left + rect.width / 2 - tipRect.width / 2;
      // Clamp to viewport
      left = Math.max(4, Math.min(left, window.innerWidth - tipRect.width - 4));
      deviceTooltip.style.left = left + 'px';
      deviceTooltip.style.top = (rect.bottom + 8) + 'px';
    });

    item.addEventListener('mouseleave', () => {
      deviceTooltip.style.display = 'none';
    });
  });

  // Resize window to fit devices
  resizeWindowToFit(devices.length);
}

function parsePx(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getListHeight(listElement, itemSelector, count, fallbackItemHeight = 54) {
  const styles = window.getComputedStyle(listElement);
  const maxHeightRaw = parsePx(styles.maxHeight);
  const hasMaxHeight = maxHeightRaw > 0 && styles.maxHeight !== 'none';
  const naturalFromDom = Math.ceil(listElement.scrollHeight);
  const sample = listElement.querySelector(itemSelector);
  const itemHeight = sample ? sample.getBoundingClientRect().height : fallbackItemHeight;
  const naturalFromEstimate = Math.ceil(itemHeight * count);
  const natural = Math.max(naturalFromDom, naturalFromEstimate);
  return hasMaxHeight ? Math.min(natural, maxHeightRaw) : natural;
}

function resizeUsingContainer(width, minHeight, maxHeight) {
  // Use actual rendered content height to avoid clipping by a few pixels.
  let height = Math.ceil(container.scrollHeight + 8);
  height = Math.max(minHeight, Math.min(maxHeight, height));
  ipcRenderer.send('resize-window', width, height);
}

function resizeWindowToFit(deviceCount) {
  if (currentLayout === 'horizontal') {
    const titleBar = document.querySelector('.title-bar');

    const listStyles = window.getComputedStyle(deviceList);
    const paddingX = parsePx(listStyles.paddingLeft) + parsePx(listStyles.paddingRight);
    const gap = parsePx(listStyles.columnGap || listStyles.gap);
    const sampleItem = deviceList.querySelector('.device-item');
    const itemWidth = sampleItem ? sampleItem.getBoundingClientRect().width : 48;
    const listWidth = paddingX + (deviceCount * itemWidth) + (Math.max(0, deviceCount - 1) * gap);

    const titleWidth = Math.ceil(titleBar.scrollWidth);
    const statusWidth = Math.ceil(statusBar.scrollWidth);
    const minWidth = 160;
    const maxWidth = 600;
    const minHeight = 130;
    const maxHeight = 260;

    let width = Math.ceil(Math.max(listWidth, titleWidth, statusWidth) + 2);
    width = Math.max(minWidth, Math.min(maxWidth, width));
    resizeUsingContainer(width, minHeight, maxHeight);
  } else {
    const width = 280;
    const minHeight = 150;
    const maxHeight = 600;
    // Keep list height constrained by CSS max-height before reading container size.
    getListHeight(deviceList, '.device-item', deviceCount, 54);
    resizeUsingContainer(width, minHeight, maxHeight);
  }
}

function updateLayoutIcon() {
  if (currentLayout === 'vertical') {
    // Show horizontal icon (switch to horizontal)
    layoutIcon.innerHTML = `
      <rect x="2" y="8" width="6" height="8" rx="1"/>
      <rect x="9" y="8" width="6" height="8" rx="1"/>
      <rect x="16" y="8" width="6" height="8" rx="1"/>
    `;
    layoutBtn.title = 'Switch to horizontal layout';
  } else {
    // Show vertical icon (switch to vertical)
    layoutIcon.innerHTML = `
      <rect x="4" y="2" width="16" height="5" rx="1"/>
      <rect x="4" y="9" width="16" height="5" rx="1"/>
      <rect x="4" y="16" width="16" height="5" rx="1"/>
    `;
    layoutBtn.title = 'Switch to vertical layout';
  }
}

async function toggleLayout() {
  currentLayout = currentLayout === 'vertical' ? 'horizontal' : 'vertical';
  await ipcRenderer.invoke('set-layout', currentLayout);
  applyLayout();
}

function applyLayout() {
  if (currentLayout === 'horizontal') {
    container.classList.add('horizontal');
  } else {
    container.classList.remove('horizontal');
  }
  updateLayoutIcon();
  resizeWindowToFit(devices.length);
}

function getAutoIconType(name) {
  if (/headset|ヘッドセット/i.test(name)) {
    return 'headset';
  }
  if (/headphone|kopfh|ヘッドホン|ヘッドフォン|イヤホン|イヤフォン/i.test(name)) {
    return 'headphones';
  }
  if (/hdmi|display|monitor|tv|tele|モニター|テレビ/i.test(name)) {
    return 'display';
  }
  if (/digital|spdif|optical|toslink|デジタル|光/i.test(name)) {
    return 'digital';
  }
  if (/bluetooth|bt /i.test(name)) {
    return 'bluetooth';
  }
  return 'speaker';
}

function getIconPathByType(iconType) {
  if (iconType === 'headset') {
    return '<path d="M4 11C4 5.48 7.58 2 12 2s8 3.48 8 9h-2c0-3.31-2.69-6-6-6s-6 2.69-6 6H4z"/><rect x="1" y="11" width="5" height="9" rx="2"/><rect x="18" y="11" width="5" height="9" rx="2"/><path d="M3 18v3c0 1.66 1.34 3 3 3h5v-2H6c-.55 0-1-.45-1-1v-3H3z"/>';
  }
  if (iconType === 'headphones') {
    return '<path d="M4 11C4 5.48 7.58 2 12 2s8 3.48 8 9h-2c0-3.31-2.69-6-6-6s-6 2.69-6 6H4z"/><rect x="1" y="11" width="5" height="9" rx="2"/><rect x="18" y="11" width="5" height="9" rx="2"/>';
  }
  if (iconType === 'display') {
    return '<path d="M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7v2H8v2h8v-2h-2v-2h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H3V4h18v12z"/>';
  }
  if (iconType === 'digital') {
    return '<circle cx="12" cy="12" r="3"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/><path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z"/>';
  }
  if (iconType === 'bluetooth') {
    return '<path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/>';
  }
  return '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
}

function getEffectiveIconType(name, deviceId) {
  return deviceIconOverrides[deviceId] || getAutoIconType(name);
}

function getDeviceIcon(name, deviceId) {
  return getIconPathByType(getEffectiveIconType(name, deviceId));
}

function parseDeviceName(name) {
  // Extract device type and hardware name
  // Example: "Speakers (Realtek High Definition Audio)" -> { type: "Speakers", hardware: "Realtek High Definition Audio" }
  const match = name.match(/^(.+?)\s*\((.+)\)\s*$/);

  if (match) {
    const type = match[1].trim();
    let hardware = match[2].trim()
      .replace(/High Definition Audio$/i, '')
      .replace(/Audio$/i, '')
      .trim();
    return { type, hardware: hardware || match[2].trim() };
  }

  // No parentheses found, use the whole name as type
  return {
    type: name.replace(/High Definition Audio Device/gi, '').replace(/Audio Device/gi, '').trim(),
    hardware: ''
  };
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function switchDevice(deviceId, index) {
  const items = document.querySelectorAll('.device-item');
  const targetItem = items[index];
  
  if (targetItem.classList.contains('active')) return;
  
  // Add switching animation
  targetItem.classList.add('switching');
  
  try {
    const result = await ipcRenderer.invoke('set-audio-device', deviceId);
    
    if (result.success) {
      // Update UI
      items.forEach(item => item.classList.remove('active'));
      targetItem.classList.add('active');
      
      // Update devices array
      devices.forEach(d => d.isDefault = false);
      devices[index].isDefault = true;
    }
  } catch (error) {
    console.error('Failed to switch device:', error);
  }
  
  setTimeout(() => targetItem.classList.remove('switching'), 300);
}

// Load settings
async function loadSettings() {
  const settings = await ipcRenderer.invoke('get-settings');
  hotkeyDisplay.textContent = settings.hotkey;
  alwaysOnTop = settings.alwaysOnTop;
}

// Settings view functions
async function openSettings() {
  // Refresh settings state
  const settings = await ipcRenderer.invoke('get-settings');
  alwaysOnTop = settings.alwaysOnTop;
  updateAlwaysOnTopToggle();

  // Settings always uses vertical layout
  container.classList.remove('horizontal');

  deviceList.classList.add('hidden');
  settingsView.classList.add('active');
  renderSettings();
}

function updateAlwaysOnTopToggle() {
  if (alwaysOnTop) {
    alwaysOnTopToggle.classList.add('active');
  } else {
    alwaysOnTopToggle.classList.remove('active');
  }
}

async function toggleAlwaysOnTop() {
  alwaysOnTop = !alwaysOnTop;
  await ipcRenderer.invoke('set-setting', 'alwaysOnTop', alwaysOnTop);
  updateAlwaysOnTopToggle();
}

function closeSettings() {
  settingsView.classList.remove('active');
  deviceList.classList.remove('hidden');
  // Restore layout
  applyLayout();
  loadDevices();
}

function renderSettings() {
  settingsList.innerHTML = allDevices.map(device => {
    const parsed = parseDeviceName(device.name);
    const isEnabled = enabledDevices === null || enabledDevices.includes(device.id);
    const overrideType = deviceIconOverrides[device.id] || 'auto';
    const effectiveType = getEffectiveIconType(device.name, device.id);
    return `
    <div class="settings-item ${isEnabled ? 'enabled' : ''}" data-id="${device.id}">
      <div class="settings-checkbox">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div class="settings-device-info">
        <div class="settings-device-name">${escapeHtml(parsed.type)}</div>
        <div class="settings-device-detail">${escapeHtml(parsed.hardware) || 'Playback Device'}</div>
      </div>
      <button class="settings-icon-picker" data-icon-device-id="${device.id}" title="Cycle icon type">
        <svg class="device-icon-svg" viewBox="0 0 24 24">${getIconPathByType(effectiveType)}</svg>
        <span class="settings-icon-label">${escapeHtml(ICON_TYPE_LABELS[overrideType])}</span>
      </button>
    </div>
    `;
  }).join('');

  // Add click handlers
  document.querySelectorAll('.settings-item').forEach(item => {
    item.addEventListener('click', () => toggleDevice(item.dataset.id));
  });
  document.querySelectorAll('.settings-icon-picker').forEach(button => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      await cycleDeviceIconType(button.dataset.iconDeviceId);
    });
  });

  getListHeight(settingsList, '.settings-item', allDevices.length, 50);
  resizeUsingContainer(280, 170, 620);
}

async function toggleDevice(deviceId) {
  // Initialize enabledDevices if null (first time toggling)
  if (enabledDevices === null) {
    enabledDevices = allDevices.map(d => d.id);
    // Mark all current devices as known
    await ipcRenderer.invoke('set-known-devices', [...enabledDevices]);
  }

  const index = enabledDevices.indexOf(deviceId);
  if (index > -1) {
    // Don't allow disabling all devices
    if (enabledDevices.length > 1) {
      enabledDevices.splice(index, 1);
    }
  } else {
    enabledDevices.push(deviceId);
  }

  // Save to store
  await ipcRenderer.invoke('set-enabled-devices', enabledDevices);

  // Update UI
  renderSettings();
}

async function cycleDeviceIconType(deviceId) {
  const current = deviceIconOverrides[deviceId] || 'auto';
  const currentIndex = ICON_TYPE_ORDER.indexOf(current);
  const nextType = ICON_TYPE_ORDER[(currentIndex + 1) % ICON_TYPE_ORDER.length];

  if (nextType === 'auto') {
    delete deviceIconOverrides[deviceId];
  } else {
    deviceIconOverrides[deviceId] = nextType;
  }

  await ipcRenderer.invoke('set-device-icon-override', deviceId, nextType);
  renderSettings();
}

// Event listeners
refreshBtn.addEventListener('click', loadDevices);

minimizeBtn.addEventListener('click', () => {
  ipcRenderer.send('close-window');
});

closeBtn.addEventListener('click', () => {
  ipcRenderer.send('close-window');
});

settingsBtn.addEventListener('click', openSettings);
settingsDoneBtn.addEventListener('click', closeSettings);
alwaysOnTopToggle.addEventListener('click', toggleAlwaysOnTop);
layoutBtn.addEventListener('click', toggleLayout);

// Initialize
async function init() {
  currentLayout = await ipcRenderer.invoke('get-layout') || 'vertical';
  applyLayout();
  loadDevices();
  loadSettings();
}
init();

// Auto-refresh when window becomes visible
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !settingsView.classList.contains('active')) {
    loadDevices();
  }
});