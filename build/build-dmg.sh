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

echo "Packaging DMG for macOS $ARCH using binary $BINARY_PATH..."

# Ensure we are in build directory
cd "$(dirname "$0")"

# Create dist directory
mkdir -p dist

# Compile icon generator and create iconset
go run genicon.go --out icon.png --size 512

# Create iconset for macOS
mkdir -p shellhub.iconset
sips -z 16 16     icon.png --out shellhub.iconset/icon_16x16.png
sips -z 32 32     icon.png --out shellhub.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out shellhub.iconset/icon_32x32.png
sips -z 64 64     icon.png --out shellhub.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out shellhub.iconset/icon_128x128.png
sips -z 256 256   icon.png --out shellhub.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out shellhub.iconset/icon_256x256.png
sips -z 512 512   icon.png --out shellhub.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out shellhub.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out shellhub.iconset/icon_512x512@2x.png

# Create icns
iconutil -c icns shellhub.iconset -o shellhub.icns
rm -rf shellhub.iconset

# Assemble App Bundle
APP_DIR="dist/dmg_root/ShellHub.app"
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

# Copy pre-built binary
cp "$BINARY_PATH" "$APP_DIR/Contents/MacOS/shellhub"
chmod +x "$APP_DIR/Contents/MacOS/shellhub"

# Write Info.plist
cat <<EOF > "$APP_DIR/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>shellhub</string>
    <key>CFBundleIconFile</key>
    <string>shellhub.icns</string>
    <key>CFBundleIdentifier</key>
    <string>com.shivarchit.shellhub</string>
    <key>CFBundleName</key>
    <string>ShellHub</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>0.1.2</string>
    <key>LSMinimumSystemVersion</key>
    <string>11.0</string>
    <key>LSUIElement</key>
    <string>true</string>
</dict>
</plist>
EOF

# Copy icns into App Bundle
cp shellhub.icns "$APP_DIR/Contents/Resources/shellhub.icns"

# Create symlink to Applications
ln -s -f /Applications "dist/dmg_root/Applications"

# Create DMG
hdiutil create -volname "ShellHub" -srcfolder dist/dmg_root -ov -format UDZO "dist/shellhub-darwin-$ARCH.dmg"

# Clean up
rm -rf dist/dmg_root
rm -f shellhub.icns
rm -f icon.png

echo "Built dist/shellhub-darwin-$ARCH.dmg successfully."
