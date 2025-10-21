<div align="center">

# 🌐 LocalShare

### Share your localhost instantly. No deploy, no config, just share.

[![Download](https://img.shields.io/github/v/release/roguegrid9/localshare-desktop?label=Download&color=blue)](https://github.com/roguegrid9/localshare-desktop/releases/latest)
[![License](https://img.shields.io/github/license/roguegrid9/localshare-desktop)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](https://github.com/roguegrid9/localshare-desktop/releases/latest)

[Download Beta](https://github.com/roguegrid9/localshare-desktop/releases/latest) • [Website](https://roguegrid9.com) • [Report Bug](https://github.com/roguegrid9/localshare-desktop/issues)

</div>

---

## What is LocalShare?

LocalShare lets you **share any localhost server with teammates in one click**. Perfect for code reviews, client demos, pair programming, and quick feedback.

**The problem:** "Can you review my PR?" → Checkout branch, npm install, npm run dev... **10 minutes wasted**.

**The solution:** Click share, send link, done. **30 seconds**.

No deployment. No configuration. No port forwarding. Just instant, secure sharing.

---

## ✨ Features

- 🚀 **One-click sharing** - Automatically detects localhost servers
- 🔒 **Secure HTTPS** - All tunnels use HTTPS with valid certificates
- 🌍 **Global relays** - 5 servers across 3 continents for low latency
- ⚡ **P2P first** - Direct connections when possible, relay fallback
- 🎨 **Fun subdomains** - `purple-dragon-7824.roguegrid9.com`
- 💬 **Built-in chat** - Text and voice channels per workspace
- 📊 **Bandwidth tracking** - 50GB free during beta
- 🔄 **Auto-discovery** - Detects React, Next.js, Python, and more
- 🛡️ **Privacy-focused** - End-to-end encrypted P2P connections

---

## 🚀 Quick Start

### 1️⃣ Install

Download for your platform:

| Platform | Download |
|----------|----------|
| 🪟 Windows | [.msi installer](https://github.com/roguegrid9/localshare-desktop/releases/latest) |
| 🍎 macOS | [.dmg installer](https://github.com/roguegrid9/localshare-desktop/releases/latest) |
| 🐧 Linux | [.deb package](https://github.com/roguegrid9/localshare-desktop/releases/latest) |

### 2️⃣ Share a Server

```bash
# Start any localhost server
npm run dev  # React/Vite on :5173
python3 -m http.server 8000  # Python on :8000
rails s  # Rails on :3000

# Open LocalShare → Click "Share" → Copy link → Send to teammate
```

### 3️⃣ View in Browser

Your teammate opens the link in any browser. **No app installation needed for viewers.**

They get a secure HTTPS URL like: `https://purple-dragon-7824.roguegrid9.com`

---

## 💡 Use Cases

<table>
<tr>
<td width="50%">

### 👨‍💻 Code Reviews
```diff
- Before: Checkout branch, npm install, npm run dev
- Time: 10 minutes
+ After: Click share, send link
+ Time: 30 seconds
```

</td>
<td width="50%">

### 🎨 Designer Feedback
Let designers test the **real thing**: responsive design, animations, interactions—not just static screenshots.

</td>
</tr>
<tr>
<td width="50%">

### 👔 Client Demos
Show work-in-progress **without deploying**. Get real-time feedback on features before they hit production.

</td>
<td width="50%">

### 🤝 Pair Programming
Both people can **interact with the app**, not just watch a screen share. Full collaboration.

</td>
</tr>
</table>

---

## 🛠️ Framework Support

### React / Vite

Add to `vite.config.js`:

```javascript
export default {
  server: {
    allowedHosts: ['.roguegrid9.com']
  }
}
```

### Next.js

Works out of the box! Just share your `localhost:3000` server.

### Python

```bash
python3 -m http.server 8000
# LocalShare auto-detects port 8000
```

### Node.js / Express

Works with any Express app. No configuration needed.

### Ruby on Rails

```bash
rails server
# Share port 3000
```

### Other Frameworks

LocalShare supports **any HTTP server** running on localhost. If it works in your browser at `localhost:PORT`, it works with LocalShare.

---

## 🔧 How It Works

1. **Detection**: LocalShare scans for active localhost ports
2. **Tunnel Creation**: Creates secure HTTPS tunnel via WebRTC (P2P) or FRP relay
3. **Link Generation**: Generates shareable link with fun subdomain
4. **Access Control**: Manage who can access your shared services
5. **Auto-Cleanup**: Tunnels close when you stop the local server

### Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   You       │         │  LocalShare  │         │  Teammate   │
│ localhost:  │  ◄──►   │   Relay      │  ◄──►   │   Browser   │
│   3000      │         │  (Global)    │         │   HTTPS     │
└─────────────┘         └──────────────┘         └─────────────┘
                               ▲
                               │
                        WebRTC P2P (when possible)
```

- **Desktop App**: Rust (Tauri) + React
- **Backend**: Go API server
- **Database**: Supabase (PostgreSQL)
- **Networking**: WebRTC P2P + FRP relay servers
- **Relays**: 5 global locations (Digital Ocean, Vultr)

---

## 🗺️ Roadmap

### ✅ Completed (Beta v0.0.1)
- [x] One-click HTTP/HTTPS tunnel sharing
- [x] Auto-detection of localhost servers
- [x] Global relay network (5 regions)
- [x] Built-in workspace chat
- [x] Bandwidth tracking
- [x] Cross-platform desktop app (Windows, macOS, Linux)

### 🚧 In Progress
- [ ] Desktop-to-desktop P2P improvements
- [ ] Custom subdomain names
- [ ] Grid/workspace management improvements
- [ ] Enhanced terminal sharing

### 🔮 Planned
- [ ] Browser extension for one-click sharing
- [ ] Mobile app (iOS/Android)
- [ ] Team collaboration features
- [ ] Self-hosted relay option
- [ ] API for programmatic tunnel creation
- [ ] VS Code extension

[Vote on features →](https://github.com/roguegrid9/localshare-desktop/discussions)

---

## 🐛 Known Issues

- Grid deletion UI not implemented (workaround: old grids auto-expire)
- Some WebSocket frameworks require `allowedHosts` configuration
- Desktop-to-desktop P2P connection can be unreliable (relay fallback works)

[See all issues →](https://github.com/roguegrid9/localshare-desktop/issues)

---

## 🤝 Contributing

Contributions are welcome! We're planning to open source more components soon.

- **Report bugs**: [GitHub Issues](https://github.com/roguegrid9/localshare-desktop/issues)
- **Request features**: [Discussions](https://github.com/roguegrid9/localshare-desktop/discussions)
- **Ask questions**: [GitHub Discussions](https://github.com/roguegrid9/localshare-desktop/discussions)

### Development Setup

```bash
# Clone the repo
git clone https://github.com/roguegrid9/localshare-desktop.git
cd localshare-desktop

# Install dependencies
npm install

# Run in dev mode
npm run tauri dev

# Build for production
npm run tauri build
```

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

Built with these amazing open source projects:

- [Tauri](https://tauri.app) - Lightweight desktop framework
- [WebRTC](https://webrtc.org) - Peer-to-peer networking
- [FRP](https://github.com/fatedier/frp) - Fast reverse proxy
- [Supabase](https://supabase.com) - Backend infrastructure
- [React](https://react.dev) - UI framework
- [Vite](https://vitejs.dev) - Build tool

---

<div align="center">

### 🚀 Ready to share?

**[Download LocalShare →](https://github.com/roguegrid9/localshare-desktop/releases/latest)**

**Free Beta** • 50GB bandwidth • No credit card required

[Website](https://roguegrid9.com) • [Documentation](https://github.com/roguegrid9/localshare-desktop/wiki) • [Community](https://github.com/roguegrid9/localshare-desktop/discussions)

---

Made with ❤️ by [RogueGrid](https://roguegrid9.com)

</div>
