#!/bin/sh
# ShellHub installer for macOS and Linux.
#   curl -fsSL https://raw.githubusercontent.com/shivarchit/shellhub/main/install.sh | sh
#
# On macOS this installs both ShellHub.app (double-clickable) and the CLI binary.
#
# Env overrides:
#   SHELLHUB_VERSION      release tag to install (default: latest)
#   SHELLHUB_INSTALL_DIR  binary directory (default: /usr/local/bin, else ~/.local/bin)
#   SHELLHUB_APP_DIR      macOS app directory (default: /Applications, else ~/Applications)
#   SHELLHUB_CLI=1        macOS: install the CLI binary only, skip ShellHub.app
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

base="https://github.com/$REPO/releases/download/$version"
tmp=$(mktemp -d)
mnt="$tmp/mnt"
trap 'hdiutil detach "$mnt" -quiet >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT INT TERM

download "$base/SHA256SUMS.txt" "$tmp/SHA256SUMS.txt" || fatal "download failed: $base/SHA256SUMS.txt"

# Download release asset $1 into $tmp and verify it against SHA256SUMS.txt.
# That file mixes text ("hash  name") and binary ("hash *name") formats.
get() {
	info "Downloading $1 ($version)..."
	download "$base/$1" "$tmp/$1" || fatal "download failed: $base/$1"
	expected=$(awk -v f="$1" '$2 == f || $2 == "*" f { print $1; exit }' "$tmp/SHA256SUMS.txt")
	[ -n "$expected" ] || fatal "no checksum for $1 in SHA256SUMS.txt"
	actual=$(sha "$tmp/$1" | awk '{print $1}')
	[ "$expected" = "$actual" ] || fatal "checksum mismatch for $1 (expected $expected, got $actual)"
	info "Checksum verified: $1"
}

# --- CLI binary ---

asset="shellhub-$os-$arch"
get "$asset"

dir="${SHELLHUB_INSTALL_DIR:-}"
if [ -n "$dir" ]; then
	mkdir -p "$dir"
	install -m 755 "$tmp/$asset" "$dir/shellhub" || fatal "could not install to $dir"
elif [ -w /usr/local/bin ]; then
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

# --- macOS app bundle ---

appdir=""
if [ "$os" = darwin ] && [ -z "${SHELLHUB_CLI:-}" ]; then
	dmg="shellhub-darwin-$arch.dmg"
	get "$dmg"

	mkdir -p "$mnt"
	hdiutil attach "$tmp/$dmg" -mountpoint "$mnt" -nobrowse -quiet || fatal "could not mount $dmg"
	[ -d "$mnt/ShellHub.app" ] || fatal "ShellHub.app not found in $dmg"

	# $1 is a command prefix ("" or "sudo"), $2 the destination directory.
	copy_app() {
		$1 rm -rf "$2/ShellHub.app" &&
			$1 cp -R "$mnt/ShellHub.app" "$2/" &&
			{ $1 xattr -dr com.apple.quarantine "$2/ShellHub.app" 2>/dev/null || true; }
	}

	appdir="${SHELLHUB_APP_DIR:-}"
	if [ -n "$appdir" ]; then
		mkdir -p "$appdir"
		copy_app "" "$appdir" || fatal "could not install ShellHub.app to $appdir"
	elif [ -w /Applications ]; then
		appdir=/Applications
		copy_app "" "$appdir" || fatal "could not install ShellHub.app to $appdir"
	elif command -v sudo >/dev/null 2>&1 && { [ -t 0 ] || [ -t 2 ]; } && copy_app sudo /Applications; then
		appdir=/Applications
	else
		appdir="$HOME/Applications"
		mkdir -p "$appdir"
		copy_app "" "$appdir" || fatal "could not install ShellHub.app to $appdir"
	fi
fi

installed=$("$dir/shellhub" -version 2>/dev/null) || installed="ShellHub $version"

info ""
if [ -n "$appdir" ]; then
	info "Installed $installed to $appdir/ShellHub.app"
	info "Open it from Spotlight or Finder. On first launch, right-click the app and"
	info "choose Open so Gatekeeper lets it through."
	info ""
fi
info "Installed the CLI to $dir/shellhub"
case ":$PATH:" in
	*":$dir:"*) ;;
	*) info "Note: $dir is not in your PATH. Add it with:"
	   info "  export PATH=\"$dir:\$PATH\"" ;;
esac
info "Next: run 'shellhub' and open http://localhost:8080"
