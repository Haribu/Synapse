# Synapse — Agent & Developer Operational Guide

This document establishes the architecture, permission models, build/test protocols, feature designs, and operational boundaries for all developers and AI agents working within the **Synapse** workspace.

---

## 1. System Overview & Tech Stack

- **Purpose:** Self-hosted, AI-native RSS++ reader, newsletter deep-link curator, accessibility-first reading environment, and research aggregator.
- **Frontend / Fullstack:** Next.js 15 (App Router), React 19, Tailwind CSS.
- **Database:** SQLite (`better-sqlite3` + `drizzle-orm`) with WAL mode, indexing, and SQLite FTS5 full-text search triggers.
- **Container Environment:** Docker container `synapse-reader` running on port 3000 (mapped to `${HOST_PORT:-3000}`).
- **Integrations:**
  - Obsidian Vault: Mounted into container at `/obsidian-vault` (optional; falls back to direct browser `.md` download).
  - Google Docs / Drive: Export via OAuth2 / service account (optional).

---

## 2. Permissions, Tool Execution & Sandboxing

To ensure seamless local execution and prevent permission prompt fatigue:

### A. Operations within Standard Sandbox

Run the vast majority of operations inside the standard sandbox:

- File reads, writes, and diff replacements.
- Git operations (`git status`, `git diff`, `git log`, `git add`, `git commit`).
- Workspace directory scans and code inspections.
- Static typing (`bun x tsc --noEmit`).

### B. Operations Requiring Sandbox Bypass

The following actions should ONLY be executed when explicitly requested for deployment or container operations:

1. **Docker Engine Management:** (`docker compose up -d --build --wait`, `docker logs`, `docker ps`).
2. **Unified Deployment Verification:** (`bun run verify:deploy`).
3. **UI Viewport Capture:** (`bun run verify:ui`).

### C. Database Integrity & Anti-Corruption Protocol (STRICT)

- **Zero Host-Level SQLite Writes While Container is Running:** NEVER execute `sqlite3 ./data/synapse.db` directly from the host while the Docker container is active.
  - _Why:_ SQLite WAL mode uses shared memory (`.db-shm`) and POSIX locks that do NOT synchronize across host and Docker container boundaries. Concurrent dual-kernel access causes silent b-tree corruption.
- **Safe Maintenance Commands:**
  - Backup: `bun run db:backup` (triggers atomic `VACUUM INTO` snapshot via container API).
  - Integrity Check: `bun run db:check` (runs `PRAGMA integrity_check` via container API).
- **Storage Tiering:**
  - Live database: Hosted on native Linux volume `synapse_data:/app/data` inside Docker VM.
  - Verified backups: Streamed to `./backups` on the host filesystem via atomic snapshots.

### D. Version Bumping & SemVer Protocol (MANDATORY)

- **Always Bump Version on Features & Fixes:** Never deploy or release updates without incrementing the SemVer version (`1.0.0-rc1` ➔ `1.0.0-rc2` ➔ `1.0.0`).
- **Automated Bumper:** Run `bun run bump [rc|patch|minor|major]` to simultaneously increment `package.json` and synchronize `src/lib/version.ts` with the current git commit hash and build date.

---

## 3. Key Feature Architecture & Standards

### A. Multi-Device Adaptive Navigation

- **3-Tier Responsive Breakpoints:**
  - Mobile (`<768px`): Single-pane view with a 5-tab bottom navigation bar (`Triage`, `All`, `Saved`, `Work`, `Feeds`) anchored to `env(safe-area-inset-bottom)`.
  - Tablet (`768px–1279px`): 2-pane split (`ItemList` + `ReaderView`) with `FeedSidebar` accessible as a slide-over drawer so `ReaderView` is never crushed.
  - Desktop (`>=1280px`): Full 3-pane layout with Pointer Event (`onPointerDown`) draggable splitters.
- **Auto-Hiding Mobile Reader Chrome:** `ReaderTopBar` and `ReaderMobileThumbBar` track scroll direction in `ReaderView` and slide off-screen when scrolling down on mobile, returning on upward scroll.
- **Swipe-to-Triage List Rows:** Touch swipe gestures on `ItemList.tsx` rows (swipe right toggles Read/Unread; swipe left toggles Star/Saved).
- **`Cmd+K` Command Palette (`CommandPaletteModal.tsx`):** Triggered via `⌘K` / `Ctrl+K` for instant fuzzy navigation across views, active article actions, categories, and feeds.
- **Docked Desktop Notes Drawer (`ReaderNotesDrawer.tsx`):** Docks inline side-by-side (`xl:relative xl:w-80`) on desktop without a blocking backdrop.

### B. Obsidian & Markdown Knowledge Export

- Endpoint: `POST /api/items/[id]/obsidian` and `GET /api/items/[id]/markdown`.
- Converts rich content into clean Markdown via Turndown.
- Downloads remote images into `${targetDir}/assets/` and rewrites image links to local relative paths (`./assets/...`).
- Frontmatter includes `title`, `source`, `author`, `date_saved`, `date_published`, `feed`, `origin_type`, `tags`, and `status: to-review`.
- Graceful Fallback: When no vault is mounted, Synapse automatically triggers a direct browser `.md` download.

### C. Reading Ergonomics & OpenDyslexic Typography

- **Editorial Sanctuary Palette:** Light mode warm paper (`#FAF8F5`) and dark mode obsidian ink (`#0B0D12`).
- **Self-Hosted Font:** `public/fonts/open-dyslexic.woff` served locally with zero CDN dependency.
- **Ergonomic Controls:** Font size, line spacing, letter spacing, column width, and global dyslexic mode.

### D. Dual-Pool Adaptive Background Synchronization

- **Worker Segregation:** Isolates fast RSS feeds (pool: 8 workers) from serialized YouTube feeds (pool: 2 workers) in `sync-engine.ts`.
- **Adaptive Ingestion Intervals:** RSS and news feeds sync every 25 minutes; YouTube feeds sync every 2 hours.
- **Event-Loop Yielding:** Workers yield via `setImmediate` between items, guaranteeing health probes never stall.

---

## 4. Security & Privacy Boundaries

- **SSRF Protection:** All URL extraction (Readability, RSS fetch) must validate URLs to prevent SSRF against internal subnets.
- **No Hardcoded Credentials or Personal Paths:** Keep all environment configurations in `.env` and `docker-compose.override.yml`.
