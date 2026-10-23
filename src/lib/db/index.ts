import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { WELCOME_FEED, WELCOME_ARTICLE } from "@/lib/data/welcome-guide";
import path from "path";
import fs from "fs";

const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const DATA_DIR = process.env.SYNAPSE_DATA_DIR || path.join(process.cwd(), "data");
const BACKUP_DIR = process.env.SYNAPSE_BACKUP_DIR || path.join(process.cwd(), "backups");

if (!isBuildPhase && !fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = isBuildPhase ? ":memory:" : path.join(DATA_DIR, "synapse.db");

// Auto-seed database on fresh container volume initialization
if (!isBuildPhase && !fs.existsSync(dbPath)) {
  // 1. Check if seed file exists in seed directory or host mount
  const candidateSeeds = [
    path.join("/app", "seed_data", "synapse.db"),
    path.join(process.cwd(), "data", "synapse.db"),
  ];
  let seeded = false;
  for (const seedPath of candidateSeeds) {
    if (seedPath !== dbPath && fs.existsSync(seedPath)) {
      console.log(`[DB] Seeding database from: ${seedPath}`);
      try {
        fs.copyFileSync(seedPath, dbPath);
        seeded = true;
        break;
      } catch (e) {
        console.warn(`[DB] Failed to seed from ${seedPath}:`, e);
      }
    }
  }

  if (!seeded && fs.existsSync(BACKUP_DIR)) {
    // 2. Check if a recent backup snapshot exists
    try {
      const backups = fs
        .readdirSync(BACKUP_DIR)
        .filter((f) => f.startsWith("synapse-backup-") && f.endsWith(".db"))
        .sort()
        .reverse();
      if (backups.length > 0) {
        const latestBackup = path.join(BACKUP_DIR, backups[0]);
        console.log(`[DB] Seeding database from latest backup: ${latestBackup}`);
        fs.copyFileSync(latestBackup, dbPath);
      }
    } catch (e) {
      console.warn("[DB] Failed to seed from backup:", e);
    }
  }
}

const sqlite = new Database(dbPath);

// Enable WAL mode and high-performance safety pragmas
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("synchronous = NORMAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 15000");
sqlite.pragma("cache_size = -64000"); // 64MB RAM page cache
sqlite.pragma("temp_store = MEMORY"); // In-memory temp storage
sqlite.pragma("mmap_size = 268435456"); // 256MB memory-mapped I/O
sqlite.pragma("wal_autocheckpoint = 1000");

try {
  // Verify FTS5 integrity and rebuild if ever corrupted
  const integrity = sqlite.pragma("integrity_check") as Array<{ integrity_check: string }>;
  if (integrity.some((r) => r.integrity_check && r.integrity_check.includes("FTS5"))) {
    console.warn("[DB] Rebuilding FTS5 full-text index...");
    sqlite.exec("INSERT INTO items_fts(items_fts) VALUES('rebuild');");
  }
} catch (e) {
  console.warn("[DB] Integrity check bypassed during bootstrap:", e);
}

try {
  sqlite.exec("ALTER TABLE feeds ADD COLUMN last_error TEXT;");
} catch {
  // column already exists
}

try {
  sqlite.exec("ALTER TABLE feedback ADD COLUMN status TEXT DEFAULT 'open';");
} catch {}
try {
  sqlite.exec("ALTER TABLE feedback ADD COLUMN resolved_at INTEGER;");
} catch {}
try {
  sqlite.exec("ALTER TABLE feedback ADD COLUMN resolution_notes TEXT;");
} catch {}

try {
  sqlite.exec("ALTER TABLE feeds ADD COLUMN editorial_type TEXT DEFAULT 'independent';");
} catch {}
try {
  sqlite.exec("ALTER TABLE feed_items ADD COLUMN is_engaged_read INTEGER DEFAULT 0;");
} catch {}
try {
  sqlite.exec("ALTER TABLE feed_items ADD COLUMN read_duration_seconds INTEGER DEFAULT 0;");
} catch {}
try {
  sqlite.exec("ALTER TABLE feed_items ADD COLUMN user_notes TEXT;");
} catch {}
try {
  sqlite.exec("ALTER TABLE feed_items ADD COLUMN tags TEXT;");
} catch {}
try {
  sqlite.exec("ALTER TABLE reading_list ADD COLUMN user_notes TEXT;");
} catch {}
try {
  sqlite.exec("ALTER TABLE reading_list ADD COLUMN tags TEXT;");
} catch {}
try {
  sqlite.exec("ALTER TABLE reading_sessions ADD COLUMN feed_id TEXT;");
} catch {}
try {
  sqlite.exec("ALTER TABLE user_profiles ADD COLUMN work_digest_name TEXT DEFAULT 'Work';");
} catch {}
try {
  sqlite.exec("ALTER TABLE user_profiles ADD COLUMN work_digest_email TEXT;");
} catch {}

// Seed / auto-classify known vendor feeds
try {
  sqlite.exec(`
    UPDATE feeds 
    SET editorial_type = 'vendor' 
    WHERE (
      lower(title) LIKE '%cardinal%' OR 
      lower(feed_url) LIKE '%cardinalops%' OR 
      lower(title) LIKE '%crowdstrike%' OR 
      lower(title) LIKE '%sentinelone%' OR 
      lower(title) LIKE '%palo alto%' OR 
      lower(title) LIKE '%wiz.io%' OR 
      lower(feed_url) LIKE '%wiz.io%'
    ) AND (editorial_type IS NULL OR editorial_type = 'independent');
  `);
} catch {}

// Bootstrap tables if not exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS feeds (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    feed_url TEXT NOT NULL UNIQUE,
    site_url TEXT,
    category TEXT DEFAULT 'General',
    feed_type TEXT DEFAULT 'rss',
    editorial_type TEXT DEFAULT 'independent',
    auto_full_fetch INTEGER DEFAULT 0,
    icon_url TEXT,
    last_fetched_at INTEGER,
    etag TEXT,
    last_modified TEXT,
    error_count INTEGER DEFAULT 0,
    last_error TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS feed_items (
    id TEXT PRIMARY KEY,
    feed_id TEXT REFERENCES feeds(id) ON DELETE CASCADE,
    guid TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    author TEXT,
    snippet TEXT,
    full_content_html TEXT,
    full_content_markdown TEXT,
    is_full_fetched INTEGER DEFAULT 0,
    media_type TEXT DEFAULT 'article',
    video_id TEXT,
    thumbnail_url TEXT,
    is_read INTEGER DEFAULT 0,
    is_starred INTEGER DEFAULT 0,
    ai_summary TEXT,
    published_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reading_list (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    source_feed_item_id TEXT REFERENCES feed_items(id) ON DELETE SET NULL,
    source_context TEXT,
    full_content_html TEXT,
    full_content_markdown TEXT,
    is_read INTEGER DEFAULT 0,
    is_starred INTEGER DEFAULT 0,
    ai_summary TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    color TEXT DEFAULT '#3B82F6',
    icon TEXT DEFAULT 'bookmark',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS board_items (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    user_notes TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reading_sessions (
    id TEXT PRIMARY KEY,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    duration_seconds INTEGER DEFAULT 0,
    word_count INTEGER DEFAULT 0,
    action TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    category TEXT DEFAULT 'General',
    comment TEXT NOT NULL,
    article_id TEXT,
    article_title TEXT,
    current_view TEXT,
    device_info TEXT,
    status TEXT DEFAULT 'open',
    resolved_at INTEGER,
    resolution_notes TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_profiles (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT 'Reader',
    bio TEXT,
    reading_speed_wpm INTEGER DEFAULT 230,
    default_category TEXT DEFAULT 'All',
    obsidian_vault_subfolder TEXT DEFAULT '01 - Inbox/Synapse',
    obsidian_save_mode TEXT DEFAULT 'markdown_with_assets',
    work_digest_name TEXT DEFAULT 'Work',
    work_digest_email TEXT,
    theme_preference TEXT DEFAULT 'system',
    summary_style TEXT DEFAULT 'concise',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
    item_id UNINDEXED,
    title,
    snippet,
    content_markdown,
    tokenize = 'porter unicode61'
  );

  CREATE TRIGGER IF NOT EXISTS feed_items_ai AFTER INSERT ON feed_items BEGIN
    INSERT INTO items_fts(item_id, title, snippet, content_markdown)
    VALUES (new.id, new.title, new.snippet, coalesce(new.full_content_markdown, ''));
  END;

  CREATE TRIGGER IF NOT EXISTS feed_items_au AFTER UPDATE ON feed_items BEGIN
    DELETE FROM items_fts WHERE item_id = old.id;
    INSERT INTO items_fts(item_id, title, snippet, content_markdown)
    VALUES (new.id, new.title, new.snippet, coalesce(new.full_content_markdown, ''));
  END;

  CREATE TRIGGER IF NOT EXISTS feed_items_ad AFTER DELETE ON feed_items BEGIN
    DELETE FROM items_fts WHERE item_id = old.id;
  END;

  CREATE INDEX IF NOT EXISTS idx_feed_items_feed_id ON feed_items(feed_id);
  CREATE INDEX IF NOT EXISTS idx_feed_items_published_at ON feed_items(published_at DESC);
  CREATE INDEX IF NOT EXISTS idx_feed_items_is_read ON feed_items(is_read);
  CREATE INDEX IF NOT EXISTS idx_feed_items_feed_published ON feed_items(feed_id, published_at DESC);
  CREATE INDEX IF NOT EXISTS idx_feed_items_guid ON feed_items(feed_id, guid);
  CREATE INDEX IF NOT EXISTS idx_feeds_category ON feeds(category);
`);

// Initialize default user profile if empty
try {
  const profileCount = sqlite.prepare("SELECT count(*) as count FROM user_profiles").get() as {
    count: number;
  };
  if (profileCount && profileCount.count === 0) {
    sqlite
      .prepare(
        `
      INSERT INTO user_profiles (id, display_name, bio, reading_speed_wpm, default_category, obsidian_vault_subfolder, obsidian_save_mode, theme_preference, summary_style, created_at, updated_at)
      VALUES ('default', 'Reader', 'Curator & deep reader', 230, 'All', '01 - Inbox/Synapse', 'markdown_with_assets', 'system', 'concise', CAST(strftime('%s', 'now') AS INTEGER), CAST(strftime('%s', 'now') AS INTEGER))
    `
      )
      .run();
  }
} catch (e) {
  console.warn("User profile initialization skipped:", e);
}

// Initialize welcome guide if not present
try {
  const welcomeItem = sqlite
    .prepare("SELECT count(*) as count FROM feed_items WHERE id = ?")
    .get(WELCOME_ARTICLE.id) as { count: number };

  if (welcomeItem && welcomeItem.count === 0) {
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO feeds (id, title, feed_url, site_url, category, feed_type, editorial_type, auto_full_fetch, created_at)
         VALUES (?, ?, ?, ?, ?, 'rss', ?, 1, CAST(strftime('%s', 'now') AS INTEGER))`
      )
      .run(
        WELCOME_FEED.id,
        WELCOME_FEED.title,
        WELCOME_FEED.feedUrl,
        WELCOME_FEED.siteUrl,
        WELCOME_FEED.category,
        WELCOME_FEED.editorialType
      );

    sqlite
      .prepare(
        `INSERT INTO feed_items (id, feed_id, guid, title, url, author, snippet, full_content_html, full_content_markdown, is_full_fetched, media_type, published_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'article', CAST(strftime('%s', 'now') AS INTEGER), CAST(strftime('%s', 'now') AS INTEGER))`
      )
      .run(
        WELCOME_ARTICLE.id,
        WELCOME_ARTICLE.feedId,
        WELCOME_ARTICLE.guid,
        WELCOME_ARTICLE.title,
        WELCOME_ARTICLE.url,
        WELCOME_ARTICLE.author,
        WELCOME_ARTICLE.snippet,
        WELCOME_ARTICLE.fullContentHtml,
        WELCOME_ARTICLE.fullContentMarkdown
      );
  } else {
    // Keep welcome guide content synchronized with current template updates
    sqlite
      .prepare(
        `UPDATE feed_items 
         SET full_content_html = ?, full_content_markdown = ?, snippet = ?
         WHERE id = ?`
      )
      .run(
        WELCOME_ARTICLE.fullContentHtml,
        WELCOME_ARTICLE.fullContentMarkdown,
        WELCOME_ARTICLE.snippet,
        WELCOME_ARTICLE.id
      );
  }
} catch (e) {
  console.warn("Welcome guide initialization skipped:", e);
}

// Safe startup data migrations (executed only if feeds exist)
try {
  const feedCount = sqlite.prepare("SELECT count(*) as count FROM feeds").get() as {
    count: number;
  };
  if (feedCount && feedCount.count > 0) {
    sqlite.exec(`
      UPDATE feed_items
      SET published_at = created_at
      WHERE published_at > CAST(strftime('%s', 'now') AS INTEGER) + 3600;
    `);
  }
} catch (e) {
  console.warn("Startup migration check skipped:", e);
}

export const db = drizzle(sqlite, { schema });
export { sqlite };
