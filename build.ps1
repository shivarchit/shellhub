param(
    [Parameter(Position=0)]
    [ValidateSet("build", "build-all", "windows", "linux", "linux-arm", "mac", "mac-arm", "frontend", "clean", "dev")]
    [string]$Target = "build"
)

function Build-Frontend {
    Write-Host "Building frontend..." -ForegroundColor Cyan
    Push-Location frontend
    npm ci --silent
    npm run build
    Pop-Location
}

function Build-Binary($os, $arch, $output) {
    Write-Host "Building $output..." -ForegroundColor Cyan
    $env:GOOS = $os
    $env:GOARCH = $arch
    go build -o $output .
    Remove-Item Env:GOOS
    Remove-Item Env:GOARCH
    Write-Host "  -> $output" -ForegroundColor Green
}

switch ($Target) {
    "dev" {
        Write-Host "Run in two terminals:" -ForegroundColor Yellow
        Write-Host "  1: go run . -dev"
        Write-Host "  2: cd frontend; npm run dev"
    }
    "frontend" {
        Build-Frontend
    }
    "build" {
        Build-Frontend
        Write-Host "Building shellhub.exe..." -ForegroundColor Cyan
        go build -o shellhub.exe .
        Write-Host "Done: shellhub.exe" -ForegroundColor Green
    }
    "windows" {
        Build-Frontend
        New-Item -ItemType Directory -Force -Path dist | Out-Null
        Build-Binary "windows" "amd64" "dist/shellhub-windows-amd64.exe"
    }
    "linux" {
        Build-Frontend
        New-Item -ItemType Directory -Force -Path dist | Out-Null
        Build-Binary "linux" "amd64" "dist/shellhub-linux-amd64"
    }
    "linux-arm" {
        Build-Frontend
        New-Item -ItemType Directory -Force -Path dist | Out-Null
        Build-Binary "linux" "arm64" "dist/shellhub-linux-arm64"
    }
    "mac" {
        Build-Frontend
        New-Item -ItemType Directory -Force -Path dist | Out-Null
        Build-Binary "darwin" "amd64" "dist/shellhub-darwin-amd64"
    }
    "mac-arm" {
        Build-Frontend
        New-Item -ItemType Directory -Force -Path dist | Out-Null
        Build-Binary "darwin" "arm64" "dist/shellhub-darwin-arm64"
    }
    "build-all" {
        Build-Frontend
        New-Item -ItemType Directory -Force -Path dist | Out-Null
        Build-Binary "windows" "amd64" "dist/shellhub-windows-amd64.exe"
        Build-Binary "linux"   "amd64" "dist/shellhub-linux-amd64"
        Build-Binary "linux"   "arm64" "dist/shellhub-linux-arm64"
        Build-Binary "darwin"  "amd64" "dist/shellhub-darwin-amd64"
        Build-Binary "darwin"  "arm64" "dist/shellhub-darwin-arm64"
        Write-Host "`nAll builds complete. Check dist/" -ForegroundColor Green
    }
    "clean" {
        Remove-Item -Force -ErrorAction SilentlyContinue shellhub.exe, shellhub
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue dist
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue frontend/dist
        New-Item -ItemType Directory -Force -Path frontend/dist | Out-Null
        New-Item -ItemType File -Force -Path frontend/dist/.gitkeep | Out-Null
        Write-Host "Cleaned." -ForegroundColor Green
    }
}
