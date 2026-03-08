const vscode = require('vscode');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

function getSharedAntigravityDir() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Antigravity');
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Antigravity');
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(xdgConfig, 'Antigravity');
}

/**
 * Antigravity Profile Switcher
 * Local multi-profile/session management with cross-platform backend.
 *
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('Antigravity Profile Switcher v2.4.0 is now active');

  const NUM_SLOTS = 5;
  const sharedAntigravityDir = getSharedAntigravityDir();
  const ACTIVE_PROFILE_FILE = path.join(sharedAntigravityDir, 'active_profile.txt');
  const PENDING_STATE_FILE = path.join(sharedAntigravityDir, 'pending_state.json');

  function ensureDirExists(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Get the currently active profile name from shared file.
   */
  function getActiveProfile() {
    try {
      if (fs.existsSync(ACTIVE_PROFILE_FILE)) {
        return fs.readFileSync(ACTIVE_PROFILE_FILE, 'utf8').trim();
      }
    } catch (e) {
      console.error('Error reading active profile:', e);
    }
    return null;
  }

  /**
   * Set the active profile name in shared file.
   */
  function setActiveProfile(profileName) {
    try {
      ensureDirExists(ACTIVE_PROFILE_FILE);
      fs.writeFileSync(ACTIVE_PROFILE_FILE, profileName, 'utf8');
      return true;
    } catch (e) {
      console.error('Error saving active profile:', e);
      return false;
    }
  }

  /**
   * Cross-platform backend runner.
   */
  function runProfileManager(action, profileName = '') {
    return new Promise((resolve) => {
      const scriptPath = context.asAbsolutePath(path.join('scripts', 'profile_manager.js'));
      const config = vscode.workspace.getConfiguration('antigravitySwitcher');

      const args = [
        scriptPath,
        action,
        '--max-profiles',
        String(config.get('maxProfiles', 5))
      ];

      if (profileName) {
        args.push('--profile', profileName);
      }

      const profilesDirectory = config.get('profilesDirectory');
      const dataDir = config.get('dataDir');
      const executablePath = config.get('executablePath');
      const debugLogging = config.get('debugLogging', false);

      if (profilesDirectory) args.push('--profiles-dir', profilesDirectory);
      if (dataDir) args.push('--data-dir', dataDir);
      if (executablePath) args.push('--exe', executablePath);
      if (debugLogging) args.push('--debug');

      execFile(process.execPath, args, { timeout: 60000 }, (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, error: stderr || error.message, output: stdout || '' });
          return;
        }

        try {
          const parsed = stdout ? JSON.parse(stdout) : {};
          resolve(parsed);
        } catch {
          resolve({ success: false, error: `Invalid JSON from profile manager: ${stdout || stderr}`, output: stdout || '' });
        }
      });
    });
  }

  /**
   * Save full workspace state (folders, editors, layout) for restoration after profile switch.
   */
  function saveFullWorkspaceState() {
    try {
      const state = {
        version: 1,
        timestamp: new Date().toISOString(),
        workspaceFolders: [],
        openEditors: [],
        activeEditorUri: null
      };

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        state.workspaceFolders = workspaceFolders.map((f) => f.uri.fsPath);
      }

      if (vscode.window.tabGroups) {
        const tabGroups = vscode.window.tabGroups;
        for (const group of tabGroups.all) {
          for (const tab of group.tabs) {
            if (tab.input && tab.input.uri) {
              state.openEditors.push({
                uri: tab.input.uri.toString(),
                viewColumn: group.viewColumn || 1,
                isActive: tabGroups.activeTabGroup === group && group.activeTab === tab
              });
            }
          }
        }

        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
          state.activeEditorUri = activeEditor.document.uri.toString();
        }
      }

      ensureDirExists(PENDING_STATE_FILE);
      fs.writeFileSync(PENDING_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
      console.log('Saved full workspace state:', state.workspaceFolders.length, 'folders,', state.openEditors.length, 'editors');
      return true;
    } catch (e) {
      console.error('Error saving workspace state:', e);
    }
    return false;
  }

  /**
   * Get and clear pending workspace state.
   */
  function getPendingWorkspaceState() {
    try {
      if (fs.existsSync(PENDING_STATE_FILE)) {
        const stateJson = fs.readFileSync(PENDING_STATE_FILE, 'utf8');
        const state = JSON.parse(stateJson);
        fs.unlinkSync(PENDING_STATE_FILE);
        return state;
      }
    } catch (e) {
      console.error('Error reading pending state:', e);
    }
    return null;
  }

  /**
   * Restore all editors from saved state.
   */
  async function restoreEditors(state) {
    if (!state || !state.openEditors || state.openEditors.length === 0) {
      return;
    }

    console.log('Restoring', state.openEditors.length, 'editors...');

    const editorsByColumn = {};
    for (const editor of state.openEditors) {
      const col = editor.viewColumn || 1;
      if (!editorsByColumn[col]) {
        editorsByColumn[col] = [];
      }
      editorsByColumn[col].push(editor);
    }

    for (const [column, editors] of Object.entries(editorsByColumn)) {
      for (const editor of editors) {
        try {
          const uri = vscode.Uri.parse(editor.uri);
          if (fs.existsSync(uri.fsPath)) {
            await vscode.window.showTextDocument(uri, {
              viewColumn: parseInt(column, 10),
              preview: false,
              preserveFocus: !editor.isActive
            });
          }
        } catch (e) {
          console.log('Could not restore editor:', editor.uri, e.message);
        }
      }
    }

    if (state.activeEditorUri) {
      try {
        const uri = vscode.Uri.parse(state.activeEditorUri);
        if (fs.existsSync(uri.fsPath)) {
          await vscode.window.showTextDocument(uri, { preview: false });
        }
      } catch (e) {
        console.log('Could not focus active editor:', e.message);
      }
    }
  }

  // ============================================
  // FULL WORKSPACE RESTORATION ON STARTUP
  // ============================================
  const pendingState = getPendingWorkspaceState();
  if (pendingState) {
    if (pendingState.workspaceFolders && pendingState.workspaceFolders.length > 0) {
      const firstFolder = pendingState.workspaceFolders[0];
      const currentWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

      if (currentWorkspace !== firstFolder && fs.existsSync(firstFolder)) {
        console.log('Restoring workspace folders...');

        if (pendingState.workspaceFolders.length > 1) {
          const foldersToAdd = pendingState.workspaceFolders
            .filter((f) => fs.existsSync(f))
            .map((f) => ({ uri: vscode.Uri.file(f) }));

          if (foldersToAdd.length > 0) {
            vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(firstFolder), false).then(() => {
              setTimeout(() => {
                if (foldersToAdd.length > 1) {
                  vscode.workspace.updateWorkspaceFolders(1, 0, ...foldersToAdd.slice(1));
                }
                restoreEditors(pendingState);
              }, 2000);
            });

            vscode.window.showInformationMessage(
              `Restored ${foldersToAdd.length} workspace folders and ${pendingState.openEditors?.length || 0} editors`
            );
          }
        } else {
          vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(firstFolder), false).then(() => {
            setTimeout(() => restoreEditors(pendingState), 2000);
          });
          vscode.window.showInformationMessage(`Restored workspace: ${path.basename(firstFolder)}`);
        }
      } else if (currentWorkspace === firstFolder) {
        restoreEditors(pendingState);
      }
    } else if (pendingState.openEditors && pendingState.openEditors.length > 0) {
      restoreEditors(pendingState);
    }
  }

  const SLOT_COLORS = [
    '#4FC3F7',
    '#81C784',
    '#FFB74D',
    '#BA68C8',
    '#F06292'
  ];

  /**
   * Get list of saved profiles.
   */
  async function getProfiles() {
    const result = await runProfileManager('List');
    if (result && Array.isArray(result.profiles)) {
      return result.profiles;
    }
    if (result && Array.isArray(result.Profiles)) {
      return result.Profiles;
    }
    return [];
  }

  // ============================================
  // STATUS BAR BUTTONS
  // ============================================
  const profileButtons = [];
  for (let i = 0; i < NUM_SLOTS; i++) {
    const btn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000 - i);
    btn.command = `antigravity-switcher.slotAction${i}`;
    btn.tooltip = `Profile Slot ${i + 1}`;
    profileButtons.push(btn);
    context.subscriptions.push(btn);
  }

  const saveButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000 - NUM_SLOTS);
  saveButton.text = '$(add)';
  saveButton.tooltip = 'Save current session as a new profile';
  saveButton.command = 'antigravity-switcher.saveProfile';
  saveButton.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  context.subscriptions.push(saveButton);

  const deleteButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000 - NUM_SLOTS - 1);
  deleteButton.text = '$(trash)';
  deleteButton.tooltip = 'Delete a profile';
  deleteButton.command = 'antigravity-switcher.deleteProfile';
  deleteButton.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  context.subscriptions.push(deleteButton);

  /**
   * Update all profile buttons based on current profiles.
   */
  async function updateProfileButtons() {
    const profiles = await getProfiles();

    for (let i = 0; i < NUM_SLOTS; i++) {
      const btn = profileButtons[i];
      const profile = profiles[i];
      const slotNum = i + 1;
      const color = SLOT_COLORS[i];

      if (profile) {
        const name = profile.Name || profile.name;
        const activeProfileName = getActiveProfile();
        const isActive = activeProfileName && activeProfileName.toLowerCase() === name.toLowerCase();

        if (isActive) {
          btn.text = `$(check) ${name}`;
          btn.tooltip = `"${name}" is currently active`;
          btn.color = '#FFFFFF';
          btn.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
        } else {
          btn.text = `$(account) ${name}`;
          btn.tooltip = `Click to switch to "${name}"`;
          btn.color = color;
          btn.backgroundColor = undefined;
        }
      } else {
        btn.text = `$(circle-slash) ${slotNum}`;
        btn.tooltip = `Slot ${slotNum} is empty - Click + to save`;
        btn.color = new vscode.ThemeColor('disabledForeground');
        btn.backgroundColor = undefined;
      }

      btn.show();
    }

    saveButton.show();
    deleteButton.show();
  }

  for (let i = 0; i < NUM_SLOTS; i++) {
    const slotNum = i;
    const cmd = vscode.commands.registerCommand(`antigravity-switcher.slotAction${i}`, async () => {
      const profiles = await getProfiles();
      const profile = profiles[slotNum];

      if (profile) {
        const profileName = profile.Name || profile.name;
        const activeProfileName = getActiveProfile();

        if (activeProfileName && activeProfileName.toLowerCase() === profileName.toLowerCase()) {
          vscode.window.showInformationMessage(`"${profileName}" is already the active profile.`);
          return;
        }

        vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: `Switching to "${profileName}"...`,
          cancellable: false
        }, async () => {
          saveFullWorkspaceState();
          setActiveProfile(profileName);
          const result = await runProfileManager('Load', profileName);
          if (!result.success) {
            vscode.window.showErrorMessage(`Failed to switch: ${result.error}`);
          }
        });
      } else {
        vscode.window.showInformationMessage(`Slot ${slotNum + 1} is empty. Click the + button to save your current session.`);
      }
    });

    context.subscriptions.push(cmd);
  }

  // ============================================
  // MAIN COMMANDS
  // ============================================
  const saveCmd = vscode.commands.registerCommand('antigravity-switcher.saveProfile', async () => {
    const profiles = await getProfiles();
    if (profiles.length >= NUM_SLOTS) {
      vscode.window.showWarningMessage(`All ${NUM_SLOTS} profile slots are full. Delete a profile first to save a new one.`);
      return;
    }

    const profileName = await vscode.window.showInputBox({
      prompt: 'Enter a name for this profile',
      placeHolder: 'Profile name',
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Profile name cannot be empty';
        }
        if (profiles.some((p) => (p.Name || p.name).toLowerCase() === value.toLowerCase())) {
          return 'A profile with this name already exists';
        }
        return null;
      }
    });

    if (!profileName) return;

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Saving profile "${profileName}"...`,
      cancellable: false
    }, async () => {
      const result = await runProfileManager('Save', profileName);
      if (result.success) {
        setActiveProfile(profileName);
        vscode.window.showInformationMessage(`Profile "${profileName}" saved and set as active!`);
        updateProfileButtons();
      } else {
        vscode.window.showErrorMessage(`Failed to save profile: ${result.error}`);
      }
    });
  });
  context.subscriptions.push(saveCmd);

  const deleteCmd = vscode.commands.registerCommand('antigravity-switcher.deleteProfile', async () => {
    const profiles = await getProfiles();
    if (profiles.length === 0) {
      vscode.window.showInformationMessage('No profiles to delete.');
      return;
    }

    const items = profiles.map((p) => ({
      label: `$(trash) ${p.Name || p.name}`,
      description: 'Click to delete',
      profileName: p.Name || p.name
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a profile to delete'
    });
    if (!selected) return;

    const confirm = await vscode.window.showWarningMessage(
      `Are you sure you want to delete "${selected.profileName}"?`,
      { modal: true },
      'Delete'
    );
    if (confirm !== 'Delete') return;

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Deleting profile "${selected.profileName}"...`,
      cancellable: false
    }, async () => {
      const result = await runProfileManager('Delete', selected.profileName);
      if (result.success) {
        vscode.window.showInformationMessage(`Profile "${selected.profileName}" deleted.`);
        updateProfileButtons();
      } else {
        vscode.window.showErrorMessage(`Failed to delete profile: ${result.error}`);
      }
    });
  });
  context.subscriptions.push(deleteCmd);

  const switchCmd = vscode.commands.registerCommand('antigravity-switcher.switchProfile', async () => {
    const profiles = await getProfiles();
    if (profiles.length === 0) {
      vscode.window.showInformationMessage('No profiles saved yet. Use the + button to save one.');
      return;
    }

    const items = profiles.map((p, i) => ({
      label: `$(account) ${p.Name || p.name}`,
      description: `Slot ${i + 1}`,
      profileName: p.Name || p.name
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a profile to switch to'
    });
    if (!selected) return;

    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Switching to "${selected.profileName}"...`,
      cancellable: false
    }, async () => {
      saveFullWorkspaceState();
      setActiveProfile(selected.profileName);
      const result = await runProfileManager('Load', selected.profileName);
      if (!result.success) {
        vscode.window.showErrorMessage(`Failed to switch: ${result.error}`);
      }
    });
  });
  context.subscriptions.push(switchCmd);

  const listCmd = vscode.commands.registerCommand('antigravity-switcher.listProfiles', async () => {
    const profiles = await getProfiles();
    if (profiles.length === 0) {
      vscode.window.showInformationMessage('No profiles saved yet.');
      return;
    }

    const profileList = profiles.map((p, i) => `${i + 1}. ${p.Name || p.name}`).join('\n');
    vscode.window.showInformationMessage(`Saved Profiles:\n${profileList}`);
  });
  context.subscriptions.push(listCmd);

  const setActiveCmd = vscode.commands.registerCommand('antigravity-switcher.setActiveProfile', async () => {
    const profiles = await getProfiles();
    if (profiles.length === 0) {
      vscode.window.showInformationMessage('No profiles saved yet.');
      return;
    }

    const items = profiles.map((p, i) => ({
      label: `$(account) ${p.Name || p.name}`,
      description: `Slot ${i + 1}`,
      profileName: p.Name || p.name
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select which profile is currently active (no restart)'
    });
    if (!selected) return;

    setActiveProfile(selected.profileName);
    vscode.window.showInformationMessage(`"${selected.profileName}" is now marked as the active profile.`);
    updateProfileButtons();
  });
  context.subscriptions.push(setActiveCmd);

  updateProfileButtons();
}

function deactivate() {
  console.log('Antigravity Profile Switcher deactivated');
}

module.exports = {
  activate,
  deactivate
};
