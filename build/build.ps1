param(
    [Parameter(Position=0)]
    [ValidateSet("build", "build-all", "windows", "linux", "linux-arm", "mac", "mac-arm", "frontend", "clean", "dev")]
    [string]$Target = "build"
)

$Root = Resolve-Path "$PSScriptRoot/.."

function Build-Frontend {
    Write-Host "Building frontend..." -ForegroundColor Cyan
    Push-Location "$Root/frontend"
    npm ci --silent
    npm run build
    Pop-Location
}

function Build-Binary($os, $arch, $output) {
    Write-Host "Building $output..." -ForegroundColor Cyan
    Push-Location $Root
    $env:GOOS = $os
    $env:GOARCH = $arch
    if ($os -eq "windows") {
        go build -ldflags "-H windowsgui" -o "build/$output" .
    } else {
        go build -o "build/$output" .
    }
    Remove-Item Env:GOOS
    Remove-Item Env:GOARCH
    Pop-Location
    Write-Host "  -> build/$output" -ForegroundColor Green
}

switch ($Target) {
    "dev" {
        Write-Host "Run in two terminals from project root:" -ForegroundColor Yellow
        Write-Host "  1: go run . -dev"
        Write-Host "  2: cd frontend; npm run dev"
    }
    "frontend" {
        Build-Frontend
    }
    "build" {
        Build-Frontend
        Write-Host "Building shellhub.exe..." -ForegroundColor Cyan
        Push-Location $Root
        go build -ldflags "-H windowsgui" -o shellhub.exe .
        Pop-Location
        Write-Host "Done: shellhub.exe (in project root)" -ForegroundColor Green
    }
    "windows" {
        Build-Frontend
        New-Item -ItemType Directory -Force -Path dist | Out-Null
        Build-Binary "windows" "amd64" "dist/shellhub-windows-amd64.exe"
        if (Get-Command makensis -ErrorAction SilentlyContinue) {
            Write-Host "Packaging Windows Setup Installer..." -ForegroundColor Cyan
            makensis shellhub.nsi
        } else {
            Write-Host "Warning: makensis not found. Skipping Windows Setup packaging." -ForegroundColor Yellow
        }
    }
    "linux" {
        Build-Frontend
        New-Item -ItemType Directory -Force -Path dist | Out-Null
        Build-Binary "linux" "amd64" "dist/shellhub-linux-amd64"
        if (Get-Command bash -ErrorAction SilentlyContinue) {
            bash ./build-deb.sh dist/shellhub-linux-amd64 amd64
            bash ./build-rpm.sh dist/shellhub-linux-amd64 amd64
        }
    }
    "linux-arm" {
        Build-Frontend
        New-Item -ItemType Directory -Force -Path dist | Out-Null
        Build-Binary "linux" "arm64" "dist/shellhub-linux-arm64"
        if (Get-Command bash -ErrorAction SilentlyContinue) {
            bash ./build-deb.sh dist/shellhub-linux-arm64 arm64
            bash ./build-rpm.sh dist/shellhub-linux-arm64 arm64
        }
    }
    "mac" {
        Build-Frontend
        New-Item -ItemType Directory -Force -Path dist | Out-Null
        Build-Binary "darwin" "amd64" "dist/shellhub-darwin-amd64"
        if (Get-Command bash -ErrorAction SilentlyContinue) {
            bash ./build-dmg.sh dist/shellhub-darwin-amd64 amd64
        }
    }
    "mac-arm" {
        Build-Frontend
        New-Item -ItemType Directory -Force -Path dist | Out-Null
        Build-Binary "darwin" "arm64" "dist/shellhub-darwin-arm64"
        if (Get-Command bash -ErrorAction SilentlyContinue) {
            bash ./build-dmg.sh dist/shellhub-darwin-arm64 arm64
        }
    }
    "build-all" {
        Build-Frontend
        New-Item -ItemType Directory -Force -Path dist | Out-Null
        Build-Binary "windows" "amd64" "dist/shellhub-windows-amd64.exe"
        Build-Binary "linux"   "amd64" "dist/shellhub-linux-amd64"
        Build-Binary "linux"   "arm64" "dist/shellhub-linux-arm64"
        Build-Binary "darwin"  "amd64" "dist/shellhub-darwin-amd64"
        Build-Binary "darwin"  "arm64" "dist/shellhub-darwin-arm64"
        
        # Packaging
        if (Get-Command makensis -ErrorAction SilentlyContinue) {
            Write-Host "Packaging Windows Setup Installer..." -ForegroundColor Cyan
            makensis shellhub.nsi
        }
        if (Get-Command bash -ErrorAction SilentlyContinue) {
            bash ./build-deb.sh dist/shellhub-linux-amd64 amd64
            bash ./build-rpm.sh dist/shellhub-linux-amd64 amd64
            bash ./build-deb.sh dist/shellhub-linux-arm64 arm64
            bash ./build-rpm.sh dist/shellhub-linux-arm64 arm64
            bash ./build-dmg.sh dist/shellhub-darwin-amd64 amd64
            bash ./build-dmg.sh dist/shellhub-darwin-arm64 arm64
        }
        Write-Host "`nAll builds complete. Check build/dist/" -ForegroundColor Green
    }
    "clean" {
        Remove-Item -Force -ErrorAction SilentlyContinue "$Root/shellhub.exe", "$Root/shellhub"
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue "$PSScriptRoot/dist"
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue "$Root/frontend/dist"
        New-Item -ItemType Directory -Force -Path "$Root/frontend/dist" | Out-Null
        New-Item -ItemType File -Force -Path "$Root/frontend/dist/.gitkeep" | Out-Null
        Write-Host "Cleaned." -ForegroundColor Green
    }
}
