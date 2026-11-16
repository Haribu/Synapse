import { describe, expect, it } from "bun:test";
import {
  getAiClusteringConfig,
  groupArticlesWithAi,
  validateAiGroups,
  type AiClusterCandidate,
} from "@/lib/utils/ai-clustering";
import { clusterRelatedArticles } from "@/lib/utils/clustering";

describe("ai-clustering - Optional Configuration & Fallbacks", () => {
  it("returns null when no AI env vars are configured (generic user default)", () => {
    expect(getAiClusteringConfig({})).toBeNull();
  });

  it("returns null when SYNAPSE_AI_ENABLED is false even if API key is present", () => {
    expect(
      getAiClusteringConfig({
        SYNAPSE_AI_ENABLED: "false",
        SYNAPSE_AI_API_KEY: "test-key",
      })
    ).toBeNull();
  });

  it("defaults to Gemini OpenAI-compatible endpoint and gemini-3.5-flash-lite when API key is set", () => {
    const cfg = getAiClusteringConfig({ SYNAPSE_AI_API_KEY: "test-key" });
    expect(cfg).toEqual({
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: "test-key",
      model: "gemini-3.5-flash-lite",
    });
  });

  it("allows key-less local endpoints (e.g. Ollama) when SYNAPSE_AI_BASE_URL is set", () => {
    const cfg = getAiClusteringConfig({
      SYNAPSE_AI_BASE_URL: "http://host.docker.internal:11434/v1/",
    });
    expect(cfg).toEqual({
      baseUrl: "http://host.docker.internal:11434/v1",
      apiKey: "",
      model: "llama3.2",
    });
  });

  it("returns empty groups without calling fetch when unconfigured", async () => {
    let called = false;
    const mockFetch = (async () => {
      called = true;
      throw new Error("should not be called");
    }) as unknown as typeof fetch;

    const now = Date.now();
    const groups = await groupArticlesWithAi(
      [
        { id: "a", feedId: "f1", title: "Story A", publishedAt: now },
        { id: "b", feedId: "f2", title: "Story A", publishedAt: now },
      ],
      { config: null, fetchImpl: mockFetch }
    );

    expect(called).toBe(false);
    expect(groups).toEqual([]);
  });

  it("degrades gracefully when the remote endpoint returns HTTP 429 or invalid JSON", async () => {
    const now = Date.now();
    const candidates: AiClusterCandidate[] = [
      { id: "a", feedId: "f1", title: "OpenAI launches new model", publishedAt: now },
      { id: "b", feedId: "f2", title: "GPT-5 arrives from OpenAI", publishedAt: now },
    ];

    const rateLimitFetch = (async () =>
      new Response("rate limited", { status: 429 })) as unknown as typeof fetch;

    const res1 = await groupArticlesWithAi(candidates, {
      config: { baseUrl: "https://example.com/v1", apiKey: "k", model: "m" },
      fetchImpl: rateLimitFetch,
    });
    expect(res1).toEqual([]);

    const badJsonFetch = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] }), {
        status: 200,
      })) as unknown as typeof fetch;

    const res2 = await groupArticlesWithAi(candidates, {
      config: { baseUrl: "https://example.com/v1", apiKey: "k", model: "m" },
      fetchImpl: badJsonFetch,
    });
    expect(res2).toEqual([]);
  });
});

describe("ai-clustering - Deterministic Guardrails on LLM Output", () => {
  const now = Date.now();
  const baseCandidates: AiClusterCandidate[] = [
    {
      id: "official-1",
      feedId: "feed-official",
      feedEditorialType: "official",
      title: "Acme Cloud discloses critical auth bypass",
      publishedAt: now,
    },
    {
      id: "news-1",
      feedId: "feed-news",
      feedEditorialType: "news",
      title: "Hackers exploit Acme Cloud login bug",
      publishedAt: now - 3600_000,
    },
    {
      id: "same-feed",
      feedId: "feed-news",
      feedEditorialType: "news",
      title: "Follow-up: Acme Cloud patch guidance",
      publishedAt: now - 7200_000,
    },
    {
      id: "digest-1",
      feedId: "feed-digest",
      feedEditorialType: "independent",
      title: "Security Roundup #42: Acme Cloud and more",
      publishedAt: now - 1000_000,
    },
    {
      id: "stale-1",
      feedId: "feed-old",
      feedEditorialType: "independent",
      title: "Acme Cloud incident postmortem",
      publishedAt: now - 72 * 3600_000,
    },
  ];

  it("enforces editorial authority, same-feed exclusion, digest exclusion, and 48h window", () => {
    const validated = validateAiGroups(baseCandidates, [
      {
        reason: "Acme Cloud auth bypass",
        ids: ["news-1", "official-1", "same-feed", "digest-1", "stale-1", "ghost-id"],
      },
    ]);

    expect(validated.length).toBe(1);
    expect(validated[0].primaryId).toBe("official-1");
    expect(validated[0].memberIds).toEqual(["official-1", "news-1"]);
  });

  it("honors persisted clusterId in clusterRelatedArticles while falling back deterministically", () => {
    const items = [
      {
        id: "1",
        feedId: "f1",
        feedEditorialType: "news",
        title: "OpenAI releases GPT-5 with native reasoning",
        publishedAt: now,
        clusterId: "ai_story_1",
      },
      {
        id: "2",
        feedId: "f2",
        feedEditorialType: "official",
        title: "Introducing our newest flagship model",
        publishedAt: now - 1000,
        clusterId: "ai_story_1",
      },
      {
        id: "3",
        feedId: "f3",
        feedEditorialType: "independent",
        title: "CISA warns on CVE-2026-99999 actively exploited",
        snippet: "Patch CVE-2026-99999 immediately",
        publishedAt: now,
        clusterId: null,
      },
      {
        id: "4",
        feedId: "f4",
        feedEditorialType: "news",
        title: "Critical CVE-2026-99999 flaw under active attack",
        snippet: "Administrators urged to patch CVE-2026-99999",
        publishedAt: now - 2000,
        clusterId: null,
      },
    ];

    const clusters = clusterRelatedArticles(items);
    expect(clusters.length).toBe(2);
    expect(clusters[0].primary.id).toBe("2"); // official beats news
    expect(clusters[0].relatedStories.map((s) => s.id)).toEqual(["1"]);
    expect(clusters[1].primary.id).toBe("3"); // deterministic CVE fallback
    expect(clusters[1].relatedStories.map((s) => s.id)).toEqual(["4"]);
  });
});
