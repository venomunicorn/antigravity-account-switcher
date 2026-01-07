# Antigravity Multi-Account Switcher

**Version 2.0.0** - Final Release

Seamlessly switch between multiple Google accounts in Antigravity to bypass model rate limits without manual re-login.

## Features

### 🎨 Colorful Profile Buttons
- **5 profile slot buttons** in the status bar with distinct colors (Blue, Green, Orange, Purple, Pink)
- **One-click switching** - no confirmation dialogs
- Empty slots are grayed out with slot numbers

### ➕ Easy Profile Management
- **Save button (+)** - Save your current session as a new profile
- **Delete button (🗑️)** - Remove unwanted profiles
- Profiles are stored in `%APPDATA%\Antigravity\Profiles`

### ⚠️ Rate Limit Detection
- Automatically monitors for rate limit errors (supports Gemini and Claude)
- When detected, prompts you to switch to another account
- 1-minute cooldown between alerts to avoid spam

---

## Installation Instructions

### Method 1: Install from VSIX (Recommended)

1. **Download** the `antigravity-account-switcher-2.0.0.vsix` file
2. **Open Antigravity**
3. Press `Ctrl+Shift+P` to open Command Palette
4. Type: `Extensions: Install from VSIX...`
5. Select the downloaded `.vsix` file
6. Click **Reload** when prompted (or press `Ctrl+Shift+P` → `Developer: Reload Window`)

### Method 2: Command Line Install

```powershell
# Run this in PowerShell or Command Prompt
& "$env:LOCALAPPDATA\Programs\Antigravity\bin\antigravity.cmd" --install-extension "path\to\antigravity-account-switcher-2.0.0.vsix"
```

### Method 3: Manual Install (Copy Files)

1. Navigate to: `%USERPROFILE%\.vscode\extensions\` (or `%USERPROFILE%\.antigravity\extensions\`)
2. Create folder: `antigravity-account-switcher-2.0.0`
3. Copy these files into it:
   - `extension.js`
   - `package.json`
   - `scripts\profile_manager.ps1`
4. Restart Antigravity

---

## How It Works

1. **Save a Profile**: Log into a Google account in Antigravity, then click the **+** button and enter a name
2. **Switch Profiles**: Click any colored profile button to instantly switch (Antigravity will restart)
3. **Rate Limit Auto-Switch**: When you hit a rate limit, a prompt appears offering to switch accounts

## Commands

| Command | Description |
|---------|-------------|
| `Antigravity: Save Current Profile` | Save current session |
| `Antigravity: Switch Profile` | Switch via picker |
| `Antigravity: Delete Profile` | Delete a profile |
| `Antigravity: List Profiles` | Show saved profiles |

## Requirements

- Windows 10/11
- Antigravity IDE
- PowerShell (included with Windows)

## Notes

- Profile switching **restarts Antigravity** to apply changes
- Each profile stores the complete authentication state
- Maximum 5 profiles supported

---

Made for bypassing rate limits without the hassle of manual re-login! 🚀
