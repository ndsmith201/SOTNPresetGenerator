# SOTN Preset Generator

An Electron + React + TypeScript desktop app for creating locally saved Symphony of the Night presets, choosing their options, and previewing their JSON representation.

Presets are stored in the Electron renderer's local storage. The app opens on the preset library; creating or selecting a preset opens the option editor with that preset's saved selections.

## Run locally

Requires Node.js 22.12 or newer.

```bash
npm install
npm start
```

The Electron main process owns SQLite and filesystem access. The React renderer is split into focused components under `src/renderer/components`, and esbuild produces the browser bundle used by the app.
