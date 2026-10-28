# Changelog

All notable changes to **Synapse** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.2] - 2026-10-28

### Changed
- **Extended Evaluation Window to 90 Days & Enforced Strict Volume Floors:**
  - Extended the audit lookback window from 30 days to 90 days (3 months) to accurately assess sustained publication and engagement patterns.
  - Implemented a strict volume floor: feeds publishing fewer than 15 articles in 90 days ($< 1.25$ articles/week) are **strictly exempt** from Loud Exhaustion and Skim & Flick flags, completely safeguarding high-value, low-frequency specialist blogs and essayists (*Wait But Why*, *Dan Wang*, *SpecterOps*, *The DFIR Report*, *37signals*).
  - Raised the Loud Exhaustion threshold to require $\ge 25$ articles in 90 days with $\le 7\%$ engaged read rate and 0 starred items, cutting false positives down from 96 to 13 focused, high-volume/low-engagement culprits (*The Hacker News*, *Dark Reading*, *Malwarebytes*, *Recorded Future*).
  - Restricted Dormant / Failing classification to feeds with $\ge 10$ consecutive network/fetch errors, exempting healthy quiet publications that post infrequently.

## [1.2.1] - 2026-10-28

### Fixed
- **Feed Audit SQLite Timestamp Type Binding Fix (`/api/feeds/audit`):**
  - Resolved `SQLite3 can only bind numbers, strings, bigints, buffers, and null` error when querying 30-day article velocity in `src/lib/services/feed-audit.ts` by passing integer seconds timestamp (`Math.floor(Date.now() / 1000) - 30 * 86400`) instead of raw JavaScript `Date` object.
- **Calibrated Fatigue & Noise Heuristics (`feed-noise.ts`):**
  - Calibrated Loud Exhaustion threshold to $\le 7\%$ engaged read rate for high-volume feeds ($\ge 20$ articles), accurately identifying feeds like **The Hacker News** (259 articles, 3.8% engaged reads, 0 saves).
  - Refined Skim & Flick threshold to capture feeds with critically low reading dwell time ($< 10$s average across $\ge 8$ reads, $\le 8\%$ engaged), accurately identifying feeds like **Dark Reading** (110 articles, 5s average dwell time, 0 saves).
  - Preserved healthy status for feeds with high engaged dwell times and saved articles like **BleepingComputer** (206s average dwell, 1 save) and **The Register** (30s average dwell, 1 save).

## [1.2.0] - 2026-10-28

### Added
- **Feed Signal vs. Noise Audit & Pruning Recommendations Engine:**
  - Added deterministic heuristic evaluator `evaluateFeedNoise` (`src/lib/utils/feed-noise.ts`) and background audit service `getFeedAuditRecommendations` (`src/lib/services/feed-audit.ts`) to identify loud, low-signal, or duplicated feeds causing triage fatigue.
  - Classified candidates into four diagnostic categories:
    - **Loud Exhaustion:** High publication volume ($\ge 12$ recent or $\ge 20$ total items) with 0 engaged reads ($\ge 30$s dwell) and 0 stars.
    - **Redundant Wire:** High story duplication overlap ($\ge 45\%$) where other outlets were read instead.
    - **Skim & Flick Only:** Consistent quick dismissals ($< 12$s average dwell) without depth.
    - **Dormant / Failing:** Inactive for $\ge 90$ days or $\ge 6$ consecutive fetch errors.
  - Added `GET /api/feeds/audit` endpoint exposing candidate diagnostic verdicts, fatigue index scores (0–100), dwell statistics, and managed exceptions.
  - Added dedicated **"Feed Audit"** tab in `FeedManagerView` (`src/components/FeedManagerView.tsx`) with real-time candidate badges, full diagnostic evidence cards, one-click Unsubscribe, Mute/Pause Sync, and Whitelist (Keep) actions.
  - Added **Feed Signal vs. Noise Audit** telemetry card in `StatsView` (`src/components/StatsView.tsx`) with deep-link navigation directly into the Feed Manager Audit tab.
  - Added `isMuted` and `isAuditWhitelisted` columns to `feeds` SQLite table with automatic startup migrations (`src/lib/db/index.ts` and `src/lib/db/schema.ts`).
  - Added muted feed exemption in `syncSingleFeed` (`src/lib/services/sync-engine.ts`) to immediately bypass background network fetching for muted subscriptions.
  - Added comprehensive unit tests in `src/lib/utils/feed-noise.test.ts` verifying all diagnostic branches, specialist blog exemptions, and fatigue score boundaries.

