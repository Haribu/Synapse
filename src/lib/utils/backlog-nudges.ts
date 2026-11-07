export interface BacklogCandidate {
  id: string;
  title: string;
  url: string;
  author?: string | null;
  snippet?: string | null;
  fullContentHtml?: string | null;
  fullContentMarkdown?: string | null;
  isFullFetched?: boolean | null;
  mediaType?: "article" | "video" | "podcast" | string | null;
  videoId?: string | null;
  thumbnailUrl?: string | null;
  isRead?: boolean | null;
  isStarred?: boolean | null;
  isWork?: boolean | null;
  publishedAt?: string | number | Date | null;
  createdAt?: string | number | Date | null;
  feedId?: string | null;
  feedTitle?: string | null;
  feedCategory?: string | null;
  feedEditorialType?: string | null;
  sourceQueue?: "read_later" | "research_inbox" | "watch_later";
}

export interface WipCapacityStatus {
  count: number;
  cap: number;
  isAtOrOverCap: boolean;
  isNearCap: boolean;
  fillRatio: number;
}

export const DEFAULT_READ_LATER_CAP = 15;
export const DEFAULT_RESEARCH_CAP = 10;
export const DEFAULT_STALE_DAYS = 14;
export const DEFAULT_SPOTLIGHT_MIN_AGE_DAYS = 3;

/**
 * Normalizes a date/timestamp (Unix seconds, epoch ms, ISO string, or Date) into epoch milliseconds.
 */
export function toEpochMs(value?: string | number | Date | null): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === "number") {
    if (value <= 0) return null;
    // Values under 10 billion are Unix seconds
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const num = parseInt(trimmed, 10);
      return num < 10_000_000_000 ? num * 1000 : num;
    }
    const parsed = new Date(trimmed).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Computes the age in whole days of an item relative to `nowMs`.
 * Prefers `createdAt` (when saved to Synapse/Research Inbox) if available for Research items,
 * or `publishedAt` / `createdAt` fallback.
 */
export function getItemAgeDays(
  item: Pick<BacklogCandidate, "publishedAt" | "createdAt">,
  nowMs: number = Date.now()
): number {
  const refMs = toEpochMs(item.publishedAt) ?? toEpochMs(item.createdAt);
  if (!refMs || refMs > nowMs) return 0;
  const diffMs = nowMs - refMs;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Determines whether a saved backlog item has crossed the half-life decay threshold (default 14 days).
 */
export function isItemStale(
  item: Pick<BacklogCandidate, "publishedAt" | "createdAt">,
  staleDaysThreshold: number = DEFAULT_STALE_DAYS,
  nowMs: number = Date.now()
): boolean {
  const threshold = Math.max(1, staleDaysThreshold);
  return getItemAgeDays(item, nowMs) >= threshold;
}

/**
 * Estimates reading time in minutes from HTML, Markdown, or snippet text (~230 WPM).
 */
export function estimateItemReadingMinutes(
  item: Pick<BacklogCandidate, "fullContentHtml" | "fullContentMarkdown" | "snippet">,
  wpm: number = 230
): number {
  const rawText =
    item.fullContentMarkdown ||
    (item.fullContentHtml ? item.fullContentHtml.replace(/<[^>]+>/g, " ") : "") ||
    item.snippet ||
    "";
  const words = rawText
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  if (words === 0) return 3; // sensible default for unhydrated link
  const safeWpm = Math.max(80, wpm);
  return Math.max(1, Math.round(words / safeWpm));
}

/**
 * Evaluates a backlog queue's current item count against the user's WIP cap.
 */
export function evaluateWipCapacity(count: number, cap: number): WipCapacityStatus {
  const safeCount = Math.max(0, count);
  const safeCap = Math.max(1, cap);
  const fillRatio = safeCount / safeCap;
  return {
    count: safeCount,
    cap: safeCap,
    isAtOrOverCap: safeCount >= safeCap,
    isNearCap: safeCount < safeCap && fillRatio >= 0.8,
    fillRatio,
  };
}

/**
 * Picks the best candidate for the "Triage Zero" Deep Read Pivot Card.
 * Prioritizes Research Inbox items and older saved items so the oldest intentional saves surface first.
 */
export function selectTriageZeroPivotItem(
  candidates: BacklogCandidate[],
  nowMs: number = Date.now()
): (BacklogCandidate & { ageDays: number; readingMinutes: number }) | null {
  if (!candidates || candidates.length === 0) return null;

  const enriched = candidates.map((c) => ({
    ...c,
    ageDays: getItemAgeDays(c, nowMs),
    readingMinutes: estimateItemReadingMinutes(c),
  }));

  // Sort oldest first (highest ageDays), tie-breaking by Research Inbox priority then id
  enriched.sort((a, b) => {
    if (b.ageDays !== a.ageDays) return b.ageDays - a.ageDays;
    const aIsResearch = a.sourceQueue === "research_inbox" ? 1 : 0;
    const bIsResearch = b.sourceQueue === "research_inbox" ? 1 : 0;
    if (bIsResearch !== aIsResearch) return bIsResearch - aIsResearch;
    return a.id.localeCompare(b.id);
  });

  return enriched[0] || null;
}

/**
 * Selects a single aged item (>= minAgeDays old) from the saved backlog to pin at the top of Triage
 * ("Interleaved Serendipity"). Deterministic per calendar day (`YYYY-MM-DD`) so it doesn't flicker on refresh.
 */
export function selectDailyVaultSpotlight(
  candidates: BacklogCandidate[],
  options: {
    minAgeDays?: number;
    nowMs?: number;
    dateKey?: string;
    dismissedItemIds?: string[];
  } = {}
): (BacklogCandidate & { ageDays: number; readingMinutes: number }) | null {
  if (!candidates || candidates.length === 0) return null;

  const minAgeDays = options.minAgeDays ?? DEFAULT_SPOTLIGHT_MIN_AGE_DAYS;
  const nowMs = options.nowMs ?? Date.now();
  const dismissedSet = new Set(options.dismissedItemIds || []);

  const eligible = candidates
    .filter((c) => !dismissedSet.has(c.id))
    .map((c) => ({
      ...c,
      ageDays: getItemAgeDays(c, nowMs),
      readingMinutes: estimateItemReadingMinutes(c),
    }))
    .filter((c) => c.ageDays >= minAgeDays)
    .sort((a, b) => {
      if (b.ageDays !== a.ageDays) return b.ageDays - a.ageDays;
      return a.id.localeCompare(b.id);
    });

  if (eligible.length === 0) return null;

  const dateKey = options.dateKey || new Date(nowMs).toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  }

  // Pick deterministically among the top 3 oldest items so variety exists across days
  const poolSize = Math.min(3, eligible.length);
  const chosenIndex = hash % poolSize;
  return eligible[chosenIndex];
}

/**
 * Filters a list of saved items down to those that have crossed the staleness threshold (e.g. >= 14 days).
 */
export function getStaleBacklogItems<T extends Pick<BacklogCandidate, "id" | "publishedAt" | "createdAt">>(
  items: T[],
  staleDaysThreshold: number = DEFAULT_STALE_DAYS,
  nowMs: number = Date.now()
): T[] {
  return items.filter((item) => isItemStale(item, staleDaysThreshold, nowMs));
}
