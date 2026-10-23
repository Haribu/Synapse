import { NextResponse } from "next/server";
import { db, sqlite } from "@/lib/db";
import { feedItems, feeds, readingList, readingSessions, boards } from "@/lib/db/schema";
import { desc, eq, sql, gte, and } from "drizzle-orm";
import { isSponsoredContent } from "@/lib/utils/sponsored";
import { isWeeklyRoundup } from "@/lib/utils/roundup";
import { getLastSyncTelemetry } from "@/lib/services/sync-engine";
import crypto from "crypto";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1. Overall counts (distinguishing triaged vs engaged)
    const totalItemsRow = db
      .select({
        total: sql<number>`count(*)`,
        triaged: sql<number>`count(case when ${feedItems.isRead} = 1 then 1 else null end)`,
        engaged: sql<number>`count(case when ${feedItems.isEngagedRead} = 1 then 1 else null end)`,
        starred: sql<number>`count(case when ${feedItems.isStarred} = 1 then 1 else null end)`,
        hydrated: sql<number>`count(case when ${feedItems.isFullFetched} = 1 then 1 else null end)`,
      })
      .from(feedItems)
      .get();

    const readingListRow = db
      .select({
        total: sql<number>`count(*)`,
        read: sql<number>`count(case when ${readingList.isRead} = 1 then 1 else null end)`,
      })
      .from(readingList)
      .get();

    const boardsCountRow = db
      .select({ total: sql<number>`count(*)` })
      .from(boards)
      .get();

    // 2. Action sessions (Obsidian exports, GDocs exports, logged reading time, flicks, skims)
    const sessionStats = db
      .select({
        obsidianSaved: sql<number>`count(case when ${readingSessions.action} = 'obsidian' then 1 else null end)`,
        gdocsSaved: sql<number>`count(case when ${readingSessions.action} = 'google_docs' then 1 else null end)`,
        loggedSeconds: sql<number>`coalesce(sum(${readingSessions.durationSeconds}), 0)`,
        flickedCount: sql<number>`count(case when ${readingSessions.action} = 'flick' then 1 else null end)`,
        skimmedCount: sql<number>`count(case when ${readingSessions.action} = 'skim' then 1 else null end)`,
        engagedCount: sql<number>`count(case when ${readingSessions.action} = 'read' then 1 else null end)`,
      })
      .from(readingSessions)
      .get();

    // 3. Category Breakdown (Dual-metric: triaged vs engaged)
    const categoryStats = db
      .select({
        category: feeds.category,
        total: sql<number>`count(${feedItems.id})`,
        read: sql<number>`count(case when ${feedItems.isRead} = 1 then 1 else null end)`,
        engaged: sql<number>`count(case when ${feedItems.isEngagedRead} = 1 then 1 else null end)`,
        engagedSeconds: sql<number>`coalesce(sum(case when ${feedItems.isEngagedRead} = 1 then ${feedItems.readDurationSeconds} else 0 end), 0)`,
      })
      .from(feeds)
      .leftJoin(feedItems, eq(feeds.id, feedItems.feedId))
      .groupBy(feeds.category)
      .all();

    // 4. Media Types Breakdown
    const mediaStats = db
      .select({
        mediaType: feedItems.mediaType,
        count: sql<number>`count(*)`,
      })
      .from(feedItems)
      .groupBy(feedItems.mediaType)
      .all();

    // 4b. Written Articles vs Video Breakdown
    const writtenVsVideoRow = db
      .select({
        totalArticles: sql<number>`count(case when (${feedItems.mediaType} != 'video' or ${feedItems.mediaType} is null) and ${feedItems.videoId} is null and ${feedItems.url} not like '%youtube%' then 1 else null end)`,
        readArticles: sql<number>`count(case when (${feedItems.mediaType} != 'video' or ${feedItems.mediaType} is null) and ${feedItems.videoId} is null and ${feedItems.url} not like '%youtube%' and ${feedItems.isRead} = 1 then 1 else null end)`,
        engagedArticles: sql<number>`count(case when (${feedItems.mediaType} != 'video' or ${feedItems.mediaType} is null) and ${feedItems.videoId} is null and ${feedItems.url} not like '%youtube%' and ${feedItems.isEngagedRead} = 1 then 1 else null end)`,
        totalVideos: sql<number>`count(case when ${feedItems.mediaType} = 'video' or ${feedItems.videoId} is not null or ${feedItems.url} like '%youtube%' then 1 else null end)`,
        triagedVideos: sql<number>`count(case when (${feedItems.mediaType} = 'video' or ${feedItems.videoId} is not null or ${feedItems.url} like '%youtube%') and ${feedItems.isRead} = 1 then 1 else null end)`,
        watchedVideos: sql<number>`count(case when (${feedItems.mediaType} = 'video' or ${feedItems.videoId} is not null or ${feedItems.url} like '%youtube%') and (${feedItems.isEngagedRead} = 1 or ${feedItems.readDurationSeconds} >= 30) then 1 else null end)`,
        watchedSeconds: sql<number>`coalesce(sum(case when ${feedItems.mediaType} = 'video' or ${feedItems.videoId} is not null or ${feedItems.url} like '%youtube%' then ${feedItems.readDurationSeconds} else 0 end), 0)`,
        watchLaterVideos: sql<number>`count(case when (${feedItems.mediaType} = 'video' or ${feedItems.videoId} is not null or ${feedItems.url} like '%youtube%') and ${feedItems.isStarred} = 1 then 1 else null end)`,
      })
      .from(feedItems)
      .get();

    // 5. Authentic reading time & digested words calculation
    // Grounded in actual logged reading seconds, capped by human reading rate (~230 wpm)
    const readItems = db
      .select({
        contentMarkdown: feedItems.fullContentMarkdown,
        snippet: feedItems.snippet,
        durationSeconds: feedItems.readDurationSeconds,
        isEngagedRead: feedItems.isEngagedRead,
      })
      .from(feedItems)
      .where(sql`${feedItems.readDurationSeconds} > 0`)
      .all();

    let totalWordsRead = 0;
    let totalEngagedSeconds = 0;

    for (const item of readItems) {
      const dur = item.durationSeconds || 0;
      if (item.isEngagedRead) {
        totalEngagedSeconds += dur;
      }
      const text = item.contentMarkdown || item.snippet || "";
      const articleWords = text.trim().split(/\s+/).filter(Boolean).length || 150;
      // Human reading rate ~230 wpm = ~3.8 words/sec
      const wordsAtVelocity = Math.round(dur * (230 / 60));
      const digested = Math.min(articleWords, Math.max(wordsAtVelocity, 0));
      totalWordsRead += digested;
    }

    const estimatedMinutesRead = Math.round(totalEngagedSeconds / 60);

    // 6. Last 7 Days velocity (distinguishing true reading from skims/flicks)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentSessions = db
      .select({
        timestamp: readingSessions.timestamp,
        action: readingSessions.action,
      })
      .from(readingSessions)
      .where(gte(readingSessions.timestamp, sevenDaysAgo))
      .all();

    // Format 7-day velocity map (Day of week / date -> { engaged, skimmed, flicked, count })
    const daysMap: Record<
      string,
      { date: string; count: number; engaged: number; skimmed: number; flicked: number }
    > = {};

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "numeric",
        day: "numeric",
      });
      daysMap[key] = { date: key, count: 0, engaged: 0, skimmed: 0, flicked: 0 };
    }

    for (const session of recentSessions) {
      if (session.timestamp) {
        const key = new Date(session.timestamp).toLocaleDateString("en-US", {
          weekday: "short",
          month: "numeric",
          day: "numeric",
        });
        if (daysMap[key]) {
          if (session.action === "read") {
            daysMap[key].engaged++;
            daysMap[key].count++; // primary bar counts genuine engaged reading
          } else if (session.action === "skim") {
            daysMap[key].skimmed++;
          } else if (session.action === "flick") {
            daysMap[key].flicked++;
          }
        }
      }
    }

    const dailyVelocity = Object.values(daysMap);

    const engagedCount = totalItemsRow?.engaged || 0;
    const triagedCount = totalItemsRow?.triaged || 0;
    const engagementRatio = triagedCount > 0 ? Math.round((engagedCount / triagedCount) * 100) : 0;

    // 6b. Reading Streak & Deep Work Calculation
    let streakDays = 0;
    let isStreakActiveToday = false;
    try {
      const sessionDates = db
        .select({
          timestamp: readingSessions.timestamp,
        })
        .from(readingSessions)
        .where(sql`${readingSessions.action} IN ('read', 'obsidian', 'google_docs')`)
        .all();

      if (sessionDates.length > 0) {
        const dateSet = new Set<string>();
        for (const s of sessionDates) {
          if (s.timestamp) {
            const dateStr = new Date(s.timestamp).toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
            dateSet.add(dateStr);
          }
        }

        const todayStr = new Date().toLocaleDateString("en-CA");
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = yesterdayDate.toLocaleDateString("en-CA");

        isStreakActiveToday = dateSet.has(todayStr);

        const checkDateStr = isStreakActiveToday
          ? todayStr
          : dateSet.has(yesterdayStr)
            ? yesterdayStr
            : null;

        if (checkDateStr) {
          const curr = new Date(checkDateStr);
          while (true) {
            const str = curr.toLocaleDateString("en-CA");
            if (dateSet.has(str)) {
              streakDays++;
              curr.setDate(curr.getDate() - 1);
            } else {
              break;
            }
          }
        }
      }
    } catch (streakErr) {
      console.warn("Failed to compute reading streak:", streakErr);
    }

    // 6c. Noise Reduction & Filter Telemetry
    let noiseStats = {
      sponsoredCount: 0,
      roundupCount: 0,
      vendorCount: 0,
      readCount: triagedCount,
      totalSuppressed: 0,
    };
    try {
      const allItemsForFilter = db
        .select({
          id: feedItems.id,
          title: feedItems.title,
          snippet: feedItems.snippet,
          author: feedItems.author,
          url: feedItems.url,
          editorialType: feeds.editorialType,
        })
        .from(feedItems)
        .leftJoin(feeds, eq(feedItems.feedId, feeds.id))
        .all();

      let spCount = 0;
      let roCount = 0;
      let veCount = 0;

      for (const item of allItemsForFilter) {
        if (isSponsoredContent(item)) spCount++;
        if (isWeeklyRoundup(item)) roCount++;
        if (item.editorialType === "vendor") veCount++;
      }

      noiseStats = {
        sponsoredCount: spCount,
        roundupCount: roCount,
        vendorCount: veCount,
        readCount: triagedCount,
        totalSuppressed: spCount + roCount + veCount,
      };
    } catch (noiseErr) {
      console.warn("Failed to compute noise reduction stats:", noiseErr);
    }

    // 6d. Deep Research & Saved Queue Clearance Telemetry
    let starredRow:
      { totalStarred: number; readStarred: number; engagedStarred: number } | undefined;
    let researchRow: { totalResearch: number; readResearch: number } | undefined;
    try {
      starredRow = db
        .select({
          totalStarred: sql<number>`count(*)`,
          readStarred: sql<number>`count(case when ${feedItems.isRead} = 1 then 1 else null end)`,
          engagedStarred: sql<number>`count(case when ${feedItems.isEngagedRead} = 1 then 1 else null end)`,
        })
        .from(feedItems)
        .where(eq(feedItems.isStarred, true))
        .get();

      researchRow = db
        .select({
          totalResearch: sql<number>`count(*)`,
          readResearch: sql<number>`count(case when ${readingList.isRead} = 1 then 1 else null end)`,
        })
        .from(readingList)
        .get();
    } catch (clearanceErr) {
      console.warn("Failed to compute queue clearance stats:", clearanceErr);
    }

    // 7. Stats for Nerds: SQLite & Engine Telemetry
    let nerdStats = null;
    try {
      const DATA_DIR = process.env.SYNAPSE_DATA_DIR || path.join(process.cwd(), "data");
      const dbFile = path.join(DATA_DIR, "synapse.db");
      const walFile = path.join(DATA_DIR, "synapse.db-wal");

      const dbSizeBytes = fs.existsSync(dbFile) ? fs.statSync(dbFile).size : 0;
      const walSizeBytes = fs.existsSync(walFile) ? fs.statSync(walFile).size : 0;
      const totalDiskMb = ((dbSizeBytes + walSizeBytes) / (1024 * 1024)).toFixed(2);

      const pageSize = Number(sqlite.pragma("page_size", { simple: true }) || 4096);
      const pageCount = Number(sqlite.pragma("page_count", { simple: true }) || 0);
      const freelistCount = Number(sqlite.pragma("freelist_count", { simple: true }) || 0);

      // Rank feeds by true engaged reading dwell time rather than raw bulk marks
      const mostReadFeeds = db
        .select({
          title: feeds.title,
          category: feeds.category,
          editorialType: feeds.editorialType,
          engagedSeconds: sql<number>`coalesce(sum(case when ${feedItems.isEngagedRead} = 1 then ${feedItems.readDurationSeconds} else 0 end), 0)`,
          engagedCount: sql<number>`count(case when ${feedItems.isEngagedRead} = 1 then 1 else null end)`,
          readCount: sql<number>`count(case when ${feedItems.isRead} = 1 then 1 else null end)`,
          totalCount: sql<number>`count(${feedItems.id})`,
        })
        .from(feeds)
        .leftJoin(feedItems, eq(feeds.id, feedItems.feedId))
        .groupBy(feeds.id)
        .having(
          sql`count(case when ${feedItems.isEngagedRead} = 1 then 1 else null end) > 0 OR count(case when ${feedItems.isRead} = 1 then 1 else null end) > 0`
        )
        .orderBy(
          desc(
            sql`coalesce(sum(case when ${feedItems.isEngagedRead} = 1 then ${feedItems.readDurationSeconds} else 0 end), 0)`
          ),
          desc(sql`count(case when ${feedItems.isEngagedRead} = 1 then 1 else null end)`)
        )
        .limit(6)
        .all();

      const highestVolumeFeeds = db
        .select({
          title: feeds.title,
          category: feeds.category,
          editorialType: feeds.editorialType,
          itemCount: sql<number>`count(${feedItems.id})`,
        })
        .from(feeds)
        .leftJoin(feedItems, eq(feeds.id, feedItems.feedId))
        .groupBy(feeds.id)
        .orderBy(desc(sql`count(${feedItems.id})`))
        .limit(6)
        .all();

      const ftsCountRow = sqlite.prepare("SELECT count(*) as count FROM items_fts").get() as
        { count: number } | undefined;
      const feedbackCountRow = sqlite.prepare("SELECT count(*) as count FROM feedback").get() as
        { count: number } | undefined;

      nerdStats = {
        dbSizeBytes,
        walSizeBytes,
        totalDiskMb,
        pageSize,
        pageCount,
        freelistCount,
        mostReadFeeds,
        highestVolumeFeeds,
        topFeeds: highestVolumeFeeds,
        tableCounts: {
          feeds: categoryStats.length,
          feedItems: totalItemsRow?.total || 0,
          readingList: readingListRow?.total || 0,
          readingSessions:
            (sessionStats?.engagedCount || 0) +
            (sessionStats?.skimmedCount || 0) +
            (sessionStats?.flickedCount || 0),
          feedback: feedbackCountRow?.count || 0,
          ftsIndexed: ftsCountRow?.count || 0,
        },
        syncTelemetry: getLastSyncTelemetry(),
      };
    } catch (nerdErr) {
      console.warn("Failed to compute nerd stats:", nerdErr);
    }

    return NextResponse.json({
      summary: {
        totalArticles: totalItemsRow?.total || 0,
        readArticles: triagedCount, // triaged / marked read
        engagedArticles: engagedCount, // >=30s genuine read
        flickedArticles: sessionStats?.flickedCount || 0,
        skimmedArticles: sessionStats?.skimmedCount || 0,
        engagementRatio,
        unreadArticles: (totalItemsRow?.total || 0) - triagedCount,
        starredArticles: totalItemsRow?.starred || 0,
        hydratedArticles: totalItemsRow?.hydrated || 0,
        researchInboxCount: readingListRow?.total || 0,
        boardsCount: boardsCountRow?.total || 0,
        obsidianSaved: sessionStats?.obsidianSaved || 0,
        gdocsSaved: sessionStats?.gdocsSaved || 0,
        totalWordsRead,
        estimatedMinutesRead,
        loggedSeconds: totalEngagedSeconds,
        streakDays,
        isStreakActiveToday,
      },
      queueClearance: {
        starred: {
          total: starredRow?.totalStarred || 0,
          read: starredRow?.readStarred || 0,
          engaged: starredRow?.engagedStarred || 0,
          pending: (starredRow?.totalStarred || 0) - (starredRow?.readStarred || 0),
        },
        research: {
          total: researchRow?.totalResearch || 0,
          read: researchRow?.readResearch || 0,
          pending: (researchRow?.totalResearch || 0) - (researchRow?.readResearch || 0),
        },
        obsidianNotesSaved: sessionStats?.obsidianSaved || 0,
        gdocsNotesSaved: sessionStats?.gdocsSaved || 0,
      },
      categories: categoryStats.map((c) => ({
        category: c.category || "General",
        total: c.total,
        read: c.read,
        engaged: c.engaged,
        engagedSeconds: c.engagedSeconds,
      })),
      mediaBreakdown: mediaStats.map((m) => ({
        type: m.mediaType || "article",
        count: m.count,
      })),
      contentSplit: {
        written: {
          total: writtenVsVideoRow?.totalArticles || 0,
          read: writtenVsVideoRow?.readArticles || 0,
          engaged: writtenVsVideoRow?.engagedArticles || 0,
          wordsRead: totalWordsRead,
          minutesRead: estimatedMinutesRead,
        },
        video: {
          total: writtenVsVideoRow?.totalVideos || 0,
          triaged: writtenVsVideoRow?.triagedVideos || 0,
          watched: writtenVsVideoRow?.watchedVideos || 0,
          watchHours: Number(((writtenVsVideoRow?.watchedSeconds || 0) / 3600).toFixed(1)),
          watchMinutes: Math.round((writtenVsVideoRow?.watchedSeconds || 0) / 60),
          watchLater: writtenVsVideoRow?.watchLaterVideos || 0,
        },
      },
      noiseStats,
      dailyVelocity,
      nerdStats,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      const text = await req.text();
      body = text ? JSON.parse(text) : {};
    }
    const {
      targetType = "feed_item",
      targetId,
      feedId,
      durationSeconds = 0,
      wordCount = 0,
      action,
    } = body;

    if (!targetId || !action) {
      return NextResponse.json({ error: "targetId and action are required" }, { status: 400 });
    }

    db.insert(readingSessions)
      .values({
        id: crypto.randomUUID(),
        targetType,
        targetId,
        feedId: feedId || null,
        durationSeconds,
        wordCount,
        action,
        timestamp: new Date(),
      })
      .run();

    const isEngaged = action === "read" || durationSeconds >= 30;

    if (targetType === "feed_item") {
      db.update(feedItems)
        .set({
          ...(isEngaged ? { isEngagedRead: true } : {}),
          readDurationSeconds: sql`coalesce(${feedItems.readDurationSeconds}, 0) + ${durationSeconds}`,
        })
        .where(eq(feedItems.id, targetId))
        .run();
    } else if (targetType === "reading_list") {
      if (isEngaged) {
        db.update(readingList).set({ isRead: true }).where(eq(readingList.id, targetId)).run();
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
