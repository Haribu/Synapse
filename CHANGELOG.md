# Changelog

All notable changes to **Synapse** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---
## [1.4.2] - 2026-11-07

### Fixed
- **Stats & Analytics Light Mode Editorial Sanctuary Compatibility (`src/components/StatsView.tsx`):**
  - Resolved missing light mode styling across StatsView by introducing dual-theme Tailwind classes across all modules.
  - Adapted active reading dwell metrics cards, queue clearance progress modules, 7-day velocity bar charts, topic distribution bars, and Stats for Nerds SQLite storage/telemetry tables to render with high contrast and legible typography across both warm paper (`bg-slate-50/50`, `bg-white`, `border-slate-200`, `text-slate-900`) and obsidian ink (`dark:bg-slate-900`, `dark:bg-slate-950`, `dark:border-slate-800`, `dark:text-white`).
- **Phantom "General" Category & Internal Welcome Guide Purge (`src/lib/db/index.ts`, `src/lib/services/sync-engine.ts`):**
  - Removed auto-seeding of synthetic `synapse-welcome` feed and `welcome-guide` internal article from `db/index.ts`, which previously forced a phantom "General" category containing 1 internal article.
  - Added automated cleanup migration in `db/index.ts` and `sync-engine.ts` (`rehydrateAndCleanTargetedSources`) to purge historical `synapse-welcome` and `welcome-guide` records from existing databases.
  - Restored natural first-run `OnboardingModal` triggering when 0 feeds exist in the user's database.

## [1.4.1] - 2026-11-07

### Added
- **Offline Research Notes & Tags Synchronization (`src/lib/services/offline-cache.ts`, `src/components/ReaderView.tsx`):**
  - Expanded `CachedArticle` and `OfflineMutation` to support `update_notes` and `update_tags` actions.
  - Added optimistic local caching in IndexedDB for draft research notes and tags so switching articles or navigating views while completely offline (e.g. in flight) retains notes immediately.
  - Wired `ReaderView.tsx` note and tag persistence into the offline queue when offline or if the network fetch fails.
- **Offline Queue-Aware Article Filtering (`src/lib/services/offline-cache.ts`, `src/app/page.tsx`):**
  - Added `readingQueueOnly` and `readingListOnly` filters to `getOfflineArticles` so that navigating between **Reading Queue**, **Deep Research**, **Starred**, **Unread**, and **Work** views while offline correctly scopes articles to the matching queue rather than returning an unfiltered dump.
- **Comprehensive Offline Engine Unit Test Suite (`src/lib/services/offline-cache.test.ts`):**
  - Added 5 automated unit tests covering article caching, preserving draft user notes against stale remote overwrites, queue-aware filtering, optimistic mutation queueing, and `PATCH /api/items` synchronization replay.

### Fixed
- **Offline Mutation Flushing 404 Endpoint Repair (`src/lib/services/offline-cache.ts`):**
  - Repaired `flushOfflineMutations` which previously attempted to call non-existent endpoints (`/api/items/${id}/read`, `/api/items/${id}/star`, `/api/items/${id}/work`), causing replay failures.
  - Unified all offline mutations (`toggle_read`, `toggle_star`, `toggle_work`, `update_notes`, `update_tags`) onto `PATCH /api/items`, which atomically updates both `feed_items` and `reading_list` in SQLite.
- **Reading List Star Toggle Offline Fallback (`src/app/page.tsx`):**
  - Added offline check and error fallback to `commitToggleStar` for items in the Reading List / Deep Research queue, enqueuing a mutation if network connectivity is absent. 

## [1.4.0] - 2026-11-07

### Added
- **Unified Reading Queue & Expandable Sub-Queues (`src/components/FeedSidebar.tsx`, `src/components/ItemList.tsx`, `src/app/page.tsx`):**
  - Consolidated text backlogs into a single, expandable **Reading Queue** (`total/totalCap`) in the sidebar and mobile `Queue` tab (strictly excluding videos, which remain in **Watch Later**).
  - Added expandable sidebar sub-views and compact in-list segmented filtering for **All**, **Deep Research** (`reading_list`, sorted by date saved), and **Starred Articles** (`starred`, sorted by published date), plus a collapsible `+ URL` quick-save button.
  - Eliminated double-counting between `reading_list` and `starred` in `src/lib/db/reconcile.ts`, `src/app/api/reading-list/route.ts`, and `src/app/api/items/route.ts` so `Deep Research + Starred Articles = Reading Queue` with zero overlap.
