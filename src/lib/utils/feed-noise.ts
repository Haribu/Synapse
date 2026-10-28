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

  // Rule 1: Loud Exhaustion (high volume, 0 or near 0 engaged reading)
  const isHighVolume = recentArticles >= 12 || totalArticles >= 20;
  const zeroOrNearZeroEngaged =
    engagedCount === 0 || (totalArticles >= 15 && engagedCount / totalArticles <= 0.04);
  const zeroStarred = starredCount === 0;

  if (isHighVolume && zeroOrNearZeroEngaged && zeroStarred) {
    const volumeBonus = Math.min(Math.round(recentArticles * 1.5), 35);
    const fatigueScore = Math.min(100, 65 + volumeBonus);
    return {
      isRecommended: true,
      fatigueScore,
      reasonKey: "loud_exhaustion",
      reasonLabel: "Loud Exhaustion",
      reasonDescription: `${recentArticles > 0 ? `${recentArticles} recent articles` : `${totalArticles} total articles`} with 0 engaged reads and 0 saves. High triage burden with no reading value.`,
    };
  }

  // Rule 2: Pure Duplicate Wire (heavy duplication overlap)
  if (
    duplicateStoryCount >= 4 &&
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

  // Rule 3: Skim & Flick Only (consistent quick dismissals)
  if (
    totalArticles >= 10 &&
    (flickedCount >= 6 || readCount >= 8) &&
    avgDwellSeconds < 12 &&
    engagedCount === 0 &&
    starredCount === 0
  ) {
    const fatigueScore = Math.min(85, 50 + flickedCount * 4);
    return {
      isRecommended: true,
      fatigueScore,
      reasonKey: "skim_only",
      reasonLabel: "Skim & Flick Only",
      reasonDescription: `Average reading dwell is only ${avgDwellSeconds}s. Articles are consistently flicked away without detailed reading.`,
    };
  }

  // Rule 4: Dormant / Broken
  if (
    errorCount >= 6 ||
    (lastPostAgoDays >= 90 && totalArticles >= 5 && engagedCount === 0)
  ) {
    const fatigueScore = Math.min(80, 45 + Math.min(lastPostAgoDays / 10, 30));
    return {
      isRecommended: true,
      fatigueScore,
      reasonKey: "dormant_broken",
      reasonLabel: "Dormant / Failing",
      reasonDescription:
        errorCount >= 6
          ? `Feed has encountered ${errorCount} consecutive fetch errors: ${lastError || "Network failure"}`
          : `Inactive for ${lastPostAgoDays} days with 0 active reading interest.`,
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
