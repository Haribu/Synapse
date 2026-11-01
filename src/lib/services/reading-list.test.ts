import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { cleanUrl } from "./link-cleaner";

describe("Reading List Ingestion & Provenance Isolation", () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE feed_items (
        id TEXT PRIMARY KEY,
        feed_id TEXT,
        title TEXT NOT NULL,
        url TEXT,
        author TEXT,
        snippet TEXT,
        full_content_html TEXT,
        full_content_markdown TEXT,
        is_read INTEGER DEFAULT 0,
        is_starred INTEGER DEFAULT 0,
        created_at INTEGER,
        is_work INTEGER DEFAULT 0
      );

      CREATE TABLE reading_list (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        source_feed_item_id TEXT,
        source_context TEXT,
        full_content_html TEXT,
        full_content_markdown TEXT,
        is_read INTEGER DEFAULT 0,
        is_starred INTEGER DEFAULT 0,
        is_work INTEGER DEFAULT 0,
        created_at INTEGER
      );
    `);
  });

  afterEach(() => {
    db.close();
  });

  it("ensures cleanUrl strips tracking and affiliate parameters accurately", () => {
    const raw = "https://example.com/research-post?utm_source=newsletter&utm_medium=email&utm_campaign=october&ref=feedly";
    const cleaned = cleanUrl(raw);
    expect(cleaned).toBe("https://example.com/research-post");
  });

  it("isolates saved hyperlinks so they NEVER inherit the parent article's title or content", () => {
    // Parent newsletter
    const parentId = "parent-dew-172";
    const parentUrl = "https://dew.newsletter/172-context-bombing";
    const parentTitle = "DEW #172 - Context bombing, GATES method for hunting & Vulnpocalypse Week 2";
    const parentHtml = "<article><p>Comprehensive newsletter content with 50 links...</p></article>";
    const parentMd = "Comprehensive newsletter content with 50 links...";

    db.prepare(`
      INSERT INTO feed_items (id, title, url, full_content_html, full_content_markdown)
      VALUES (?, ?, ?, ?, ?)
    `).run(parentId, parentTitle, parentUrl, parentHtml, parentMd);

    // Hyperlink clicked inside newsletter
    const targetHyperlink = "https://vulncheck.com/blog/context-bombing-deep-dive?utm_source=dew";
    const cleanedTarget = cleanUrl(targetHyperlink);
    const contextText = "GATES method for hunting";

    // Simulate ingestion logic
    const parent = db.prepare(`SELECT * FROM feed_items WHERE id = ?`).get(parentId) as any;
    expect(parent).toBeDefined();

    let finalTitle = contextText || cleanedTarget;
    let contentHtml = "";
    let contentMarkdown = "";

    // Invariant: only inherit from parent if cleanUrl(parent.url) === cleanedTarget
    if (parent && cleanUrl(parent.url) === cleanedTarget) {
      if (parent.full_content_html) contentHtml = parent.full_content_html;
      if (parent.full_content_markdown) contentMarkdown = parent.full_content_markdown;
      if (parent.title) finalTitle = parent.title;
    }

    expect(contentHtml).toBe("");
    expect(contentMarkdown).toBe("");
    expect(finalTitle).toBe("GATES method for hunting");
    expect(finalTitle).not.toBe(parentTitle);
  });

  it("allows parent article itself to inherit content when saved to reading list", () => {
    const parentId = "parent-article-1";
    const parentUrl = "https://example.com/standalone-article?utm_campaign=rss";
    const parentTitle = "Standalone Article Title";
    const parentHtml = "<article><p>Article body</p></article>";
    const parentMd = "Article body";

    db.prepare(`
      INSERT INTO feed_items (id, title, url, full_content_html, full_content_markdown)
      VALUES (?, ?, ?, ?, ?)
    `).run(parentId, parentTitle, parentUrl, parentHtml, parentMd);

    const savedUrl = cleanUrl(parentUrl);
    const parent = db.prepare(`SELECT * FROM feed_items WHERE id = ?`).get(parentId) as any;

    let finalTitle = savedUrl;
    let contentHtml = "";
    let contentMarkdown = "";

    if (parent && cleanUrl(parent.url) === savedUrl) {
      if (parent.full_content_html) contentHtml = parent.full_content_html;
      if (parent.full_content_markdown) contentMarkdown = parent.full_content_markdown;
      if (parent.title) finalTitle = parent.title;
    }

    expect(contentHtml).toBe(parentHtml);
    expect(contentMarkdown).toBe(parentMd);
    expect(finalTitle).toBe(parentTitle);
  });

  it("detects and heals historical corrupted reading_list entries where a hyperlink copied parent content", () => {
    const parentId = "parent-dew-172";
    const parentUrl = "https://dew.newsletter/172";
    const parentTitle = "DEW #172 - Context bombing, GATES method for hunting & Vulnpocalypse Week 2";
    const parentHtml = "<article>Newsletter full text</article>";

    db.prepare(`
      INSERT INTO feed_items (id, title, url, full_content_html)
      VALUES (?, ?, ?, ?)
    `).run(parentId, parentTitle, parentUrl, parentHtml);

    // Contaminated reading_list item (hyperlink that wrongly received parent title and parent HTML, with null foreign key)
    db.prepare(`
      INSERT INTO reading_list (id, url, title, source_feed_item_id, source_context, full_content_html, is_work)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      "rl-corrupted-1",
      "https://target.com/research-paper",
      parentTitle,
      null, // null foreign key simulates real-world corrupted row
      "GATES method for hunting",
      parentHtml,
      1
    );

    // Legitimate reading_list item (parent article saved directly)
    db.prepare(`
      INSERT INTO reading_list (id, url, title, source_feed_item_id, source_context, full_content_html, is_work)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      "rl-legit-parent",
      parentUrl,
      parentTitle,
      parentId,
      null,
      parentHtml,
      0
    );

    // Run detection query (does not rely on non-null foreign key)
    const corruptedItems = db.prepare(`
      SELECT rl.id, rl.url, rl.title, rl.source_context
      FROM reading_list rl
      WHERE (
        rl.title LIKE '%DEW #%'
        OR rl.title LIKE '%assorted links%'
        OR (rl.full_content_html LIKE '%Newsletter full text%' AND rl.url NOT LIKE '%dew.newsletter%')
        OR EXISTS (
          SELECT 1 FROM feed_items fi
          WHERE fi.url != rl.url
            AND (fi.title = rl.title OR fi.full_content_html = rl.full_content_html)
        )
      )
      AND rl.url NOT LIKE '%dew.newsletter%'
    `).all() as any[];

    expect(corruptedItems.length).toBe(1);
    expect(corruptedItems[0].id).toBe("rl-corrupted-1");
    expect(corruptedItems[0].url).toBe("https://target.com/research-paper");

    // Perform healing
    for (const c of corruptedItems) {
      const parentNewsletter = c.title;
      const healedTitle = c.source_context || c.url;
      const healedSourceContext = parentNewsletter;
      const healedHtml = `<div class="direct-link">Saved from: ${parentNewsletter}</div>`;
      db.prepare(`
        UPDATE reading_list 
        SET title = ?, source_context = ?, full_content_html = ?, full_content_markdown = '' 
        WHERE id = ?
      `).run(healedTitle, healedSourceContext, healedHtml, c.id);
    }

    const healedRecord = db.prepare(`SELECT * FROM reading_list WHERE id = ?`).get("rl-corrupted-1") as any;
    expect(healedRecord.title).toBe("GATES method for hunting");
    expect(healedRecord.source_context).toBe(parentTitle);
    expect(healedRecord.full_content_html).toContain("Saved from: DEW #172");
    expect(healedRecord.full_content_html).not.toBe(parentHtml);

    // Verify legitimate parent item was untouched
    const legitRecord = db.prepare(`SELECT * FROM reading_list WHERE id = ?`).get("rl-legit-parent") as any;
    expect(legitRecord.title).toBe(parentTitle);
    expect(legitRecord.full_content_html).toBe(parentHtml);
  });
});
