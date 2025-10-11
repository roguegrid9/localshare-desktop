# Release Notes

## 🎉 v0.1.4 Beta - First Public Release
**Release Date:** October 11, 2025

---

## 🚀 What's New

This is the **first public beta release** of RogueGrid9! After months of development, we're opening the platform to everyone.

### Major Features
- ✅ **Cross-platform P2P networking** - Direct peer-to-peer connections between Windows and Linux machines
- ✅ **OAuth authentication** - Secure login with Google and GitHub
- ✅ **Grid management** - Create collaborative workspaces and invite team members
- ✅ **Real-time text chat** - Instant messaging within grids
- ✅ **Process sharing** - Share running terminals, dev servers, and applications (Windows/Linux)
- ✅ **Terminal emulation** - Full-featured terminal with xterm.js
- ✅ **WebSocket coordination** - Real-time synchronization via coordinator server

### Platform Support
- **Windows 10/11:** Fully tested and supported ✅
- **Linux (Ubuntu 22.04+):** Fully tested and supported ✅
- **macOS 14+:** Partial support - auth and chat work, process sharing limited ⚠️

---

## ✅ What Works Well

### Networking
- P2P connection establishment between peers
- WebRTC data channels for low-latency communication
- Automatic relay fallback when direct connections fail
- WebSocket-based coordination server

### Authentication
- Google OAuth integration
- GitHub OAuth integration
- Persistent session management
- Secure token storage

### Collaboration
- Real-time text messaging
- Grid member presence indicators
- Invite code system with expiration
- Role-based permissions (owner, admin, member)

### Process Management
- Terminal process creation and management
- Process discovery and detection (Windows/Linux)
- Process sharing across grid members
- Real-time process output streaming

---

## ⚠️ Known Limitations

### Critical Issues
1. **macOS Process Discovery Incomplete**
   - Some processes may not be detected on macOS
   - Process sharing on Mac is experimental
   - **Workaround:** Works fine for basic terminal sessions
   - **Fix:** Planned for v0.2.0

2. **Voice Chat Experimental**
   - Voice may be unstable or crash
   - Audio quality not optimized
   - Echo cancellation needs work
   - **Workaround:** Use external voice chat (Discord) for now
   - **Fix:** Major focus for v0.2.0

### Minor Issues
1. **First Launch Slow**
   - Initial P2P connection can take 10-20 seconds
   - **Workaround:** Be patient, subsequent connections are faster
   - **Fix:** Optimization in progress

2. **Large File Transfers Untested**
   - File sharing over P2P not fully tested
   - May fail or timeout on large files (>100MB)
   - **Workaround:** Use alternative file transfer for now
   - **Fix:** Testing and optimization planned

3. **UI Polish Needed**
   - Some buttons/layouts need refinement
   - Error messages could be more helpful
   - Loading states could be clearer
   - **Fix:** Continuous improvement

4. **Windows SmartScreen Warning**
   - Windows shows "Unknown Publisher" warning
   - This is normal for unsigned applications
   - **Workaround:** Click "More info" → "Run anyway"
   - **Fix:** Code signing planned for v0.2.0

5. **macOS Gatekeeper Warning**
   - macOS may block first launch
   - App is signed but not yet notarized
   - **Workaround:** System Settings → Privacy & Security → "Open Anyway"
   - **Fix:** Notarization planned for v0.2.0

---

## 🐛 Reported Bugs

None yet - this is the first public release! 

