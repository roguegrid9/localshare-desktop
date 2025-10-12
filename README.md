# RogueGrid9

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.4--beta-orange.svg)](https://github.com/roguegrid9/roguegrid-desktop/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey.svg)](#-platform-support)

> **Open Beta Now Available!** Collaborative computing platform with P2P process sharing - no cloud required.

🚧 **This is beta software** - expect bugs, breaking changes, and rough edges. [Report issues](https://github.com/roguegrid9/roguegrid-desktop/issues) or [get help on Discord](https://discord.gg/7cs9Uh32).

---

## 🎯 What is RogueGrid9?

RogueGrid9 lets teams share running processes, terminals, and applications directly between computers using P2P networking. Think Discord meets VPS, but running on your own hardware.

**Use Cases:**
- Share development servers with your team in real-time
- Collaborative debugging and pair programming
- Multi-player game server hosting
- Distributed computing experiments
- Remote IT support and troubleshooting
- Other cool stuff I havent thought of

---

## Features

### ✅ Available Now (Beta)
- **P2P Process Sharing** - Share terminal sessions, dev servers, and running applications
- **Grid Management** - Create collaborative workspaces and invite team members
- **Real-time Text Chat** - Instant messaging within grids
- **OAuth Authentication** - Secure login with Google or GitHub
- **Cross-platform** - Windows, Linux, and macOS support

### 🚧 Experimental (May Have Issues)
- **Voice Chat** - WebRTC-based voice communication (early stage)
- **macOS Process Discovery** - Limited process detection on Mac

### 📋 Coming Soon (v0.2.0+)
- Stable voice chat with screen sharing
- Full macOS support
- File sharing and collaborative editing
- Performance optimizations
- UI/UX improvements
- A lot more cool stuff like tunnels relays 24/7 process persistance

---

## 💾 Installation

### Download Latest Release

[**📥 Download Beta v0.1.5**](https://github.com/roguegrid9/roguegrid-desktop/releases/latest)

**Choose your platform:**
- 🪟 **Windows 10/11**: `RogueGrid9_0.1.5_x64-setup.exe`
- 🐧 **Linux (Ubuntu 22.04+)**: `roguegrid9_0.1.5_amd64.AppImage`
- 🍎 **macOS 14+**: `RogueGrid9_0.1.5_aarch64.dmg` (Apple Silicon) or `x64.dmg` (Intel)

### Platform-Specific Notes

**Windows:**
- SmartScreen warning is expected (app not yet code-signed for Windows)
- Click "More info/Advanced" → "Run anyway"

**Linux:**
- Make AppImage executable: `chmod +x roguegrid9_*.AppImage`
- Or install the `.deb` package

**macOS:**
- App is code-signed but not yet notarized
- If Gatekeeper blocks it: System Settings → Privacy & Security → "Open Anyway"

---

## 🖥️ Platform Support

| Feature | Windows | Linux | macOS |
|---------|:-------:|:-----:|:-----:|
| Authentication | ✅ | ✅ | ✅ |
| Grid Management | ✅ | ✅ | ✅ |
| Text Chat | ✅ | ✅ | ✅ |
| Process Sharing | ✅ | ✅ | ⚠️ |
| Process Discovery | ✅ | ✅ | ⚠️ |
| Voice Chat | 🚧 | 🚧 | 🚧 |

## 🏁 Quick Start

1. **Download** and install for your platform
2. **Launch** RogueGrid9
3. **Sign in** with Google or GitHub
4. **Create a grid** (your collaborative workspace)
5. **Invite teammates** using the grid invite code
6. **Share processes** by opening terminals or running servers
7. **Collaborate** in real-time!

---

## 🛠️ Development Setup

Want to contribute or run from source?

### Prerequisites
- Node.js 18+
- Rust 1.70+ (via [rustup](https://rustup.rs/))
- Git

### Clone & Run
```bash
# Clone the repository
git clone https://github.com/roguegrid9/roguegrid-desktop.git
cd roguegrid-desktop

# Install dependencies
npm install

# Run in development mode
npm run tauri:dev

# Build production binary
npm run tauri:build

roguegrid-desktop/
├── src/                 # React frontend (TypeScript)
├── src-tauri/          # Rust backend (Tauri)
│   ├── src/            # Core Rust code
│   └── Cargo.toml      # Rust dependencies
├── package.json        # Node dependencies
└── README.md           # You are here
