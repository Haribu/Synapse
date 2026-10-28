import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { marked } from "marked";
import { validateSafeUrl } from "@/lib/utils/ssrf";
import { cleanArticleHtml, cleanArticleMarkdown } from "@/lib/utils/clean-article";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  emDelimiter: "_",
});

// Preserve YouTube video embeds in Turndown
turndown.addRule("youtubeIframe", {
  filter: (node) => {
    if (node.nodeName !== "IFRAME") return false;
    const src = (node as HTMLElement).getAttribute("src") || "";
    return (
      src.includes("youtube.com") ||
      src.includes("youtube-nocookie.com") ||
      src.includes("youtu.be")
    );
  },
  replacement: (_content, node) => {
    const src = (node as HTMLElement).getAttribute("src") || "";
    const match = src.match(/(?:embed\/|watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    const videoId = match ? match[1] : "";
    if (videoId) {
      return `\n\nhttps://www.youtube.com/watch?v=${videoId}\n\n`;
    }
    return "";
  },
});

turndown.addRule("removeGarbage", {
  filter: (node) => {
    const name = node.nodeName.toLowerCase();
    if (name === "script" || name === "style" || name === "noscript") return true;
    if (name === "iframe") {
      const src = (node as HTMLElement).getAttribute("src") || "";
      return !(
        src.includes("youtube.com") ||
        src.includes("youtube-nocookie.com") ||
        src.includes("youtu.be")
      );
    }
    return false;
  },
  replacement: () => "",
});

// Custom GFM table rules for Turndown
turndown.addRule("table", {
  filter: "table",
  replacement: (content) => `\n\n${content}\n\n`,
});

turndown.addRule("tableRow", {
  filter: "tr",
  replacement: (content, node) => {
    const parent = node.parentNode;
    const isFirstRow =
      parent &&
      (node === parent.firstElementChild ||
        (parent.nodeName.toUpperCase() === "TBODY" &&
          parent.parentNode &&
          node === parent.firstElementChild &&
          parent === parent.parentNode.firstElementChild));
    const isHeader =
      node.querySelector("th") !== null ||
      (parent && (parent.nodeName === "THEAD" || parent.nodeName === "thead")) ||
      Boolean(isFirstRow);
    let border = "";
    if (isHeader) {
      const cells = node.querySelectorAll("th, td");
      const underlines = Array.from(cells).map(() => "---");
      border = `\n| ${underlines.join(" | ")} |`;
    }
    return `\n| ${content.replace(/^\s*\|\s*/, "").replace(/\s*\|\s*$/, "")} |${border}`;
  },
});

turndown.addRule("tableCell", {
  filter: ["th", "td"],
  replacement: (content) => ` ${content.trim()} |`,
});

// Preserve code blocks with language fences
turndown.addRule("fencedCodeBlock", {
  filter: (node) => {
    return node.nodeName === "PRE" && node.querySelector("code") !== null;
  },
  replacement: (_content, node) => {
    const codeEl = node.querySelector("code");
    const lang = codeEl?.className?.match(/(?:lang|language)-(\w+)/)?.[1] || "";
    const code = codeEl?.textContent || node.textContent || "";
    return `\n\n\`\`\`${lang}\n${code.trim()}\n\`\`\`\n\n`;
  },
});

export interface ExtractedArticle {
  title: string;
  byline?: string;
  excerpt?: string;
  contentHtml: string;
  contentMarkdown: string;
  siteName?: string;
  publishedTime?: string;
  videoId?: string;
}

/**
 * Detects whether extracted text is a bot challenge, Turnstile, or CAPTCHA page
 * rather than legitimate article content.
 */
export function isChallengeOrCaptcha(title?: string, content?: string): boolean {
  const t = (title || "").toLowerCase();
  const c = (content || "").toLowerCase();
  const challengeMarkers = [
    "just a moment...",
    "attention required!",
    "performing security verification",
    "verify you are not a bot",
    "warning: this page maybe requiring captcha",
    "cloudflare ray id",
    "cf-browser-verification",
    "access denied |",
    "enable javascript and cookies to continue",
    "checking your browser",
  ];
  return challengeMarkers.some((marker) => t.includes(marker) || c.includes(marker));
}

/**
 * Detects whether extracted content is an empty stub, cookie wall, subscription prompt,
 * or truncated client-side teaser.
 */
export function isStubOrBlocked(
  title?: string,
  content?: string,
  textLength: number = 0,
  targetUrl?: string
): boolean {
  if (textLength < 600) return true;

  const c = (content || "").toLowerCase();
  const t = (title || "").toLowerCase();

  // Hard blocker / CAPTCHA / bot challenge markers (must reject regardless of text length)
  const hardBlockMarkers = [
    "please enable javascript",
    "javascript is required",
    "turnstile",
    "cloudflare ray id",
    "cf-browser-verification",
    "access denied |",
    "warning: this page maybe requiring captcha",
    "enable javascript and cookies to continue",
  ];
  if (hardBlockMarkers.some((m) => c.includes(m) || t.includes(m))) {
    return true;
  }

  // If the article has substantial body text (> 1200 chars), it is a real article, not an empty stub or subscription prompt
  if (textLength > 1200) return false;

  // Soft stub, subscription prompt, and cookie wall markers (applied when text length <= 1200 chars)
  const softStubMarkers = [
    "subscribe to read",
    "subscribe to continue",
    "sign in to read the full",
    "sign in or subscribe to read",
    "sign in or subscribe to read the full article",
    "read full article on",
    "we value your privacy",
    "manage your cookie preferences",
    "accept all cookies",
    "to view this content, please",
    "you have reached your limit of free articles",
    "you have reached your free article limit",
    "subscribe to the interpreter",
    "the most-pressing world events explained",
    "independent international policy think tank",
    "next_http_error_fallback",
    "make ars better with an arspro subscription",
    "stay informed on the world's most pressing challenges",
    "this one is on us",
    "new issue out",
    "more by ",
    "read now",
  ];
  if (softStubMarkers.some((m) => c.includes(m) || t.includes(m))) {
    return true;
  }

  // If text length < 1000 and contains magazine issue teaser or author bios without substantive body
  if (
    textLength < 1000 &&
    (c.includes("new issue out") ||
      c.includes("global fellow") ||
      c.includes("senior fellow") ||
      c.includes("carnegie russia") ||
      c.includes("columbia university"))
  ) {
    return true;
  }

  // If title is generic while URL points to a specific article slug, origin returned a client-side shell/landing page
  const isGenericTitle =
    !title ||
    /^(?:lowy institute|the interpreter|home|untitled|article|news|blog)$/i.test(title.trim());
  const hasArticleSlug = !!targetUrl && targetUrl.split("/").filter(Boolean).length >= 2;
  if (isGenericTitle && hasArticleSlug && textLength < 1000) return true;

  return false;
}

interface BrowserProfile {
  name: string;
  headers: (origin: string, referer?: string) => Record<string, string>;
}

const BROWSER_PROFILES: BrowserProfile[] = [
  {
    name: "chrome-macos-organic",
    headers: (_origin: string, referer = "https://www.google.com/") => ({
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "max-age=0",
      Referer: referer,
      "Sec-Ch-Ua": '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"macOS"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "cross-site",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
      Priority: "u=0, i",
    }),
  },
  {
    name: "firefox-macos-direct",
    headers: (origin: string, referer?: string) => ({
      // Firefox intentionally never sends Sec-Ch-Ua headers
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:136.0) Gecko/20100101 Firefox/136.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      Referer: referer || `${origin}/`,
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
      Priority: "u=0, i",
    }),
  },
];

/**
 * Performs an HTTP fetch using a cohesive browser header profile with manual,
 * cookie-preserving redirect handling and SSRF validation on every hop.
 * Automatically rotates from Chrome profile to Firefox profile on 403/429/503.
 */
async function fetchWithBrowserProfile(
  targetUrl: string,
  timeoutMs = 15000
): Promise<Response | null> {
  for (let profileIdx = 0; profileIdx < BROWSER_PROFILES.length; profileIdx++) {
    const profile = BROWSER_PROFILES[profileIdx];
    const cookieJar = new Map<string, string>();
    let currentUrl = targetUrl;

    try {
      for (let hop = 0; hop < 5; hop++) {
        validateSafeUrl(currentUrl);
        const parsedUrl = new URL(currentUrl);
        const headers = profile.headers(parsedUrl.origin);

        if (cookieJar.size > 0) {
          headers["Cookie"] = Array.from(cookieJar.entries())
            .map(([k, v]) => `${k}=${v}`)
            .join("; ");
        }

        const res = await fetch(currentUrl, {
          headers,
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
        });

        // Harvest Set-Cookie headers across redirect hops
        const setCookies: string[] =
          typeof (res.headers as any).getSetCookie === "function"
            ? (res.headers as any).getSetCookie()
            : res.headers.get("set-cookie")
              ? [res.headers.get("set-cookie")!]
              : [];

        for (const rawCookie of setCookies) {
          const firstPair = rawCookie.split(";")[0]?.trim();
          if (firstPair) {
            const eqIdx = firstPair.indexOf("=");
            if (eqIdx > 0) {
              cookieJar.set(firstPair.slice(0, eqIdx).trim(), firstPair.slice(eqIdx + 1).trim());
            }
          }
        }

        if ([301, 302, 303, 307, 308].includes(res.status)) {
          const location = res.headers.get("location");
          if (!location) break;
          currentUrl = new URL(location, currentUrl).toString();
          continue;
        }

        // If blocked by WAF/rate-limit on primary profile, rotate to secondary browser profile
        if ((res.status === 403 || res.status === 429 || res.status === 503) && profileIdx === 0) {
          break;
        }

        return res;
      }
    } catch {
      if (profileIdx === BROWSER_PROFILES.length - 1) return null;
    }
  }
  return null;
}

/**
 * Fallback to Wayback Machine when direct origin, AMP, WP-JSON, and Jina fail or are blocked.
 * Checks both the availability API and the direct /web/2/ latest snapshot conduit.
 */
async function fetchViaWaybackMachine(targetUrl: string): Promise<ExtractedArticle | null> {
  const parseSnapshotHtml = (snapHtml: string): ExtractedArticle | null => {
    if (!snapHtml || snapHtml.length < 200) return null;
    const snapDom = new JSDOM(snapHtml, { url: targetUrl });
    const snapReader = new Readability(snapDom.window.document);
    const snapArticle = snapReader.parse();
    const textLen = (snapArticle?.textContent || "").trim().length;
    if (
      snapArticle &&
      snapArticle.content &&
      textLen > 400 &&
      !isChallengeOrCaptcha(snapArticle.title, snapArticle.textContent) &&
      !isStubOrBlocked(snapArticle.title, snapArticle.textContent, textLen, targetUrl)
    ) {
      const contentMarkdown = cleanArticleMarkdown(
        turndown.turndown(snapArticle.content),
        snapArticle.title
      );
      const contentHtml = cleanArticleHtml(snapArticle.content, snapArticle.title);
      if (contentMarkdown.length > 200) {
        return {
          title: snapArticle.title || "Archived Article",
          excerpt: snapArticle.excerpt || contentMarkdown.slice(0, 300),
          contentMarkdown,
          contentHtml,
          siteName: "Internet Archive",
        };
      }
    }
    return null;
  };

  try {
    const checkUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(targetUrl)}`;
    const checkRes = await fetch(checkUrl, {
      headers: { "User-Agent": "Synapse-Reader/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (checkRes.ok) {
      const data = await checkRes.json();
      const closest = data?.archived_snapshots?.closest;
      if (closest && closest.available && closest.url) {
        const snapRes = await fetch(closest.url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
          },
          signal: AbortSignal.timeout(12000),
        });
        if (snapRes.ok) {
          const parsed = parseSnapshotHtml(await snapRes.text());
          if (parsed) return parsed;
        }
      }
    }
  } catch {}

  // Secondary Wayback conduit: direct latest capture redirect (/web/2/<url>)
  try {
    const directWaybackUrl = `https://web.archive.org/web/2/${targetUrl}`;
    const directRes = await fetch(directWaybackUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (directRes.ok) {
      const parsed = parseSnapshotHtml(await directRes.text());
      if (parsed) return parsed;
    }
  } catch {}

  return null;
}

/**
 * Formats a raw plain-text or HTML article body string into clean Markdown and HTML.
 */
function formatStructuredBodyToMarkdown(rawBody: string): string {
  const trimmed = rawBody.trim();
  // If the string contains HTML paragraph or block tags, convert via Turndown
  if (/<(?:p|div|h[1-6]|ul|ol|blockquote|pre|table)\b/i.test(trimmed)) {
    return turndown.turndown(trimmed);
  }
  if (!trimmed.includes("\n\n")) {
    const sentences = trimmed.split(/(?<=[.!?])\s+(?=[A-Z0-9"'\''‘“])/);
    const chunks: string[] = [];
    let curr = "";
    for (const s of sentences) {
      curr = curr ? `${curr} ${s}` : s;
      if (curr.length >= 320) {
        chunks.push(curr.trim());
        curr = "";
      }
    }
    if (curr.trim()) chunks.push(curr.trim());
    if (chunks.length > 1) {
      return chunks.join("\n\n");
    }
  }
  return trimmed;
}

/**
 * Extracts full articleBody from JSON-LD schema or Schema.org microdata ([itemprop="articleBody"])
 * embedded for search engine crawlers.
 */
function extractJsonLdArticle(doc: Document): { title?: string; contentMarkdown?: string } | null {
  try {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of Array.from(scripts)) {
      let json: any;
      try {
        json = JSON.parse((script.textContent || "").trim());
      } catch {
        continue;
      }
      const flattenObjects = (item: any): any[] => {
        if (!item || typeof item !== "object") return [];
        if (Array.isArray(item)) return item.flatMap(flattenObjects);
        const list = [item];
        if (Array.isArray(item["@graph"])) list.push(...item["@graph"].flatMap(flattenObjects));
        if (item.mainEntity && typeof item.mainEntity === "object")
          list.push(...flattenObjects(item.mainEntity));
        return list;
      };

      for (const obj of flattenObjects(json)) {
        if (!obj || typeof obj !== "object") continue;
        const rawType = Array.isArray(obj["@type"])
          ? obj["@type"].join(" ")
          : String(obj["@type"] || "");
        const type = rawType.toLowerCase();
        if (
          type.includes("article") ||
          type.includes("newsarticle") ||
          type.includes("blogposting") ||
          type.includes("report") ||
          type.includes("webpage")
        ) {
          const body = obj.articleBody || obj.text;
          if (typeof body === "string" && body.trim().length > 600) {
            return {
              title: obj.headline || obj.name,
              contentMarkdown: formatStructuredBodyToMarkdown(body),
            };
          }
        }
      }
    }

    // Also check Schema.org microdata [itemprop="articleBody"] in the DOM before stripping
    const itempropBodies = doc.querySelectorAll('[itemprop="articleBody"]');
    if (itempropBodies.length > 0) {
      const combinedHtml = Array.from(itempropBodies)
        .map((el) => el.innerHTML)
        .join("\n\n");
      const md = turndown.turndown(combinedHtml).trim();
      if (md.length > 600) {
        const headlineEl = doc.querySelector('[itemprop="headline"], h1');
        return {
          title: headlineEl?.textContent?.trim() || doc.title || undefined,
          contentMarkdown: md,
        };
      }
    }
  } catch {}
  return null;
}

/**
 * Extracts full article content from Next.js SSR hydration state (<script id="__NEXT_DATA__">)
 * when sites render a gated teaser or client-hydrated shell in the HTML body.
 */
function extractNextDataArticle(
  doc: Document
): { title?: string; contentMarkdown?: string } | null {
  try {
    const nextScript = doc.querySelector("script#__NEXT_DATA__");
    if (!nextScript || !nextScript.textContent) return null;
    const data = JSON.parse(nextScript.textContent);
    const pageProps = data?.props?.pageProps;
    if (!pageProps || typeof pageProps !== "object") return null;

    let bestBody = "";
    let bestTitle: string | undefined;

    const bodyKeys = new Set([
      "body",
      "bodyHtml",
      "content",
      "contentHtml",
      "articleBody",
      "rawHtml",
      "html",
      "markdown",
      "text",
    ]);

    const walk = (node: any, depth = 0) => {
      if (!node || typeof node !== "object" || depth > 7) return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item, depth + 1);
        return;
      }

      if (typeof node.title === "string" && node.title.length > 10 && !bestTitle) {
        bestTitle = node.title;
      } else if (typeof node.headline === "string" && node.headline.length > 10 && !bestTitle) {
        bestTitle = node.headline;
      }

      for (const [k, v] of Object.entries(node)) {
        if (bodyKeys.has(k) && typeof v === "string" && v.trim().length > bestBody.length) {
          // Avoid picking up raw CSS/JS bundles
          if (!v.includes("function(") && !v.includes("{margin:")) {
            bestBody = v.trim();
          }
        } else if (typeof v === "object" && v !== null) {
          walk(v, depth + 1);
        }
      }
    };

    walk(pageProps);

    if (bestBody.length > 600) {
      return {
        title: bestTitle,
        contentMarkdown: formatStructuredBodyToMarkdown(bestBody),
      };
    }
  } catch {}
  return null;
}

/**
 * Discovers an AMP HTML (<link rel="amphtml">) URL from the document head, or constructs
 * a candidate /amp/ URL for publishers known to serve un-gated AMP endpoints (e.g. BleepingComputer).
 */
function discoverAmpUrl(doc: Document | null, targetUrl: string): string | null {
  try {
    if (doc) {
      const ampLink = doc.querySelector('link[rel="amphtml"]')?.getAttribute("href");
      if (ampLink) {
        const resolved = new URL(ampLink, targetUrl).toString();
        validateSafeUrl(resolved);
        return resolved;
      }
    }
    const parsed = new URL(targetUrl);
    if (
      !parsed.pathname.endsWith("/amp/") &&
      !parsed.pathname.endsWith("/amp") &&
      (parsed.hostname.includes("bleepingcomputer.com") ||
        parsed.hostname.includes("thehackernews.com") ||
        parsed.hostname.includes("darkreading.com") ||
        parsed.hostname.includes("securityweek.com"))
    ) {
      const candidate = `${targetUrl.replace(/\/?$/, "/")}amp/`;
      validateSafeUrl(candidate);
      return candidate;
    }
  } catch {}
  return null;
}

/**
 * Fetches and parses an AMP HTML version of the article. AMP pages are lightweight,
 * structured with clean semantic body markup optimized for mobile devices and search indexing.
 */
async function fetchViaAmpHtml(
  ampUrl: string,
  originalUrl: string
): Promise<ExtractedArticle | null> {
  try {
    validateSafeUrl(ampUrl);
    const res = await fetchWithBrowserProfile(ampUrl, 12000);
    if (!res || !res.ok) return null;

    const ampHtml = await res.text();
    if (!ampHtml || ampHtml.length < 300) return null;

    const ampDom = new JSDOM(ampHtml, { url: originalUrl });
    const ampDoc = ampDom.window.document;

    // Check JSON-LD inside AMP page first if available
    const ampJsonLd = extractJsonLdArticle(ampDoc);

    // Convert <amp-img> elements into standard <img> elements so Readability and Turndown preserve images
    ampDoc.querySelectorAll("amp-img").forEach((ampImg) => {
      const src = ampImg.getAttribute("src");
      if (src) {
        const img = ampDoc.createElement("img");
        img.setAttribute("src", src);
        const alt = ampImg.getAttribute("alt");
        if (alt) img.setAttribute("alt", alt);
        ampImg.replaceWith(img);
      }
    });

    // Remove AMP-specific clutter tags
    ampDoc
      .querySelectorAll(
        "amp-ad, amp-embed, amp-analytics, amp-pixel, amp-sidebar, amp-social-share, amp-next-page, amp-user-notification, script, style, header, nav, footer"
      )
      .forEach((el) => el.remove());

    const reader = new Readability(ampDoc);
    const article = reader.parse();
    const textLen = (article?.textContent || "").trim().length;

    if (
      article &&
      article.content &&
      textLen > 400 &&
      !isChallengeOrCaptcha(article.title, article.textContent) &&
      !isStubOrBlocked(article.title, article.textContent, textLen, originalUrl)
    ) {
      const contentMarkdown = cleanArticleMarkdown(
        turndown.turndown(article.content),
        article.title
      );
      const contentHtml = cleanArticleHtml(article.content, article.title);
      if (contentMarkdown.length > 200) {
        return {
          title: article.title || ampDoc.title || "Untitled",
          byline: article.byline || undefined,
          excerpt: article.excerpt || contentMarkdown.slice(0, 300),
          contentMarkdown,
          contentHtml,
          siteName: article.siteName || undefined,
          publishedTime: article.publishedTime || undefined,
        };
      }
    }

    if (ampJsonLd && ampJsonLd.contentMarkdown && ampJsonLd.contentMarkdown.length > 600) {
      const cleanedMd = cleanArticleMarkdown(ampJsonLd.contentMarkdown, ampJsonLd.title);
      const parsedHtml = await marked.parse(cleanedMd);
      return {
        title: ampJsonLd.title || ampDoc.title || "Untitled",
        excerpt: cleanedMd.slice(0, 300),
        contentMarkdown: cleanedMd,
        contentHtml: cleanArticleHtml(parsedHtml, ampJsonLd.title),
      };
    }
  } catch {}
  return null;
}

/**
 * Queries the WordPress REST API (/wp-json/wp/v2/posts?slug=<slug>) for sites running WordPress.
 * Retrieves canonical post objects with structured un-gated article HTML.
 */
async function fetchViaWordPressApi(targetUrl: string): Promise<ExtractedArticle | null> {
  try {
    const parsed = new URL(targetUrl);
    const segments = parsed.pathname
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => s !== "amp" && !/^\d+$/.test(s) && !/\.html?$/i.test(s));

    const lastSegment = segments[segments.length - 1];
    if (!lastSegment || lastSegment.length < 4) return null;

    const wpApiUrl = `${parsed.origin}/wp-json/wp/v2/posts?slug=${encodeURIComponent(lastSegment)}`;
    validateSafeUrl(wpApiUrl);

    const res = await fetch(wpApiUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("json")) return null;

    const posts = await res.json();
    if (!Array.isArray(posts) || posts.length === 0) return null;

    const post = posts[0];
    const renderedHtml = post?.content?.rendered;
    if (typeof renderedHtml !== "string" || renderedHtml.trim().length < 600) return null;

    const rawTitle = post?.title?.rendered
      ? new JSDOM(
          `<!DOCTYPE html><body>${post.title.rendered}</body>`
        ).window.document.body.textContent?.trim() || "Article"
      : "Article";

    const contentMarkdown = cleanArticleMarkdown(turndown.turndown(renderedHtml), rawTitle);
    const contentHtml = cleanArticleHtml(renderedHtml, rawTitle);

    if (
      contentMarkdown.length < 300 ||
      isChallengeOrCaptcha(rawTitle, contentMarkdown) ||
      isStubOrBlocked(rawTitle, contentMarkdown, contentMarkdown.length, targetUrl)
    ) {
      return null;
    }

    return {
      title: rawTitle,
      excerpt: contentMarkdown.slice(0, 300),
      contentMarkdown,
      contentHtml,
      publishedTime: post?.date_gmt || post?.date || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Negotiates native Markdown directly from the origin (e.g., Cloudflare Markdown for Agents
 * via `Accept: text/markdown`).
 */
async function fetchViaMarkdownNegotiation(targetUrl: string): Promise<ExtractedArticle | null> {
  try {
    validateSafeUrl(targetUrl);
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        Accept: "text/markdown, text/x-markdown;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("markdown")) return null;

    const rawMd = await res.text();
    if (!rawMd || rawMd.trim().length < 400) return null;

    const headingMatch = rawMd.match(/^#\s+(.+)$/m);
    const title = headingMatch ? headingMatch[1].trim() : "Article";
    const cleanedMarkdown = cleanArticleMarkdown(rawMd, title);

    if (
      cleanedMarkdown.length < 300 ||
      isChallengeOrCaptcha(title, cleanedMarkdown) ||
      isStubOrBlocked(title, cleanedMarkdown, cleanedMarkdown.length, targetUrl)
    ) {
      return null;
    }

    const parsedHtml = await marked.parse(cleanedMarkdown);
    return {
      title,
      excerpt: cleanedMarkdown.slice(0, 300),
      contentMarkdown: cleanedMarkdown,
      contentHtml: cleanArticleHtml(parsedHtml, title),
    };
  } catch {
    return null;
  }
}

/**
 * Fallback to Jina Reader (r.jina.ai) when direct origin, AMP, and WP-JSON fail or hit WAF blocks.
 */
async function fetchViaJinaReader(targetUrl: string): Promise<ExtractedArticle | null> {
  try {
    const jinaUrl = `https://r.jina.ai/${targetUrl}`;
    const response = await fetch(jinaUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        "X-Return-Format": "markdown",
        Accept: "text/plain, text/markdown",
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) return null;

    const rawText = await response.text();
    if (!rawText || rawText.trim().length < 100) return null;

    const titleMatch = rawText.match(/^Title:\s*(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : "Article";

    // Clean markdown: strip Jina headers, cookie banners, navigation, and tail boilerplate
    const cleanedMarkdown = cleanArticleMarkdown(rawText, title);

    // Guard: If Jina returned a CAPTCHA, Cloudflare challenge notice, or empty stub, reject it
    if (
      cleanedMarkdown.length < 100 ||
      isChallengeOrCaptcha(title, cleanedMarkdown) ||
      isStubOrBlocked(title, cleanedMarkdown, cleanedMarkdown.length, targetUrl)
    ) {
      return null;
    }

    // Render rich HTML using marked for high-fidelity typography, code, lists, and images
    const parsedHtml = await marked.parse(cleanedMarkdown);

    return {
      title,
      excerpt: cleanedMarkdown.slice(0, 300),
      contentMarkdown: cleanedMarkdown,
      contentHtml: cleanArticleHtml(parsedHtml, title),
    };
  } catch {
    return null;
  }
}

/**
 * Executes the ordered fallback cascade when direct HTML Readability is blocked, truncated, or fails.
 */
async function runFallbackCascade(
  targetUrl: string,
  fetchUrl: string,
  preExtractedStructured: { title?: string; contentMarkdown?: string } | null,
  discoveredAmpUrl: string | null,
  fallbackTitle?: string,
  detectedVideoId?: string
): Promise<ExtractedArticle | null> {
  // 1. Pre-Emulation Structured Data (JSON-LD / Microdata / Next.js __NEXT_DATA__) from already-fetched DOM
  if (
    preExtractedStructured &&
    preExtractedStructured.contentMarkdown &&
    preExtractedStructured.contentMarkdown.length > 600
  ) {
    const title = preExtractedStructured.title || fallbackTitle || "Untitled";
    const cleanedMd = cleanArticleMarkdown(preExtractedStructured.contentMarkdown, title);
    if (cleanedMd.length > 200 && !isChallengeOrCaptcha(title, cleanedMd)) {
      const parsedHtml = await marked.parse(cleanedMd);
      return {
        title,
        excerpt: cleanedMd.slice(0, 300),
        contentMarkdown: cleanedMd,
        contentHtml: cleanArticleHtml(parsedHtml, title),
        videoId: detectedVideoId,
      };
    }
  }

  // 2. AMP HTML (<link rel="amphtml"> or /amp/ endpoint) — canonical mobile-optimized article layout
  const ampUrl = discoveredAmpUrl || discoverAmpUrl(null, targetUrl);
  if (ampUrl && ampUrl !== targetUrl && ampUrl !== fetchUrl) {
    const ampResult = await fetchViaAmpHtml(ampUrl, targetUrl);
    if (ampResult) return { ...ampResult, videoId: ampResult.videoId || detectedVideoId };
  }

  // 3. WordPress REST API (/wp-json/wp/v2/posts?slug=...) — queries structured post endpoint
  const wpResult = await fetchViaWordPressApi(targetUrl);
  if (wpResult) return { ...wpResult, videoId: wpResult.videoId || detectedVideoId };

  // 4. Native Markdown Content Negotiation (Cloudflare Markdown for Agents)
  const mdNegotiated = await fetchViaMarkdownNegotiation(targetUrl);
  if (mdNegotiated) return { ...mdNegotiated, videoId: mdNegotiated.videoId || detectedVideoId };

  // 5. Jina Reader (r.jina.ai)
  const jinaResult = await fetchViaJinaReader(fetchUrl);
  if (jinaResult) return { ...jinaResult, videoId: jinaResult.videoId || detectedVideoId };

  // 6. Wayback Machine (Internet Archive availability API + /web/2/ latest capture)
  const waybackResult = await fetchViaWaybackMachine(targetUrl);
  if (waybackResult) return { ...waybackResult, videoId: waybackResult.videoId || detectedVideoId };

  return null;
}

export async function extractReadableContent(targetUrl: string): Promise<ExtractedArticle | null> {
  // Validate URL and guard against SSRF
  validateSafeUrl(targetUrl);

  // Normalization for known multi-page publishers (e.g. Ars Technica single-page view)
  const fetchUrl =
    targetUrl.includes("arstechnica.com") && !targetUrl.includes("view=all")
      ? `${targetUrl}${targetUrl.includes("?") ? "&" : "?"}view=all`
      : targetUrl;

  const response = await fetchWithBrowserProfile(fetchUrl, 15000);

  // If direct origin fetch failed or returned HTTP 403/429/503 across both browser profiles, run fallback cascade
  if (!response || !response.ok) {
    const cascaded = await runFallbackCascade(targetUrl, fetchUrl, null, null);
    if (cascaded) return cascaded;
    if (response && !response.ok) {
      throw new Error(`Failed to fetch article: HTTP ${response.status} ${response.statusText}`);
    }
    return null;
  }

  const rawHtml = await response.text();
  const html = rawHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gis, "");
  const dom = new JSDOM(html, { url: targetUrl });
  const doc = dom.window.document;

  // Step 1: Pre-DOM-strip extraction of structured payloads, AMP link, and pagination link (before <script>, <nav>, and <head> tags are modified)
  const preExtractedStructured = extractJsonLdArticle(doc) || extractNextDataArticle(doc);
  const discoveredAmpUrl = discoverAmpUrl(doc, targetUrl);
  const discoveredNextHref = doc
    .querySelector("link[rel='next'], a[rel='next']")
    ?.getAttribute("href");

  // Step 2: Declarative overlay & modal suppression
  const overlaySelectors = [
    "[class*='modal' i]",
    "[id*='modal' i]",
    "[class*='consent' i]",
    "[id*='consent' i]",
    "[class*='cookie' i]",
    "[id*='cookie' i]",
    "[class*='paywall' i]",
    "[id*='paywall' i]",
    "[class*='overlay' i]",
    "[id*='overlay' i]",
    "[class*='backdrop' i]",
    "[id*='backdrop' i]",
    "[class*='popup' i]",
    "[id*='popup' i]",
    "[aria-modal='true']",
  ];
  for (const selector of overlaySelectors) {
    try {
      doc.querySelectorAll(selector).forEach((el) => {
        if (
          el.tagName.toLowerCase() !== "main" &&
          el.tagName.toLowerCase() !== "article" &&
          !el.querySelector("article")
        ) {
          el.remove();
        }
      });
    } catch {}
  }

  // Pre-clean DOM: strip headers, navs, footers, cookie banners, consent SDKs, and skip links
  const boilerplateSelectors = [
    "header",
    "nav",
    "footer",
    "aside",
    "form",
    "[role='banner']",
    "[role='navigation']",
    "[role='dialog']",
    "[role='alertdialog']",
    "[id*='cookie' i]",
    "[class*='cookie' i]",
    "[id*='consent' i]",
    "[class*='consent' i]",
    "[id*='onetrust' i]",
    "[class*='onetrust' i]",
    "[id*='didomi' i]",
    "[class*='didomi' i]",
    "[id*='ethyca' i]",
    "[class*='ethyca' i]",
    "[id*='privacy-banner' i]",
    "[class*='privacy-banner' i]",
    "[id*='gdpr' i]",
    "[class*='gdpr' i]",
    "[id*='qc-cmp' i]",
    "[class*='qc-cmp' i]",
    "[id*='sp_message_container' i]",
    "[class*='sp_message_container' i]",
    "[class*='trustarc' i]",
    "[id*='trustarc' i]",
    "[class*='cmp-']",
    "[aria-label*='cookie' i]",
    "[aria-label*='consent' i]",
    ".skip-link",
    "a[href*='#main']",
    "a[href*='#content']",
    "[class*='subscription-widget']",
    "[class*='subscribe-card']",
    "[class*='newsletter-signup']",
    "[class*='newsletter-form']",
    "[class*='subscribe-form']",
    "[id*='subscribe']",
    "[id*='newsletter']",
    "[class*='share-bar']",
    "[class*='social-share']",
    "[class*='sharing-']",
    "[class*='comment-bubble']",
    "[class*='comments-section']",
    "[id*='comments']",
    // Navigation menus & site headers
    ".site-header",
    ".page-header",
    ".top-header",
    ".header-inner",
    ".header-navigation",
    ".site-navigation",
    ".main-navigation",
    ".primary-navigation",
    ".top-navigation",
    ".nav-container",
    ".navbar",
    ".nav-menu",
    ".site-menu",
    ".menu-primary",
    ".menu-main",
    ".menu-header",
    ".site-branding",
    ".site-logo",
    ".custom-logo-link",
    ".custom-logo",
    ".logo-wrapper",
    ".header-wrapper",
    ".c-nav",
    ".c-header",
    ".wp-block-navigation",
    ".wp-block-site-title",
    ".wp-block-site-logo",
    // Breadcrumbs
    ".breadcrumbs",
    ".breadcrumb",
    ".breadcrumb-nav",
    ".rank-math-breadcrumb",
    ".yoast-breadcrumb",
    // Author avatars & bio cards
    ".author-avatar",
    ".author-card-avatar",
    ".author-image",
    ".post-footer",
    ".article-footer",
    ".entry-footer",
    // Cyber news, Atlantic Council & Dark Reading boilerplates
    ".bc_author_info",
    ".cz-related-article-wrapp",
    ".related-article",
    ".article-tags",
    ".article-meta",
    ".deal-block",
    ".post-sidebar",
    ".social-networks",
    ".newsletter-signup-box",
    // Atlantic Council & Lowy Institute
    ".gta-site-nav",
    ".gta-home2021-banner",
    ".ac-site-header",
    ".ac-site-nav",
    ".ac-expert-card",
    ".ac-post-related",
    ".article-sidebar",
    ".article-meta-wrapper",
    ".donate-banner",
    ".post-terms",
    ".the-informer",
    ".newsletter-wrapper",
    // Dark Reading
    ".article-tools",
    ".author-bio-container",
    ".more-from-author",
    ".social-sharing",
    ".featured-article-callout",
    ".trending-bar",
    // The Hacker News
    ".pop-posts",
    ".popular-posts",
    ".related-posts",
    ".comment-container",
    ".post-share",
    // BleepingComputer bylines & headers
    ".bc_byline",
    ".bc_header",
    ".bc_top",
    ".cz-author-date",
    ".article-date",
    // Video ads & player embeds
    ".ad-video",
    "[class*='video-ad']",
    "[id*='video-ad']",
    "[class*='connatix']",
    "[id*='connatix']",
    "[class*='primis']",
    "[id*='primis']",
    "[class*='aniview']",
    "[id*='aniview']",
    ".ad-wrapper",
    // Publisher clutter, share modals, and overlay prompts
    ".article-header-actions",
    ".article-tools",
    ".article-share",
    ".share-modal",
    ".fa-newsletter-signup",
    ".paywall-barrier",
    ".meter-banner",
    "[class*='newsletter-tout']",
    "[class*='gate-barrier']",
    // Marginal Revolution sidebar & footer widgets
    "#sidebar",
    ".sidebar",
    ".widget",
    ".widget_feedblitz",
    ".contact-us",
    ".our-books",
    ".translation-flags",
    "#gtranslate_wrapper",
    ".gtranslate_wrapper",
    ".menu-footer",
    "[class*='widget_']",
    "link[rel='stylesheet']",
    "style",
  ];

  // Pre-strip scripts, noscripts, and non-youtube iframes
  try {
    const scripts = doc.querySelectorAll("script, noscript, style, iframe:not([src*='youtube'])");
    scripts.forEach((el) => el.remove());
  } catch {}

  for (const selector of boilerplateSelectors) {
    try {
      const elements = doc.querySelectorAll(selector);
      elements.forEach((el) => {
        const tag = el.tagName.toLowerCase();
        if (
          tag === "main" ||
          tag === "article" ||
          el.querySelector("article") ||
          el.querySelector("main") ||
          ((el.textContent || "").trim().length > 600 &&
            tag !== "footer" &&
            tag !== "aside" &&
            !el.className.toLowerCase().includes("footer"))
        ) {
          return;
        }
        el.remove();
      });
    } catch {}
  }

  // Check if article or document embeds a YouTube video
  const rawBodyHtml = doc.body?.innerHTML || "";
  const ytMatch = rawBodyHtml.match(
    /(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  const detectedVideoId = ytMatch ? ytMatch[1] : undefined;

  // Multi-part layout stitching (e.g. Ars Technica's .post-content.post-content-double blocks):
  // When an article is split across multiple separate content containers separated by ad/grid wrappers,
  // combine them into a single unified article element so Readability processes the complete story.
  const multiContainers = doc.querySelectorAll(".post-content.post-content-double, .post-content");
  if (multiContainers.length > 1) {
    const combinedArticle = doc.createElement("article");
    combinedArticle.className = "synapse-combined-article";
    multiContainers.forEach((container) => {
      combinedArticle.appendChild(container.cloneNode(true));
      container.remove();
    });
    const main = doc.querySelector("main") || doc.body;
    if (main) {
      main.prepend(combinedArticle);
    }
  }

  const reader = new Readability(doc);
  const article = reader.parse();

  const rawTextLength = (article?.textContent || "").trim().length;
  const isStub = isStubOrBlocked(
    article?.title,
    article?.textContent || article?.content,
    rawTextLength,
    targetUrl
  );

  // If Readability got stripped, blocked by JS, or returned a short stub/cookie wall, run progressive fallback cascade
  if (
    !article ||
    !article.content ||
    isStub ||
    isChallengeOrCaptcha(article.title, article.content)
  ) {
    const cascaded = await runFallbackCascade(
      targetUrl,
      fetchUrl,
      preExtractedStructured,
      discoveredAmpUrl,
      article?.title || dom.window.document.title || "Untitled",
      detectedVideoId
    );
    if (cascaded) return cascaded;

    if (!article || !article.content || rawTextLength < 50) return null;
  }

  let contentMarkdown = cleanArticleMarkdown(
    turndown.turndown(article.content || ""),
    article.title
  );
  let contentHtml = cleanArticleHtml(article.content || "", article.title);

  // If cleanArticleMarkdown left an empty shell (< 500 chars) or stripped all body paragraphs because
  // the article was incomplete/truncated, run the fallback cascade
  if (contentMarkdown.length < 500 || !/[a-zA-Z]{3,}[\s\S]{100,}/.test(contentMarkdown)) {
    const cascaded = await runFallbackCascade(
      targetUrl,
      fetchUrl,
      preExtractedStructured,
      discoveredAmpUrl,
      article?.title || dom.window.document.title || "Untitled",
      detectedVideoId
    );
    if (cascaded) return cascaded;
  }

  // Multi-page stitching: Check if article has canonical rel="next" continuation link
  try {
    const nextHref =
      discoveredNextHref ||
      doc.querySelector("link[rel='next'], a[rel='next']")?.getAttribute("href");
    if (nextHref && !targetUrl.includes("view=all") && !targetUrl.includes("page=")) {
      const nextUrl = new URL(nextHref, targetUrl).toString();
      if (new URL(nextUrl).origin === new URL(targetUrl).origin) {
        validateSafeUrl(nextUrl);
        const nextRes = await fetchWithBrowserProfile(nextUrl, 10000);
        if (nextRes && nextRes.ok) {
          const nextHtml = await nextRes.text();
          const nextDom = new JSDOM(nextHtml, { url: nextUrl });
          const nextDoc = nextDom.window.document;
          const nextReader = new Readability(nextDoc);
          const nextArticle = nextReader.parse();
          if (
            nextArticle &&
            nextArticle.content &&
            (nextArticle.textContent || "").trim().length > 300
          ) {
            const nextMd = cleanArticleMarkdown(
              turndown.turndown(nextArticle.content),
              nextArticle.title
            );
            contentMarkdown += `\n\n---\n\n### Continued (Page 2)\n\n${nextMd}`;
            contentHtml += `<hr class="my-8 border-slate-300 dark:border-slate-700"/><div class="mt-6">${cleanArticleHtml(nextArticle.content, nextArticle.title)}</div>`;
          }
        }
      }
    }
  } catch {}

  return {
    title: article.title || dom.window.document.title || "Untitled",
    byline: article.byline || undefined,
    excerpt: article.excerpt || undefined,
    contentHtml,
    contentMarkdown,
    siteName: article.siteName || undefined,
    publishedTime: article.publishedTime || undefined,
    videoId: detectedVideoId,
  };
}