- **Anti-Collector Backlog Digestion Engine (`src/lib/utils/backlog-nudges.ts`, `src/components/ItemList.tsx`, `src/components/WipCapModal.tsx`):**
  - **Triage Zero Deep Read Pivot Card:** Replaces the passive `"All caught up!"` empty state in Triage (`unread`) and feed views whenever saved backlog items exist in **Deep Research** or **Starred Articles**, surfacing the oldest unfinished item with age, estimated reading time, **Read Deeply Now** action, and 1-click **Drop** action.
  - **Interleaved Serendipity (Daily Vault Spotlight in Triage):** Pins a deterministic, daily-rotating `"From Your Vault · Saved Xd ago"` spotlight card at the top of Triage (`unread`) when saved items `>= 3` days old exist, with instant **Read Now**, **Drop**, and daily dismiss (`localStorage`) controls.
  - **Live WIP Capacity Badges & "One-In, One-Out" Gate Modal (`FeedSidebar.tsx`, `WipCapModal.tsx`):** Displays live `count/cap` badges on `Reading Queue`, `Deep Research` (default cap `10`), and `Starred Articles` (default cap `15`). When starring an article or saving to Deep Research at capacity, opens a frictionless "One-In, One-Out" gate modal offering to **Drop Oldest & Save This Instead**, **Read Oldest Item Now**, or **Save Anyway (Override Cap)**.
  - **14-Day Article Half-Life Decay & Stale Bankruptcy Sweep:** Automatically marks saved items `>= 14` days old with a `"Stale · Xd"` badge and subtle visual decay (`opacity-55`) across `Reading Queue`, `Deep Research`, `Starred Articles`, and `Watch Later`, accompanied by a top **Backlog Decay Banner** with a 1-click **Declare Bankruptcy (Clear X Stale)** action protected by the 5-second `UndoToast`.
  - **Configurable WIP & Decay Guardrails (`SettingsView.tsx`, `accessibility.ts`):** Added user-adjustable controls in Settings for Daily Vault Spotlight toggle (`enableTriageSpotlight`), Starred Articles WIP cap (`readLaterCap`), Deep Research WIP cap (`researchCap`), and Half-Life Decay threshold (`staleDaysThreshold`).

## [1.3.13] - 2026-11-06

### Fixed
- **The Register Front Matter & Tail Cleanup (Feedback 03/11/2026):**
  - Stripped author bylines with redundant markdown links, forum comment counters, publication timestamps (`Published Day DD Mon YYYY // HH:MM UTC`), Google preference promos, and leading `### READ MORE` related story lists across `cleanArticleMarkdown` and `cleanArticleHtml` in `clean-article.ts`.
  - Stripped trailing tag lists, comment links, and related story card embeds.
- **Extraction Hardening Against Next.js 404 Stubs (Feedback 03/11/2026):**
  - Hardened `readability-extractor.ts` to reject Next.js 404 templates (`NEXT_HTTP_ERROR_FALLBACK`) and empty markdown (< 50 chars) from masquerading as successful extractions, preventing false `is_full_fetched = 1` status.
  - Added automatic reset and live re-extraction in `rehydrateAndCleanTargetedSources()` within `sync-engine.ts` to heal previously poisoned 404 stubs.
  - Added fallback recovery card in `ReaderView.tsx` with direct browser launch and re-extraction trigger when content is pending.
- **Reading List & Work Backlog Generic Title Healing (Feedback 05/11/2026):**
  - Added `isGenericTitle()` filter in `src/app/api/reading-list/route.ts` and `ReaderView.tsx` so anchor text like "Read More", "Continue reading", and "Link" is never saved as the definitive article title.
  - Prioritized `extracted.title` for generic links and added automatic title healing in `rehydrateAndCleanTargetedSources()`.

## [1.3.12] - 2026-11-01

### Fixed
- **Empty Feeds Auto-Recovery & Feed URL Modernization:**
  - Added automatic historical backfill in `reconcileUserData()` to copy archive articles from seed database for feeds that currently have 0 items.
  - Healed 8 legacy/broken/redirected feed URLs (Graham Cluley, Schneier on Security, Slack Engineering, James Clear, Mark Manson, Wait But Why, Sketchplanations, Dan Wang) and trimmed title whitespace.
  - Relaxed the 3-year publication cutoff in `sync-engine.ts` for feeds with zero stored articles, allowing initial hydration for long-form/infrequent essayists.
  - Enhanced Cloudflare edge protection compatibility in `feed-fetcher.ts` by using standard browser User-Agent headers for known WAF-protected domains.

