# Audio Switcher (macOS)

Minimal audio output switcher for macOS. teenage engineering inspired design.

## Features

- 1-click audio output switching
- Vertical / Horizontal layout switchable (icon-only compact mode)
- Device type icons (speaker, headphones, headset, HDMI, digital, bluetooth)
- Per-device icon override in settings (manual icon selection)
- Hover tooltips in horizontal mode
- Device filtering (show/hide specific devices)
- Always on top (optional)
- System tray integration
- Global hotkey (Alt+A by default)
- Start at login (optional)
- Single instance (second launch focuses existing window)
- Frameless, draggable window

## Prerequisites

### 1. Install Node.js

Install from: https://nodejs.org/ (LTS recommended)

### 2. Install switchaudio-osx

```bash
brew install switchaudio-osx
```

This project uses `SwitchAudioSource` to list and switch output devices.

## Setup

```bash
cd audio-switcher-mac
npm install
npm start
```

## Build

```bash
npm run build
```

Build artifacts are generated in `dist/`.

## Usage

- Click a device to switch audio output
- Drag title bar to move window
- Alt+A to show/hide window
- Layout button to switch vertical/horizontal mode
- Settings button to show/hide devices
- Right-click tray icon for options:
  - Always on Top
  - Start at Login
  - Start Minimized

## Troubleshooting

### "SwitchAudioSource command not found"

Install dependency:

```bash
brew install switchaudio-osx
```

### No devices shown

- Check whether output devices are connected
- Open macOS Sound settings and confirm devices are enabled
- Click refresh in the app

## License

MIT