## [1.1.5] - 2026-10-28

### Fixed
- **WordPress Kadence Inline CSS & Empty-Alt Image Preservation (Feedback `769dcf80`):**
  - Stripped unwrapped WordPress Kadence inline CSS rules (`.kt-inside-inner-col{...}`, `.kadence-column...{...}`, `@media all and (...){...}`) across `cleanArticleMarkdown`, `cleanArticleHtml`, and `extractSnippet` in `clean-article.ts` and `feed-fetcher.ts`, plus Malwarebytes Scam Guard trailing promotional blocks.
  - Added negative lookbehind `(?<!!)` to empty-link removal in `cleanArticleMarkdown` so Markdown images with empty alt text (`![](https://...)`) are preserved instead of being stripped down to bare `!` characters across 148 articles.
- **YouTube Iframe `referrerpolicy` Attribute Injection & Malformed Tag Repair (Feedback `712cfe23`):**
  - Fixed `<iframe` `referrerpolicy` injection in `cleanArticleHtml` (`clean-article.ts`) so `referrerpolicy="strict-origin-when-cross-origin"` is inserted *inside* the opening `<iframe ...>` tag before `>` instead of after `>`.
  - Added automatic repair for malformed unclosed parent tags preceding `<iframe` (e.g., Ars Technica `<div class="relative"<iframe`) and healed previously stored `> referrerpolicy="strict-origin-when-cross-origin"` text leaks.
  - Deduped inline YouTube `<iframe>` embeds in `ReaderView.tsx` when the same `effectiveVideoId` is already rendered in the top hero video player.
- **Lowy Institute / The Interpreter Sanity.io SVG Wordmark & Title Deduplication (Feedback `ff5206e1`):**
  - Stripped Sanity.io SVG wordmarks (`269x44.svg`, `31-bligh.svg`, `[![Image 3: The Interpreter](...)](...)|<Title>`) and newline-joined duplicate titles (`<p>Title\nBody...</p>`) in `cleanArticleMarkdown` and `cleanArticleHtml`.
  - Stripped Lowy Institute tail sections (`About the author`, `Topics`, `## The Interpreter on ...`, `## More on ...`, `## Subscribe to`, `### Lowy Institute`, and cookie consent banners).
- **Feed Sync Health & YouTube 404 Fallback Resilience:**
  - Exempted the synthetic `synapse-welcome` (`synapse.local`) onboarding feed from network fetching in `sync-engine.ts`.
  - Added `/channel/UC.../videos` `ytInitialData` fallback in `feed-fetcher.ts` when YouTube's `/feeds/videos.xml` Atom endpoint returns `HTTP 404/400/5xx`, plus automatic browser User-Agent retry on `HTTP 403` and legacy feed URL auto-healing (`Marginal REVOLUTION`, `Trend Micro`).
- **Automated Startup Hygiene, Feedback Sync & Zero-`curl` Verification (`/api/health` & `verify:deploy`):**
  - Updated `/api/health` (`src/app/api/health/route.ts`) to automatically run `reconcileFeedbackWithObsidian()` and a one-time version-keyed in-place database hygiene sweep (`rehydrateAndCleanTargetedSources`) when a new `APP_VERSION` boots, exposing live `hygiene` metrics (`referrerLeaks`, `cssSnippetLeaks`, `openFeedbackCount`) verified by `bun run verify:deploy` (`scripts/verify-deploy.ts`).

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
