# Windows Installation Guide

RogueGrid9 is currently in beta and not yet code-signed for Windows. This means Windows SmartScreen will show warnings when you install it. This is normal for early-stage open source apps.

## Why am I seeing warnings?

Windows code signing certificates cost $100-400/year. As an open-source project in beta, we haven't purchased one yet. **The app is safe** - you can review the source code on GitHub.

## Installation Steps

### Step 1: Download the installer
Download `RogueGrid9_0.1.3_x64_en-US.msi` (or `.exe`) from the [releases page](https://github.com/roguegrid9/roguegrid-desktop/releases).

### Step 2: Bypass SmartScreen warning

When you run the installer, Windows will show:

> **Windows protected your PC**
> Microsoft Defender SmartScreen prevented an unrecognized app from starting.

**Click "More info"** → then click **"Run anyway"**

![SmartScreen bypass](https://i.imgur.com/example.png)

### Step 3: Complete installation
Follow the installer prompts normally.

### Step 4: Allow network access (Important!)

When Windows Firewall prompts you:

> **Windows Defender Firewall has blocked some features**

✅ **Check both boxes:**
- [x] Private networks
- [x] Public networks

Click **"Allow access"**

This is required for P2P networking features.

### Step 5: First launch

If you see another SmartScreen warning on first launch:
1. Right-click the app
2. Select **Properties**
3. Check **"Unblock"** at the bottom
4. Click **Apply** → **OK**
5. Launch the app

## Troubleshooting

### "This app can't run on your PC"
- Make sure you downloaded the right version (x64 for 64-bit Windows)
- Run the installer as administrator (right-click → Run as administrator)

### Connection issues / Can't join grids
Windows Defender may be blocking network access:

1. Open **Windows Security**
2. Go to **Firewall & network protection**
3. Click **"Allow an app through firewall"**
4. Click **"Change settings"** (admin required)
5. Find **RogueGrid9** in the list
6. Check both **Private** and **Public** boxes
7. Click **OK**

### Still having issues?
Open an issue on GitHub or join our Discord for support.

---

## For Advanced Users

If you want to verify the app is safe:

1. **Check the source code:** [github.com/roguegrid9/roguegrid-desktop](https://github.com/roguegrid9/roguegrid-desktop)
2. **Build from source:** Instructions in README.md
3. **Scan with your antivirus:** The app is clean

We plan to purchase a code signing certificate when we have more users. Thanks for being an early adopter! 🚀
