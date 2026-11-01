import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { reconcileUserData } from "./reconcile";

describe("reconcileUserData", () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE feed_items (
        id TEXT PRIMARY KEY,
        feed_id TEXT,
        guid TEXT,
        title TEXT NOT NULL,
        url TEXT,
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
        created_at INTEGER,
        is_work INTEGER DEFAULT 0,
        work_dispatched_at INTEGER
      );

      CREATE TABLE reading_list (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        source_feed_item_id TEXT,
        source_context TEXT,
        full_content_html TEXT,
        full_content_markdown TEXT,
        is_read INTEGER DEFAULT 1,
        is_starred INTEGER DEFAULT 0,
        ai_summary TEXT,
        created_at INTEGER,
        is_work INTEGER DEFAULT 0,
        work_dispatched_at INTEGER,
        user_notes TEXT,
        tags TEXT
      );
    `);
  });

  afterEach(() => {
    db.close();
  });

  it("marks all read-later reading list items with is_starred = 1", () => {
    db.prepare(
      `INSERT INTO reading_list (id, url, title, tags, is_starred) VALUES (?, ?, ?, ?, ?)`
    ).run("rl-1", "https://example.com/1", "Test Article", "read-later,feedly-import", 0);

    const result = reconcileUserData(db as any);
    expect(result.readingListStarred).toBe(1);

    const item = db.prepare(`SELECT is_starred FROM reading_list WHERE id = ?`).get("rl-1") as any;
    expect(item.is_starred).toBe(1);
  });

  it("reconciles known work items across reading_list and feed_items", () => {
    db.prepare(
      `INSERT INTO reading_list (id, url, title, source_context, is_work) VALUES (?, ?, ?, ?, ?)`
    ).run("rl-work", "https://nebulock.io/blog/test", "Nebulock Research", "DEW #172", 0);

    db.prepare(
      `INSERT INTO feed_items (id, title, url, is_work) VALUES (?, ?, ?, ?)`
    ).run(
      "fi-work",
      "Apple changes full-disk access permissions to curb abuse from AI agents",
      "https://example.com/apple",
      0
    );

    const result = reconcileUserData(db as any);
    expect(result.readingListWork).toBe(1);
    expect(result.feedItemsWork).toBeGreaterThanOrEqual(1);

    const rl = db.prepare(`SELECT is_work FROM reading_list WHERE id = ?`).get("rl-work") as any;
    expect(rl.is_work).toBe(1);

    const fi = db.prepare(`SELECT is_work FROM feed_items WHERE id = ?`).get("fi-work") as any;
    expect(fi.is_work).toBe(1);
  });

  it("reconciles known starred text feed items", () => {
    db.prepare(
      `INSERT INTO feed_items (id, title, url, is_starred) VALUES (?, ?, ?, ?)`
    ).run(
      "fi-starred",
      "The 15-Minute Patch, Reverse-Engineered: What Had to Be True?",
      "https://example.com/patch",
      0
    );

    const result = reconcileUserData(db as any);
    expect(result.feedItemsStarred).toBeGreaterThanOrEqual(1);

    const fi = db.prepare(`SELECT is_starred FROM feed_items WHERE id = ?`).get("fi-starred") as any;
    expect(fi.is_starred).toBe(1);
  });
});
