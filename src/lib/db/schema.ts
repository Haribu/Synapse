import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const feeds = sqliteTable(
  "feeds",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    feedUrl: text("feed_url").notNull().unique(),
    siteUrl: text("site_url"),
    category: text("category").default("General"),
    feedType: text("feed_type").default("rss"), // 'rss' | 'atom' | 'youtube' | 'newsletter'
    editorialType: text("editorial_type").default("independent"), // 'independent' | 'vendor' | 'community' | 'official' | 'news'
    autoFullFetch: integer("auto_full_fetch", { mode: "boolean" }).default(false),
    iconUrl: text("icon_url"),
    lastFetchedAt: integer("last_fetched_at", { mode: "timestamp" }),
    etag: text("etag"),
    lastModified: text("last_modified"),
    errorCount: integer("error_count").default(0),
    lastError: text("last_error"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    categoryIdx: index("feeds_category_idx").on(table.category),
  })
);

export const feedItems = sqliteTable(
  "feed_items",
  {
    id: text("id").primaryKey(),
    feedId: text("feed_id").references(() => feeds.id, { onDelete: "cascade" }),
    guid: text("guid").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    author: text("author"),
    snippet: text("snippet"),
    fullContentHtml: text("full_content_html"),
    fullContentMarkdown: text("full_content_markdown"),
    isFullFetched: integer("is_full_fetched", { mode: "boolean" }).default(false),
    mediaType: text("media_type").default("article"), // 'article' | 'video' | 'podcast'
    videoId: text("video_id"),
    thumbnailUrl: text("thumbnail_url"),
    isRead: integer("is_read", { mode: "boolean" }).default(false),
    isStarred: integer("is_starred", { mode: "boolean" }).default(false),
    isWork: integer("is_work", { mode: "boolean" }).default(false),
    workDispatchedAt: integer("work_dispatched_at", { mode: "timestamp" }),
    isEngagedRead: integer("is_engaged_read", { mode: "boolean" }).default(false),
    readDurationSeconds: integer("read_duration_seconds").default(0),
    userNotes: text("user_notes"),
    tags: text("tags"),
    aiSummary: text("ai_summary"),
    publishedAt: integer("published_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    feedIdIdx: index("feed_items_feed_id_idx").on(table.feedId),
    publishedAtIdx: index("feed_items_published_at_idx").on(table.publishedAt),
    isReadIdx: index("feed_items_is_read_idx").on(table.isRead),
    isStarredIdx: index("feed_items_is_starred_idx").on(table.isStarred),
  })
);

export const readingList = sqliteTable(
  "reading_list",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull().unique(),
    title: text("title").notNull(),
    sourceFeedItemId: text("source_feed_item_id").references(() => feedItems.id, {
      onDelete: "set null",
    }),
    sourceContext: text("source_context"), // e.g. parent newsletter title or excerpt
    fullContentHtml: text("full_content_html"),
    fullContentMarkdown: text("full_content_markdown"),
    isRead: integer("is_read", { mode: "boolean" }).default(false),
    isStarred: integer("is_starred", { mode: "boolean" }).default(false),
    isWork: integer("is_work", { mode: "boolean" }).default(false),
    workDispatchedAt: integer("work_dispatched_at", { mode: "timestamp" }),
    userNotes: text("user_notes"),
    tags: text("tags"),
    aiSummary: text("ai_summary"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    createdAtIdx: index("reading_list_created_at_idx").on(table.createdAt),
    isReadIdx: index("reading_list_is_read_idx").on(table.isRead),
  })
);

export const boards = sqliteTable("boards", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  color: text("color").default("#3B82F6"),
  icon: text("icon").default("bookmark"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const boardItems = sqliteTable(
  "board_items",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    itemType: text("item_type").notNull(), // 'feed_item' | 'reading_list'
    targetId: text("target_id").notNull(), // feed_items.id or reading_list.id
    userNotes: text("user_notes"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    boardIdx: index("board_items_board_idx").on(table.boardId),
    targetIdx: index("board_items_target_idx").on(table.targetId),
  })
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const readingSessions = sqliteTable(
  "reading_sessions",
  {
    id: text("id").primaryKey(),
    targetType: text("target_type").notNull(), // 'feed_item' | 'reading_list'
    targetId: text("target_id").notNull(),
    feedId: text("feed_id").references(() => feeds.id, { onDelete: "cascade" }),
    durationSeconds: integer("duration_seconds").default(0),
    wordCount: integer("word_count").default(0),
    action: text("action").notNull(), // 'view' | 'read' | 'flick' | 'hydrate' | 'obsidian' | 'google_docs'
    timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    timestampIdx: index("reading_sessions_timestamp_idx").on(table.timestamp),
    actionIdx: index("reading_sessions_action_idx").on(table.action),
    feedIdIdx: index("reading_sessions_feed_id_idx").on(table.feedId),
  })
);

export const feedback = sqliteTable("feedback", {
  id: text("id").primaryKey(),
  category: text("category").default("General"),
  comment: text("comment").notNull(),
  articleId: text("article_id"),
  articleTitle: text("article_title"),
  currentView: text("current_view"),
  deviceInfo: text("device_info"),
  status: text("status").default("open"),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  resolutionNotes: text("resolution_notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const userProfiles = sqliteTable("user_profiles", {
  id: text("id").primaryKey(), // default is 'default'
  displayName: text("display_name").notNull().default("Reader"),
  bio: text("bio"),
  readingSpeedWpm: integer("reading_speed_wpm").default(230),
  defaultCategory: text("default_category").default("All"),
  obsidianVaultSubfolder: text("obsidian_vault_subfolder").default("01 - Inbox/Synapse"),
  obsidianSaveMode: text("obsidian_save_mode").default("markdown_with_assets"), // 'markdown_with_assets' | 'markdown_only'
  workDigestName: text("work_digest_name").default("Work"),
  workDigestEmail: text("work_digest_email"),
  themePreference: text("theme_preference").default("system"), // 'light' | 'dark' | 'system'
  summaryStyle: text("summary_style").default("concise"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
