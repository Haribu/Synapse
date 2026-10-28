import { describe, it, expect } from "bun:test";
import { evaluateFeedNoise } from "./feed-noise";

describe("Feed Noise & Low-Signal Heuristic Evaluator", () => {
  it("flags loud exhaustion feeds with high volume and zero engaged reading", () => {
    const result = evaluateFeedNoise({
      totalArticles: 40,
      recentArticles: 25,
      readCount: 22,
      engagedCount: 0,
      flickedCount: 18,
      starredCount: 0,
      avgDwellSeconds: 6,
      duplicateStoryCount: 0,
    });

    expect(result.isRecommended).toBe(true);
    expect(result.reasonKey).toBe("loud_exhaustion");
    expect(result.reasonLabel).toBe("Loud Exhaustion");
    expect(result.fatigueScore).toBeGreaterThanOrEqual(70);
    expect(result.reasonDescription).toContain("25 recent articles");
  });

  it("flags feeds with heavy duplication overlap against existing feeds", () => {
    const result = evaluateFeedNoise({
      totalArticles: 15,
      recentArticles: 10,
      readCount: 5,
      engagedCount: 0,
      flickedCount: 4,
      starredCount: 0,
      avgDwellSeconds: 8,
      duplicateStoryCount: 6, // 60% duplicate rate
    });

    expect(result.isRecommended).toBe(true);
    expect(result.reasonKey).toBe("pure_duplicate");
    expect(result.reasonLabel).toBe("Redundant Wire");
    expect(result.fatigueScore).toBeGreaterThanOrEqual(60);
    expect(result.reasonDescription).toContain("6 stories duplicate coverage");
  });

  it("flags feeds with consistent skim-and-flick patterns without engagement", () => {
    const result = evaluateFeedNoise({
      totalArticles: 14,
      recentArticles: 6,
      readCount: 10,
      engagedCount: 0,
      flickedCount: 9,
      starredCount: 0,
      avgDwellSeconds: 7,
      duplicateStoryCount: 1,
    });

    expect(result.isRecommended).toBe(true);
    expect(result.reasonKey).toBe("skim_only");
    expect(result.reasonLabel).toBe("Skim & Flick Only");
    expect(result.fatigueScore).toBeGreaterThanOrEqual(50);
  });

  it("flags dormant feeds with high consecutive errors or long periods of inactivity", () => {
    const result = evaluateFeedNoise({
      totalArticles: 8,
      recentArticles: 0,
      readCount: 2,
      engagedCount: 0,
      flickedCount: 1,
      starredCount: 0,
      avgDwellSeconds: 5,
      duplicateStoryCount: 0,
      errorCount: 8,
      lastError: "HTTP 502 Bad Gateway",
      lastPostAgoDays: 120,
    });

    expect(result.isRecommended).toBe(true);
    expect(result.reasonKey).toBe("dormant_broken");
    expect(result.reasonLabel).toBe("Dormant / Failing");
    expect(result.fatigueScore).toBeGreaterThanOrEqual(50);
  });

  it("does NOT flag high-signal low-frequency feeds (the specialist blog)", () => {
    const result = evaluateFeedNoise({
      totalArticles: 4,
      recentArticles: 2,
      readCount: 2,
      engagedCount: 2,
      flickedCount: 0,
      starredCount: 1,
      avgDwellSeconds: 180,
      duplicateStoryCount: 0,
      lastPostAgoDays: 20,
    });

    expect(result.isRecommended).toBe(false);
    expect(result.reasonKey).toBeNull();
    expect(result.fatigueScore).toBe(0);
    expect(result.reasonLabel).toBe("Healthy");
  });

  it("does NOT flag high-volume feeds if they maintain healthy engaged readership", () => {
    const result = evaluateFeedNoise({
      totalArticles: 50,
      recentArticles: 30,
      readCount: 25,
      engagedCount: 8,
      flickedCount: 5,
      starredCount: 4,
      avgDwellSeconds: 95,
      duplicateStoryCount: 2,
      lastPostAgoDays: 1,
    });

    expect(result.isRecommended).toBe(false);
    expect(result.reasonKey).toBeNull();
  });
});
