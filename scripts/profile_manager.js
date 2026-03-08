#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

function parseArgs(argv) {
  const args = {
    action: argv[2],
    profileName: undefined,
    maxProfiles: 5,
    debug: false
  };

  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];

    if (a === '--profile' && argv[i + 1]) {
      args.profileName = argv[++i];
    } else if (a === '--max-profiles' && argv[i + 1]) {
      args.maxProfiles = Number(argv[++i]) || 5;
    } else if (a === '--data-dir' && argv[i + 1]) {
      args.dataDir = argv[++i];
    } else if (a === '--profiles-dir' && argv[i + 1]) {
      args.profilesDir = argv[++i];
    } else if (a === '--exe' && argv[i + 1]) {
      args.exePath = argv[++i];
    } else if (a === '--debug') {
      args.debug = true;
    }
  }

  return args;
}

function logDebug(enabled, ...args) {
  if (!enabled) return;
  try {
    process.stderr.write(`[profile-manager] ${args.join(' ')}\n`);
  } catch {
    // ignore logging errors
  }
}

function exists(p) {
  try {
    return !!p && fs.existsSync(p);
  } catch {
    return false;
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyDir(src, dst) {
  fs.cpSync(src, dst, { recursive: true, force: true });
}

function removeDir(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function getPlatformDefaults() {
  const home = os.homedir();
  const platform = process.platform;

  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  const xdgData = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');

  const defaults = {
    dataCandidates: [],
    exeCandidates: []
  };

  if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');

    defaults.dataCandidates = [
      process.env.ANTIGRAVITY_DATA_DIR,
      path.join(appData, 'Antigravity')
    ].filter(Boolean);

    defaults.exeCandidates = [
      process.env.ANTIGRAVITY_EXECUTABLE,
      path.join(localAppData, 'Programs', 'Antigravity', 'bin', 'antigravity.cmd'),
      path.join(localAppData, 'Programs', 'Antigravity', 'Antigravity.exe'),
      'antigravity'
    ].filter(Boolean);
  } else if (platform === 'darwin') {
    defaults.dataCandidates = [
      process.env.ANTIGRAVITY_DATA_DIR,
      path.join(home, 'Library', 'Application Support', 'Antigravity')
    ].filter(Boolean);

    defaults.exeCandidates = [
      process.env.ANTIGRAVITY_EXECUTABLE,
      '/Applications/Antigravity.app/Contents/MacOS/Antigravity',
      'open'
    ].filter(Boolean);
  } else {
    defaults.dataCandidates = [
      process.env.ANTIGRAVITY_DATA_DIR,
      path.join(xdgConfig, 'Antigravity'),
      path.join(xdgData, 'Antigravity'),
      path.join(home, '.config', 'Antigravity'),
      path.join(home, '.local', 'share', 'Antigravity')
    ].filter(Boolean);

    defaults.exeCandidates = [
      process.env.ANTIGRAVITY_EXECUTABLE,
      '/usr/bin/antigravity',
      '/usr/local/bin/antigravity',
      '/app/bin/antigravity',
      '/snap/bin/antigravity',
      '/var/lib/flatpak/exports/bin/antigravity',
      path.join(home, '.local', 'bin', 'antigravity'),
      path.join(home, 'Applications', 'Antigravity.AppImage'),
      'antigravity'
    ].filter(Boolean);
  }

  return defaults;
}

function resolvePaths(overrides = {}) {
  logDebug(overrides.debug, 'Resolving paths for platform', process.platform);

  const defs = getPlatformDefaults();

  const dataRoot =
    overrides.dataDir ||
    defs.dataCandidates.find((p) => exists(path.join(p, 'User')) || exists(p)) ||
    defs.dataCandidates[0];

  if (!dataRoot) {
    throw new Error('Could not resolve Antigravity data directory.');
  }

  const userDataPath = path.join(dataRoot, 'User');
  const profilesStorePath = overrides.profilesDir || path.join(dataRoot, 'Profiles');

  const exePath =
    overrides.exePath ||
    defs.exeCandidates.find((p) => p === 'open' || p === 'antigravity' || exists(p)) ||
    defs.exeCandidates[0];

  logDebug(overrides.debug, 'Resolved dataRoot', dataRoot);
  logDebug(overrides.debug, 'Resolved profilesStorePath', profilesStorePath);
  logDebug(overrides.debug, 'Resolved exePath', String(exePath));

  return { dataRoot, userDataPath, profilesStorePath, exePath };
}

function dirSizeMb(dir) {
  let total = 0;
  if (!exists(dir)) return 0;

  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        total += fs.statSync(full).size;
      }
    }
  }

  return Math.round((total / (1024 * 1024)) * 100) / 100;
}

