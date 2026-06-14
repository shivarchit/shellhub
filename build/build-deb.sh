#!/bin/bash
set -e

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <path_to_binary> <arch>"
    exit 1
fi

BINARY_PATH=$1
ARCH=$2

# Resolve BINARY_PATH to an absolute path
if [[ "$BINARY_PATH" != /* ]]; then
    BINARY_PATH="$(pwd)/$BINARY_PATH"
fi

# Translate arch to debian standards (amd64, arm64)
DEB_ARCH=$ARCH
if [ "$ARCH" = "x86_64" ]; then
    DEB_ARCH="amd64"
fi

if ! command -v dpkg-deb >/dev/null 2>&1; then
    echo "Warning: dpkg-deb not found. Skipping DEB packaging."
    exit 0
fi

echo "Packaging DEB for Linux $DEB_ARCH using binary $BINARY_PATH..."

# Ensure we are in build directory
cd "$(dirname "$0")"

# Setup temporary staging directory
STAGE_DIR="dist/deb_root/shellhub_${DEB_ARCH}"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/DEBIAN"
mkdir -p "$STAGE_DIR/usr/local/bin"
mkdir -p "$STAGE_DIR/usr/share/applications"
mkdir -p "$STAGE_DIR/usr/share/pixmaps"

# Copy binary
cp "$BINARY_PATH" "$STAGE_DIR/usr/local/bin/shellhub"
chmod +x "$STAGE_DIR/usr/local/bin/shellhub"

# Generate launcher icon
go run genicon.go --out "$STAGE_DIR/usr/share/pixmaps/shellhub.png" --size 512

# Create desktop launcher file
cat <<EOF > "$STAGE_DIR/usr/share/applications/shellhub.desktop"
[Desktop Entry]
Name=ShellHub
Comment=Lightweight web-based SSH client and server management tool
Exec=/usr/local/bin/shellhub
Icon=shellhub
Type=Application
Categories=Utility;
Terminal=false
EOF

# Create Debian control file
cat <<EOF > "$STAGE_DIR/DEBIAN/control"
Package: shellhub
Version: 0.1.2
Section: utils
Priority: optional
Architecture: ${DEB_ARCH}
Maintainer: Shivarchit <shivarchit@users.noreply.github.com>
Description: A lightweight web-based SSH client and server management tool.
EOF

# Build package
dpkg-deb --build "$STAGE_DIR" "dist/shellhub-linux-${DEB_ARCH}.deb"

# Clean up
rm -rf dist/deb_root

echo "Built dist/shellhub-linux-${DEB_ARCH}.deb successfully."
