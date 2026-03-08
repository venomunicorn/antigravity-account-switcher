# Antigravity Profile Switcher

Antigravity Profile Switcher lets you save, switch, list, and delete local Antigravity profiles. 

Each profile is a snapshot of Antigravity’s local user data, so you can move between saved sessions without manually reconfiguring the app each time. Adapted primarily for Linux through the use of Node.js (though it can run on Windows and macOS as well), with @sloppy_adaptation's [antigravity-account-switcher](https://github.com/eriktechgrounds/antigravity-account-switcher) as a basis.

## Features

- Save the current local session as a named profile
- Switch between up to 5 profiles from the status bar
- Delete saved profiles
- Mark a profile as active without restarting
- Restore workspace folders and open editors after a profile switch
- Optional path overrides for custom Antigravity installs on Linux and macOS

## Rate Limits & Token Distribution

This extension was designed with Antigravity API rate limits in mind. To ensure uninterrupted workflows, **Antigravity Profile Switcher** enables rapid switching between accounts.

## Installation

You can install this extension locally using the generated `.vsix` file.

1. Download or generate the `.vsix` package of this extension (e.g., using `npx @vscode/vsce package`).
2. Open **Visual Studio Code**.
3. Open the **Extensions** view (`Ctrl+Shift+X` on Windows/Linux or `Cmd+Shift+X` on macOS).
4. Click on the `...` (Views and More Actions) icon in the top right corner of the Extensions view.
5. Select **Install from VSIX...** from the dropdown menu.
6. Select the `.vsix` file from your machine.
7. Restart VS Code if prompted.

## Commands

The extension contributes the following commands:

- `Antigravity: Save Current Profile`
- `Antigravity: Switch Profile`
- `Antigravity: Delete Profile`
- `Antigravity: List Profiles`
- `Antigravity: Set Active Profile (No Restart)`

## Settings

The extension uses the `antigravitySwitcher` settings namespace.

### Available settings

- `antigravitySwitcher.maxProfiles`  
  Maximum number of saved profiles. The current UI supports 5 slots.

- `antigravitySwitcher.profilesDirectory`  
  Optional custom directory for stored profiles.

- `antigravitySwitcher.dataDir`  
  Optional override for the Antigravity data directory.

- `antigravitySwitcher.executablePath`  
  Optional override for the Antigravity executable path.

- `antigravitySwitcher.debugLogging`  
  Enables extra backend logging.

### Example settings

```json
{
  "antigravitySwitcher.maxProfiles": 5,
  "antigravitySwitcher.profilesDirectory": "",
  "antigravitySwitcher.dataDir": "",
  "antigravitySwitcher.executablePath": "",
  "antigravitySwitcher.debugLogging": false
}
```