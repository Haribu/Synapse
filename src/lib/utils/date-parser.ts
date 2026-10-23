/**
 * Robust date parser for syndication feeds (RSS 2.0, Atom, Dublin Core, RDF).
 * Extracts published date from any tag candidate, handles XML objects with '#text',
 * standardizes date formats, and protects against defaulting to sync time.
 */
export function parseFeedPublishedDate(...candidates: any[]): Date | null {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue;

    let dateStr: string | null = null;

    if (candidate instanceof Date && !isNaN(candidate.getTime())) {
      return candidate;
    }

    if (typeof candidate === "number" && !isNaN(candidate)) {
      // Unix timestamp in seconds vs milliseconds
      const ms = candidate < 10000000000 ? candidate * 1000 : candidate;
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d;
    }

    if (typeof candidate === "string") {
      dateStr = candidate.trim();
    } else if (typeof candidate === "object") {
      if (typeof candidate["#text"] === "string") {
        dateStr = candidate["#text"].trim();
      } else if (typeof candidate.text === "string") {
        dateStr = candidate.text.trim();
      } else if (typeof candidate._ === "string") {
        dateStr = candidate._.trim();
      }
    }

    if (!dateStr || dateStr.length === 0) continue;

    // 1. Direct standard Date parsing
    let parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      // Reject dates impossibly far in future (e.g. > 7 days ahead)
      if (parsed.getTime() <= Date.now() + 7 * 86400 * 1000) {
        return parsed;
      }
    }

    // 2. Clean common RSS date oddities: multiple spaces, timezone quirks
    const normalized = dateStr
      .replace(/\s+/g, " ")
      .replace(/GMT\s*\+00:?00/gi, "GMT")
      .replace(/UTC\s*\+00:?00/gi, "UTC");

    parsed = new Date(normalized);
    if (!isNaN(parsed.getTime())) {
      if (parsed.getTime() <= Date.now() + 7 * 86400 * 1000) {
        return parsed;
      }
    }

    // 3. Regex match ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss...)
    const isoMatch = dateStr.match(
      /\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?/
    );
    if (isoMatch) {
      parsed = new Date(isoMatch[0]);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    // 4. Regex match RFC 822 / 1123 (e.g. "29 Oct 2023", "29 Oct 2023 14:00:00")
    const rfcMatch = dateStr.match(/\d{1,2}\s+[A-Za-z]{3}\s+\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?/);
    if (rfcMatch) {
      parsed = new Date(rfcMatch[0]);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  return null;
}
