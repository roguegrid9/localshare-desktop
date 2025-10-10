#!/bin/bash

# Prepare update files for self-hosted server
# This script copies latest.json from GitHub release and updates URLs

set -e

if [ $# -eq 0 ]; then
    echo "Usage: $0 <version>"
    echo "Example: $0 0.1.4"
    exit 1
fi

VERSION=$1
SERVER_URL="https://roguegrid9-coordinator.fly.dev/updates"
GITHUB_REPO="roguegrid9/roguegrid-desktop"
SERVER_DIR="../roguegrid9-server/server/public/updates"

echo "🚀 Preparing update files for version $VERSION"
echo "=============================================="
echo ""

# 1. Download latest.json from GitHub release
echo "📥 Downloading latest.json from GitHub..."
RELEASE_URL="https://github.com/$GITHUB_REPO/releases/download/v${VERSION}/latest.json"

curl -L -o /tmp/latest.json "$RELEASE_URL" 2>/dev/null || {
    echo "❌ Failed to download latest.json from $RELEASE_URL"
    echo ""
    echo "Make sure:"
    echo "1. Version v${VERSION} exists as a GitHub release"
    echo "2. The release includes latest.json"
    exit 1
}

echo "✅ Downloaded latest.json"
echo ""

# 2. Update URLs to point to self-hosted server
echo "🔧 Updating URLs to point to $SERVER_URL..."

# Use jq if available, otherwise use sed
if command -v jq &> /dev/null; then
    # Update all platform URLs to point to our server
    jq --arg server "$SERVER_URL" '
        .platforms |= with_entries(
            .value.url |= ($server + "/" + (.value.url | split("/") | last))
        )
    ' /tmp/latest.json > /tmp/latest-updated.json

    mv /tmp/latest-updated.json /tmp/latest.json
    echo "✅ URLs updated (using jq)"
else
    # Fallback: simple sed replacement (less reliable but works)
    sed -i "s|https://github.com/$GITHUB_REPO/releases/download/v${VERSION}|$SERVER_URL|g" /tmp/latest.json
    echo "✅ URLs updated (using sed)"
fi

echo ""

# 3. Copy to server directory
echo "📋 Copying to server directory..."

if [ ! -d "$SERVER_DIR" ]; then
    mkdir -p "$SERVER_DIR"
    echo "Created directory: $SERVER_DIR"
fi

cp /tmp/latest.json "$SERVER_DIR/latest.json"
echo "✅ Copied latest.json to $SERVER_DIR"
echo ""

# 4. Show the updated content
echo "📄 Updated latest.json content:"
cat "$SERVER_DIR/latest.json" | head -20
echo ""

# 5. Instructions
echo "✅ Done!"
echo ""
echo "Next steps:"
echo "1. Commit and push the server changes:"
echo "   cd ../roguegrid9-server/server"
echo "   git add public/updates/latest.json"
echo "   git commit -m \"Update to v${VERSION}\""
echo "   git push origin main"
echo ""
echo "2. The file will be available at:"
echo "   $SERVER_URL/latest.json"
echo ""
echo "Note: You don't need to host the actual binaries (.msi, .dmg, etc.)"
echo "      They can still be downloaded from GitHub releases."
echo "      Only latest.json needs to be on your server!"