## [1.3.11] - 2026-11-01

### Added
- **Local CI Pipeline Verifier (`scripts/verify-ci.ts`, `bun run test:ci`):**
  - Added a unified pre-push CI test runner that replicates remote GitHub Actions checks locally: asserts frozen lockfile parity (`bun install --frozen-lockfile`), static type correctness (`bun x tsc --noEmit`), and full unit test execution (`bun test`).
  - Integrated `scripts/verify-ci.ts` into `synapse-tester` container profile in `docker-compose.yml`, mounting `package.json`, `bun.lock`, and `tsconfig.json` read-only to catch lockfile drift before pushing.

### Fixed
- **CI Dependency & Lockfile Drift Repair (`bun.lock`):**
  - Synchronized `bun.lock` following removal of redundant `@types/marked`, resolving `bun install --frozen-lockfile` failures on remote CI workflows.

## [1.3.10] - 2026-11-01

### Removed & Refactored
- **Purged Obsolete Admin Endpoints & Reset Scripts:**
  - Removed dangerous legacy reset route `POST /api/admin/reset-stats` and accompanying `scripts/db-reset-v1.ts` (along with `npm run db:reset-v1`) to safeguard user reading sessions and floor invariants against accidental truncation.
  - Removed obsolete one-time migration endpoints `POST /api/admin/import-reading-list` and `POST /api/admin/recalibrate-stats`.
  - Removed uncalled standalone handlers `POST /api/feeds/cleanup-shorts` (fully managed by internal `sync-engine.ts`) and `POST /api/feeds/health-check` (superseded by per-feed checks).
  - Consolidated HTML sanitization imports directly to `src/lib/utils/clean-article.ts` and deleted redundant shim `clean-html.ts`.
  - Pruned obsolete `@types/marked` dependency from `package.json` in favor of native `marked` v18 types.

## [1.3.9] - 2026-11-01

### Fixed & Hardened
- **Reading List Context & Title Mapping Realignment (`src/components/ReaderView.tsx`, `src/app/api/reading-list/route.ts`):**
  - Corrected parameter mapping when queuing links from `ReaderView.tsx`: passed the link anchor text as `title` and parent newsletter title (`item.title`) as `sourceContext` so research/work item feeds render accurately.
  - Added existing-record repair in `POST /api/reading-list`: when saving a link that already exists in the database but contains contaminated parent content or titles, the endpoint automatically re-extracts readable content from the target URL and resets the title and context.
  - Expanded in-place database hygiene in `sync-engine.ts` (`rehydrateAndCleanTargetedSources`) to detect and heal historical orphaned records where `source_feed_item_id` was null, restoring authentic article headlines (e.g. Nebulock GATES method) and stripping 50KB+ newsletter bodies.

## [1.3.8] - 2026-11-01

### Fixed & Hardened
- **Hyperlink Reading List & Work Backlog Isolation (`src/app/api/reading-list/route.ts`, `src/lib/services/sync-engine.ts`):**
  - Isolated saved hyperlinks from parent article content and title by enforcing strict URL parity checks (`cleanUrl(parent.url) === cleanedUrl`) across `GET` and `POST` handlers in `/api/reading-list`.
  - Hyperlinks saved from within articles or newsletters (via `ReaderLinkMenu`) now fetch and extract their own target page title and readability content independently instead of inheriting the parent newsletter's title and entire article HTML.
  - Implemented an automated database hygiene sweep in `sync-engine.ts` (`rehydrateAndCleanTargetedSources`) that detects contaminated historical `reading_list` entries where `rl.url != fi.url` and `(rl.title = fi.title OR rl.full_content_html = fi.full_content_html)` and heals them with clean standalone link titles and direct browser view cards.
  - Added visual confirmation toasts in `ReaderView.tsx` ("Saved link to Work Backlog" / "Saved link to Research Inbox") for instant tactile feedback when saving links from context menus.
  - Added comprehensive provenance isolation unit tests in `src/lib/services/reading-list.test.ts`.

## [1.3.7] - 2026-11-01

### Fixed & Hardened
- **Unified & Hardened User-Data Floor Invariants (`src/lib/db/reconcile.ts`, `src/lib/services/backup-service.ts`):**
  - Unified data floor invariant checking under a single source of truth (`checkDatabaseInvariants`), eliminating duplicate and diverging query logic between `reconcile.ts` and `backup-service.ts`.
  - Calibrated the default work items floor to `work >= 1` (reflecting active backlog items) and introduced dynamic environment variable overrides (`DATA_FLOOR_WORK`, `DATA_FLOOR_FEEDS`, `DATA_FLOOR_SESSIONS`, `DATA_FLOOR_STARRED`) with non-negative finite integer fallback parsing.
  - Resolved false-positive 503 Service Unavailable healthcheck errors and restored container healthcheck status to `healthy`.

