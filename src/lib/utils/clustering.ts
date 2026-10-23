/**
 * Deterministic multi-signal clustering engine for grouping related news stories
 * covering the same breaking event across multiple feeds (zero token spend).
 *
 * Combines title entity extraction, technical identifier tracking (CVEs),
 * domain-specific stop word filtering, and full article/snippet content
 * cross-verification to prevent false positives while capturing multi-source coverage.
 */

const STOP_WORDS = new Set([
  "a",
  "about",
  "above",
  "after",
  "again",
  "against",
  "all",
  "am",
  "an",
  "and",
  "any",
  "are",
  "aren't",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "by",
  "can't",
  "cannot",
  "could",
  "couldn't",
  "did",
  "didn't",
  "do",
  "does",
  "doesn't",
  "doing",
  "don't",
  "down",
  "during",
  "each",
  "few",
  "for",
  "from",
  "further",
  "had",
  "hadn't",
  "has",
  "hasn't",
  "have",
  "haven't",
  "having",
  "he",
  "her",
  "here",
  "hers",
  "herself",
  "him",
  "himself",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "isn't",
  "it",
  "it's",
  "its",
  "itself",
  "let's",
  "me",
  "more",
  "most",
  "mustn't",
  "my",
  "myself",
  "no",
  "nor",
  "not",
  "of",
  "off",
  "on",
  "once",
  "only",
  "or",
  "other",
  "ought",
  "our",
  "ours",
  "ourselves",
  "out",
  "over",
  "own",
  "same",
  "shan't",
  "she",
  "should",
  "shouldn't",
  "so",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "theirs",
  "them",
  "themselves",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "too",
  "under",
  "until",
  "up",
  "very",
  "was",
  "wasn't",
  "we",
  "were",
  "weren't",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "whom",
  "why",
  "with",
  "won't",
  "would",
  "wouldn't",
  "you",
  "your",
  "yours",
  "yourself",
  "yourselves",
  "new",
  "update",
  "claims",
  "says",
  "report",
  "reports",
  "how",
]);

// Generic domain stop words that should NOT count towards breaking-news clustering by themselves
const DOMAIN_STOP_WORDS = new Set([
  "attack",
  "attacks",
  "attacker",
  "attackers",
  "breach",
  "breaches",
  "hack",
  "hacked",
  "hackers",
  "hacking",
  "flaw",
  "flaws",
  "bug",
  "bugs",
  "critical",
  "severity",
  "security",
  "cyber",
  "cybersecurity",
  "data",
  "leak",
  "leaks",
  "stolen",
  "steal",
  "stealing",
  "malware",
  "ransomware",
  "phishing",
  "patch",
  "patches",
  "patched",
  "update",
  "updates",
  "updated",
  "fix",
  "fixes",
  "fixed",
  "vulnerability",
  "vulnerabilities",
  "zero-day",
  "0-day",
  "exploit",
  "exploits",
  "exploited",
  "target",
  "targets",
  "targeted",
  "threat",
  "actor",
  "actors",
  "campaign",
  "tool",
  "tools",
  "government",
  "govt",
  "officials",
  "federal",
  "state",
  "states",
  "users",
  "people",
  "device",
  "devices",
  "system",
  "systems",
  "server",
  "servers",
  "cloud",
  "service",
  "services",
  "app",
  "apps",
  "platform",
  "company",
  "firm",
  "exposed",
  "online",
  "web",
  "internet",
  "code",
  "release",
  "releases",
  "released",
  "disrupts",
  "disrupted",
  "disrupting",
  "disrupt",
  "used",
  "using",
  "uses",
  "use",
  "assorted",
  "links",
  "roundup",
  "weekly",
  "daily",
  "thursday",
  "wednesday",
  "friday",
  "tuesday",
  "monday",
  "weekend",
  "morning",
  "evening",
  "edition",
  "briefing",
  "bulletin",
  "newsletter",
  "post",
  "posts",
  "article",
  "articles",
  "story",
  "stories",
  "read",
  "reading",
  "review",
  "part",
  "year",
  "years",
  "month",
  "months",
  "week",
  "weeks",
  "today",
  "yesterday",
  "world",
  "worldwide",
  "global",
  "across",
  "amid",
  "could",
  "million",
  "billion",
  "first",
  "second",
  "third",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "prison",
  "jail",
  "jailed",
  "sentence",
  "sentenced",
  "court",
  "judge",
  "arrest",
  "arrested",
  "charged",
  "charges",
  "pleads",
  "guilty",
  "meetup",
  "conference",
  "event",
  "summit",
  "gathering",
  "episode",
  "season",
]);

