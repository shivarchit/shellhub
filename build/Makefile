.PHONY: dev build clean frontend-build build-all build-windows build-linux build-linux-arm build-mac build-mac-arm

ROOT := $(shell cd .. && pwd)

# Development: run Go backend and Vite frontend separately
dev:
	@echo "Run in two terminals:"
	@echo "  1: cd .. && go run . -dev"
	@echo "  2: cd ../frontend && npm run dev"

# Build for current platform (uses -H windowsgui to hide console on Windows)
build: frontend-build
	cd $(ROOT) && go build -ldflags "-H windowsgui" -o shellhub.exe .

# Build frontend assets
frontend-build:
	cd $(ROOT)/frontend && npm ci && npm run build

# Cross-platform builds (all require frontend to be built first)
build-all: frontend-build build-windows build-linux build-linux-arm build-mac build-mac-arm
	@echo "All builds complete. Check dist/"

build-windows: frontend-build
	@mkdir -p dist
	cd $(ROOT) && GOOS=windows GOARCH=amd64 go build -ldflags "-H windowsgui" -o build/dist/shellhub-windows-amd64.exe .
	@if command -v makensis >/dev/null 2>&1; then makensis shellhub.nsi; else echo "Warning: makensis not found. Skipping Windows NSIS setup."; fi

build-linux: frontend-build
	@mkdir -p dist
	cd $(ROOT) && GOOS=linux GOARCH=amd64 go build -o build/dist/shellhub-linux-amd64 .
	./build-deb.sh dist/shellhub-linux-amd64 amd64
	./build-rpm.sh dist/shellhub-linux-amd64 amd64

build-linux-arm: frontend-build
	@mkdir -p dist
	cd $(ROOT) && GOOS=linux GOARCH=arm64 go build -o build/dist/shellhub-linux-arm64 .
	./build-deb.sh dist/shellhub-linux-arm64 arm64
	./build-rpm.sh dist/shellhub-linux-arm64 arm64

build-mac: frontend-build
	@mkdir -p dist
	cd $(ROOT) && GOOS=darwin GOARCH=amd64 go build -o build/dist/shellhub-darwin-amd64 .
	./build-dmg.sh dist/shellhub-darwin-amd64 amd64

build-mac-arm: frontend-build
	@mkdir -p dist
	cd $(ROOT) && GOOS=darwin GOARCH=arm64 go build -o build/dist/shellhub-darwin-arm64 .
	./build-dmg.sh dist/shellhub-darwin-arm64 arm64


clean:
	rm -f $(ROOT)/shellhub.exe $(ROOT)/shellhub
	rm -rf dist
	rm -rf $(ROOT)/frontend/dist
	mkdir -p $(ROOT)/frontend/dist && touch $(ROOT)/frontend/dist/.gitkeep