function getProfiles(profilesStorePath) {
  if (!exists(profilesStorePath)) return [];

  return fs
    .readdirSync(profilesStorePath, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const full = path.join(profilesStorePath, d.name);
      const stats = fs.statSync(full);
      return {
        name: d.name,
        created: (stats.birthtime || stats.ctime).toISOString().replace('T', ' ').slice(0, 16),
        size: dirSizeMb(full)
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function validateProfileName(name) {
  if (!name || !name.trim()) {
    throw new Error('Profile name is required.');
  }
  if (/[\\/:*?"<>|]/.test(name)) {
    throw new Error('Profile name contains invalid characters.');
  }
}

function saveProfile({ profileName, maxProfiles, userDataPath, profilesStorePath, debug }) {
  validateProfileName(profileName);

  if (!exists(userDataPath)) {
    throw new Error(`User data directory not found: ${userDataPath}`);
  }

  ensureDir(profilesStorePath);

  const profiles = getProfiles(profilesStorePath);
  const target = path.join(profilesStorePath, profileName);
  const alreadyExists = profiles.some((p) => p.name === profileName);

  if (!alreadyExists && profiles.length >= maxProfiles) {
    throw new Error(`Maximum profile limit (${maxProfiles}) reached.`);
  }

  if (exists(target)) {
    removeDir(target);
  }

  copyDir(userDataPath, target);
  logDebug(debug, 'Saved profile', profileName, 'to', target);

  return {
    success: true,
    message: 'Profile saved'
  };
}

function stopAntigravity() {
  const platform = process.platform;

  try {
    if (platform === 'win32') {
      spawnSync('taskkill', ['/IM', 'Antigravity.exe', '/F'], { stdio: 'ignore' });
      spawnSync('taskkill', ['/IM', 'antigravity.exe', '/F'], { stdio: 'ignore' });
    } else {
      spawnSync('pkill', ['-x', 'Antigravity'], { stdio: 'ignore' });
      spawnSync('pkill', ['-f', 'antigravity'], { stdio: 'ignore' });
    }
  } catch {
    // ignore if not running
  }
}

function startAntigravity(exePath) {
  const platform = process.platform;

  if (!exePath) {
    throw new Error('Could not resolve Antigravity executable path.');
  }

  if (platform === 'darwin' && exePath === 'open') {
    const child = spawn('open', ['-a', 'Antigravity'], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    return;
  }

  const child = spawn(exePath, [], {
    detached: true,
    stdio: 'ignore',
    shell: platform === 'win32'
  });
  child.unref();
}

function loadProfile({ profileName, userDataPath, profilesStorePath, exePath, debug }) {
  validateProfileName(profileName);

  const source = path.join(profilesStorePath, profileName);
  if (!exists(source)) {
    throw new Error(`Profile not found: ${profileName}`);
  }

  stopAntigravity();

  const backup = `${userDataPath}_switching_backup`;
  if (exists(backup)) {
    removeDir(backup);
  }

  let renamedCurrent = false;

  try {
    if (exists(userDataPath)) {
      fs.renameSync(userDataPath, backup);
      renamedCurrent = true;
    }

    copyDir(source, userDataPath);

    try {
      startAntigravity(exePath);
    } catch (startErr) {
      logDebug(debug, 'Start warning:', startErr.message);
    }

    try {
      if (exists(backup)) {
        removeDir(backup);
      }
    } catch {
      // ignore cleanup failure
    }

    logDebug(debug, 'Loaded profile', profileName);
    return {
      success: true,
      message: 'Profile loaded',
      restarted: true
    };
  } catch (err) {
    try {
      if (exists(userDataPath)) {
        removeDir(userDataPath);
      }
      if (renamedCurrent && exists(backup)) {
        fs.renameSync(backup, userDataPath);
      }
    } catch {
      // ignore rollback failure
    }
    throw err;
  }
}

function deleteProfile({ profileName, profilesStorePath, debug }) {
  validateProfileName(profileName);

  const target = path.join(profilesStorePath, profileName);
  if (!exists(target)) {
    throw new Error(`Profile not found: ${profileName}`);
  }

  removeDir(target);
  logDebug(debug, 'Deleted profile', profileName);

  return {
    success: true,
    message: 'Profile deleted'
  };
}

function listProfiles({ profilesStorePath, maxProfiles, debug }) {
  ensureDir(profilesStorePath);
  const profiles = getProfiles(profilesStorePath);

  logDebug(debug, 'Listed profiles', String(profiles.length));

  return {
    success: true,
    profiles,
    count: profiles.length,
    maxProfiles
  };
}

(function main() {
  try {
    const args = parseArgs(process.argv);

    if (!['Save', 'Load', 'List', 'Delete'].includes(args.action)) {
      throw new Error('Action must be one of: Save, Load, List, Delete');
    }

    const paths = resolvePaths(args);
    ensureDir(paths.profilesStorePath);

    let result;
    if (args.action === 'Save') {
      result = saveProfile({ ...args, ...paths });
    } else if (args.action === 'Load') {
      result = loadProfile({ ...args, ...paths });
    } else if (args.action === 'Delete') {
      result = deleteProfile({ ...args, ...paths });
    } else {
      result = listProfiles({ ...args, ...paths });
    }

    process.stdout.write(JSON.stringify(result));
  } catch (err) {
    process.stderr.write(err.message || String(err));
    process.exit(1);
  }
})();
