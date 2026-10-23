# Contributing to Synapse

Thank you for your interest in contributing to Synapse! We are building a fast, private, AI-native RSS++ reader, newsletter curator, and reading intelligence engine.

---

## 🚀 Local Development Setup

Synapse is built with **Next.js 15 (App Router)**, **React 19**, **Tailwind CSS**, and **SQLite WAL** via `better-sqlite3` and `drizzle-orm`.

### Prerequisites

- [Bun](https://bun.sh) (v1.1+)
- Docker & Docker Compose (for containerized testing)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Haribu/synapse.git
cd synapse

# 2. Install dependencies
bun install

# 3. Create a local environment file
cp .env.example .env

# 4. Start the development server
bun dev
```

Open `http://localhost:3000` to start exploring the reader.

---

## 🧪 Verification & Testing

Before submitting a Pull Request, ensure that all static typing and build checks pass:

```bash
# Typecheck TypeScript files
bun x tsc --noEmit

# Run unit tests
bun test

# Test production build
bun run build
```

---

## 🏛️ Codebase Structure

- `src/app/`: Next.js 15 App Router pages and API routes.
  - `src/app/api/feeds/`: Feed management, OPML import/export, starter packs, and sync triggers.
  - `src/app/api/items/`: Article mutations, full-content extraction, and markdown export.
  - `src/app/api/profile/`: User profile preferences (zero login).
- `src/components/`: Modular React 19 UI components.
  - `ReaderView.tsx`: Core distraction-free reading sanctuary, scroll chrome, and notes drawer.
  - `ItemList.tsx`: Filtered article feed with swipe gestures, FTS5 search, and clustering.
  - `FeedSidebar.tsx`: Navigation, categories, and unread counters.
  - `OnboardingModal.tsx`: First-run onboarding wizard.
  - `SettingsView.tsx`: Reading ergonomics, accessibility, and storage health.
- `src/lib/db/`: SQLite schema (`schema.ts`) and Drizzle initialization (`index.ts`).
- `src/lib/services/`: Feed fetchers, background sync engine, readability extractors, and Obsidian sync.
- `scripts/mcp-server.ts`: Built-in Model Context Protocol (MCP) stdio server for AI agent integration.

---

## 🔒 Security & Privacy Boundaries

- **SSRF Protection:** All external URL fetches must be validated via `validateSafeUrl()` (`src/lib/utils/ssrf.ts`) against private IP ranges (`127.0.0.1`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`, `169.254.169.254`, and IPv6 loopback/unique-local).
- **No Hardcoded Paths or Secrets:** Never commit personal file paths, tokens, or email addresses into the repository. Use `.env` or `docker-compose.override.yml` for local host bindings.