/**
 * Normalizes different timestamp representations (seconds, milliseconds, ISO string).
 */
export function parseTimestampMs(val: any): number {
  if (!val) return 0;
  if (typeof val === "number") {
    return val < 100_000_000_000 ? val * 1000 : val;
  }
  const num = Number(val);
  if (!isNaN(num) && num > 0) {
    return num < 100_000_000_000 ? num * 1000 : num;
  }
  const d = new Date(val).getTime();
  return isNaN(d) ? 0 : d;
}

/**
 * Extracts distinct entities and strong topical keywords from an article.
 */
export function extractArticleFeatures(item: {
  title?: string;
  snippet?: string | null;
  fullContentMarkdown?: string | null;
  fullContentHtml?: string | null;
}) {
  const title = item.title || "";
  const snippet = item.snippet || "";
  const content = (item.fullContentMarkdown || item.fullContentHtml || "").slice(0, 3000);

  // 1. High-confidence technical identifiers (CVEs)
  const cveMatches = (title + " " + snippet).match(/cve-\d{4}-\d{4,7}/gi) || [];
  const cves = new Set(cveMatches.map((c) => c.toLowerCase()));

  // 2. Title keywords (pure content, non-generic)
  const titleWords = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((w: string) => w.trim())
    .filter((w: string) => w.length >= 3 && !STOP_WORDS.has(w) && !DOMAIN_STOP_WORDS.has(w));

  const titleKeywords = new Set(titleWords);

  // 3. Lead content tokens for cross-verification
  const contentText = (snippet + " " + content).toLowerCase().replace(/[^a-z0-9\s-]/g, " ");

  const contentTokens = new Set(
    contentText
      .split(/\s+/)
      .map((w: string) => w.trim())
      .filter((w: string) => w.length >= 4 && !STOP_WORDS.has(w) && !DOMAIN_STOP_WORDS.has(w))
  );

  // Check if title is a periodic digest (e.g. "Wednesday assorted links", "Security roundup #42")
  const isDigest =
    /(?:assorted\s+links|weekly\s+roundup|daily\s+brief|security\s+roundup|links\s+for\s+\w+)/i.test(
      title
    );

  return {
    cves,
    titleKeywords,
    contentTokens,
    isDigest,
  };
}

/**
 * Evaluates whether two articles cover the same specific breaking story.
 */
