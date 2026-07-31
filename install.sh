#!/bin/sh
# ShellHub installer for macOS and Linux.
#   curl -fsSL https://raw.githubusercontent.com/shivarchit/shellhub/main/install.sh | sh
#
# Env overrides:
#   SHELLHUB_VERSION      release tag to install (default: latest)
#   SHELLHUB_INSTALL_DIR  target directory (default: /usr/local/bin, else ~/.local/bin)
set -eu

REPO="shivarchit/shellhub"

fatal() { printf 'error: %s\n' "$1" >&2; exit 1; }
info() { printf '%s\n' "$1"; }

if command -v curl >/dev/null 2>&1; then
	fetch() { curl -fsSL "$1"; }
	download() { curl -fsSL -o "$2" "$1"; }
elif command -v wget >/dev/null 2>&1; then
	fetch() { wget -qO- "$1"; }
	download() { wget -qO "$2" "$1"; }
else
	fatal "curl or wget is required"
fi

case "$(uname -s)" in
	Darwin) os=darwin; sha() { shasum -a 256 "$1"; } ;;
	Linux)  os=linux;  sha() { sha256sum "$1"; } ;;
	*) fatal "unsupported OS: $(uname -s). ShellHub supports macOS and Linux; on Windows use install.ps1" ;;
esac

case "$(uname -m)" in
	x86_64|amd64) arch=amd64 ;;
	arm64|aarch64) arch=arm64 ;;
	*) fatal "unsupported architecture: $(uname -m). Prebuilt binaries exist for amd64 and arm64 only" ;;
esac

version="${SHELLHUB_VERSION:-}"
if [ -z "$version" ]; then
	info "Resolving latest release..."
	version=$(fetch "https://api.github.com/repos/$REPO/releases/latest" |
		sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
	[ -n "$version" ] || fatal "could not resolve the latest release tag; set SHELLHUB_VERSION=vX.Y.Z"
fi

asset="shellhub-$os-$arch"
base="https://github.com/$REPO/releases/download/$version"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

info "Downloading $asset ($version)..."
download "$base/$asset" "$tmp/$asset" || fatal "download failed: $base/$asset"
download "$base/SHA256SUMS.txt" "$tmp/SHA256SUMS.txt" || fatal "download failed: $base/SHA256SUMS.txt"

# SHA256SUMS.txt mixes text ("hash  name") and binary ("hash *name") formats.
expected=$(awk -v f="$asset" '$2 == f || $2 == "*" f { print $1; exit }' "$tmp/SHA256SUMS.txt")
[ -n "$expected" ] || fatal "no checksum for $asset in SHA256SUMS.txt"
actual=$(sha "$tmp/$asset" | awk '{print $1}')
[ "$expected" = "$actual" ] || fatal "checksum mismatch for $asset (expected $expected, got $actual)"
info "Checksum verified."

dir="${SHELLHUB_INSTALL_DIR:-}"
if [ -n "$dir" ]; then
	mkdir -p "$dir"
	install -m 755 "$tmp/$asset" "$dir/shellhub" || fatal "could not install to $dir"
elif [ -w /usr/local/bin ] 2>/dev/null; then
	dir=/usr/local/bin
	install -m 755 "$tmp/$asset" "$dir/shellhub"
elif command -v sudo >/dev/null 2>&1 && { [ -t 0 ] || [ -t 2 ]; } &&
	sudo mkdir -p /usr/local/bin && sudo install -m 755 "$tmp/$asset" /usr/local/bin/shellhub; then
	dir=/usr/local/bin
else
	dir="$HOME/.local/bin"
	mkdir -p "$dir"
	install -m 755 "$tmp/$asset" "$dir/shellhub" || fatal "could not install to $dir"
fi

[ "$os" = darwin ] && xattr -d com.apple.quarantine "$dir/shellhub" 2>/dev/null || true

installed=$("$dir/shellhub" -version 2>/dev/null) || installed="ShellHub $version"

info ""
info "Installed $installed to $dir/shellhub"
case ":$PATH:" in
	*":$dir:"*) ;;
	*) info "Note: $dir is not in your PATH. Add it with:"
	   info "  export PATH=\"$dir:\$PATH\"" ;;
esac
info "Next: run 'shellhub' and open http://localhost:8080"
