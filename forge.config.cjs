const { execFile } = require('node:child_process');
const path = require('node:path');
const { copyFile, mkdir } = require('node:fs/promises');
const { promisify } = require('node:util');
const { version } = require('./package.json');
const { bundleSotnRando, bundlePath } = require('./scripts/bundle-sotnrando.cjs');

const execFileAsync = promisify(execFile);
const windowsIcon = path.join(__dirname, 'assets/icons/castle-moon.ico');
const [owner, name] = (process.env.GITHUB_REPOSITORY || 'ndsmith201/SOTNPresetGenerator').split('/');

// Allow only runtime inputs. In particular, out/ contains local database
// backups, and dist/ may contain development screenshots and test reports.
const runtimeFiles = new Set([
  '/dist/community-client.js', '/dist/community-auth.js', '/dist/community-service.js', '/dist/community-types.js',
  '/package.json', '/dist/main.js', '/dist/preload.js', '/dist/installed-presets.js', '/dist/options-database.js', '/dist/bundled-randomizer.js', '/dist/preset-generation.js',
  '/dist/renderer/index.html', '/dist/renderer/styles.css', '/dist/renderer/renderer.js',
  '/database/schema.sql', '/database/options-dump.sql', '/templates/preset-template.json',
  '/assets/icons/castle-moon.ico'
]);
const runtimeDirectories = new Set(['', '/', '/dist', '/dist/renderer', '/database', '/templates', '/node_modules', '/assets', '/assets/icons']);

/** @type {import('@electron-forge/shared-types').ForgeConfig} */
module.exports = {
  packagerConfig: {
    asar: true,
    extraResource: [bundlePath],
    icon: windowsIcon,
    executableName: 'SOTNPresetGenerator',
    appBundleId: 'io.github.ndsmith201.sotnpresetgenerator',
    ignore: (filePath) => {
      const normalized = filePath.replaceAll('\\', '/');
      return !runtimeDirectories.has(normalized) && !runtimeFiles.has(normalized) && !normalized.startsWith('/node_modules/');
    }
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: (arch) => ({
        name: 'SOTNPresetGenerator',
        authors: 'ndsmith201',
        exe: 'SOTNPresetGenerator.exe',
        setupIcon: windowsIcon,
        setupExe: `SOTNPresetGenerator-${version}-win32-${arch}-Setup.exe`,
        noMsi: true
      })
    },
    { name: '@electron-forge/maker-zip', platforms: ['win32'], config: {} }
  ],
  publishers: [{
    name: '@electron-forge/publisher-github',
    config: {
      repository: { owner, name },
      draft: true,
      prerelease: version.includes('-'),
      generateReleaseNotes: true,
      tagPrefix: 'v'
    }
  }],
  hooks: {
    prePackage: async () => {
      // Hosted runners use the release tag's committed snapshot. Local packaging
      // must read the author's live database and fail if it is unavailable.
      const args = process.env.CI ? ['--check'] : [];
      const { stdout } = await execFileAsync(process.execPath, [path.join(__dirname, 'scripts/export-options.cjs'), ...args], {
        cwd: __dirname, windowsHide: true, maxBuffer: 10 * 1024 * 1024
      });
      console.log(stdout.trim());
      await bundleSotnRando();
    },
    postMake: async (_config, results) => {
      if (results.length) {
        const destination = path.join(__dirname, 'out/make/options-dump.sql');
        await mkdir(path.dirname(destination), { recursive: true });
        await copyFile(path.join(__dirname, 'database/options-dump.sql'), destination);
        results[0].artifacts.push(destination);
      }
      return results;
    },
    generateAssets: async () => {
      await execFileAsync(process.execPath, [path.join(__dirname, 'scripts/build.mjs')], {
        cwd: __dirname, windowsHide: true, maxBuffer: 10 * 1024 * 1024
      });
    }
  }
};
