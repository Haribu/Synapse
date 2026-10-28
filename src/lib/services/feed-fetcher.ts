import { XMLParser } from "fast-xml-parser";
import { decodeHtmlEntities } from "@/lib/utils/decode";
import { cleanArticleHtml, cleanAuthor } from "@/lib/utils/clean-article";
import { parseFeedPublishedDate } from "@/lib/utils/date-parser";
import { validateSafeUrl } from "@/lib/utils/ssrf";

export function stripInlineCssAndScripts(raw: string): string {
  return raw
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gis, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gis, " ")
    .replace(/@media\s+[^{]{1,200}\{(?:[^{}]*\{[^}]*\})*\s*\}/gi, " ")
    .replace(
      /\.[a-zA-Z_-][a-zA-Z0-9_\\-]*[\s>+~,:.\[\]="a-zA-Z0-9_\\-]{0,120}\{[a-zA-Z-]+\s*:[^}]{1,500}\}/g,
      " "
    )
    .replace(/\.(?:kadence-column|kt-inside-inner-col)[a-zA-Z0-9_\\-]*/gi, " ");
}

export function extractSnippet(rawSnippet?: any, rawContent?: any): string {
  if (rawSnippet && typeof rawSnippet === "string" && rawSnippet.trim().length > 0) {
    const text = decodeHtmlEntities(
      stripInlineCssAndScripts(rawSnippet)
        .replace(/<[^>]*>?/gm, " ")
        .replace(/\s+/g, " ")
        .trim()
    );
    if (text.length >= 40 || (!rawContent && text.length > 0)) return text.slice(0, 300);
  }
  if (rawContent && typeof rawContent === "string" && rawContent.trim().length > 0) {
    const text = decodeHtmlEntities(
      stripInlineCssAndScripts(rawContent)
        .replace(/<[^>]*>?/gm, " ")
        .replace(/\s+/g, " ")
        .trim()
    );
    if (text.length > 0) return text.slice(0, 300);
  }
  return "";
}

export interface ParsedItem {
  guid: string;
  title: string;
  url: string;
  author?: string;
  snippet?: string;
  content?: string;
  publishedAt?: Date;
  mediaType: "article" | "video" | "podcast";
  videoId?: string;
  thumbnailUrl?: string;
}

export interface ParsedFeedResult {
  title: string;
  siteUrl?: string;
  description?: string;
  items: ParsedItem[];
  etag?: string;
  lastModified?: string;
  discoveredFeedUrl?: string;
}

async function discoverFeedUrlFromHtml(html: string, baseUrl: string): Promise<string | null> {
  // 1. Look for standard <link rel="alternate" type="application/rss+xml" href="..."> tags
  const linkRegex = /<link\b[^>]*\brel=["'](?:alternate|service\.feed)["'][^>]*>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const tag = match[0];
    const typeMatch = tag.match(/\btype=["']([^"']+)["']/i);
    const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
    if (typeMatch && hrefMatch) {
      const type = typeMatch[1].toLowerCase();
      if (
        type.includes("rss+xml") ||
        type.includes("atom+xml") ||
        type.includes("feed+json") ||
        type.includes("xml")
      ) {
        try {
          return new URL(hrefMatch[1], baseUrl).href;
        } catch {
          // ignore
        }
      }
    }
  }

  // Check type first then rel
  const linkRegex2 =
    /<link\b[^>]*\btype=["'](?:application\/rss\+xml|application\/atom\+xml)["'][^>]*>/gi;
  while ((match = linkRegex2.exec(html)) !== null) {
    const tag = match[0];
    const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
    if (hrefMatch) {
      try {
        return new URL(hrefMatch[1], baseUrl).href;
      } catch {
        // ignore
      }
    }
  }

  // 2. Check common feed paths
  const commonPaths = [
    "/feed",
    "/rss",
    "/atom.xml",
    "/feed.xml",
    "/rss.xml",
    "/blog/feed",
    "/blog/atom.xml",
  ];
  for (const path of commonPaths) {
    try {
      const candidateUrl = new URL(path, baseUrl).href;
      const res = await fetch(candidateUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Synapse-Reader/1.0",
          Accept: "application/rss+xml, application/atom+xml, application/xml",
        },
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const ct = res.headers.get("content-type") || "";
        const bodyStart = await res.text();
        if (
          ct.includes("xml") ||
          ct.includes("rss") ||
          ct.includes("atom") ||
          bodyStart.includes("<rss") ||
          bodyStart.includes("<feed")
        ) {
          return candidateUrl;
        }
      }
    } catch {
      // Continue searching
    }
  }

  return null;
}
// Serialized queue and rate-limiter for YouTube requests to prevent burst HTTP 429
let lastYouTubeFetchTime = 0;
let youtubeThrottleChain = Promise.resolve();

