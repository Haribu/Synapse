const NAMED_ENTITIES: Record<string, string> = {
  "&trade;": "™",
  "&reg;": "®",
  "&copy;": "©",
  "&quot;": '"',
  "&apos;": "'",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
  "&lsquo;": "‘",
  "&rsquo;": "’",
  "&ldquo;": "“",
  "&rdquo;": "”",
  "&bull;": "•",
  "&middot;": "·",
  "&pound;": "£",
  "&euro;": "€",
  "&cent;": "¢",
  "&yen;": "¥",
  "&sect;": "§",
  "&deg;": "°",
  "&plusmn;": "±",
  "&frac12;": "½",
  "&frac14;": "¼",
  "&frac34;": "¾",
  "&times;": "×",
  "&divide;": "÷",
};

/**
 * Utility to decode common HTML character entities from RSS and XML syndication feeds.
 */
export function decodeHtmlEntities(str?: any): string {
  if (!str) return "";
  let s = typeof str === "string" ? str : String(str?.["#text"] ?? str?.text ?? str);

  // 1. Replace known named entities
  for (const [entity, replacement] of Object.entries(NAMED_ENTITIES)) {
    if (s.includes(entity)) {
      s = s.replaceAll(entity, replacement);
    }
  }

  // Case-insensitive variants for common uppercase/mixed-case entities
  s = s
    .replace(/&trade;/gi, "™")
    .replace(/&copy;/gi, "©")
    .replace(/&reg;/gi, "®")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");

  // 2. Hex numeric character references (e.g. &#x27; or &#x00A0;)
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    try {
      return String.fromCodePoint(parseInt(hex, 16));
    } catch {
      return _;
    }
  });

  // 3. Decimal numeric character references (e.g. &#8217; or &#39;)
  s = s.replace(/&#(\d+);/g, (_, dec) => {
    try {
      return String.fromCodePoint(parseInt(dec, 10));
    } catch {
      return _;
    }
  });

  return s;
}