export function areArticlesRelated(
  itemA: any,
  featA: ReturnType<typeof extractArticleFeatures>,
  itemB: any,
  featB: ReturnType<typeof extractArticleFeatures>
): boolean {
  // Never group periodic digest posts with each other (e.g. Wednesday links vs Thursday links)
  if (featA.isDigest || featB.isDigest) {
    return false;
  }

  // Temporal check: must be published within 72 hours
  const dateA = parseTimestampMs(itemA.publishedAt);
  const dateB = parseTimestampMs(itemB.publishedAt);
  if (dateA > 0 && dateB > 0) {
    const diffHours = Math.abs(dateA - dateB) / (1000 * 60 * 60);
    if (diffHours > 72) return false;
  }

  // 1. Definite CVE match
  if (featA.cves.size > 0 && featB.cves.size > 0) {
    for (const cve of featA.cves) {
      if (featB.cves.has(cve)) {
        return true;
      }
    }
  }

  // 2. High-value Title Keyword Overlap
  const sharedTitleWords: string[] = [];
  for (const word of featA.titleKeywords) {
    if (featB.titleKeywords.has(word)) {
      sharedTitleWords.push(word);
    }
  }

  // If they share at least 2 strong, non-generic title keywords
  if (sharedTitleWords.length >= 2) {
    // Cross-verify with full article content
    let sharedContentWords = 0;
    for (const word of sharedTitleWords) {
      if (featA.contentTokens.has(word) && featB.contentTokens.has(word)) {
        sharedContentWords++;
      }
    }
    // Check general content overlap
    let sharedGeneralContent = 0;
    for (const token of featA.contentTokens) {
      if (featB.contentTokens.has(token)) {
        sharedGeneralContent++;
      }
    }

    if (sharedContentWords >= 2 || sharedGeneralContent >= 4) {
      return true;
    }
  }

  // 3. Single strong entity keyword + deep content confirmation
  // e.g. "Tensorlake" or "FortiBleed" or "PoeLLM" in title + 5+ shared rare tokens in lead content
  if (sharedTitleWords.length === 1) {
    const key = sharedTitleWords[0];
    if (key.length >= 6) {
      let sharedGeneralContent = 0;
      for (const token of featA.contentTokens) {
        if (featB.contentTokens.has(token)) {
          sharedGeneralContent++;
        }
      }
      if (sharedGeneralContent >= 5) {
        return true;
      }
    }
  }

  return false;
}

export interface ClusteredItem<T = any> {
  primary: T;
  relatedStories: T[];
}

/**
 * Authority score to select the primary article when multiple sources cover the same story.
 */
function getAuthorityScore(item: any): number {
  const edType = item.feedEditorialType || "independent";
  let score = 0;
  if (edType === "official") score += 50;
  else if (edType === "community") score += 40;
  else if (edType === "independent") score += 30;
  else if (edType === "news") score += 20;
  else if (edType === "vendor") score += 10;

  // Bonus for longer full content / snippet
  const len = (item.fullContentHtml || item.fullContentMarkdown || item.snippet || "").length;
  score += Math.min(len / 100, 20);

  return score;
}

/**
 * Groups an array of articles into clustered primary articles with attached related stories.
 * Evaluates titles, technical entities (CVEs), domain stop words, and full content tokens.
 */
export function clusterRelatedArticles<
  T extends {
    id: string;
    title: string;
    snippet?: string | null;
    fullContentMarkdown?: string | null;
    fullContentHtml?: string | null;
    publishedAt?: string | number | null;
    feedEditorialType?: string | null;
  },
>(items: T[]): ClusteredItem<T>[] {
  if (!items || items.length === 0) return [];

  const clusters: { primary: T; related: T[] }[] = [];
  const assigned = new Set<string>();
  const featuresMap = new Map<string, ReturnType<typeof extractArticleFeatures>>();

  for (const item of items) {
    featuresMap.set(item.id, extractArticleFeatures(item));
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (assigned.has(item.id)) continue;

    const featA = featuresMap.get(item.id)!;
    const currentGroup: T[] = [item];
    assigned.add(item.id);

    for (let j = i + 1; j < items.length; j++) {
      const candidate = items[j];
      if (assigned.has(candidate.id)) continue;

      const featB = featuresMap.get(candidate.id)!;
      if (areArticlesRelated(item, featA, candidate, featB)) {
        currentGroup.push(candidate);
        assigned.add(candidate.id);
      }
    }

    if (currentGroup.length > 1) {
      // Pick best authority / longest article as primary
      currentGroup.sort((a, b) => getAuthorityScore(b) - getAuthorityScore(a));
      const [primary, ...related] = currentGroup;
      clusters.push({ primary, related });
    } else {
      clusters.push({ primary: item, related: [] });
    }
  }

  return clusters.map((c) => ({
    primary: c.primary,
    relatedStories: c.related,
  }));
}
