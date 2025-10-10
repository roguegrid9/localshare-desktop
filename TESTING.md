# RogueGrid9 - Cross-Platform Testing Guide

**Version:** 0.1.4
**Date:** 2025-10-10
**Tester:** [Your Name]
**Platform:** [Mac / Windows / Linux]

---

## Pre-Testing Setup

### 1. Environment Check
```bash
# Verify you're in the project directory
pwd
# Should show: .../roguegrid9-desktop

# Check Node.js version (should be 18+)
node --version

# Check Rust/Cargo (should be 1.70+)
cargo --version

# Pull latest code
git pull origin main
```

### 2. Install Dependencies
```bash
npm install
```

**Expected:** No errors, dependencies installed successfully

---

## Phase 1: Development Mode Testing

### Step 1.1: Launch Dev Mode
```bash
npm run tauri:dev
```

**Expected Output:**
- ✅ Vite dev server starts on http://localhost:5173
- ✅ Tauri window opens automatically
- ✅ No red errors in terminal

**If it fails:**
- Check terminal for errors
- Try `rm -rf node_modules && npm install`
- Try `cargo clean` in src-tauri folder

---

### Step 1.2: Login Flow Test

**Test 1: Google OAuth**
1. Click "Sign in with Google"
2. Browser opens to Google login
3. Select your account
4. Redirected back to app
5. You're logged in

**Pass Criteria:**
- [ ] OAuth redirect works
- [ ] Login completes successfully
- [ ] User info displays (name/email)
- [ ] No console errors (check with F12/Cmd+Opt+I in dev mode)

**Test 2: GitHub OAuth**
1. Log out if needed
2. Click "Sign in with GitHub"
3. Authorize the app
4. Redirected back to app
5. You're logged in

**Pass Criteria:**
- [ ] OAuth redirect works
- [ ] Login completes successfully
- [ ] User info displays
- [ ] No console errors

---

### Step 1.3: Core Features Test

**Test 3: Create Grid**
1. Click "Create Grid" or similar
2. Enter grid name: "Test Grid 123"
3. Submit

**Pass Criteria:**
- [ ] Grid created successfully
- [ ] Grid appears in your grids list
- [ ] Can navigate into the grid

**Test 4: Invite Code**
1. Inside your grid, generate an invite code
2. Copy the code

**Pass Criteria:**
- [ ] Invite code generated
- [ ] Code is copyable
- [ ] Code displays correctly

