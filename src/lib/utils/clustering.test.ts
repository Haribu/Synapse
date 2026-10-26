import { describe, expect, it } from "bun:test";
import { areArticlesRelated, clusterRelatedArticles, extractArticleFeatures } from "./clustering";

describe("clustering - Story Grouping Calibration (Bug 25/10/2026)", () => {
  it("does NOT cluster articles from the same feed", () => {
    const itemA = {
      id: "1",
      feedId: "feed-123",
      title: "Evaluating Reasoning Models in Practice",
      publishedAt: new Date("2026-10-25T10:00:00Z").toISOString(),
      snippet: "Discussion of reasoning benchmarks and evaluation.",
    };
    const itemB = {
      id: "2",
      feedId: "feed-123",
      title: "Benchmarking Reasoning Models Across Tasks",
      publishedAt: new Date("2026-10-25T12:00:00Z").toISOString(),
      snippet: "Discussion of reasoning benchmarks and evaluation.",
    };

    const featA = extractArticleFeatures(itemA);
    const featB = extractArticleFeatures(itemB);

    expect(areArticlesRelated(itemA, featA, itemB, featB)).toBe(false);
  });

  it("does NOT cluster articles published more than 48 hours apart", () => {
    const itemA = {
      id: "1",
      feedId: "feed-a",
      title: "Critical Zero-Day Flaw Found in Starshield Infrastructure",
      publishedAt: new Date("2026-10-20T10:00:00Z").toISOString(),
      fullContentMarkdown: "Starshield communications suffered a massive disruption due to a critical zero day vulnerability.",
    };
    const itemB = {
      id: "2",
      feedId: "feed-b",
      title: "Critical Zero-Day Flaw Found in Starshield Infrastructure",
      publishedAt: new Date("2026-10-25T10:00:00Z").toISOString(), // 5 days later
      fullContentMarkdown: "Starshield communications suffered a massive disruption due to a critical zero day vulnerability.",
    };

    const featA = extractArticleFeatures(itemA);
    const featB = extractArticleFeatures(itemB);

    expect(areArticlesRelated(itemA, featA, itemB, featB)).toBe(false);
  });

  it("does NOT cluster unrelated research articles that share generic tech/domain keywords", () => {
    const itemA = {
      id: "1",
      feedId: "feed-a",
      title: "The LLM Blindspot: Why Models Forget What’s in the Middle of Your Prompt",
      publishedAt: new Date("2026-10-25T10:00:00Z").toISOString(),
      snippet: "An exploration of prompt context and attention mechanisms in large language models.",
    };
    const itemB = {
      id: "2",
      feedId: "feed-b",
      title: "How to Use Reasoning Models Properly in Enterprise Architectures",
      publishedAt: new Date("2026-10-25T11:00:00Z").toISOString(),
      snippet: "Guidelines for deploying reasoning and language models in enterprise architectures.",
    };

    const featA = extractArticleFeatures(itemA);
    const featB = extractArticleFeatures(itemB);

    expect(areArticlesRelated(itemA, featA, itemB, featB)).toBe(false);
  });

  it("clusters multi-source breaking news covering the exact same event across different feeds", () => {
    const itemA = {
      id: "1",
      feedId: "feed-thehackernews",
      title: "OpenAI Employee Arrested for Allegedly Planting Hidden Recorder in Executive Conference Room",
      publishedAt: new Date("2026-10-25T10:00:00Z").toISOString(),
      snippet: "Federal authorities detained an OpenAI employee accused of secretly planting a recording device in an executive boardroom.",
      fullContentMarkdown: "Federal authorities detained an OpenAI employee accused of secretly planting a recording device in an executive boardroom to capture sensitive discussions.",
    };
    const itemB = {
      id: "2",
      feedId: "feed-theregister",
      title: "OpenAI Engineer Detained After Boardroom Bug Found Secretly Recording Meetings",
      publishedAt: new Date("2026-10-25T11:30:00Z").toISOString(),
      snippet: "An OpenAI engineer has been arrested after a hidden microphone recording device was discovered in an executive conference room.",
      fullContentMarkdown: "An OpenAI engineer has been arrested after a hidden microphone recording device was discovered in an executive conference room during security sweeping.",
    };

    const clusters = clusterRelatedArticles([itemA, itemB]);
    expect(clusters.length).toBe(1);
    expect(clusters[0].relatedStories.length).toBe(1);
  });

  it("clusters articles that reference the exact same CVE identifier", () => {
    const itemA = {
      id: "1",
      feedId: "feed-a",
      title: "Critical RCE CVE-2026-9999 Discovered in Banking Gateway",
      publishedAt: new Date("2026-10-25T10:00:00Z").toISOString(),
    };
    const itemB = {
      id: "2",
      feedId: "feed-b",
      title: "Urgent Patch Released for CVE-2026-9999 Vulnerability",
      publishedAt: new Date("2026-10-25T14:00:00Z").toISOString(),
    };

    const clusters = clusterRelatedArticles([itemA, itemB]);
    expect(clusters.length).toBe(1);
    expect(clusters[0].relatedStories.length).toBe(1);
  });
});
