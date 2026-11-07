import { describe, expect, test } from "bun:test";
import {
  getItemAgeDays,
  isItemStale,
  estimateItemReadingMinutes,
  evaluateWipCapacity,
  selectTriageZeroPivotItem,
  selectDailyVaultSpotlight,
  getStaleBacklogItems,
  BacklogCandidate,
} from "./backlog-nudges";

const NOW_MS = new Date("2026-11-07T12:00:00Z").getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

describe("backlog-nudges utilities", () => {
  test("getItemAgeDays handles ISO strings, Unix seconds, and epoch milliseconds", () => {
    const fiveDaysAgoIso = new Date(NOW_MS - 5 * DAY_MS).toISOString();
    expect(getItemAgeDays({ publishedAt: fiveDaysAgoIso }, NOW_MS)).toBe(5);

    const tenDaysAgoSeconds = Math.floor((NOW_MS - 10 * DAY_MS) / 1000);
    expect(getItemAgeDays({ createdAt: tenDaysAgoSeconds }, NOW_MS)).toBe(10);

    const twoDaysAgoMs = NOW_MS - 2 * DAY_MS;
    expect(getItemAgeDays({ publishedAt: twoDaysAgoMs }, NOW_MS)).toBe(2);

    // Future timestamps clamp to 0
    expect(getItemAgeDays({ publishedAt: NOW_MS + DAY_MS }, NOW_MS)).toBe(0);
  });

  test("isItemStale identifies items older than or equal to the 14-day half-life threshold", () => {
    const freshItem = { publishedAt: new Date(NOW_MS - 7 * DAY_MS).toISOString() };
    const boundaryItem = { publishedAt: new Date(NOW_MS - 14 * DAY_MS).toISOString() };
    const ancientItem = { publishedAt: new Date(NOW_MS - 25 * DAY_MS).toISOString() };

    expect(isItemStale(freshItem, 14, NOW_MS)).toBe(false);
    expect(isItemStale(boundaryItem, 14, NOW_MS)).toBe(true);
    expect(isItemStale(ancientItem, 14, NOW_MS)).toBe(true);
  });

  test("estimateItemReadingMinutes calculates read duration from HTML, Markdown, or snippet", () => {
    const words460 = Array.from({ length: 460 }, () => "synapse").join(" ");
    expect(estimateItemReadingMinutes({ fullContentMarkdown: words460 }, 230)).toBe(2);

    const html690 = `<article><p>${Array.from({ length: 690 }, () => "word").join(" ")}</p></article>`;
    expect(estimateItemReadingMinutes({ fullContentHtml: html690 }, 230)).toBe(3);

    // Empty unhydrated item defaults to 3 min
    expect(estimateItemReadingMinutes({})).toBe(3);
  });

  test("evaluateWipCapacity computes cap status and near-cap warning accurately", () => {
    const under = evaluateWipCapacity(5, 15);
    expect(under.isAtOrOverCap).toBe(false);
    expect(under.isNearCap).toBe(false);

    const near = evaluateWipCapacity(13, 15);
    expect(near.isAtOrOverCap).toBe(false);
    expect(near.isNearCap).toBe(true);

    const full = evaluateWipCapacity(15, 15);
    expect(full.isAtOrOverCap).toBe(true);
    expect(full.isNearCap).toBe(false);
  });

  test("selectTriageZeroPivotItem surfaces the oldest intentional save first", () => {
    const items: BacklogCandidate[] = [
      {
        id: "recent-star",
        title: "Recent Starred Article",
        url: "https://example.com/1",
        publishedAt: new Date(NOW_MS - 2 * DAY_MS).toISOString(),
        sourceQueue: "read_later",
      },
      {
        id: "old-research",
        title: "Deep Research Paper",
        url: "https://example.com/2",
        publishedAt: new Date(NOW_MS - 9 * DAY_MS).toISOString(),
        sourceQueue: "research_inbox",
      },
      {
        id: "mid-star",
        title: "Mid Starred Article",
        url: "https://example.com/3",
        publishedAt: new Date(NOW_MS - 5 * DAY_MS).toISOString(),
        sourceQueue: "read_later",
      },
    ];

    const pivot = selectTriageZeroPivotItem(items, NOW_MS);
    expect(pivot).not.toBeNull();
    expect(pivot?.id).toBe("old-research");
    expect(pivot?.ageDays).toBe(9);
  });

  test("selectDailyVaultSpotlight filters by minAgeDays and respects dismissedItemIds", () => {
    const items: BacklogCandidate[] = [
      {
        id: "fresh-1",
        title: "Saved Today",
        url: "https://example.com/fresh",
        publishedAt: new Date(NOW_MS - 1 * DAY_MS).toISOString(),
        sourceQueue: "read_later",
      },
      {
        id: "aged-1",
        title: "Saved 6 Days Ago",
        url: "https://example.com/aged-1",
        publishedAt: new Date(NOW_MS - 6 * DAY_MS).toISOString(),
        sourceQueue: "research_inbox",
      },
    ];

    const spotlight = selectDailyVaultSpotlight(items, {
      minAgeDays: 3,
      nowMs: NOW_MS,
      dateKey: "2026-11-07",
    });
    expect(spotlight?.id).toBe("aged-1");

    // When dismissed, returns null since fresh-1 is < 3 days old
    const afterDismiss = selectDailyVaultSpotlight(items, {
      minAgeDays: 3,
      nowMs: NOW_MS,
      dateKey: "2026-11-07",
      dismissedItemIds: ["aged-1"],
    });
    expect(afterDismiss).toBeNull();
  });

  test("getStaleBacklogItems returns only items meeting or exceeding stale threshold", () => {
    const list = [
      { id: "1", publishedAt: new Date(NOW_MS - 4 * DAY_MS).toISOString() },
      { id: "2", publishedAt: new Date(NOW_MS - 14 * DAY_MS).toISOString() },
      { id: "3", publishedAt: new Date(NOW_MS - 30 * DAY_MS).toISOString() },
    ];
    const stale = getStaleBacklogItems(list, 14, NOW_MS);
    expect(stale.map((i) => i.id)).toEqual(["2", "3"]);
  });
});
