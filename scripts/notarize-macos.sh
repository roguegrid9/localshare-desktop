#!/bin/bash

# macOS Notarization Script for RogueGrid9
# Run this after building: npm run tauri build

set -e

# Configuration
APPLE_ID="${APPLE_ID:-your@email.com}"
TEAM_ID="${TEAM_ID:-YOUR_TEAM_ID}"
APP_BUNDLE="src-tauri/target/release/bundle/macos/RogueGrid9.app"
DMG_FILE="src-tauri/target/release/bundle/dmg/RogueGrid9_0.1.3_aarch64.dmg"

echo "🍎 RogueGrid9 macOS Notarization"
echo "================================"
echo ""

# Check if app bundle exists
if [ ! -d "$APP_BUNDLE" ]; then
    echo "❌ Error: App bundle not found at $APP_BUNDLE"
    echo "Run 'npm run tauri build' first!"
    exit 1
fi

# Step 1: Sign the app (if not already signed)
echo "📝 Step 1: Checking code signature..."
if codesign -v --strict "$APP_BUNDLE" 2>/dev/null; then
    echo "✅ App is already signed"
else
    echo "🔏 Signing app bundle..."
    codesign --force --deep --sign "Developer ID Application" \
        --options runtime \
        --entitlements src-tauri/entitlements.plist \
        "$APP_BUNDLE"
    echo "✅ App signed successfully"
fi

# Step 2: Create or verify DMG
echo ""
echo "📦 Step 2: Checking DMG..."
if [ -f "$DMG_FILE" ]; then
    echo "✅ DMG found: $DMG_FILE"
else
    echo "❌ DMG not found. Tauri should have created it during build."
    exit 1
fi

# Step 3: Submit for notarization
echo ""
echo "☁️  Step 3: Submitting to Apple for notarization..."
echo "This may take 2-10 minutes..."
echo ""

# Check if app-specific password is set
if [ -z "$APPLE_PASSWORD" ]; then
    echo "⚠️  APPLE_PASSWORD environment variable not set"
    echo "You'll need to enter your app-specific password"
    echo ""
    echo "To avoid this, create an app-specific password at:"
    echo "https://appleid.apple.com/account/manage"
    echo ""
    read -sp "Enter app-specific password: " APPLE_PASSWORD
    echo ""
fi

# Submit for notarization
xcrun notarytool submit "$DMG_FILE" \
    --apple-id "$APPLE_ID" \
    --team-id "$TEAM_ID" \
    --password "$APPLE_PASSWORD" \
    --wait

# Step 4: Staple the notarization ticket
echo ""
echo "📌 Step 4: Stapling notarization ticket..."
xcrun stapler staple "$DMG_FILE"

echo ""
echo "✅ Success! Your DMG is now notarized and ready to distribute!"
echo ""
echo "DMG location: $DMG_FILE"
echo ""
echo "Users can now open it without seeing 'unidentified developer' warnings."
