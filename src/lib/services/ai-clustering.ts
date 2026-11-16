import { db } from "@/lib/db";
import { feedItems, feeds } from "@/lib/db/schema";
import { and, desc, eq, gte } from "drizzle-orm";
import { logger } from "@/lib/services/logger";
import {
  AI_CLUSTER_WINDOW_MS,
  getAiClusteringConfig,
  groupArticlesWithAi,
} from "@/lib/utils/ai-clustering";

export {
  getAiClusteringConfig,
  isAiClusteringEnabled,
  validateAiGroups,
  groupArticlesWithAi,
  type AiClusteringConfig,
  type AiClusterCandidate,
  type ValidatedAiGroup,
} from "@/lib/utils/ai-clustering";

/**
 * Runs semantic story clustering across unread articles from the last 48 hours
 * and persists validated cluster IDs to SQLite. Safe no-op when unconfigured.
 */
export async function clusterRecentArticlesWithAi(): Promise<{
  enabled: boolean;
  evaluated: number;
  groupsCreated: number;
  itemsGrouped: number;
}> {
  const config = getAiClusteringConfig();
  if (!config) {
    return { enabled: false, evaluated: 0, groupsCreated: 0, itemsGrouped: 0 };
  }

  const cutoff = new Date(Date.now() - AI_CLUSTER_WINDOW_MS);
  const recentItems = db
    .select({
      id: feedItems.id,
      feedId: feedItems.feedId,
      feedTitle: feeds.title,
      feedEditorialType: feeds.editorialType,
      title: feedItems.title,
      snippet: feedItems.snippet,
      publishedAt: feedItems.publishedAt,
      createdAt: feedItems.createdAt,
      clusterId: feedItems.clusterId,
    })
    .from(feedItems)
    .leftJoin(feeds, eq(feedItems.feedId, feeds.id))
    .where(and(eq(feedItems.isRead, false), gte(feedItems.createdAt, cutoff)))
    .orderBy(desc(feedItems.publishedAt))
    .limit(80)
    .all();

  if (recentItems.length < 2) {
    return { enabled: true, evaluated: recentItems.length, groupsCreated: 0, itemsGrouped: 0 };
  }

  const groups = await groupArticlesWithAi(recentItems, {
    config,
    onWarn: (msg) => logger.warn("AiClustering", msg),
  });
  let itemsGrouped = 0;

  for (const group of groups) {
    const members = recentItems.filter((item) => group.memberIds.includes(item.id));
    const existingClusterId = members.find((m) => m.clusterId)?.clusterId;
    const clusterId = existingClusterId || `ai_${crypto.randomUUID().slice(0, 12)}`;

    for (const member of members) {
      if (member.clusterId !== clusterId) {
        db.update(feedItems).set({ clusterId }).where(eq(feedItems.id, member.id)).run();
      }
      itemsGrouped++;
    }
  }

  if (groups.length > 0) {
    logger.info(
      "AiClustering",
      `Grouped ${itemsGrouped} recent articles into ${groups.length} stories via ${config.model}`
    );
  }

  return {
    enabled: true,
    evaluated: recentItems.length,
    groupsCreated: groups.length,
    itemsGrouped,
  };
}
