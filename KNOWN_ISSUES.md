# Known Issues

**Last Updated:** October 11, 2025  
**Version:** v0.1.4 Beta

This document tracks all known bugs, limitations, and issues in RogueGrid9. We're working on fixes for the next release!

---

## 🚨 Critical Issues

### 1. macOS Process Discovery Incomplete
**Severity:** High  
**Platforms:** macOS only  
**Status:** 🔧 In Progress

**Problem:**
- Process scanning on macOS returns incomplete results
- Some running processes are not detected
- Port detection may miss services running on localhost

**Impact:**
- Process sharing on Mac is unreliable
- Users may not see their running dev servers
- Workaround required for Mac users

**Workaround:**
- Manually enter process information
- Use terminal sessions which work reliably
- Consider running processes on Linux/Windows machines

**Fix Timeline:** v0.2.0 (targeting December 2025)

---

### 2. Voice Chat Experimental and Unstable
**Severity:** High  
**Platforms:** All (Windows, Linux, macOS)  
**Status:** 🔧 Major Rewrite Planned

**Problem:**
- Voice connections may fail to establish
- Audio quality is poor (high latency, crackling)
- Echo cancellation not working properly
- App may crash when joining voice channels
- CPU usage spikes during voice calls

**Impact:**
- Voice chat is unusable for serious collaboration
- May cause app instability

**Workaround:**
- Use external voice chat (Discord, Zoom, etc.)
- Disable voice features if experiencing crashes
- Stick to text chat for now

**Fix Timeline:** v0.2.0 (complete voice rewrite)


📝 Reporting New Issues
Found a bug not listed here? Please report it!
Before Reporting:

✅ Check this document first
✅ Search GitHub Issues
✅ Try on latest version (v0.1.4)
✅ Note your OS and version

What to Include:

Title: Short description (e.g., "App crashes when joining voice")
Platform: Windows 11, Ubuntu 24.04, macOS 14, etc.
Steps to Reproduce: Exact steps that trigger the bug
Expected Behavior: What should happen
Actual Behavior: What actually happens
Logs: Attach relevant log snippets (see above)
Screenshots: If UI-related

Where to Report:

🐛 GitHub Issues: github.com/roguegrid9/roguegrid-desktop/issues
💬 Discord: discord.gg/roguegrid9 (#bug-reports)
📧 Email: team@roguegrid.com


🙏 Thank You!
Your bug reports help make RogueGrid9 better for everyone. We appreciate your patience during the beta!
