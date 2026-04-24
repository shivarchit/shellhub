.PHONY: dev build clean

dev:
	@echo "Run in two terminals:"
	@echo "  1: go run . -dev"
	@echo "  2: cd frontend && npm run dev"

build: frontend-build
	go build -o shellhub.exe .

frontend-build:
	cd frontend && npm ci && npm run build

clean:
	rm -f shellhub.exe shellhub
	rm -rf frontend/dist
	mkdir -p frontend/dist && touch frontend/dist/.gitkeep