**Test 5: Text Chat**
1. Navigate to a text channel (probably #general)
2. Type a message: "Test message from [Platform]"
3. Press Enter

**Pass Criteria:**
- [ ] Message sends
- [ ] Message appears in chat
- [ ] Timestamp shows correctly
- [ ] No errors in console

**Test 6: Terminal**
1. Open a terminal/process sharing feature
2. Type a simple command: `echo "Hello from RogueGrid9"`
3. Press Enter

**Pass Criteria:**
- [ ] Terminal renders correctly
- [ ] Command executes
- [ ] Output displays correctly
- [ ] Terminal is responsive

**Test 7: Voice Channel (if available)**
1. Join a voice channel
2. Check microphone permissions (should prompt on first use)

**Pass Criteria:**
- [ ] Permission prompt appears (first time)
- [ ] Can join voice channel
- [ ] Microphone indicator shows activity
- [ ] No audio feedback/echo

---

### Step 1.4: Dev Mode Verdict

**Overall Status:**
- [ ] ✅ PASS - All features work, proceed to Phase 2
- [ ] ⚠️ PARTIAL - Some issues, note them below
- [ ] ❌ FAIL - Critical issues, fix before building

**Issues Found:**
```
[List any bugs, errors, or issues here]




```

---

## Phase 2: Production Binary Testing

### Step 2.1: Build Production Binary

**Stop dev server first** (Ctrl+C)

```bash
npm run tauri:build
```

**Expected:**
- Build process completes (5-15 minutes)
- No fatal errors
- Binary created in `src-tauri/target/release/bundle/`

**Find your binary:**
- **Mac:** `src-tauri/target/release/bundle/dmg/RogueGrid9_0.1.4_aarch64.dmg` (or x64)
- **Windows:** `src-tauri/target/release/bundle/nsis/RogueGrid9_0.1.4_x64-setup.exe`
- **Linux:** `src-tauri/target/release/bundle/appimage/roguegrid9_0.1.4_amd64.AppImage`

**Build Status:**
- [ ] ✅ Build succeeded
- [ ] ❌ Build failed (note error below)

**Build Errors (if any):**
```
[Paste error here]




```

---

### Step 2.2: Install & Launch Binary

**Mac:**
1. Open the .dmg file
2. Drag RogueGrid9 to Applications
3. Launch from Applications folder
4. **Expected warning:** None (should be signed)
5. If warned: System Settings → Privacy & Security → "Open Anyway"

**Windows:**
1. Run the setup.exe
2. **Expected warning:** "Windows protected your PC" (SmartScreen)
3. Click "More info" → "Run anyway"
4. Complete installation
5. Launch from Start Menu

**Linux:**
1. Make AppImage executable: `chmod +x roguegrid9_0.1.4_amd64.AppImage`
2. Run: `./roguegrid9_0.1.4_amd64.AppImage`
3. Should launch without issues

**Launch Status:**
- [ ] ✅ App launches successfully
- [ ] ⚠️ Launches with warnings (expected on Windows)
- [ ] ❌ Fails to launch (note error below)

**Launch Errors (if any):**
```
[Paste error here]




```

---

### Step 2.3: Binary Feature Test

**Repeat ALL tests from Phase 1:**

**Login:**
- [ ] Google OAuth works
- [ ] GitHub OAuth works

**Core Features:**
- [ ] Create grid works
- [ ] Invite code works
- [ ] Text chat works
- [ ] Terminal works
- [ ] Voice works (if tested)

**Production-Specific Checks:**
- [ ] App icon displays correctly
- [ ] Window title is "RogueGrid9"
- [ ] No dev tools available (can't open with F12 - this is correct)
- [ ] Performance feels smooth (no lag)
- [ ] Auto-updater config loads (check Settings if available)

---

### Step 2.4: Platform-Specific Checks

**Mac Only:**
- [ ] App is signed (no Gatekeeper warning)
- [ ] Certificate shows "Peter Kozikowski" when right-click → Get Info
- [ ] Can run from Applications without re-authorization

**Windows Only:**
- [ ] SmartScreen warning appears (expected)
- [ ] App runs after "Run anyway"
- [ ] App appears in Programs list
- [ ] Uninstaller works (optional test)

**Linux Only:**
- [ ] AppImage runs without root
- [ ] No missing library errors
- [ ] Can create desktop shortcut (optional)

---

## Final Verdict

### Phase 1 (Dev Mode):
- [ ] ✅ PASS
- [ ] ⚠️ PARTIAL PASS (minor issues)
- [ ] ❌ FAIL

### Phase 2 (Binary):
- [ ] ✅ PASS
- [ ] ⚠️ PARTIAL PASS (minor issues)
- [ ] ❌ FAIL

### Overall Platform Status:
- [ ] ✅ READY FOR RELEASE
- [ ] ⚠️ READY WITH KNOWN ISSUES (document below)
- [ ] ❌ NOT READY (fix issues first)

---

## Known Issues & Notes

**Critical Issues (Must Fix):**
```
[List blockers here]




```

**Minor Issues (Can Ship With):**
```
[List minor bugs here]




```

**Platform-Specific Notes:**
```
[Any platform quirks or observations]




```

---

## Performance Notes

**App Launch Time:** _____ seconds
**Login Time:** _____ seconds
**Memory Usage (idle):** _____ MB
**Any lag/stuttering?:** Yes / No

---

## Logs & Debugging

**If you encounter issues, attach logs:**

**Mac Logs:**
```bash
# View app logs
cat ~/Library/Logs/RogueGrid9/roguegrid9.log
```

**Windows Logs:**
```cmd
# View logs
type %APPDATA%\RogueGrid9\logs\roguegrid9.log
```

**Linux Logs:**
```bash
# View logs
cat ~/.local/share/RogueGrid9/logs/roguegrid9.log
```

---

## Checklist Summary

**Copy this to your test report:**

```
Platform: [Mac/Windows/Linux]
Tester: [Name]
Date: [Date]

Dev Mode: [ ] PASS / [ ] FAIL
Binary Build: [ ] PASS / [ ] FAIL
Binary Test: [ ] PASS / [ ] FAIL

Critical Issues: [Count]
Minor Issues: [Count]

Ready for Release: [ ] YES / [ ] NO
```

---

## Questions for Claude?

**If you get stuck, ask Claude Code:**
1. Paste the error message
2. Include your platform (Mac/Windows/Linux)
3. Include the test step you were on
4. Attach any relevant logs

**Upload this completed doc to Claude for analysis!**
