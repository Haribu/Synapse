# Changelog

All notable changes to **Synapse** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-10-23

### Initial Open Source Release

- **Dual-Surface Reading Platform:** Human-centered distraction-free reading sanctuary paired with an agentic headless API and Model Context Protocol (MCP) server.
- **Editorial Sanctuary Typography:** Self-hosted OpenDyslexic (`public/fonts/open-dyslexic.woff`), serif, and sans typography modes with real-time slider controls for font size, line spacing, and column width.
- **Attention Dwell Telemetry:** Accurate reading time measurement against words read with automatic pause on background tab switch or 60s inactivity watchdog.
- **Multi-Device Responsive Breakpoints:** 3-tier adaptive layouts across Mobile (<768px single-pane with bottom navigation bar), Tablet (768px–1279px 2-pane split with slide-over drawer), and Desktop (≥1280px 3-pane with draggable splitters).
- **Mobile PWA & Offline Sync:** Standalone iOS Safari/Android Chrome installation, offline service worker caching, thumb-driven triage bars, and cross-device synchronization.
- **Obsidian & Markdown Export:** 1-click note export with YAML frontmatter, automatic asset downloading, and relative link rewriting directly into mounted `/obsidian-vault`, falling back to browser `.md` download.
- **Dual-Pool Background Synchronization Engine:** Isolated worker pools segregating high-throughput RSS feeds (8 workers, 25m interval) from rate-limited YouTube channels (2 workers, 2h interval).
- **Full-Text FTS5 Search & Deduplication:** SQLite FTS5 search across title, snippet, and content with automated URL canonicalization and GUID deduplication.
- **Dual-Mode Feedback Routing:** Integrated feedback modal supporting local private backlog storage and upstream GitHub issue generation.
- **Security & Zero Trust Hardening:** Comprehensive SSRF guards (RFC 1918, RFC 3927, CGNAT, Docker bridge), Cloudflare Zero Trust tunnel support, WebAuthn passkey policies, and pre-shared service token authentication for AI agents.
- **Automated Container Publishing:** Multi-arch GitHub Container Registry (GHCR) build and push workflow on release tags and main updates.