## [1.3.6] - 2026-11-01

### Added
- **Automated Release & Daily-Anchor Backups (`src/lib/services/backup-service.ts`, `src/app/api/health/route.ts`):** Automatically creates an atomic `VACUUM INTO` snapshot whenever `APP_VERSION` increments, throttles post-sync snapshots to once every 6 hours, refuses to prune historical backups if user-data floors or file sizes drop, and always retains a `>=24h` daily anchor snapshot.
- **User-Data Floor Invariant Gates (`src/lib/db/reconcile.ts`, `scripts/verify-deploy.ts`):** Enforces floor invariants (`feeds >= 100`, `reading_sessions >= 3000`, `starred >= 150`, `work >= 5`) in `/api/health` and `bun run verify:deploy`.

## [1.3.5] - 2026-11-01

### Fixed
- **Idle-Tab Outlier Clamping & Full Sub-Chart Telemetry (`src/lib/db/reconcile.ts`, `src/app/api/stats/route.ts`):**
  - Clamped 41 runaway idle-tab sessions (`>1800s`) in `reading_sessions` to realistic word-count reading durations (max 30m per session), restoring authentic reading duration (~35.8h / ~299k words) instead of inflated multi-day idle tabs.
  - Joined `reading_sessions` to `feeds` across Category Breakdown, Written vs. Video Split, and Most-Read Feeds Leaderboard in `/api/stats`, populating all sub-charts with historical engaged reading counts and dwell time.
  - Restored `work_dispatched_at` timestamps on previously dispatched October work digest items so Dispatched (3) and Pending (2) queues reflect true workflow state.

## [1.3.4] - 2026-11-01

### Fixed
- **Reading Analytics & Telemetry Engine Restoration (`src/app/api/stats/route.ts`):**
  - Grounded authentic reading stats (`totalWordsRead`, `estimatedMinutesRead`, `engagedArticles`, `loggedSeconds`) directly in `reading_sessions` where all 3,234 user sessions are preserved, restoring 334+ hours of logged deep reading, 430 distinct articles, and 299,000+ words read.
  - Resolved Unix Epoch Seconds (`1791120684`) vs Milliseconds timestamp mismatch in `stats/route.ts` using `toEpochMs()`, restoring 7-day daily velocity charts and consecutive reading streak calculations.
  - Reconciled Obsidian literature notes count directly from the mounted vault (`/obsidian-vault/01 - Inbox/Synapse`).

## [1.3.3] - 2026-11-01

### Fixed & Hardened
- **Data Protection & Reconciliation Layer (`src/lib/db/reconcile.ts`, `src/lib/db/index.ts`):**
  - Permanently removed dangerous pre-boot backup overwrites that risked unlinking and replacing the active SQLite database on startup.
  - Implemented an idempotent data reconciliation engine on boot: ensures all reading list items tagged `read-later` or `feedly-import` maintain `is_starred = 1`, restores user-flagged Tesco Work Digest items across `feed_items` and `reading_list`, restores missing historical starred articles from host seed/backups, and syncs exported literature notes from the mounted Obsidian vault.
- **Unified Starred Query in Reader API (`src/app/api/items/route.ts`):**
  - Updated `GET /api/items` with `starredOnly=true` so that text article requests combine both `feed_items` and `reading_list` (where `is_starred = true`), ensuring all saved text articles and newsletters render seamlessly in "Read Later (Articles)".

## [1.3.2] - 2026-11-01

### Fixed
- **Resolved Unread Queue Inundation & Epoch Millisecond Mismatch:**
  - Fixed timestamp unit mismatch in `src/app/api/admin/reset-stats/route.ts` where second-based calculation (`Date.now()/1000 - 48*3600`) was compared against millisecond database timestamps (`published_at`, `created_at`), causing the SQL `CASE` check to evaluate as true for all historical articles and marking every article as unread.
  - Added automatic startup data reconciliation in `src/lib/db/index.ts` to restore `is_read = 1` for all articles with interaction records in `reading_sessions` (`read`, `skim`, `flick`), and safely archive unstarred/non-work historical items older than 48 hours as read.

## [1.3.1] - 2026-10-31

