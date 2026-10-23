/**
 * Detects whether an article is sponsored or vendor-promoted content.
 * Checks title patterns, snippet/lead text, author name, and metadata tags.
 */
export function isSponsoredContent(item?: {
  title?: string | null;
  snippet?: string | null;
  author?: string | null;
  url?: string | null;
}): boolean {
  if (!item) return false;

  const title = (item.title || "").trim();
  const snippet = (item.snippet || "").trim();
  const author = (item.author || "").trim();

  // 1. Author line matches
  if (/^(?:sponsor(?:ed)?|partner content|advertorial|paid post|promoted)\b/i.test(author)) {
    return true;
  }

  // 2. Title patterns
  const titlePatterns = [
    /^\[?(?:sponsored|promoted|partner content|advertorial|paid post|partner post)\]?:?\s+/i,
    /\b(?:sponsored by|presented by|brought to you by)\b/i,
    /\bpartner perspectives:?\b/i,
    /\bpartner spotlight:?\b/i,
    /\b(?:sponsored content|sponsored article)\b/i,
    // Webinars & Virtual Events
    /\bwebinars?\b/i,
    /\bvirtual events?\b/i,
    /\b(?:watch|attend|join|register for)\s+[\w\s-]{0,25}webinar\b/i,
    /\b(?:upcoming|on-demand|live|expert)\s+webinar\b/i,
    /\bdemo days?\b/i,
    // Product Walkthroughs, Demos & Collateral
    /^\[?(?:product walkthrough|product demo|product tour|deep dive demo|solution brief|buyer's guide)\]?:?\s+/i,
    /\b(?:product walkthrough|interactive demo|request a demo|schedule a demo)\b/i,
    /^\[?(?:whitepaper|e-?book|datasheet)\]?:?\s+/i,
  ];

  if (titlePatterns.some((pattern) => pattern.test(title))) {
    return true;
  }

  // 3. Snippet / Lead text patterns
  const snippetPatterns = [
    /^(?:sponsored|promoted|partner content|advertorial):?\s+/i,
    /^(?:this (?:article|post|content) is sponsored by|sponsored by|presented by)\b/i,
    /\bthis content was produced by .*? in partnership with\b/i,
    /\bpaid (?:partnership|promotion|sponsorship)\b/i,
    /\ba message from our sponsor\b/i,
    /\bpartner content\b/i,
    // Webinar & Demo registration snippets
    /\b(?:register now to (?:join|attend|learn)|save your seat|join us for (?:this|an upcoming) webinar|in this webinar, you(?:'ll| will) learn)\b/i,
    /\b(?:schedule a (?:personalized )?demo|see (?:the platform|it) in action|request a demo today)\b/i,
  ];

  if (snippetPatterns.some((pattern) => pattern.test(snippet))) {
    return true;
  }

  return false;
}
