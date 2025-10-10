#!/bin/bash

# RogueGrid9 Auto-Updater Diagnostic Script

set -e

echo "🔍 RogueGrid9 Auto-Updater Diagnostic"
echo "======================================="
echo ""

# 1. Check tauri.conf.json
echo "📋 Checking tauri.conf.json configuration..."
VERSION=$(grep '"version"' src-tauri/tauri.conf.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
UPDATER_ACTIVE=$(grep '"active": true' src-tauri/tauri.conf.json | grep -c "updater" || echo "0")
CREATE_ARTIFACTS=$(grep '"createUpdaterArtifacts": true' src-tauri/tauri.conf.json | wc -l)

echo "  Current version: $VERSION"
echo "  Updater active: $([ "$UPDATER_ACTIVE" -gt 0 ] && echo '✅ Yes' || echo '❌ No')"
echo "  Create updater artifacts: $([ "$CREATE_ARTIFACTS" -gt 0 ] && echo '✅ Yes' || echo '❌ No')"
echo ""

# 2. Check git tags
echo "🏷️  Checking git tags..."
LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "none")
echo "  Latest local tag: $LATEST_TAG"

# Check if tag is pushed
if [ "$LATEST_TAG" != "none" ]; then
    if git ls-remote --tags origin | grep -q "$LATEST_TAG"; then
        echo "  Tag pushed to remote: ✅ Yes"
    else
        echo "  Tag pushed to remote: ❌ No"
    fi
fi
echo ""

# 3. Check if latest.json exists
echo "🌐 Checking GitHub release files..."
LATEST_JSON_URL="https://github.com/roguegrid9/roguegrid-desktop/releases/latest/download/latest.json"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$LATEST_JSON_URL")

if [ "$HTTP_CODE" = "200" ]; then
    echo "  latest.json: ✅ Found"
    echo ""
    echo "📄 Contents of latest.json:"
    curl -s "$LATEST_JSON_URL" | jq . || curl -s "$LATEST_JSON_URL"
elif [ "$HTTP_CODE" = "404" ]; then
    echo "  latest.json: ❌ Not found (404)"
    echo ""
    echo "  ⚠️  PROBLEM IDENTIFIED:"
    echo "  The latest.json file is missing from your GitHub release."
    echo ""
    echo "  Possible causes:"
    echo "  1. Tauri signing keys not set in GitHub Secrets"
    echo "  2. GitHub Actions workflow failed"
    echo "  3. createUpdaterArtifacts not working properly"
    echo ""
    echo "  Next steps:"
    echo "  1. Check GitHub Actions: https://github.com/roguegrid9/roguegrid-desktop/actions"
    echo "  2. Verify GitHub Secrets: TAURI_PRIVATE_KEY and TAURI_PRIVATE_KEY_PASSWORD"
    echo "  3. Check release assets: https://github.com/roguegrid9/roguegrid-desktop/releases"
else
    echo "  latest.json: ⚠️  HTTP $HTTP_CODE (might be private repo)"
fi
echo ""

# 4. Check local build artifacts
echo "🔨 Checking local build artifacts..."
if [ -d "src-tauri/target/release/bundle" ]; then
    echo "  Build directory exists: ✅"

    # Check for latest.json
    LATEST_JSON_FILES=$(find src-tauri/target/release/bundle -name "latest.json" 2>/dev/null || echo "")
    if [ -n "$LATEST_JSON_FILES" ]; then
        echo "  latest.json found locally: ✅"
        echo "  Locations:"
        echo "$LATEST_JSON_FILES" | sed 's/^/    /'
    else
        echo "  latest.json found locally: ❌"
    fi

    # Check for .sig files
    SIG_FILES=$(find src-tauri/target/release/bundle -name "*.sig" 2>/dev/null | wc -l)
    echo "  Signature files (.sig): $([ "$SIG_FILES" -gt 0 ] && echo "✅ $SIG_FILES found" || echo '❌ None found')"
else
    echo "  Build directory: ❌ Not found (run 'npm run tauri build' first)"
fi
echo ""

# 5. Summary
echo "📊 Summary"
echo "==========="

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Auto-updater should be working!"
    echo ""
    echo "Test it by:"
    echo "1. Changing version in tauri.conf.json to something higher"
    echo "2. Running the app in dev mode"
    echo "3. App should detect the update"
elif [ "$HTTP_CODE" = "404" ]; then
    echo "❌ Auto-updater is NOT working"
    echo ""
    echo "Fix by creating a new release with proper updater artifacts:"
    echo "1. Ensure TAURI_PRIVATE_KEY and TAURI_PRIVATE_KEY_PASSWORD are set in GitHub Secrets"
    echo "2. Bump version in src-tauri/tauri.conf.json"
    echo "3. Create and push a new tag: git tag v0.1.x && git push origin v0.1.x"
    echo "4. Wait for GitHub Actions to complete"
    echo "5. Verify latest.json exists in the release"
else
    echo "⚠️  Could not verify (might be private repo)"
    echo ""
    echo "Manually check:"
    echo "1. https://github.com/roguegrid9/roguegrid-desktop/releases"
    echo "2. https://github.com/roguegrid9/roguegrid-desktop/actions"
fi
echo ""
