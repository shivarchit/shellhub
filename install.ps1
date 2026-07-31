# ShellHub installer for Windows.
#   irm https://raw.githubusercontent.com/shivarchit/shellhub/main/install.ps1 | iex
#
# Env overrides:
#   $env:SHELLHUB_VERSION      release tag to install (default: latest)
#   $env:SHELLHUB_INSTALL_DIR  target directory (default: $env:LOCALAPPDATA\ShellHub)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$repo = 'shivarchit/shellhub'

if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') {
    throw 'ShellHub does not ship a Windows ARM64 build yet. Build from source: https://github.com/shivarchit/shellhub'
}
if ([IntPtr]::Size -ne 8) {
    throw 'ShellHub requires 64-bit Windows (amd64).'
}

$version = $env:SHELLHUB_VERSION
if (-not $version) {
    Write-Host 'Resolving latest release...'
    $version = (Invoke-RestMethod -UseBasicParsing -Uri "https://api.github.com/repos/$repo/releases/latest").tag_name
    if (-not $version) { throw 'Could not resolve the latest release tag; set $env:SHELLHUB_VERSION = "vX.Y.Z"' }
}

$asset = 'shellhub-windows-amd64.exe'
$base = "https://github.com/$repo/releases/download/$version"
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("shellhub-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

try {
    Write-Host "Downloading $asset ($version)..."
    $exe = Join-Path $tmp $asset
    $sums = Join-Path $tmp 'SHA256SUMS.txt'
    Invoke-WebRequest -UseBasicParsing -Uri "$base/$asset" -OutFile $exe
    Invoke-WebRequest -UseBasicParsing -Uri "$base/SHA256SUMS.txt" -OutFile $sums

    # SHA256SUMS.txt mixes text ("hash  name") and binary ("hash *name") formats.
    $expected = $null
    foreach ($line in Get-Content $sums) {
        $parts = $line -split '\s+', 2
        if ($parts.Count -eq 2 -and $parts[1].TrimStart('*') -eq $asset) { $expected = $parts[0]; break }
    }
    if (-not $expected) { throw "No checksum for $asset in SHA256SUMS.txt" }

    $actual = (Get-FileHash -Path $exe -Algorithm SHA256).Hash
    if ($actual -ne $expected.ToUpperInvariant()) {
        throw "Checksum mismatch for ${asset}: expected $expected, got $actual"
    }
    Write-Host 'Checksum verified.'

    Unblock-File -Path $exe

    $dir = $env:SHELLHUB_INSTALL_DIR
    if (-not $dir) { $dir = Join-Path $env:LOCALAPPDATA 'ShellHub' }
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $target = Join-Path $dir 'shellhub.exe'
    Copy-Item -Path $exe -Destination $target -Force
} finally {
    Remove-Item -Path $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

# Add to user PATH only if missing.
$pathAdded = $false
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not $userPath) { $userPath = '' }
$onPath = $userPath -split ';' | Where-Object { $_.TrimEnd('\') -eq $dir.TrimEnd('\') }
if (-not $onPath) {
    $newPath = if ($userPath.TrimEnd(';')) { $userPath.TrimEnd(';') + ';' + $dir } else { $dir }
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    $pathAdded = $true
}
$env:Path = "$env:Path;$dir"

# Start Menu shortcut is a convenience; never fail the install over it.
try {
    $programs = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
    $shell = New-Object -ComObject WScript.Shell
    $lnk = $shell.CreateShortcut((Join-Path $programs 'ShellHub.lnk'))
    $lnk.TargetPath = $target
    $lnk.WorkingDirectory = $dir
    $lnk.Description = 'ShellHub'
    $lnk.Save()
} catch {
    Write-Host "Note: could not create the Start Menu shortcut ($($_.Exception.Message))"
}

$installed = $null
try { $installed = & $target -version 2>$null | Select-Object -First 1 } catch { }
if (-not $installed) { $installed = "ShellHub $version" }

Write-Host ''
Write-Host "Installed $installed to $target"
if ($pathAdded) {
    Write-Host "Added $dir to your user PATH. Restart your terminal for it to take effect."
}
Write-Host "Next: run 'shellhub' and open http://localhost:8080"