### Added
- **Save to Work Backlog Action on Floating Link Menu (`ReaderLinkMenu.tsx`):**
  - Added "Save to Work Backlog" button with `Briefcase` icon to the floating link popover menu in `ReaderLinkMenu.tsx`.
  - Wired link menu action in `ReaderView.tsx` to `handleSaveLinkToReadingList(url, text, true)` and updated `POST /api/reading-list` to support `isWork: true` on both new and existing items so links clicked in newsletters (e.g. DEW) immediately route into the work digest backlog.

### Fixed
- **Inline Video Embed Stabilization & Overlay Elimination (`ReaderView.tsx`, `clean-article.ts`, `globals.css`):**
  - Resolved floating/hovering video overlay issue on scroll in Ars Technica and publisher articles by unwrapping `ars-video-container` and neutralizing escaped `class="absolute"` / `fixed` styling on YouTube iframes in `clean-article.ts`.
  - Styled `.reader-content iframe` in `globals.css` with a stable `width: 100% !important; aspect-ratio: 16 / 9; max-width: 100% !important;` so inline videos always retain responsive dimensions and never collapse or detach.
  - Scoped the top hero video player in `ReaderView.tsx` strictly to genuine video feeds and video items (`mediaType === 'video'` or `videoId`), ensuring text articles with inline video clips preserve their clips in their natural editorial context.
- **Leading Newsletter Sponsor & Banner Stripping (`clean-article.ts`):**
  - Stripped leading newsletter sponsor cards (e.g. OnlyCFO Brex promo) and accompanying sponsor banner images across both `cleanArticleMarkdown` and `cleanArticleHtml`.
- **Leading Publication Front Matter & Metadata Stripping (`clean-article.ts`):**
  - Stripped leading author bylines with profile links, standalone comments counter links, share/print action bars, and issue volume markers across Markdown and HTML cleaners (e.g. Foreign Affairs articles like "Putin's Strategy Is Working"), delivering a clean single-line slug and heading before article prose.
- **Dark Reading Feed URL Healing & 2005 Article Purge (`sync-engine.ts`):**
  - Healed legacy/broken Dark Reading feed URLs in SQLite to the official HTTPS endpoint `https://www.darkreading.com/rss.xml`.
  - Purged corrupted 2005 historical items ("Last Days of The True Tiger Blog!!", "Scandalous on Road") during database maintenance sweep.
  - Enforced a strict 3-year publication date guard in `syncFeed` to prevent ancient archived syndication items from ever flooding the unread feed.

### Added
- **Hardware-Bound WebAuthn Passkeys & RFC 9449 DPoP Token Defense:**
  - Implemented RFC 9449 DPoP (Demonstrating Proof-of-Possession at the Application Layer) verification engine in `src/lib/security/dpop.ts` and integrated into `src/middleware.ts`, preventing exfiltrated `SYNAPSE_API_KEY` bearer tokens from being replayed from untrusted hosts.
  - Added native DPoP client proof signing to the bundled Synapse Model Context Protocol server (`scripts/mcp-server.ts`) via `--dpop` CLI flag and `SYNAPSE_DPOP=true`.
  - Added Cloudflare Access cryptographic JWT assertion verifier in `src/lib/security/cf-access.ts` to validate edge signatures against Cloudflare JWKS when `CF_ACCESS_TEAM_NAME` is configured.
  - Added comprehensive test suites in `src/lib/security/dpop.test.ts` verifying signature validity, method/URI validation, tamper resistance, and expiration windows.
  - Documented enterprise-grade 1-tap biometric passkey login via Google/GitHub SSO and phishing-resistant FIDO2 MFA in `deploy/cloudflare/CLOUDFLARE_ZERO_TRUST.md` and updated `API.md`.

## [1.2.3] - 2026-10-29

### Fixed
- **Resolved Cross-Origin Image Suppression & Broken Asset Ergonomics:**
  - Enforced `referrerpolicy="no-referrer"` across all article `<img>` elements in `cleanArticleHtml` to bypass CDN hotlink and referer blocks on third-party publishers (WordPress, Substack, Medium).
  - Remapped Cloudflare-blocked Marginal Revolution image mirrors of Adam Nash's Census wealth chart (`us-household-median-net-worth-by-age-2024-3.webp` ➔ `.jpg`) to the unblocked original source across both HTML and Markdown cleaners.
  - Implemented an editorial broken-image fallback card with a direct `"Open original image ↗"` link in `ReaderView.tsx` so users are never left with broken or missing media.
  - Added in-place hygiene rehydration in `sync-engine.ts` targeting affected items.

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
