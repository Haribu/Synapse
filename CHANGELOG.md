# Changelog

All notable changes to **Synapse** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.4] - 2026-10-26

### Fixed
- **Catastrophic Regex Backtracking (ReDoS) Resolution:** Fixed nested quantifier pattern in Lowy Institute byline regex in `clean-article.ts` that caused the Node.js event loop to freeze at 100% CPU during background feed ingestion, failing health checks and causing mobile timeouts.

## [1.1.3] - 2026-10-26

### Fixed
- **Curated Queues Story Grouping Exemption:** Completely exempted curated reading queues (`isSavedView`: Research Inbox `reading_list`, Read Later `starred`, Watch Later `watch_later`, and Work `work`) from story clustering in `ItemList.tsx` and `page.tsx`. Hand-curated items remain individually visible without being hidden under primary article clusters.
- **Story Grouping Clustering Calibration:** Hardened `clustering.ts` to eliminate false-positive groupings:
  - Disallowed clustering items originating from the same feed (`itemA.feedId === itemB.feedId`).
  - Enforced a strict 48-hour publication timestamp window (`Math.abs(dateA - dateB) <= 48h`). Articles without verifiable timestamps are never grouped.
  - Significantly expanded domain stop words (`ai`, `models`, `agents`, `architecture`, `software`, `performance`, `benchmarks`, `security`, `policies`, `testing`, `analytics`, `systems`, etc.).
  - Replaced overly loose 1-keyword/4-content-word matching with high-confidence thresholds (requiring 3+ shared distinctive title keywords, verified in content, with >= 8 shared distinctive content tokens).
- **Lowy Institute / The Interpreter Content Cleaning & Deduplication:**
  - Stripped publication logos, brand headers, and wordmark images across Markdown (`![The Interpreter]`, `Image: The Interpreter`) and HTML in `clean-article.ts`.
  - Added author byline cleaners supporting linked author cards (`[Author](url)`), multi-author rows, date formats, and audio toolbars (`Listen Copy link`).
  - Added automated paragraph deduplication in `cleanArticleMarkdown` and `cleanArticleHtml` to remove repeated standfirst lead summaries, adjacent duplicate paragraphs, and redundant pullquotes.

## [1.1.2] - 2026-10-24

### Fixed
- **Touch Navigation & Quick "Save to Research" Interruption:** Added `touchmove` drag detection with an 8px movement threshold to cancel long-press timers immediately during touch scrolling, increased deliberate long-press delay to 750ms, ignored clicks/touches on `<img>` elements, auto-dismissed the link menu on container scrolling, and added a full-screen tap-outside backdrop overlay to `ReaderLinkMenu.tsx`.
- **YouTube Embed Player Error 153:** Resolved cross-origin iframe rejection by upgrading global document referrer policy from `no-referrer` to `strict-origin-when-cross-origin` in `layout.tsx`, explicitly specifying `referrerPolicy="strict-origin-when-cross-origin"` on YouTube embed iframes in `ReaderView.tsx`, and enforcing the policy on sanitized article HTML in `clean-article.ts`.

## [1.1.1] - 2026-10-24

### Fixed
- **Foreign Affairs Stub Detection & Escalation:** Added magazine issue promo teasers (`"new issue out"`, `"more by "`, and short articles dominated by author credentials) to `isStubOrBlocked` in `readability-extractor.ts`, triggering fallback cascades (Jina Reader and Wayback Machine) so full article body text is extracted.
- **Obsidian Feedback Sync Reversion Guard:** Fixed bidirectional status sync in `src/app/api/feedback/route.ts` so `PATCH` updates both SQLite and the mounted Obsidian `Feedback-Log.md`, and `GET` never reverts `implemented` items back to `open`.
- **Commit Hash Link Accuracy:** Pointed the `GIT_COMMIT` fallback in `src/lib/version.ts` to the v1.1.0 release commit (`6777148`).

## [1.1.0] - 2026-10-24

### Added
- **Interactive Git Commit & Project Links:** Linked the commit badge in `GuideModal.tsx` and `FeedSidebar.tsx` directly to the corresponding GitHub commit page, and added a direct link to the GitHub project repository in the Guide Modal footer.
- **Enterprise Cloudflare Zero Trust Documentation:** Added comprehensive deployment architecture, dual-layer validation mechanics, mobile PWA cookie preservation (`crossOrigin="use-credentials"`), AI Service Token usage, and troubleshooting matrix in `deploy/cloudflare/CLOUDFLARE_ZERO_TRUST.md` and `API.md`.

### Fixed
- **In-Body Article Figures & Charts Visibility:** Scoped `.reader-content.hide-hero-images` in `globals.css` strictly to direct-child lead elements (`> img:first-child`, `> figure:first-child`, `> div:first-child > figure`) and hero classes, preventing indiscriminate suppression of Substack and CMS embedded `<figure>` and `<picture>` charts.
- **Header Image Preference Default:** Adjusted `DEFAULT_A11Y_SETTINGS.hideHeaderImages` default to `false` in `accessibility.ts` so article figures and diagrams render by default without accidental hiding.
- **Cross-Origin Referrer Protection:** Injected `<meta name="referrer" content="no-referrer">` into the document `<head>` in `layout.tsx`, preventing third-party CDNs and media hosts from blocking embedded images based on custom domain referrers.

## [1.0.1] - 2026-10-23

### Fixed
- **Open Source Licensing Parity:** Removed outdated "All rights reserved" notice from the sidebar footer in `FeedSidebar.tsx` to align with the open-source MIT License; linked copyright text to project repository and added direct link to `LICENSE`.
- **Feedback Privacy Transparency:** Added explicit "100% Local & Private" isolation assurance indicator to the History view in `FeedbackModal.tsx`, confirming feedback stays strictly on local SQLite and Obsidian storage with zero remote telemetry.

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
