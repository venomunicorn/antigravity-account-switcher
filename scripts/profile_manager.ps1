<#
.SYNOPSIS
    Antigravity Profile Manager - Manages user profiles for account switching
.DESCRIPTION
    This script handles saving, loading, listing, and deleting Antigravity profiles.
    Each profile is a copy of the User Data directory containing authentication state.
.PARAMETER Action
    The action to perform: Save, Load, List, Delete
.PARAMETER ProfileName
    The name of the profile (required for Save, Load, Delete)
.PARAMETER MaxProfiles
    Maximum number of profiles allowed (default: 5)
#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("Save", "Load", "List", "Delete")]
    [string]$Action,
    
    [Parameter(Mandatory=$false)]
    [string]$ProfileName,
    
    [Parameter(Mandatory=$false)]
    [int]$MaxProfiles = 5
)

# Configuration
$AntigravityDataPath = "$env:APPDATA\Antigravity"
$ProfilesStorePath = "$env:APPDATA\Antigravity\Profiles"
$UserDataPath = "$AntigravityDataPath\User"
$ProcessName = "Antigravity"

# Ensure profiles directory exists
if (-not (Test-Path $ProfilesStorePath)) {
    New-Item -ItemType Directory -Path $ProfilesStorePath -Force | Out-Null
}

function Get-Profiles {
    $profiles = @()
    if (Test-Path $ProfilesStorePath) {
        Get-ChildItem -Path $ProfilesStorePath -Directory | ForEach-Object {
            $profiles += @{
                Name = $_.Name
                Created = $_.CreationTime.ToString("yyyy-MM-dd HH:mm")
                Size = [math]::Round((Get-ChildItem $_.FullName -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 2)
            }
        }
    }
    return $profiles
}

function Save-Profile {
    param([string]$Name)
    
    # Validate profile name
    if ($Name -match '[\\/:*?"<>|]') {
        Write-Error "Profile name contains invalid characters"
        exit 1
    }
    
    # Check profile limit
    $existingProfiles = Get-Profiles
    $profileExists = $existingProfiles | Where-Object { $_.Name -eq $Name }
    
    if (-not $profileExists -and $existingProfiles.Count -ge $MaxProfiles) {
        Write-Error "Maximum profile limit ($MaxProfiles) reached. Delete a profile first."
        exit 1
    }
    
    # Check if User Data exists
    if (-not (Test-Path $UserDataPath)) {
        Write-Error "User Data directory not found at: $UserDataPath"
        exit 1
    }
    
    $targetPath = Join-Path $ProfilesStorePath $Name
    
    # Remove existing profile if it exists (overwrite)
    if (Test-Path $targetPath) {
        Remove-Item -Path $targetPath -Recurse -Force
    }
    
    # Copy User Data to profile
    Write-Host "Saving profile '$Name'..."
    Copy-Item -Path $UserDataPath -Destination $targetPath -Recurse -Force
    
    Write-Host "Profile '$Name' saved successfully."
    Write-Output @{ Success = $true; Message = "Profile saved" } | ConvertTo-Json
}

function Switch-Profile {
    param([string]$Name)
    
    $profilePath = Join-Path $ProfilesStorePath $Name
    
    if (-not (Test-Path $profilePath)) {
        Write-Error "Profile '$Name' not found"
        exit 1
    }
    
    # Find Antigravity executable
    $exePath = "$env:LOCALAPPDATA\Programs\Antigravity\Antigravity.exe"
    if (-not (Test-Path $exePath)) {
        $exePath = "$env:PROGRAMFILES\Antigravity\Antigravity.exe"
    }
    if (-not (Test-Path $exePath)) {
        Write-Error "Could not find Antigravity executable"
        exit 1
    }
    
    # Stop Antigravity processes
    Write-Host "Stopping Antigravity..."
    $processes = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue
    if ($processes) {
        $processes | Stop-Process -Force
        Start-Sleep -Seconds 3
    }
    
    # Backup current User Data
    $backupPath = "${UserDataPath}_switching_backup"
    if (Test-Path $backupPath) {
        Remove-Item -Path $backupPath -Recurse -Force -ErrorAction SilentlyContinue
    }
    
    if (Test-Path $UserDataPath) {
        Write-Host "Backing up current session..."
        Rename-Item -Path $UserDataPath -NewName "${UserDataPath}_switching_backup" -Force -ErrorAction SilentlyContinue
    }
    
    # Copy profile to User Data
    Write-Host "Loading profile '$Name'..."
    Copy-Item -Path $profilePath -Destination $UserDataPath -Recurse -Force
    
    # Clean up backup in background
    if (Test-Path $backupPath) {
        Start-Job -ScriptBlock { param($p) Start-Sleep -Seconds 5; Remove-Item -Path $p -Recurse -Force -ErrorAction SilentlyContinue } -ArgumentList $backupPath | Out-Null
    }
    
    # Restart Antigravity using explorer.exe for truly detached process
    Write-Host "Starting Antigravity..."
    Start-Sleep -Seconds 2
    
    # Method 1: Use explorer.exe to launch (most reliable for detached processes)
    Start-Process "explorer.exe" -ArgumentList "`"$exePath`""
    
    Write-Host "Profile '$Name' loaded successfully."
    @{ Success = $true; Message = "Profile loaded"; Restarted = $true } | ConvertTo-Json -Compress
}

function Remove-Profile {
    param([string]$Name)
    
    $profilePath = Join-Path $ProfilesStorePath $Name
    
    if (-not (Test-Path $profilePath)) {
        Write-Error "Profile '$Name' not found"
        exit 1
    }
    
    Remove-Item -Path $profilePath -Recurse -Force
    Write-Host "Profile '$Name' deleted."
    Write-Output @{ Success = $true; Message = "Profile deleted" } | ConvertTo-Json
}

function List-Profiles {
    $profiles = @(Get-Profiles)
    $count = $profiles.Length
    
    if ($count -eq 0) {
        Write-Host "No profiles saved yet."
        $result = @{ Profiles = @(); Count = 0; MaxProfiles = $MaxProfiles }
    } else {
        Write-Host "Saved Profiles ($count/$MaxProfiles):"
        Write-Host "-----------------------------------"
        foreach ($profile in $profiles) {
            Write-Host "  - $($profile.Name) (Created: $($profile.Created), Size: $($profile.Size) MB)"
        }
        $result = @{ Profiles = $profiles; Count = $count; MaxProfiles = $MaxProfiles }
    }
    $result | ConvertTo-Json -Depth 3 -Compress
}

# Execute action
switch ($Action) {
    "Save" {
        if (-not $ProfileName) {
            Write-Error "ProfileName is required for Save action"
            exit 1
        }
        Save-Profile -Name $ProfileName
    }
    "Load" {
        if (-not $ProfileName) {
            Write-Error "ProfileName is required for Load action"
            exit 1
        }
        Switch-Profile -Name $ProfileName
    }
    "List" {
        List-Profiles
    }
    "Delete" {
        if (-not $ProfileName) {
            Write-Error "ProfileName is required for Delete action"
            exit 1
        }
        Remove-Profile -Name $ProfileName
    }
}
