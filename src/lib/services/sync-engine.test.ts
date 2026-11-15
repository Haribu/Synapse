import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { purgeYouTubeShortsFromDb } from "./shorts-purge";

describe("purgeYouTubeShortsFromDb", () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE feed_items (
        id TEXT PRIMARY KEY,
        feed_id TEXT,
        title TEXT NOT NULL,
        url TEXT,
        snippet TEXT,
        full_content_html TEXT,
        media_type TEXT DEFAULT 'article',
        video_id TEXT,
        is_read INTEGER DEFAULT 0
      );
    `);
  });

  it("preserves non-YouTube newsletter articles with embedded YouTube videos and #short substrings", () => {
    db.prepare(
      `INSERT INTO feed_items (id, feed_id, title, url, snippet, full_content_html, media_type, video_id, is_read)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "benn-1",
      "feed-benn",
      "How to lose your mind",
      "https://benn.substack.com/p/how-to-lose-your-mind",
      "A short essay with #short-term thoughts",
      '<p>See <a href="https://example.com/#short">anchor</a> and <iframe src="https://youtube.com/embed/abc"></iframe></p>',
      "article",
      "abc",
      1
    );

    const deletedCount = purgeYouTubeShortsFromDb(db);
    expect(deletedCount).toBe(0);

    const remaining = db.prepare("SELECT id FROM feed_items WHERE id = ?").get("benn-1");
    expect(remaining).toBeTruthy();
  });

  it("purges actual YouTube Shorts URLs and #shorts / #ytshorts YouTube videos", () => {
    db.prepare(
      `INSERT INTO feed_items (id, feed_id, title, url, snippet, full_content_html, media_type, video_id, is_read)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "yt-short-1",
      "feed-yt",
      "Quick Clip",
      "https://www.youtube.com/shorts/xyz123",
      "",
      "",
      "video",
      "xyz123",
      0
    );

    db.prepare(
      `INSERT INTO feed_items (id, feed_id, title, url, snippet, full_content_html, media_type, video_id, is_read)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "yt-short-2",
      "feed-yt",
      "Another Clip #shorts",
      "https://www.youtube.com/watch?v=def456",
      "",
      "",
      "video",
      "def456",
      0
    );

    db.prepare(
      `INSERT INTO feed_items (id, feed_id, title, url, snippet, full_content_html, media_type, video_id, is_read)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "yt-long-1",
      "feed-yt",
      "Deep Dive on #shortage in Supply Chains",
      "https://www.youtube.com/watch?v=long999",
      "Full 45-minute documentary",
      "",
      "video",
      "long999",
      0
    );

    const deletedCount = purgeYouTubeShortsFromDb(db);
    expect(deletedCount).toBe(2);

    const remaining = db.prepare("SELECT id FROM feed_items").all() as Array<{ id: string }>;
    expect(remaining.map((r) => r.id)).toEqual(["yt-long-1"]);
  });
});
