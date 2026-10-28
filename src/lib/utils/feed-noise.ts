export interface FeedNoiseMetricsInput {
  totalArticles: number;
  recentArticles: number;
  readCount: number;
  engagedCount: number;
  flickedCount: number;
  starredCount: number;
  avgDwellSeconds: number;
  duplicateStoryCount: number;
  errorCount?: number;
  lastError?: string | null;
  lastPostAgoDays?: number;
}

export type FeedNoiseReasonKey =
  | "loud_exhaustion"
  | "pure_duplicate"
  | "skim_only"
  | "dormant_broken";

export interface FeedNoiseEvaluation {
  isRecommended: boolean;
  fatigueScore: number;
  reasonKey: FeedNoiseReasonKey | null;
  reasonLabel: string;
  reasonDescription: string;
}

/**
 * Pure heuristic evaluator for classifying a feed's noise / triage fatigue level.
 * Independent of database runtime, enabling deterministic, fast unit testing.
 */
export function evaluateFeedNoise(metrics: FeedNoiseMetricsInput): FeedNoiseEvaluation {
  const {
    totalArticles,
    recentArticles,
    readCount,
    engagedCount,
    flickedCount,
    starredCount,
    avgDwellSeconds,
    duplicateStoryCount,
    errorCount = 0,
    lastError,
    lastPostAgoDays = 0,
  } = metrics;

  // Strict Volume Floor: Feeds with < 15 articles in the 90-day window cannot cause
  // triage exhaustion (protects low-frequency gems, quarterly essays, and specialist blogs).
  if (recentArticles < 15 && errorCount < 10) {
    return {
      isRecommended: false,
      fatigueScore: 0,
      reasonKey: null,
      reasonLabel: "Healthy",
      reasonDescription: "Low publication volume preserves triage bandwidth.",
    };
  }

  // Rule 1: Loud Exhaustion (high 90-day volume, low engaged reading, 0 saved)
  const isHighVolume = recentArticles >= 25;
  const lowEngagedRate = totalArticles > 0 ? engagedCount / totalArticles : 0;
  const zeroOrNearZeroEngaged =
    engagedCount === 0 || (totalArticles >= 20 && lowEngagedRate <= 0.07);
  const zeroStarred = starredCount === 0;

  if (isHighVolume && zeroOrNearZeroEngaged && zeroStarred) {
    const volumeBonus = Math.min(Math.round(recentArticles * 0.5), 35);
    const fatigueScore = Math.min(100, 65 + volumeBonus);
    return {
      isRecommended: true,
      fatigueScore,
      reasonKey: "loud_exhaustion",
      reasonLabel: "Loud Exhaustion",
      reasonDescription: `${recentArticles} articles in 90 days with only ${engagedCount} engaged read${engagedCount !== 1 ? "s" : ""} (${(lowEngagedRate * 100).toFixed(1)}%) and 0 saves. High triage burden with minimal reading payoff.`,
    };
  }

  // Rule 2: Pure Duplicate Wire (heavy duplication overlap)
  if (
    duplicateStoryCount >= 5 &&
    duplicateStoryCount / Math.max(recentArticles, 5) >= 0.45 &&
    engagedCount <= 1
  ) {
    const fatigueScore = Math.min(95, 60 + duplicateStoryCount * 6);
    return {
      isRecommended: true,
      fatigueScore,
      reasonKey: "pure_duplicate",
      reasonLabel: "Redundant Wire",
      reasonDescription: `${duplicateStoryCount} stories duplicate coverage from other feeds where other sources were preferred.`,
    };
  }

  // Rule 3: Skim & Flick Only (consistent quick dismissals on active feeds)
  const readEngagementRate = readCount > 0 ? engagedCount / readCount : 0;
  if (
    recentArticles >= 20 &&
    readCount >= 15 &&
    avgDwellSeconds < 10 &&
    readEngagementRate <= 0.08 &&
    starredCount === 0
  ) {
    const fatigueScore = Math.min(85, 55 + Math.min(recentArticles / 4, 25));
    return {
      isRecommended: true,
      fatigueScore,
      reasonKey: "skim_only",
      reasonLabel: "Skim & Flick Only",
      reasonDescription: `Average reading dwell is only ${avgDwellSeconds}s across ${readCount} triaged items (${(readEngagementRate * 100).toFixed(1)}% engaged). Stories are flicked away without detailed reading.`,
    };
  }

  // Rule 4: Persistent Errors Only (exempts quiet healthy feeds)
  if (errorCount >= 10) {
    return {
      isRecommended: true,
      fatigueScore: 75,
      reasonKey: "dormant_broken",
      reasonLabel: "Failing Feed",
      reasonDescription: `Feed has encountered ${errorCount} consecutive fetch errors: ${lastError || "Persistent network failure"}.`,
    };
  }

  return {
    isRecommended: false,
    fatigueScore: 0,
    reasonKey: null,
    reasonLabel: "Healthy",
    reasonDescription: "Feed exhibits healthy engagement or balanced publication volume.",
  };
}
