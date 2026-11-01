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
        work_dispatched_at INTEGER,
        is_engaged_read INTEGER DEFAULT 0,
        read_duration_seconds INTEGER DEFAULT 0
      );

      CREATE TABLE reading_sessions (
        id TEXT PRIMARY KEY,
        target_type TEXT,
        target_id TEXT,
        duration_seconds INTEGER DEFAULT 0,
        word_count INTEGER DEFAULT 0,
        action TEXT,
        timestamp INTEGER,
        feed_id TEXT
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

  it("clamps idle-tab outliers (>1800s) in reading_sessions and sets historical work_dispatched_at", () => {
    db.prepare(
      `INSERT INTO reading_sessions (id, target_type, target_id, duration_seconds, word_count, action, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("rs-idle", "feed_item", "fi-1", 248755, 600, "read", 1791790215);

    db.prepare(
      `INSERT INTO feed_items (id, title, url, is_work) VALUES (?, ?, ?, ?)`
    ).run(
      "fi-1",
      "Apple changes full-disk access permissions to curb abuse from AI agents",
      "https://example.com/apple",
      1
    );

    reconcileUserData(db as any);

    const rs = db
      .prepare(`SELECT duration_seconds FROM reading_sessions WHERE id = ?`)
      .get("rs-idle") as any;
    expect(rs.duration_seconds).toBeLessThanOrEqual(1800);
    expect(rs.duration_seconds).toBe(180); // 600 words at 200 wpm = 180s

    const fi = db
      .prepare(`SELECT is_engaged_read, read_duration_seconds, work_dispatched_at FROM feed_items WHERE id = ?`)
      .get("fi-1") as any;
    expect(fi.is_engaged_read).toBe(1);
    expect(fi.read_duration_seconds).toBe(180);
    expect(fi.work_dispatched_at).toBe(1791630000000);
  });
});
