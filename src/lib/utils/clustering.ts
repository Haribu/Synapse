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
  // Common tech, software, AI, policy, business, and conversational terms that cause false clusters
  "ai",
  "artificial",
  "intelligence",
  "model",
  "models",
  "llm",
  "llms",
  "gpt",
  "reasoning",
  "agent",
  "agents",
  "agentic",
  "guide",
  "overview",
  "introduction",
  "tutorial",
  "primer",
  "deep",
  "dive",
  "building",
  "build",
  "built",
  "design",
  "designing",
  "architecture",
  "future",
  "modern",
  "simple",
  "software",
  "engineering",
  "developer",
  "developers",
  "development",
  "program",
  "market",
  "markets",
  "business",
  "startups",
  "startup",
  "firm",
  "industry",
  "team",
  "teams",
  "leadership",
  "management",
  "culture",
  "database",
  "analytics",
  "metrics",
  "stats",
  "benchmark",
  "benchmarks",
  "performance",
  "scaling",
  "scale",
  "speed",
  "fast",
  "slow",
  "growth",
  "security",
  "privacy",
  "safety",
  "trust",
  "risk",
  "risks",
  "policy",
  "policies",
  "test",
  "testing",
  "eval",
  "evals",
  "evaluation",
  "evaluating",
  "network",
  "cloud",
  "api",
  "apis",
  "career",
  "think",
  "thinking",
  "thought",
  "lessons",
  "learned",
  "learnt",
  "things",
  "ways",
  "tips",
  "tricks",
  "rules",
  "problem",
  "problems",
  "solution",
  "solutions",
  "issue",
  "issues",
  "stop",
  "start",
  "make",
  "making",
  "better",
  "best",
  "good",
  "bad",
  "real",
  "true",
  "false",
  "national",
  "international",
  "country",
  "countries",
  "women",
  "people",
  "work",
  "working",
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

function stemWord(w: string): string {
  if (w.length < 5) return w;
  if (w.endsWith("ies") && w.length >= 6) return w.slice(0, -3) + "y";
  if (w.endsWith("ing") && w.length >= 6) return w.slice(0, -3);
  if (w.endsWith("ed") && w.length >= 5) return w.slice(0, -2);
  if (w.endsWith("ers") && w.length >= 6) return w.slice(0, -3);
  if (w.endsWith("er") && w.length >= 5) return w.slice(0, -2);
  if (w.endsWith("es") && w.length >= 5) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss") && w.length >= 4) return w.slice(0, -1);
  return w;
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
  const stemmedTitleKeywords = new Set(titleWords.map(stemWord));

  // 3. Lead content tokens for cross-verification
  const contentText = (snippet + " " + content).toLowerCase().replace(/[^a-z0-9\s-]/g, " ");

  const rawContentTokens = contentText
    .split(/\s+/)
    .map((w: string) => w.trim())
    .filter((w: string) => w.length >= 4 && !STOP_WORDS.has(w) && !DOMAIN_STOP_WORDS.has(w));

  const contentTokens = new Set(rawContentTokens);
  const stemmedContentTokens = new Set(rawContentTokens.map(stemWord));

  // Check if title is a periodic digest (e.g. "Wednesday assorted links", "Security roundup #42")
  const isDigest =
    /(?:assorted\s+links|weekly\s+roundup|daily\s+brief|security\s+roundup|links\s+for\s+\w+)/i.test(
      title
    );

  return {
    cves,
    titleKeywords,
    stemmedTitleKeywords,
    contentTokens,
    stemmedContentTokens,
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

  // Articles from the same feed are distinct posts/issues, never syndication duplicates
  if (itemA.feedId && itemB.feedId && itemA.feedId === itemB.feedId) {
    return false;
  }

  // Strict temporal check: both articles must have a valid publication/creation timestamp within 48 hours
  const dateA = parseTimestampMs(itemA.publishedAt || itemA.createdAt);
  const dateB = parseTimestampMs(itemB.publishedAt || itemB.createdAt);
  if (!dateA || !dateB) {
    return false; // Without verifiable timestamps, never cluster (prevents cross-epoch false groupings)
  }
  const diffHours = Math.abs(dateA - dateB) / (1000 * 60 * 60);
  if (diffHours > 48) {
    return false;
  }

  // 1. Definite technical identifier match (CVEs)
  if (featA.cves.size > 0 && featB.cves.size > 0) {
    for (const cve of featA.cves) {
      if (featB.cves.has(cve)) {
        return true;
      }
    }
  }

  // 2. High-value Title Keyword Overlap (using stemmed matching)
  const sharedTitleWords: string[] = [];
  for (const word of featA.titleKeywords) {
    if (featB.titleKeywords.has(word) || featB.stemmedTitleKeywords.has(stemWord(word))) {
      sharedTitleWords.push(word);
    }
  }

  // Count shared words that also appear in full article content
  let sharedContentWords = 0;
  for (const word of sharedTitleWords) {
    const stemmed = stemWord(word);
    if (
      (featA.contentTokens.has(word) || featA.stemmedContentTokens.has(stemmed)) &&
      (featB.contentTokens.has(word) || featB.stemmedContentTokens.has(stemmed))
    ) {
      sharedContentWords++;
    }
  }

  // Count general content overlap of distinctive non-stop words
  let sharedGeneralContent = 0;
  for (const token of featA.stemmedContentTokens) {
    if (featB.stemmedContentTokens.has(token)) {
      sharedGeneralContent++;
    }
  }

  // High-confidence multi-keyword cluster:
  // Requires at least 2 shared distinctive title keywords, verified in content, with shared content confirmation (>= 3 shared tokens)
  if (sharedTitleWords.length >= 2 && sharedContentWords >= 2 && sharedGeneralContent >= 3) {
    return true;
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
