# LocalShare (by RogueGrid)

> Share your localhost instantly. No deploy, no config, just share.

[![Download](https://img.shields.io/github/v/release/roguegrid9/roguegrid9)](https://github.com/roguegrid9/roguegrid9/releases)
[![License](https://img.shields.io/github/license/roguegrid9/roguegrid9)](LICENSE)

**[Download Beta](https://github.com/roguegrid9/roguegrid9/releases/latest)** • **[Website](https://roguegrid9.com)** • **[Documentation](docs/)**

---

## What is LocalShare?

LocalShare lets you share any localhost server with teammates in one click. Perfect for code reviews, client demos, pair programming, and quick feedback.

**The problem:** "Can you review my PR?" → Checkout branch, npm install, npm run dev... 10 minutes wasted.

**The solution:** Click share, send link, done. 30 seconds.

---

## ✨ Features

- 🚀 **One-click sharing** - Detects localhost servers automatically
- 🔒 **Secure HTTPS** - All tunnels use HTTPS with valid certificates
- 🌍 **Global relays** - 5 servers across 3 continents for low latency
- ⚡ **P2P first** - Direct connections when possible, relay fallback
- 🎨 **Fun subdomains** - purple-dragon-7824.roguegrid9.com
- 💬 **Built-in chat** - Text and voice channels per workspace
- 📊 **Bandwidth tracking** - 50GB free during beta

---

## 🚀 Quick Start

### 1. Install

Download for your platform:
- [Windows](https://github.com/roguegrid9/roguegrid9/releases/latest) (.msi)
- [macOS](https://github.com/roguegrid9/roguegrid9/releases/latest) (.dmg)
- [Linux](https://github.com/roguegrid9/roguegrid9/releases/latest) (.deb)

### 2. Share a Server
```bash
# Start any localhost server
npm run dev  # React on :5173
python3 -m http.server 8000  # Python on :8000

# Open LocalShare
# Click "Share" next to your process
# Copy the link
# Send to teammate
```

### 3. View in Browser

Teammate opens the link in any browser. No app installation needed for viewers.

---

## 📖 Use Cases

### Code Reviews
```
Before: Checkout branch, npm install, npm run dev → 10 minutes
After: Click share, send link → 30 seconds
```

### Client Demos
Show work-in-progress without deploying. Get real-time feedback.

### Pair Programming
Both people can interact with the app, not just watch a screen share.

### Designer Feedback
Designers test the real thing: responsive design, animations, interactions.

---

## 🛠️ Framework Support

### React (Vite)

Add to `vite.config.js`:
```javascript
export default {
  server: {
    allowedHosts: ['.roguegrid9.com']
  }
}
```

### Next.js

Works out of the box! Share your `localhost:3000` server.

### Python
```bash
python3 -m http.server 8000
# Share port 8000
```

### Node.js/Express

Works with any Express app on localhost.

---

## 🏗️ Architecture

- **Desktop App:** Rust (Tauri) + React
- **Backend:** Go API server
- **Database:** Supabase (PostgreSQL)
- **Networking:** WebRTC P2P + FRP relay servers
- **Relays:** 5 global locations (Digital Ocean, Vultr)

---

## 🐛 Known Issues

- Grid deletion not implemented (workaround: ignore old grids)
- Some WebSocket frameworks need configuration
- Desktop-to-desktop P2P still in testing

[See all issues](https://github.com/roguegrid9/roguegrid9/issues)

---

## 🤝 Contributing

Contributions welcome! We're planning to open source more components soon.

- Report bugs: [GitHub Issues](https://github.com/roguegrid9/roguegrid9/issues)
- Request features: [Discussions](https://github.com/roguegrid9/roguegrid9/discussions)
- Ask questions: Reddit or GitHub

---

## 📜 License

MIT Licence

---

## 🙏 Acknowledgments

Built with these amazing open source projects:
- [Tauri](https://tauri.app) - Desktop framework
- [WebRTC](https://webrtc.org) - P2P networking
- [FRP](https://github.com/fatedier/frp) - Relay servers
- [Supabase](https://supabase.com) - Backend infrastructure

---

**Website:** https://roguegrid9.com
**Beta:** Free • 50GB bandwidth • No credit card required
```

---

## **3. Demo Video (Already Halfway Done - 30 min)**

**You said halfway done - finish it:**

**What you need:**
- Total length: 2-3 minutes
- Clear audio (critical!)
- Shows full flow working
- Ends with clear CTA

**Upload to:**
- YouTube (set to Public)
- Get embed URL
- Add to website

**Title:** "LocalShare - Share Localhost Instantly (Beta Demo)"

**Description:**
```
LocalShare lets you share any localhost server with one click.

Perfect for:
- Code reviews (30 seconds instead of 10 minutes)
- Client demos (no deploy needed)
- Pair programming (interactive, not just screen share)
- Designer feedback (test the real thing)

Free beta: https://roguegrid9.com
50GB bandwidth • HTTPS everywhere • 5 global relays

Built with Rust, React, and WebRTC.