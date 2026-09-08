# SOTN Preset Generator

An Electron + React + TypeScript desktop app for creating locally saved Symphony of the Night presets, choosing their options, and previewing their JSON representation.

Presets are stored in the Electron renderer's local storage. The app opens on the preset library; creating or selecting a preset opens the option editor with that preset's saved selections.

Registered options are read-only and have an eye button for viewing and copying their details. On the first launch after this update, all existing options are marked read-only without changing their values or preset selections. Newly created options remain editable across restarts.

The complexity slider's maximum is calculated from all location locks in the selected relic extension and the enabled starting relics. It finds the longest sequence of pickups that each opens at least one new check; setup pickups (such as the first of two required rings) add no step. The final required Vlad pickup adds one completion step unless the required Vlads are already starting relics. Flight methods are interchangeable for movement, while distinct uses such as Mist barriers and Bat with Echo remain required. For example, starting with Bat allows a maximum of eight in Guarded and twelve in Equipment, Extended, or Scenic. This is a maximum based on access rules, not a guarantee of a particular randomized placement. The target and generated JSON are clamped when the extension or starting relics lower the maximum; if no progression remains, the target is 0.

## Run locally

Requires Node.js 22.12 or newer.

```bash
npm install
npm start
```

The Electron main process owns SQLite and filesystem access. The React renderer is split into focused components under `src/renderer/components`, and esbuild produces the browser bundle used by the app.

## Relic location reference

The [check lists by extension](docs/relic-location-extensions.md) are available as `RELIC_LOCATION_CHECKS` in `src/renderer/relic-location-checks.ts`. Preview and export include only the selected extension's checks from the template, preserving their order and fields before applying starting-relic adjustments. Switching extensions rebuilds from the original template. Raw JSON lock overrides are also filtered to the selected extension. Complexity uses the same extension membership, including allowed checks after Trio. It recalculates on extension or starting-relic changes.

Starting relics also clear a check's `escapeRequires` when any complete alternative is satisfied (all relics in a `+` combination must be enabled). Unsatisfied escape lists stay intact, entry locks remain independent, and deselecting relics restores the template requirements.

## Tests

```bash
npm test
```

This compiles TypeScript and runs the lock regression tests, including every template location with Soul of Bat, Gravity Boots + Leap Stone, and Form of Mist + Power of Mist enabled separately. The tests use real options from the SQL dump and explicit expected locks in `tests/fixtures/flight-location-locks.cjs`. Update those expectations when intentionally changing the rules or adding locations; the coverage check rejects missing or duplicate locations.