**Found a bug?** [Report it on GitHub](https://github.com/roguegrid9/roguegrid-desktop/issues)

---

## 🔧 Platform-Specific Notes

### Windows 10/11
**Status:** ✅ Fully Supported

**Testing:**
- Tested on Windows 10 (build 19045) and Windows 11 (build 22621)
- Intel x64 and AMD64 processors
- 8GB+ RAM recommended

**Known Issues:**
- SmartScreen warning on first launch (expected)
- Firewall may prompt for network access (allow it)

**Installation:**
1. Download `RogueGrid9_0.1.4_x64-setup.exe`
2. Run installer
3. Click "More info" → "Run anyway" if SmartScreen blocks
4. Complete installation
5. Launch from Start Menu

---

### Linux (Ubuntu 22.04+)
**Status:** ✅ Fully Supported

**Testing:**
- Tested on Ubuntu 22.04 LTS and 24.04 LTS
- x86_64 architecture
- GNOME and KDE desktop environments

**Known Issues:**
- None reported yet

**Installation (AppImage):**
```bash
# Download the AppImage
wget https://github.com/roguegrid9/roguegrid-desktop/releases/download/v0.1.4/roguegrid9_0.1.4_amd64.AppImage

# Make it executable
chmod +x roguegrid9_0.1.4_amd64.AppImage

# Run it
./roguegrid9_0.1.4_amd64.AppImage
Installation (.deb):
bash# Download the .deb package
wget https://github.com/roguegrid9/roguegrid-desktop/releases/download/v0.1.4/roguegrid9_0.1.4_amd64.deb

# Install
sudo dpkg -i roguegrid9_0.1.4_amd64.deb

# Fix dependencies if needed
sudo apt-get install -f

macOS 14+ (Sonoma and later)
Status: ⚠️ Partial Support (Experimental)
Testing:

Tested on macOS 14 Sonoma
Apple Silicon (M1/M2/M3/M4) and Intel processors
8GB+ RAM recommended

Known Issues:

Process discovery incomplete (some processes not detected)
Gatekeeper may block first launch
Process sharing experimental

What Works:

✅ Authentication (Google/GitHub)
✅ Grid creation and joining
✅ Text chat
✅ Basic terminal sessions
⚠️ Process sharing (limited)

What Doesn't Work:

❌ Automatic process discovery (many false negatives)
❌ Voice chat (same as other platforms)

Installation:

Download RogueGrid9_0.1.4_aarch64.dmg (Apple Silicon) or x64.dmg (Intel)
Open the DMG
Drag RogueGrid9 to Applications folder
Launch from Applications
If blocked: System Settings → Privacy & Security → "Open Anyway"


📊 Performance Benchmarks
Connection Establishment

Direct P2P: 2-5 seconds (same LAN)
Direct P2P: 5-10 seconds (different networks)
Relay fallback: 10-20 seconds

Message Latency

Text messages: <100ms (P2P)
Text messages: <500ms (relay)
Process output: <200ms

Resource Usage

Idle: ~150MB RAM, <1% CPU
Active chat: ~200MB RAM, <5% CPU
Voice chat: ~250MB RAM, 10-15% CPU (per stream)


🚀 What's Next: v0.2.0 Roadmap
High Priority

🎯 Stable voice chat - Complete rewrite with better codecs
🎯 Full macOS support - Fix process discovery
🎯 Code signing - Windows and macOS certificates
🎯 Performance optimization - Reduce latency and resource usage

Medium Priority

📁 File sharing - Robust P2P file transfer
🖥️ Screen sharing - Share your screen with grid members
🔔 Notifications - Desktop notifications for messages and events
🎨 UI improvements - Polish and refinement

Low Priority

📊 Analytics dashboard - Grid usage statistics
🔌 Plugin system - Third-party extensions
🌍 Internationalization - Multi-language support
📱 Mobile companion app - iOS/Android monitoring

Estimated Release: December 2025

🙏 Thank You
Thank you for trying RogueGrid9! This is an early beta - your feedback is invaluable.
How to Help:

🐛 Report bugs on GitHub Issues
💬 Share feedback on Discord
⭐ Star the repo if you like it!
📢 Tell your friends and colleagues

Questions? Join our Discord or email team@roguegrid.com

📝 Full Changelog
Added

Initial public beta release
Cross-platform desktop application (Windows, Linux, macOS)
OAuth authentication with Google and GitHub
Grid creation and management system
Real-time text chat with persistent history
P2P process sharing (Windows/Linux)
Terminal emulation with xterm.js
WebRTC-based P2P networking
WebSocket coordination server integration
Voice chat (experimental)
Invite code system with expiration
Role-based permissions (owner, admin, member)
Process discovery and management
Auto-updater framework (disabled in beta)

Changed

N/A (first release)

Deprecated

N/A (first release)

Removed

N/A (first release)

Fixed

N/A (first release)

Security

OAuth-only authentication (no password storage)
P2P encryption for direct connections
Secure token storage using OS keychain
HTTPS/WSS for all server communication


📋 Installation Requirements
Minimum System Requirements

OS: Windows 10 (1809+), Ubuntu 22.04+, macOS 14+
RAM: 4GB (8GB recommended)
Storage: 500MB free space
Network: Broadband internet connection
Ports: Ability to make outbound WebSocket connections

Required Permissions

Network access (for P2P connections)
Firewall rules (may prompt on first launch)
OAuth redirects (for authentication)