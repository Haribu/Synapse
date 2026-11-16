import {
  extractArticleFeatures,
  getAuthorityScore,
  parseTimestampMs,
} from "@/lib/utils/clustering";

export interface AiClusteringConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AiClusterCandidate {
  id: string;
  feedId?: string | null;
  feedTitle?: string | null;
  feedEditorialType?: string | null;
  title: string;
  snippet?: string | null;
  publishedAt?: Date | string | number | null;
  createdAt?: Date | string | number | null;
  clusterId?: string | null;
}

export interface ValidatedAiGroup {
  primaryId: string;
  memberIds: string[];
  reason?: string;
}

const DEFAULT_GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
export const AI_CLUSTER_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Resolves optional AI clustering configuration from environment variables.
 * Returns null when unconfigured or explicitly disabled so generic installs
 * incur zero network calls and fall back to deterministic clustering.
 */
export function getAiClusteringConfig(
  env: Record<string, string | undefined> = process.env
): AiClusteringConfig | null {
  const flag = (env.SYNAPSE_AI_ENABLED || "").trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") {
    return null;
  }

  const apiKey = (env.SYNAPSE_AI_API_KEY || "").trim();
  const baseUrl = (env.SYNAPSE_AI_BASE_URL || "").trim();
  const model = (env.SYNAPSE_AI_MODEL || "").trim();

  if (!apiKey && !baseUrl) {
    return null;
  }

  return {
    baseUrl: (baseUrl || DEFAULT_GEMINI_OPENAI_BASE_URL).replace(/\/+$/, ""),
    apiKey,
    model: model || (apiKey ? DEFAULT_GEMINI_MODEL : "llama3.2"),
  };
}

export function isAiClusteringEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return getAiClusteringConfig(env) !== null;
}

/**
 * Applies deterministic safety guardrails to raw LLM-proposed groups:
 * - Unknown IDs, digests, and duplicate assignments are dropped
 * - Same-feed items are never grouped together
 * - All members must fall within 48 hours of the primary item
 * - Primary is selected by editorial authority score
 */
export function validateAiGroups(
  candidates: AiClusterCandidate[],
  rawGroups: Array<{ ids?: unknown; reason?: unknown }>
): ValidatedAiGroup[] {
  const byId = new Map<string, AiClusterCandidate>();
  const digestIds = new Set<string>();

  for (const item of candidates) {
    byId.set(item.id, item);
    if (extractArticleFeatures(item).isDigest) {
      digestIds.add(item.id);
    }
  }

  const assigned = new Set<string>();
  const validated: ValidatedAiGroup[] = [];

  for (const raw of rawGroups) {
    if (!Array.isArray(raw?.ids)) continue;

    const uniqueItems: AiClusterCandidate[] = [];
    for (const id of raw.ids) {
      if (typeof id !== "string") continue;
      if (assigned.has(id) || digestIds.has(id)) continue;
      const item = byId.get(id);
      if (!item) continue;
      const ts = parseTimestampMs(item.publishedAt || item.createdAt);
      if (!ts) continue;
      uniqueItems.push(item);
    }

    if (uniqueItems.length < 2) continue;

    // Sort highest editorial authority first so primary selection is deterministic
    uniqueItems.sort((a, b) => getAuthorityScore(b) - getAuthorityScore(a));

    const primary = uniqueItems[0];
    const primaryTs = parseTimestampMs(primary.publishedAt || primary.createdAt);
    const seenFeeds = new Set<string>();
    if (primary.feedId) seenFeeds.add(primary.feedId);

    const accepted: AiClusterCandidate[] = [primary];
    for (let i = 1; i < uniqueItems.length; i++) {
      const candidate = uniqueItems[i];
      if (candidate.feedId && seenFeeds.has(candidate.feedId)) {
        continue;
      }
      const candidateTs = parseTimestampMs(candidate.publishedAt || candidate.createdAt);
      if (Math.abs(primaryTs - candidateTs) > AI_CLUSTER_WINDOW_MS) {
        continue;
      }
      if (candidate.feedId) seenFeeds.add(candidate.feedId);
      accepted.push(candidate);
    }

    if (accepted.length >= 2) {
      for (const item of accepted) {
        assigned.add(item.id);
      }
      validated.push({
        primaryId: primary.id,
        memberIds: accepted.map((a) => a.id),
        reason: typeof raw.reason === "string" ? raw.reason.slice(0, 140) : undefined,
      });
    }
  }

  return validated;
}

const SYSTEM_PROMPT = `You are a strict news-story deduplication engine for an RSS reader.
Group articles ONLY when they report on the EXACT SAME specific news event, product launch, vulnerability/CVE, security breach, outage, acquisition, legal ruling, or research paper release.

STRICT RULES:
1. NEVER group articles just because they share a broad theme or entity (e.g. two different articles about "AI agents", "OpenAI", "Linux", or "cybersecurity" are NOT a group unless they cover the same specific event).
2. NEVER group two articles from the same feedId.
3. NEVER group weekly roundups, daily link digests, or newsletters with individual stories.
4. If an article does not clearly match another article's exact event, omit it. Most articles should remain ungrouped.

Return ONLY valid JSON matching this schema:
{
  "groups": [
    {
      "reason": "Brief 5-10 word description of the shared specific event",
      "ids": ["id1", "id2"]
    }
  ]
}`;

/**
 * Sends a compact batch of recent articles to the configured OpenAI-compatible
 * endpoint and returns deterministically validated story groups.
 */
export async function groupArticlesWithAi(
  candidates: AiClusterCandidate[],
  options?: {
    config?: AiClusteringConfig | null;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    onWarn?: (message: string) => void;
  }
): Promise<ValidatedAiGroup[]> {
  const config = options?.config !== undefined ? options.config : getAiClusteringConfig();
  if (!config) return [];

  const eligible = candidates.filter((item) => {
    if (!item.id || !item.title) return false;
    if (extractArticleFeatures(item).isDigest) return false;
    return parseTimestampMs(item.publishedAt || item.createdAt) > 0;
  });

  if (eligible.length < 2) return [];

  const payloadItems = eligible.map((item) => ({
    id: item.id,
    feedId: item.feedId || "unknown",
    feed: item.feedTitle || "Unknown Feed",
    publishedAt: item.publishedAt ? new Date(item.publishedAt).toISOString().slice(0, 16) : null,
    title: item.title.slice(0, 200),
    snippet: (item.snippet || "").replace(/\s+/g, " ").trim().slice(0, 180),
  }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 20_000);
  const fetchFn = options?.fetchImpl ?? fetch;
  const warn = options?.onWarn ?? ((msg: string) => console.warn(`[AiClustering] ${msg}`));

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    const res = await fetchFn(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({ articles: payloadItems }),
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      warn(`AI grouping endpoint returned HTTP ${res.status}: ${errText.slice(0, 200)}`);
      return [];
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const rawContent = data?.choices?.[0]?.message?.content;
    if (!rawContent || typeof rawContent !== "string") {
      return [];
    }

    const cleanedJson = rawContent
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");

    const parsed = JSON.parse(cleanedJson) as {
      groups?: Array<{ ids?: unknown; reason?: unknown }>;
    };

    if (!Array.isArray(parsed?.groups)) {
      return [];
    }

    return validateAiGroups(eligible, parsed.groups);
  } catch (err: any) {
    warn(`AI grouping skipped due to error: ${err?.message || err}`);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
