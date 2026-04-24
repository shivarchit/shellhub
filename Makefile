.PHONY: dev build clean frontend-build build-all build-windows build-linux build-linux-arm build-mac build-mac-arm

# Development: run Go backend and Vite frontend separately
dev:
	@echo "Run in two terminals:"
	@echo "  1: go run . -dev"
	@echo "  2: cd frontend && npm run dev"

# Build for current platform
build: frontend-build
	go build -o shellhub.exe .

# Build frontend assets
frontend-build:
	cd frontend && npm ci && npm run build

# Cross-platform builds (all require frontend to be built first)
build-all: frontend-build build-windows build-linux build-linux-arm build-mac build-mac-arm
	@echo "All builds complete. Check dist/"

build-windows: frontend-build
	@mkdir -p dist
	GOOS=windows GOARCH=amd64 go build -o dist/shellhub-windows-amd64.exe .

build-linux: frontend-build
	@mkdir -p dist
	GOOS=linux GOARCH=amd64 go build -o dist/shellhub-linux-amd64 .

build-linux-arm: frontend-build
	@mkdir -p dist
	GOOS=linux GOARCH=arm64 go build -o dist/shellhub-linux-arm64 .

build-mac: frontend-build
	@mkdir -p dist
	GOOS=darwin GOARCH=amd64 go build -o dist/shellhub-darwin-amd64 .

build-mac-arm: frontend-build
	@mkdir -p dist
	GOOS=darwin GOARCH=arm64 go build -o dist/shellhub-darwin-arm64 .

clean:
	rm -f shellhub.exe shellhub
	rm -rf dist
	rm -rf frontend/dist
	mkdir -p frontend/dist && touch frontend/dist/.gitkeep
