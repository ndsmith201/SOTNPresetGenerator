# SOTN Preset Generator

An Electron + React + TypeScript desktop app for creating locally saved Symphony of the Night presets, choosing their options, and previewing their JSON representation.

Presets are stored in the Electron renderer's local storage. The app opens on the preset library; creating or selecting a preset opens the option editor with that preset's saved selections.

When a SOTNRando directory is configured, the library also lists the JSON files in its `presets` folder under **Installed presets**. These are read-only: you can view or copy their original JSON, or use them as a starting template in the new preset dialog. The default `preset-template` is always available. Use **Refresh** to pick up external changes; unreadable JSON files are reported separately.

Drafts created from installed presets save their own copy of the source JSON, preserving existing settings and adding missing built-in options with the app's defaults to the generated JSON. Generated copies omit `inherits` and replace `lockLocation` with the bundled template's checks for the selected relic extension, including when reopening an existing draft. Complexity and starting-relic adjustments use those replacement locks. Drafts remain available after restarting or changing the configured directory. Export creates a new file and rejects existing filenames, so rename a draft before exporting if its name conflicts with an installed preset.

Registered options are read-only and have an eye button for viewing and copying their details. On the first launch after this update, all existing options are marked read-only without changing their values or preset selections. Newly created options remain editable across restarts.

The complexity slider's maximum is calculated from all location locks in the selected relic extension and the enabled starting relics. It finds the longest sequence of pickups that each opens at least one new check; setup pickups (such as the first of two required rings) add no step. The final required Vlad pickup adds one completion step unless the required Vlads are already starting relics. Flight methods are interchangeable for movement, while distinct uses such as Mist barriers and Bat with Echo remain required. For example, starting with Bat allows a maximum of eight in Guarded and twelve in Equipment, Extended, or Scenic. This is a maximum based on access rules, not a guarantee of a particular randomized placement. The target and generated JSON are clamped when the extension or starting relics lower the maximum; if no progression remains, the target is 0.

## Run locally

Requires Node.js 22.12 or newer.

The lockfile includes security overrides for Forge's transitive dependencies: `tar` 7.5.22, `tmp` 0.2.7, and `extract-zip` replaced by `@electron-internal/extract-zip` 1.0.5. The [Electron ZIP extractor](https://github.com/electron/extract-zip) provides path and symlink containment for Electron archives. These pins keep the stable Forge release compatible with patched tooling; review them when upgrading Forge. Release CI runs `npm audit` and stops if it reports vulnerabilities.

```bash
npm install
npm start
```

The Electron main process owns SQLite and filesystem access. The React renderer is split into focused components under `src/renderer/components`, and esbuild produces the browser bundle used by the app.

## Windows releases

Electron Forge packages the app as a Windows x64 Squirrel installer and a portable ZIP. Build locally on Windows with:

```bash
npm ci
npm test
npm run make -- --platform=win32 --arch=x64
```

Distributables appear in `out/make/`. `npm run package` creates the unpacked application, and `npm start` launches Forge in development mode. Forge runs the TypeScript and renderer build automatically before packaging or starting.

Local packaging automatically exports your current `%APPDATA%/sotn-preset-generator/options.sqlite` to `database/options-dump.sql`. Set `SOTN_OPTIONS_DATABASE` to use another database. Export opens the source read-only and includes committed changes even while the app is open. A missing or invalid source stops packaging. Every installer and ZIP bundles the snapshot, and `options-dump.sql` is also uploaded as a separate release asset.

On first launch, the app preloads the snapshot's complete options catalog, including IDs, descriptions, write data, and read-only flags. Existing installations keep their catalog, including edits and deletions; updates do not reimport the release snapshot.

The **Release Windows** GitHub Actions workflow publishes to this repository's **GitHub Releases** when a `v*` tag is pushed. The tag must match `package.json` exactly and point to the checked-out commit. After committing the application and workflow changes, a typical release is:

```bash
npm version patch
git push origin HEAD --follow-tags
```

The `npm version` hook exports your current options and includes the updated dump in the version commit before tagging. Start with a clean working tree, as required by `npm version`.

For the initial version without a version bump, run `npm run options:dump`, commit `database/options-dump.sql` with the release changes, then tag with `git tag v0.1.0` and push the commit and tag. You can also run **Release Windows** manually in GitHub Actions and enter an existing tag. GitHub-hosted runners cannot access your PC's database: they validate and package the snapshot committed at that tag. To include later database changes, export and commit a fresh snapshot for a new release.

The workflow installs from `package-lock.json`, runs the tests, validates the options snapshot, builds the installer and ZIP, and uploads all Forge artifacts, including the SQL snapshot, Squirrel `.nupkg`, and `RELEASES` files. It publishes the release after all uploads succeed. Versions such as `0.2.0-beta.0` are marked as prereleases. A failed upload leaves a draft; rerunning the same tag completes missing uploads without replacing existing assets.

Authentication uses Actions' built-in `GITHUB_TOKEN` with `contents: write`; no personal access token secret is needed. For local uploads, set `GITHUB_TOKEN` and run `npm run publish -- --platform=win32 --arch=x64`; this leaves a draft release to publish on GitHub. Forge's [GitHub publisher documentation](https://www.electronforge.io/config/publishers/github) describes the authentication and publisher settings.

Installers are currently unsigned; Windows may show an unknown-publisher warning. Automatic application updates are not configured. Packaged apps retain the existing `sotn-preset-generator` data directory and include only the runtime code, static assets, template, database schema, and options SQL snapshot. The snapshot contains only the options table. Local database files, backups, settings, presets, and test artifacts are excluded.

## Relic location reference

The [check lists by extension](docs/relic-location-extensions.md) are available as `RELIC_LOCATION_CHECKS` in `src/renderer/relic-location-checks.ts`. Preview and export include only the selected extension's checks from the template, preserving their order and fields before applying starting-relic adjustments. Switching extensions rebuilds from the original template. Raw JSON lock overrides are also filtered to the selected extension. Complexity uses the same extension membership, including allowed checks after Trio. It recalculates on extension or starting-relic changes.

Starting relics also clear a check's `escapeRequires` when any complete alternative is satisfied (all relics in a `+` combination must be enabled). Unsatisfied escape lists stay intact, entry locks remain independent, and deselecting relics restores the template requirements.

Template copies also detect relics granted by constant inventory writes in the source preset's standard new-game injection routine. These starting relics appear in the editor and combine with selected relic options when adjusting locks, escape requirements, transformation metadata, and complexity. Detection reads the instructions and inventory values, not comments, and does not duplicate the source writes. Unknown branches or custom startup routines are not assumed to grant relics.

Options whose complete write sequences or raw JSON settings match the source are selected automatically, including detected starting relics. Matching ignores write comments and hexadecimal letter case or padding, while checking write addresses and all writes in an option. Matched options reuse the original source entries instead of inserting duplicates. Unchecking them removes their effect from the generated copy; startup instructions become no-ops to preserve code positions. Older template drafts are matched once when loaded, and later deselections persist across restarts.

## Tests

```bash
npm test
```

This compiles TypeScript and runs the lock regression tests, including every template location with Soul of Bat, Gravity Boots + Leap Stone, and Form of Mist + Power of Mist enabled separately. The tests use real options from the SQL dump and explicit expected locks in `tests/fixtures/flight-location-locks.cjs`. Update those expectations when intentionally changing the rules or adding locations; the coverage check rejects missing or duplicate locations.
