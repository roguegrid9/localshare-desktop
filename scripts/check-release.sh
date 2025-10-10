#!/bin/bash

# Check if GitHub release is ready

VERSION=${1:-0.1.4}
REPO="roguegrid9/roguegrid-desktop"

echo "🔍 Checking release v${VERSION}..."
echo ""

# Check if release exists
RELEASE_URL="https://api.github.com/repos/${REPO}/releases/tags/v${VERSION}"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$RELEASE_URL")

if [ "$STATUS" = "200" ]; then
    echo "✅ Release v${VERSION} exists!"
    echo ""

    # Get release info
    echo "📦 Assets:"
    curl -s "$RELEASE_URL" | grep -o '"name": "[^"]*"' | sed 's/"name": "//;s/"$//' | while read asset; do
        echo "  - $asset"
    done
    echo ""

    # Check for latest.json specifically
    if curl -s "$RELEASE_URL" | grep -q "latest.json"; then
        echo "✅ latest.json found!"
    else
        echo "❌ latest.json NOT found"
    fi

    echo ""
    echo "🌐 View release: https://github.com/${REPO}/releases/tag/v${VERSION}"

elif [ "$STATUS" = "404" ]; then
    echo "⏳ Release v${VERSION} not created yet (GitHub Actions still building)"
    echo ""
    echo "Check progress: https://github.com/${REPO}/actions"
else
    echo "⚠️  Unexpected status: $STATUS"
fi