function withYouTubeThrottle<T>(fn: () => Promise<T>): Promise<T> {
  const task = async () => {
    const now = Date.now();
    const elapsed = now - lastYouTubeFetchTime;
    const minInterval = 1500 + Math.floor(Math.random() * 500); // 1.5s - 2.0s jitter
    if (elapsed < minInterval) {
      await new Promise((resolve) => setTimeout(resolve, minInterval - elapsed));
    }
    try {
      return await fn();
    } finally {
      lastYouTubeFetchTime = Date.now();
    }
  };
  const next = youtubeThrottleChain.then(task, task);
  youtubeThrottleChain = next.then(
    () => {},
    () => {}
  );
  return next;
}

export function isYouTubeShortEntry(entry: any): boolean {
  const title = (
    typeof entry.title === "object" ? entry.title["#text"] : entry.title || ""
  ).toLowerCase();

  const description = (
    entry["media:group"]?.["media:description"] ||
    (typeof entry.content === "object" ? entry.content["#text"] : entry.content) ||
    entry.summary ||
    ""
  ).toLowerCase();

  const link = (
    Array.isArray(entry.link)
      ? entry.link.find((l: any) => l["@_rel"] === "alternate")?.["@_href"] ||
        entry.link[0]?.["@_href"]
      : entry.link?.["@_href"] || ""
  ).toLowerCase();

  // 1. Direct /shorts/ URL
  if (link.includes("/shorts/")) {
    return true;
  }

  // 2. Title hashtag or tag indicators
  if (
    title.includes("#shorts") ||
    title.includes("#short") ||
    title.includes("#ytshorts") ||
    /\b#shorts\b/i.test(title) ||
    /\[shorts?\]/i.test(title) ||
    /\(shorts?\)/i.test(title)
  ) {
    return true;
  }

  // 3. Description indicators
  if (
    description.includes("#shorts") ||
    description.includes("#short") ||
    description.includes("#ytshorts") ||
    description.includes("/shorts/") ||
    description.includes("youtube.com/shorts")
  ) {
    return true;
  }

  return false;
}

export async function isConfirmedShortVideo(videoId: string): Promise<boolean> {
  if (!videoId) return false;
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${videoId}`, {
      method: "HEAD",
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(2500),
    });
    // YouTube redirects horizontal/standard videos to /watch?v= (HTTP 303 or 302)
    const location = res.headers.get("location") || "";
    if (res.status === 303 || res.status === 302 || location.includes("/watch")) {
      return false;
    }
    // A 200 OK without /watch redirect confirms it is served as a Short
    if (res.status === 200) {
      return true;
    }
  } catch {
    // If request times out or is blocked, do not falsely flag
  }
  return false;
}

async function fetchYouTubeChannelVideosFallback(
  channelId: string
): Promise<ParsedFeedResult | null> {
  try {
    const channelVideosUrl = `https://www.youtube.com/channel/${channelId}/videos`;
    const res = await withYouTubeThrottle(() =>
      fetch(channelVideosUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          Cookie: "CONSENT=YES+cb.20210328-17-p0.en+FX+410",
        },
        signal: AbortSignal.timeout(15000),
      })
    );
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/var\s+ytInitialData\s*=\s*(\{[\s\S]*?\});<\/script>/);
    if (!match) return null;

    const data = JSON.parse(match[1]);
    const channelTitle = decodeHtmlEntities(
      data?.metadata?.channelMetadataRenderer?.title ||
        data?.header?.pageHeaderRenderer?.pageTitle ||
        ""
    );
    const siteUrl =
      data?.metadata?.channelMetadataRenderer?.channelUrl ||
      `https://www.youtube.com/channel/${channelId}`;

    const items: ParsedItem[] = [];
    const seenIds = new Set<string>();

    const walk = (node: any) => {
      if (!node || typeof node !== "object") return;
      if (node.videoRenderer && typeof node.videoRenderer.videoId === "string") {
        const vr = node.videoRenderer;
        const vid = vr.videoId;
        if (!seenIds.has(vid)) {
          const rawTitle =
            vr.title?.runs?.map((r: any) => r.text).join("") ||
            vr.title?.simpleText ||
            "Untitled";
          const webUrl =
            vr.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || "";
          const isShort =
            Boolean(vr.navigationEndpoint?.reelWatchEndpoint) ||
            webUrl.includes("/shorts/") ||
            /\b#shorts?\b/i.test(rawTitle);
          if (!isShort) {
            seenIds.add(vid);
            const desc =
              vr.descriptionSnippet?.runs?.map((r: any) => r.text).join("") || "";
            const thumb =
              vr.thumbnail?.thumbnails?.[vr.thumbnail.thumbnails.length - 1]?.url ||
              `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
            items.push({
              guid: `yt:video:${vid}`,
              title: decodeHtmlEntities(rawTitle),
              url: `https://www.youtube.com/watch?v=${vid}`,
              author: cleanAuthor(channelTitle),
              snippet: extractSnippet(desc, desc),
              content: cleanArticleHtml(desc, rawTitle),
              mediaType: "video",
              videoId: vid,
              thumbnailUrl: thumb,
            });
          }
        }
        return;
      }
      if (Array.isArray(node)) {
        for (const child of node) walk(child);
      } else {
        for (const key of Object.keys(node)) {
          walk(node[key]);
        }
      }
    };

    walk(data?.contents);
    return {
      title: channelTitle,
      siteUrl,
      items: items.slice(0, 15),
    };
  } catch {
    return null;
  }
}

