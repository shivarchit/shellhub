#!/bin/bash
set -e

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <path_to_binary> <arch>"
    exit 1
fi

BINARY_PATH=$1
ARCH=$2

# Translate arch to RPM standard (amd64 -> x86_64, arm64 -> aarch64)
RPM_ARCH=$ARCH
if [ "$ARCH" = "amd64" ]; then
    RPM_ARCH="x86_64"
elif [ "$ARCH" = "arm64" ]; then
    RPM_ARCH="aarch64"
fi

if ! command -v rpmbuild >/dev/null 2>&1; then
    echo "Warning: rpmbuild not found. Skipping RPM packaging."
    exit 0
fi

echo "Packaging RPM for Linux $RPM_ARCH using binary $BINARY_PATH..."

# Ensure we are in build directory
cd "$(dirname "$0")"

# Setup local rpmbuild directories
RPMBUILD_DIR="$(pwd)/dist/rpm_root/rpmbuild"
rm -rf "$RPMBUILD_DIR"
mkdir -p "$RPMBUILD_DIR/SOURCES"
mkdir -p "$RPMBUILD_DIR/SPECS"
mkdir -p "$RPMBUILD_DIR/RPMS"
mkdir -p "$RPMBUILD_DIR/BUILD"
mkdir -p "$RPMBUILD_DIR/SRPMS"

# Copy binary to SOURCES
cp "$BINARY_PATH" "$RPMBUILD_DIR/SOURCES/shellhub"

# Generate launcher icon
go run genicon.go --out "$RPMBUILD_DIR/SOURCES/shellhub.png" --size 512

# Create desktop launcher file in SOURCES
cat <<EOF > "$RPMBUILD_DIR/SOURCES/shellhub.desktop"
[Desktop Entry]
Name=ShellHub
Comment=Lightweight web-based SSH client and server management tool
Exec=/usr/local/bin/shellhub
Icon=shellhub
Type=Application
Categories=Utility;
Terminal=false
EOF

# Build package
rpmbuild --define "_topdir $RPMBUILD_DIR" \
         --target "$RPM_ARCH" \
         -bb shellhub.spec

# Copy generated RPM to dist
cp "$RPMBUILD_DIR"/RPMS/"$RPM_ARCH"/*.rpm "dist/shellhub-linux-$ARCH.rpm"

# Clean up
rm -rf dist/rpm_root

echo "Built dist/shellhub-linux-$ARCH.rpm successfully."