export async function fetchFeed(
  feedUrl: string,
  existingEtag?: string,
  existingLastModified?: string,
  depth = 0
): Promise<ParsedFeedResult | null> {
  validateSafeUrl(feedUrl);

  const isYouTube = feedUrl.includes("youtube.com") || feedUrl.includes("youtu.be");

  const headers: Record<string, string> = {
    "User-Agent": isYouTube
      ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      : "Synapse-Reader/1.0 (+https://github.com/synapse-reader; Mozilla/5.0 compatible)",
    Accept: isYouTube
      ? "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8"
      : "application/rss+xml, application/atom+xml, application/xml, text/xml, application/rdf+xml, text/html;q=0.9",
  };

  if (isYouTube) {
    headers["Accept-Language"] = "en-US,en;q=0.9";
  }

  // YouTube's RSS endpoint does not reliably honor ETag / If-Modified-Since and can fail with 400/500
  if (!isYouTube) {
    if (existingEtag) headers["If-None-Match"] = existingEtag;
    if (existingLastModified) headers["If-Modified-Since"] = existingLastModified;
  }

  const executeFetch = async (): Promise<Response> => {
    return fetch(feedUrl, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
  };

  const exec = isYouTube ? () => withYouTubeThrottle(executeFetch) : executeFetch;

  let response: Response;
  try {
    response = await exec();
  } catch (err: any) {
    if (isYouTube && depth === 0) {
      // Retry once after backoff for YouTube transient connection issues
      await new Promise((r) => setTimeout(r, 2000 + Math.floor(Math.random() * 1000)));
      response = await exec();
    } else {
      throw err;
    }
  }

  // Handle rate limits or transient server errors with backoff
  if (response.status === 429 || response.status === 503) {
    const backoffMs = isYouTube ? 3000 + Math.floor(Math.random() * 1500) : 2000;
    await new Promise((r) => setTimeout(r, backoffMs));
    response = await exec();
  }

  // Retry non-YouTube HTTP 403 once with standard browser User-Agent
  if (!isYouTube && response.status === 403 && depth === 0) {
    headers["User-Agent"] =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
    response = await executeFetch();
  }

  if (response.status === 304) {
    // Not modified
    return null;
  }

  // Check for UULF playlist fallback on 404 or 400
  const uulfMatch = feedUrl.match(/[?&]playlist_id=UULF([a-zA-Z0-9_-]{22})/);
  const ucMatch = feedUrl.match(/[?&]channel_id=(UC[a-zA-Z0-9_-]{22})/);
  if ((response.status === 404 || response.status === 400 || response.status >= 500) && uulfMatch && depth === 0) {
    const fallbackUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=UC${uulfMatch[1]}`;
    try {
      const fallbackResult = await fetchFeed(fallbackUrl, undefined, undefined, depth + 1);
      if (fallbackResult) {
        return fallbackResult;
      }
    } catch {
      // Fall through to HTML channel videos fallback below
    }
    const htmlFallback = await fetchYouTubeChannelVideosFallback(`UC${uulfMatch[1]}`);
    if (htmlFallback) {
      return htmlFallback;
    }
  }

  if ((response.status === 404 || response.status === 400 || response.status >= 500) && ucMatch) {
    const htmlFallback = await fetchYouTubeChannelVideosFallback(ucMatch[1]);
    if (htmlFallback) {
      return htmlFallback;
    }
  }

  if (!response.ok) {
    throw new Error(`Feed fetch failed: HTTP ${response.status} ${response.statusText}`);
  }

  const xmlText = await response.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    maxNestedTags: 5000,
    stopNodes: ["*.description", "*.content", "*.content:encoded", "*.summary"],
  });

  const parsed = parser.parse(xmlText);
  const etag = response.headers.get("etag") || undefined;
  const lastModified = response.headers.get("last-modified") || undefined;

  // If response is HTML and not RSS/Atom, attempt auto-discovery of the feed
  if (!parsed?.rss?.channel && !parsed?.feed && !parsed?.["rdf:RDF"] && depth === 0) {
    if (
      xmlText.includes("<html") ||
      xmlText.includes("<!DOCTYPE html") ||
      xmlText.includes("<head")
    ) {
      const discoveredUrl = await discoverFeedUrlFromHtml(xmlText, feedUrl);
      if (discoveredUrl && discoveredUrl !== feedUrl) {
        const discovered = await fetchFeed(discoveredUrl, undefined, undefined, depth + 1);
        if (discovered) {
          return {
            ...discovered,
            discoveredFeedUrl: discoveredUrl,
          };
        }
      }
    }

    // Also check if UULF returned non-XML/empty feed, fall back to channel_id
    if (uulfMatch) {
      const fallbackUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=UC${uulfMatch[1]}`;
      const fallbackResult = await fetchFeed(fallbackUrl, undefined, undefined, depth + 1);
      if (fallbackResult && fallbackResult.items.length > 0) {
        return fallbackResult;
      }
    }

    throw new Error(
      `No valid RSS or Atom feed found at ${feedUrl}. Make sure this URL provides a syndication feed.`
    );
  }

  // If UULF returned a valid XML feed but 0 entries, try falling back to channel_id
  if (
    isYouTube &&
    uulfMatch &&
    depth === 0 &&
    parsed?.feed &&
    (!parsed.feed.entry || (Array.isArray(parsed.feed.entry) && parsed.feed.entry.length === 0))
  ) {
    const fallbackUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=UC${uulfMatch[1]}`;
    const fallbackResult = await fetchFeed(fallbackUrl, undefined, undefined, depth + 1);
    if (fallbackResult && fallbackResult.items.length > 0) {
      return fallbackResult;
    }
  }

  // Handle RSS 2.0
  if (parsed?.rss?.channel) {
    const channel = parsed.rss.channel;
    const title = decodeHtmlEntities(channel.title || "");
    const siteUrl = channel.link;
    const rawItems = Array.isArray(channel.item)
      ? channel.item
      : channel.item
        ? [channel.item]
        : [];

    const items: ParsedItem[] = rawItems.map((item: any) => {
      const guid =
        typeof item.guid === "object" ? item.guid["#text"] : item.guid || item.link || item.title;
      const publishedAt = parseFeedPublishedDate(
        item.pubDate,
        item["dc:date"],
        item["dc:Date"],
        item.date,
        item.published,
        item.updated,
        item["atom:published"],
        item["atom:updated"],
        item.issued
      );

      const url = typeof item.link === "string" ? item.link : item.link?.["#text"] || "";
      const rawContent = item["content:encoded"] || item.description || "";
      const ytMatch = `${url} ${rawContent}`.match(
        /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
      );
      const videoId = ytMatch ? ytMatch[1] : undefined;

      return {
        guid: String(guid),
        title: decodeHtmlEntities(item.title || "Untitled"),
        url,
        author: cleanAuthor(item["dc:creator"] || item.author || channel.title),
        snippet: extractSnippet(item.description, rawContent),
        content: cleanArticleHtml(rawContent),
        publishedAt: publishedAt || undefined,
        mediaType: videoId ? "video" : "article",
        videoId,
      };
    });

    return { title, siteUrl, items, etag, lastModified };
  }

  // Handle RDF / RSS 1.0 (e.g. Schneier, US-CERT)
  const rdf = parsed?.["rdf:RDF"] || parsed?.RDF;
  if (rdf) {
    const channel = rdf.channel;
    const title = decodeHtmlEntities(channel?.title || "");
    const siteUrl = channel?.link;
    const rawItems = Array.isArray(rdf.item) ? rdf.item : rdf.item ? [rdf.item] : [];

    const items: ParsedItem[] = rawItems.map((item: any) => {
      const guid = item["@_rdf:about"] || item.link || item.title;
      const publishedAt = parseFeedPublishedDate(
        item["dc:date"],
        item["dc:Date"],
        item.date,
        item.pubDate,
        item.published
      );
      const url = typeof item.link === "string" ? item.link : "";
      const rawContent = item["content:encoded"] || item.description || "";
      const ytMatch = `${url} ${rawContent}`.match(
        /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
      );
      const videoId = ytMatch ? ytMatch[1] : undefined;

      return {
        guid: String(guid),
        title: decodeHtmlEntities(item.title || "Untitled"),
        url,
        author: cleanAuthor(item["dc:creator"] || title),
        snippet: extractSnippet(item.description, rawContent),
        content: cleanArticleHtml(rawContent),
        publishedAt: publishedAt || undefined,
        mediaType: videoId ? "video" : "article",
        videoId,
      };
    });

    return { title, siteUrl, items, etag, lastModified };
  }

  // Handle Atom & YouTube feeds
  if (parsed?.feed || parsed?.["atom:feed"]) {
    const feed = parsed.feed || parsed["atom:feed"];
    let rawTitle = typeof feed.title === "object" ? feed.title["#text"] : feed.title;
    const siteUrl = Array.isArray(feed.link) ? feed.link[0]?.["@_href"] : feed.link?.["@_href"];
    const rawEntries = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : [];

    const isYouTube = feedUrl.includes("youtube.com") || feed["@_xmlns:yt"] !== undefined;

    // For YouTube feeds, extract actual channel author name instead of generic "Videos"
    let title = rawTitle || "";
    if (isYouTube) {
      const channelAuthor = feed.author?.name;
      if (channelAuthor) {
        title = channelAuthor;
      } else if (title === "Videos") {
        title = ""; // Avoid setting title to "Videos"
      }
    }
    title = decodeHtmlEntities(title);

    // Filter out explicit & stealth Shorts when parsing YouTube feeds
    let filteredEntries = rawEntries;
    if (isYouTube) {
      // 1. Fast metadata & heuristic filter (instantaneous)
      const nonShortCandidates = rawEntries.filter((entry: any) => !isYouTubeShortEntry(entry));

      // 2. If parsing a raw channel or uploads fallback feed, verify remaining videos
      const isFallbackChannelFeed =
        feedUrl.includes("channel_id=UC") ||
        (feedUrl.includes("playlist_id=UU") && !feedUrl.includes("playlist_id=UULF"));

      if (isFallbackChannelFeed && nonShortCandidates.length > 0) {
        const checks = await Promise.all(
          nonShortCandidates.map(async (entry: any) => {
            const vid = entry["yt:videoId"];
            if (vid) {
              const isShort = await isConfirmedShortVideo(vid);
              return isShort ? null : entry;
            }
            return entry;
          })
        );
        filteredEntries = checks.filter(Boolean);
      } else {
        filteredEntries = nonShortCandidates;
      }
    }

    const items: ParsedItem[] = filteredEntries.map((entry: any) => {
      const guid = entry.id || entry.link?.["@_href"] || entry.title;
      const publishedAt = parseFeedPublishedDate(
        entry.published,
        entry["atom:published"],
        entry.updated,
        entry["atom:updated"],
        entry.issued,
        entry["dc:date"],
        entry.date
      );
      const entryLink = Array.isArray(entry.link)
        ? entry.link.find((l: any) => l["@_rel"] === "alternate")?.["@_href"] ||
          entry.link[0]?.["@_href"]
        : entry.link?.["@_href"] || "";

      let videoId: string | undefined;
      let thumbnailUrl: string | undefined;
      let mediaType: "article" | "video" = isYouTube ? "video" : "article";

      if (entry["yt:videoId"]) {
        videoId = entry["yt:videoId"];
        mediaType = "video";
      }

      if (entry["media:group"]) {
        const mg = entry["media:group"];
        if (mg["media:thumbnail"]) {
          thumbnailUrl = mg["media:thumbnail"]["@_url"];
        }
      }

      const content =
        entry["media:group"]?.["media:description"] ||
        entry.content?.["#text"] ||
        entry.content ||
        entry.summary ||
        "";

      return {
        guid: String(guid),
        title: decodeHtmlEntities(
          typeof entry.title === "object" ? entry.title["#text"] : entry.title || "Untitled"
        ),
        url: entryLink,
        author: cleanAuthor(entry.author?.name || title),
        snippet: extractSnippet(content, typeof content === "string" ? content : ""),
        content: cleanArticleHtml(typeof content === "string" ? content : ""),
        publishedAt: publishedAt || undefined,
        mediaType,
        videoId,
        thumbnailUrl,
      };
    });

    return { title, siteUrl, items, etag, lastModified };
  }

  return { title: "", items: [], etag, lastModified };
}
