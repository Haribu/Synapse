import { decodeHtmlEntities } from "./decode";

/**
 * Detects blocks of CSV data (3+ consecutive lines with equal column counts >= 2)
 * and transforms them into clean GitHub-Flavored Markdown tables.
 */
export function convertCsvToMarkdownTable(text: string): string {
  if (!text || !text.includes(",")) return text;

  const lines = text.split("\n");
  const result: string[] = [];
  let csvBuffer: string[][] = [];

  const flushBuffer = () => {
    if (csvBuffer.length >= 3) {
      const header = csvBuffer[0];
      const separator = header.map(() => "---");
      result.push("");
      result.push(`| ${header.join(" | ")} |`);
      result.push(`| ${separator.join(" | ")} |`);
      for (let i = 1; i < csvBuffer.length; i++) {
        result.push(`| ${csvBuffer[i].join(" | ")} |`);
      }
      result.push("");
    } else {
      for (const row of csvBuffer) {
        result.push(row.join(", "));
      }
    }
    csvBuffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed &&
      (trimmed.includes(",") || trimmed.includes("\t")) &&
      !trimmed.startsWith("|") &&
      !trimmed.startsWith("#")
    ) {
      const delimiter = trimmed.includes("\t") ? "\t" : ",";
      const cells = trimmed.split(delimiter).map((c) => c.replace(/^["']|["']$/g, "").trim());

      if (cells.length >= 2) {
        if (csvBuffer.length === 0) {
          csvBuffer.push(cells);
          continue;
        } else if (Math.abs(cells.length - csvBuffer[0].length) <= 1) {
          while (cells.length < csvBuffer[0].length) cells.push("");
          csvBuffer.push(cells.slice(0, csvBuffer[0].length));
          continue;
        }
      }
    }

    if (csvBuffer.length > 0) {
      flushBuffer();
    }
    result.push(line);
  }

  if (csvBuffer.length > 0) {
    flushBuffer();
  }

  return result.join("\n");
}

/**
 * Strips cookie banners, tracker consent dialogs, header navigation,
 * skip links, social share buttons, and tail recommendation boilerplate
 * from article markdown.
 */
export function cleanArticleMarkdown(rawMarkdown?: string | null, expectedTitle?: string): string {
  if (!rawMarkdown || typeof rawMarkdown !== "string") return "";

  let md = convertCsvToMarkdownTable(rawMarkdown);

  // 1. Strip Jina Reader header metadata lines
  md = md
    .replace(/^Title:\s*.*$/gim, "")
    .replace(/^URL Source:\s*.*$/gim, "")
    .replace(/^Published Time:\s*.*$/gim, "")
    .replace(/^Author:\s*.*$/gim, "")
    .replace(/^Description:\s*.*$/gim, "")
    .replace(/^Markdown Content:\s*$/gim, "");

  // 1b. Strip leaked inline CSS rule blocks (e.g. WordPress Kadence Blocks .kt-inside-inner-col{...}, .kadence-column*{...}, @media{...})
  md = md.replace(/@media\s+[^{]{1,200}\{(?:[^{}]*\{[^}]*\})*\s*\}/gi, "");
  md = md.replace(
    /\.[a-zA-Z_-][a-zA-Z0-9_\\-]*[\s>+~,:.\[\]="a-zA-Z0-9_\\-]{0,120}\{[a-zA-Z-]+\s*:[^}]{1,500}\}/g,
    ""
  );

  // 2. Strip tracking pixels, broken blob URLs, and linked blob images
  md = md.replace(
    /\[?!\[.*?\]\((?:blob:[^)]+|https?:\/\/(?:t\.co|analytics\.twitter\.com|bat\.bing\.com|ad\.|doubleclick|google-analytics|stats\.wp\.com|pixel\.).*?)\)\]?(?:\([^)]*\))?/gi,
    ""
  );

  // 2b. Strip comment bubble icons, Ars Technica comment badges, and comment count links
  md = md.replace(
    /\[?\s*!\[.*?\]\([^)]*(?:comment-bubble|comments?-icon|comment\.png|comment-count)[^)]*\)\s*\]?(?:\([^)]*\))?/gi,
    ""
  );
  md = md.replace(/\[\s*(?:\d+\s+)?Comments?\s*\]\([^)]*#comments?[^)]*\)/gi, "");
  md = md.replace(/^\[?\d+\s+Comments?\]?\(https?:\/\/[^\)]+#comments?\)$/gim, "");

  // 2c. Strip visual ad units, banner promos, and affiliate deal boxes
  md = md.replace(
    /(?:^|\n)#{1,6}\s*(?:Advertisement|Sponsored Stories|Around the Web|Promoted Links|Deal of the day)[\s\S]*?(?=\n\n#{1,6}|\n\n[A-Z0-9]|$)/gi,
    ""
  );
  md = md.replace(/(?:^|\n)\*+(?:Advertisement|Sponsored|Promoted)\*+(?:\n|$)/gi, "");
  md = md.replace(/(?:^|\n)\[?Advertisement\]?\s*\n+/gi, "\n");

  // 2d. Strip ghost/empty link anchors with no visible text: [](https://...) (preserve ![](...) empty-alt images!)
  md = md.replace(/(?<!!)\[\s*\]\([^\)]*\)/g, "");
  md = md.replace(/(?:^|\n)\s*!\s*(?=\n|$)/g, "\n");

  // 2e. Strip social subscriber and follower count chips/badges
  md = md.replace(/\[\s*(?:_\S*_\s*)?\d[\d,]*\s+(?:Subscribers|Followers)[^\]]*\]\([^\)]+\)/gi, "");

  // 2f. Strip in-content video ad units, "Skip Ad" prompts, and loading pods
  md = md.replace(
    /(?:^|\n)\s*\d+\/\d+\s*Skip Ad\s*Continue watching after the ad[\s\S]*?Visit Advertiser website\s*\[GO TO PAGE\]\([^\)]*\)(?:\s*\n+\[Video \d+\]\([^\)]*\))*/gi,
    "\n"
  );
  md = md.replace(/(?:^|\n)(?:\[Video \d+\]\([^\)]*\)\s*\n*)+/gi, "\n");

  // 3. Strip known Cookie / Tracker preferences blocks
  md = md.replace(
    /(?:Manage your tracker preferences|We use cookies and similar tracking technologies|Targeted advertising cookies and similar trackers|We value your privacy|This website uses cookies)[\s\S]*?(?:Consent powered by [^\n]+|Save\b|Accept all cookies|Reject all cookies|Cookie Policy)/gi,
    ""
  );

  // 4. Strip skip-to-content links
  md = md.replace(/\[Skip to (?:main )?content\]\([^)]+\)/gi, "");
  md = md.replace(/^Skip to (?:main )?content$/gim, "");

  // 4b. Strip Informa TechTarget & Dark Reading network brand navigation blocks & logos
  md = md.replace(
    /(?:!\[.*?\]\(.*?\)\s*)?Informa TechTarget[\s\S]*?(?:Application Security|Cybersecurity Topics|DARK READING\s*)+(?:\n\n|\n[A-Z0-9#])/gi,
    ""
  );
  md = md.replace(
    /(?:^|\n)(?:Informa TechTarget|Explore our brandsAn Informa TechTarget Publication|Dark Reading Resource LibraryBlack Hat NewsOmdia CybersecurityAdvertise|DARK READING\b)[\s\S]*?(?:Application Security|Related Topics|Cybersecurity Topics\b)/gi,
    ""
  );
  md = md.replace(/(?:^|\n)(?:Newsletter Sign-Up\s*)+/gi, "");
  md = md.replace(
    /(?:^|\n)Cybersecurity Topics\s*\n\s*Related Topics\s*\n\s*Application Security/gi,
    ""
  );
  md = md.replace(
    /!\[.*?\]\([^)]*(?:techtarget|darkreading|informa|site-logo|brand-logo|loader|target-logo)[^)]*\)/gi,
    ""
  );

  // 4c. Strip BleepingComputer top branding, menu, and "News / Featured / Latest" carousel (bounded to avoid eating article body)
  md = md.replace(
    /(?:^|\n)(?:\[?BLEEPINGCOMPUTER\]?\(?[^\)\n]*\)?)\s*\n+(?:News\s*\n+)?(?:Featured\s*\n+)?(?:Latest\s*\n+)?(?:!\[.*?\]\(.*?\)\s*\[.*?\]\(.*?\)\s*)+/gi,
    ""
  );
  md = md.replace(
    /(?:^|\n)BLEEPINGCOMPUTER\s*\n+(?:News\s*\n+)?(?:Featured\s*\n+)?(?:Latest\s*\n+)?[\s\S]{0,1500}?(?=(?:\n\s*By\b|\n\s*#{1,6}\s+\[?[A-Za-z]|\n\s*\*\*[A-Za-z]|\n\s*[A-Z][a-z]+ \d{1,2}, \d{4}))/gi,
    ""
  );
  md = md.replace(/(?:^|\n)News\s*\n+Featured\s*\n+Latest\s*\n+/gi, "\n");

  // 4d. Strip BleepingComputer raw author/date/time/comment count front matter (plain text or markdown heading/link/bullets)
  md = md.replace(
    /(?:^|\n)\s*By\s*\n+(?:#{1,6}\s+)?(?:\[?[A-Za-z\s\.-]+\]?\([^\)]+\)|[A-Za-z\s\.-]+)\s*\n+(?:(?:\*\s+)?(?:[A-Z][a-z]+ \d{1,2}, \d{4}|\d{1,2}:\d{2}\s*(?:AM|PM)|\[?\d+\]?(?:\([^\)]+\))?)\s*\n*)+/gi,
    "\n"
  );
  md = md.replace(
    /(?:^|\n)\s*By\s*\n+(?:#{1,6}\s+)?(?:\[?[A-Za-z\s\.-]+\]?\([^\)]+\)|[A-Za-z\s\.-]+)\s*\n+([A-Z][a-z]+ \d{1,2}, \d{4})\s*\n+/gi,
    "\n"
  );

  // 4e. Strip The Register top category slug (plain or linked) and REG AD markers
  md = md.replace(
    /^(?:\[?(?:Security|Offbeat|Systems|Dev|Data|Software|Hardware|AI(?:\s+and\s+ML|\s+&\s+ML)?|Cloud|Enterprise|On Prem|Bofh|Cyber)\]?(?:\(https?:\/\/[^\)]+\))?)\s*\n+(?=[A-Z0-9#\n])/gim,
    ""
  );
  md = md.replace(/(?:^|\n)\s*REG AD\s*(?:\n|$)/gi, "\n\n");

  // 4e-2. Strip BleepingComputer Jina reader navigation, breadcrumbs, tags, and footer comments
  if (md.includes("BleepingComputer") || md.includes("bleepingcomputer.com")) {
    md = md.replace(
      /^[\s\S]*?(?=\n\*\s+(?:\[Home\]\(https?:\/\/[^\)]*bleepingcomputer[^\)]*\)|\*\*?[A-Z][a-z]+[^\n]*\*\*?)\s*\n+\*\s+\[News\]|\n\s*By\s*\n+######\s*\[[A-Za-z\s\.-]+\]|\n!\[Image \d+:[^\]]*\]\(https?:\/\/www\.bleepstatic\.com\/content\/hl-images\/)/i,
      ""
    );
    md = md.replace(
      /^\*\s+\[Home\]\([^\)]+\)\s*\n+\*\s+\[News\]\([^\)]+\)\s*\n+\*\s+\[Security\]\([^\)]+\)\s*\n+\*\s+[^\n]+\n+/gi,
      ""
    );
    md = md.replace(
      /(?:^|\n)\s*#{1,6}\s*(?:Post a Comment|Reporter|Login|Follow us:|Main Sections|Popular Stories|S ponsor Posts)\b[\s\S]*$/gi,
      ""
    );
    md = md.replace(
      /(?:^|\n)(?:\*\s+\[[A-Za-z0-9\s-]+\]\(https?:\/\/[^\)]*bleepingcomputer\.com\/tag\/[^\)]*\)\s*\n*)+/gi,
      "\n"
    );
    md = md.replace(
      /(?:^|\n)#{1,6}\s*\[[A-Za-z\s\.-]+\]\(https?:\/\/[^\)]*bleepingcomputer\.com\/author\/[^\)]*\)[\s\S]*?(?=\n\n#{1,6}|\n\n[A-Z]|$)/gi,
      ""
    );
  }

  // 4f. Strip Dark Reading / Cyber portal bracketed or unbracketed byline card clutter
  md = md.replace(
    /(?:^|\n)\s*\[?\s*\n*\s*[A-Za-z\s\.-]+,\s*(?:Contributing Writer|Senior Editor|Associate Editor|Executive Editor|Features Editor|Managing Editor|Editor|Writer|Staff|Analyst|Reporter)[^\]\n]*\d{4}\s*\n*\s*\d+\s*Min Read\s*\n*\]?/gi,
    "\n"
  );

  // 4g. Strip Lowy Institute / The Interpreter newsletter subscriptions, topic tree, publication logos, and author/date/read-time toolbar
  md = md.replace(
    /(?:^|\n)(?:wsletters|Newsletters)[\s\S]*?(?:Subscribe to The Informer|The Informer)[\s\S]*?(?:Support us|\d+\s*min read\b)[\s\S]*?(?=\n\n|\n[#A-Z]|$)/gi,
    ""
  );
  md = md.replace(
    /(?:^|\n)(?:Topics\s*\n+Research\s*\n+Interactives\s*\n+The Interpreter|Support us\s*\n+[A-Za-z\s]+\s*\n+\d{1,2}\s+[A-Z][a-z]+\s+\d{4}\s+\d+\s+min read)[\s\S]*?(?=\n\n|\n[#A-Z]|$)/gi,
    ""
  );
  md = md.replace(
    /(?:^|\n)(?:\[[A-Za-z\s\.-]+\]\(https?:\/\/[^\)]*lowyinstitute\.org\/people\/[^\)]*\)|[^\n]{1,80})\s*\n+\d{1,2}\s+[A-Za-z]+\s+\d{4}\s*(?:·|\s*\|\s*|\s+)\s*\d+\s*min\s+read\s*(?:\n+(?:Listen\s*(?:Copy link)?|Copy link))?\s*(?:\n|$)/gi,
    "\n"
  );
  md = md.replace(
    /(?:^|\n)\s*\d{1,2}\s+[A-Za-z]+\s+\d{4}\s*(?:·|\s*\|\s*|\s+)\s*\d+\s*min\s+read\s*(?:\n|$)/gi,
    "\n"
  );
  md = md.replace(/(?:^|\n)\s*(?:Listen\s+Copy link|Listen|Copy link)\s*(?:\n|$)/gi, "\n");
  md = md.replace(
    /(?:^|\n)\s*\[?\s*!\[(?:Image\s*\d+:\s*)?(?:The Interpreter|Lowy Institute|Interpreter)[^\]]*\]\([^)]+\)\s*\]?(?:\([^\)]*\))?(?:\s*\|[^\n]*)?\s*(?:\n|$)/gi,
    "\n"
  );
  md = md.replace(
    /(?:^|\n)\s*\[?\s*!\[[^\]]*\]\(https?:\/\/[^\)]*(?:269x44\.svg|31-bligh\.svg|(?:lowyinstitute\.org|the-interpreter)[^\)]*(?:logo|wordmark|masthead|brand)|cdn\.sanity\.io\/images\/5dcouzig\/production\/[^\)]*\.svg)[^\)]*\)\s*\]?(?:\([^\)]*\))?(?:\s*\|[^\n]*)?\s*(?:\n|$)/gi,
    "\n"
  );
  md = md.replace(
    /(?:^|\n)\s*Image(?:\s*\d+)?:\s*(?:The Interpreter|Lowy Institute)\s*(?:\n|$)/gi,
    "\n"
  );
  md = md.replace(
    /(?:^|\n)#{1,6}\s*Newsletters\s*\n+Subscribe to The Informer[\s\S]*?(?:You may unsubscribe[^\n]*\.?|\n\n)/gi,
    "\n"
  );

  // 4h. Strip leading newsletter sponsored header blocks (e.g. ByteByteGo Datadog sponsor card)
  md = md.replace(
    /^#{1,6}\s*\[?[^\]\n]*\(Sponsored\)[^\]\n]*\]?(?:\([^\)]+\))?\s*\n+(?:\[\s*!?\s*\]\([^\)]+\)\s*\n*)*\n*/gim,
    ""
  );

  // 4i. Strip Foreign Affairs & Carnegie issue date stamps, author credentials, photo credits, and "More by [Author]" lists
  md = md.replace(
    /^(?:(?:January|February|March|April|May|June|July|August|September|October|November|December)\/[A-Za-z]+\s+\d{4}\s+)?Published on\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}\s*\n+/gim,
    ""
  );
  md = md.replace(
    /(?:^|\n)(?:Image|Photo)?\s*(?:[A-Za-z0-9\s,\.-]+\s+)?\/\s+(?:Reuters|Getty Images|AP Photo|Alamy|AFP|AFP\s*\/\s*Getty Images|Bloomberg)\s*(?:\n|$)/gi,
    "\n"
  );
  md = md.replace(
    /(?:^|\n)[A-Z\s]{3,}\s+is\s+(?:a|an)\s+[^\n]+?(?:Carnegie Endowment|Council on Foreign Relations|Brookings|Center for Strategic and International Studies|National Security Council|Central Intelligence Agency|Senior Fellow|Director)[^\n]*(?:\n|$)/gi,
    "\n"
  );
  md = md.replace(
    /(?:^|\n)More by [A-Za-z\s\.-]+(?:\n+[A-Z0-9#][^\n]+){1,5}(?=\n\n[#A-Z0-9]|\n\n$|$)/gi,
    "\n"
  );

  // 5. Look for the article's primary heading (# Title or ## Title) in the first 70 lines.
  // When found, discard pre-article navigation links, login buttons, breadcrumbs that preceded it.
  const lines = md.split("\n");
  let primaryHeadingIdx = -1;

  for (let i = 0; i < Math.min(lines.length, 300); i++) {
    const line = lines[i].trim();
    if (/^#+\s+/.test(line)) {
      const headingText = line
        .replace(/^#+\s+/, "")
        .trim()
        .toLowerCase();
      if (expectedTitle) {
        const cleanExpected = expectedTitle.trim().toLowerCase();
        if (
          headingText === cleanExpected ||
          headingText.includes(cleanExpected) ||
          cleanExpected.includes(headingText) ||
          cleanExpected.slice(0, 20) === headingText.slice(0, 20)
        ) {
          primaryHeadingIdx = i;
          break;
        }
      } else if (/^#\s+/.test(line)) {
        primaryHeadingIdx = i;
        break;
      }
    }
  }

  if (primaryHeadingIdx > 0) {
    const beforeLines = lines.slice(0, primaryHeadingIdx);
    const beforeText = beforeLines.join(" ");
    const isBoilerplate =
      beforeText.includes("Newsletters") ||
      beforeText.includes("Login") ||
      beforeText.includes("Search") ||
      beforeText.includes("All topics") ||
      beforeText.includes("Skip to") ||
      beforeText.includes("cookies") ||
      beforeText.includes("tracker preferences") ||
      beforeText.includes("Menu") ||
      beforeText.includes("Navigation") ||
      beforeText.includes("Home") ||
      beforeText.includes("Subscribe") ||
      beforeLines.filter((l) => /^\s*[\*\-]\s+\[/.test(l)).length > 0 ||
      primaryHeadingIdx <= 30;

    if (isBoilerplate) {
      lines.splice(0, primaryHeadingIdx);
      md = lines.join("\n");
    }
  }

  // Deduplicate repeated title or subtitle at the beginning of the article
  if (expectedTitle) {
    const cleanExp = expectedTitle
      .trim()
      .toLowerCase()
      .replace(/[^\w\s]/g, "");
    if (cleanExp.length > 5) {
      const topLines = md.split("\n");
      let nonEmpties = 0;
      let removedCount = 0;
      for (let i = 0; i < topLines.length && nonEmpties < 6 && removedCount < 2; i++) {
        const trimmed = topLines[i].trim();
        if (!trimmed) continue;
        nonEmpties++;
        const isHeadingOrBold = /^#+\s+/.test(trimmed) || /^\*\*[^*]+\*\*$/.test(trimmed);
        const textOnly = trimmed
          .replace(/^#+\s+/, "")
          .replace(/^\*\*|\*\*$/g, "")
          .replace(/^\|\s*/, "")
          .trim()
          .toLowerCase()
          .replace(/[^\w\s]/g, "");
        const isExactMatch = textOnly === cleanExp;
        const isNearMatch =
          isHeadingOrBold &&
          Math.abs(textOnly.length - cleanExp.length) < 15 &&
          textOnly.includes(cleanExp);
        if (isExactMatch || isNearMatch) {
          topLines[i] = "";
          removedCount++;
        }
      }
      if (removedCount > 0) {
        md = topLines.join("\n").trim();
      }
    }
  }

  // 5b. Deduplicate repeated lead paragraphs, standfirst summaries, and adjacent identical paragraphs
  const mdParagraphs = md.split(/\n{2,}/);
  const dedupedMdParagraphs: string[] = [];
  for (let i = 0; i < mdParagraphs.length; i++) {
    const current = mdParagraphs[i].trim();
    if (!current) continue;
    if (dedupedMdParagraphs.length > 0) {
      const prev = dedupedMdParagraphs[dedupedMdParagraphs.length - 1].trim();
      const cleanCur = current.toLowerCase().replace(/[^\w]/g, "");
      const cleanPrev = prev.toLowerCase().replace(/[^\w]/g, "");
      // Skip exact duplicate or near duplicate (> 35 chars and > 90% character length equality + inclusion)
      if (
        cleanCur === cleanPrev ||
        (cleanCur.length > 35 &&
          cleanPrev.length > 35 &&
          Math.abs(cleanCur.length - cleanPrev.length) < 15 &&
          (cleanCur.includes(cleanPrev) || cleanPrev.includes(cleanCur)))
      ) {
        continue;
      }
      // If current paragraph repeats lead summary blurb within first 3 paragraphs
      if (i <= 3 && dedupedMdParagraphs.length > 0) {
        const lead = dedupedMdParagraphs[0].trim().toLowerCase().replace(/[^\w]/g, "");
        if (
          lead.length > 35 &&
          (cleanCur === lead ||
            (Math.abs(cleanCur.length - lead.length) < 15 &&
              (cleanCur.includes(lead) || lead.includes(cleanCur))))
        ) {
          continue;
        }
      }
      // If current paragraph is a markdown pullquote (> quote) that repeats the previous paragraph
      if (
        current.startsWith(">") &&
        current.replace(/^>\s*/, "").trim().toLowerCase().replace(/[^\w]/g, "") === cleanPrev
      ) {
        continue;
      }
    }
    dedupedMdParagraphs.push(mdParagraphs[i]);
  }
  md = dedupedMdParagraphs.join("\n\n");

  // 6. Strip social share widgets & Google Preferred source prompts
  md = md.replace(
    /^\s*[\*\-]\s*(?:email|sms|facebook|twitter|linkedin|bluesky|whatsapp|reddit)\s*\(opens in new window\)[\s\S]*?(?=\n\n|\n[#A-Z0-9])/gim,
    ""
  );
  md = md.replace(/\[Add .*? on Google\]\([^)]+\)/gi, "");
  md = md.replace(
    /^Add .*? as your preferred source to\s*see more of our stories on Google\.?$/gim,
    ""
  );

  // 6b. Strip "(Opens in new window)" and "(opens in a new window)" warnings inside and outside markdown links
  md = md.replace(
    /\[([^\]]+?)\s*\((?:opens in (?:a )?new (?:window|tab)|Opens in new window)\)\]\(([^)]+)\)/gi,
    "[$1]($2)"
  );
  md = md.replace(
    /(\[[^\]]+\]\([^)]+\))\s*\((?:opens in (?:a )?new (?:window|tab)|Opens in new window)\)/gi,
    "$1"
  );
  md = md.replace(/\s*\((?:opens in (?:a )?new (?:window|tab)|Opens in new window)\)/gi, "");

  // 6c. Strip The Hacker News engagement follow card & icon font share toolbar
  md = md.replace(
    /(?:^|\n)Found this article interesting\?\s*Follow us on (?:Google News|Twitter|LinkedIn|Telegram)[\s\S]*?(?:SHARE[\s]*|Share on [A-Za-z\s]+|Tweet|#link_share|$)[\s\S]*?(?=\n\n[#A-Z0-9]|$)/gi,
    "\n"
  );
  md = md.replace(
    /(?:^|\n)SHARE[\s]*\n+[\s\S]*?(?:Share on Telegram|#link_share|SHARE\s*|$)[\s\S]*?(?=\n\n[#A-Z0-9]|$)/gi,
    "\n"
  );
  md = md.replace(/(?:^|\n)\s*SHARE\s*[]+\s*(?:\n|$)/gi, "\n");

  // 6d. Strip top decorative blog hero images at the very beginning of the article
  md = md.replace(
    /^!\[(?:[^\]]*?(?:hero|banner|featured|header|cover|stock)[^\]]*|Image \d+)\]\([^\)]+\)\s*\n+/i,
    ""
  );

  // 7. Strip tail boilerplate & "What to read next" / footer links
  // Note: Only match "This one is on us" when at the end of the text or followed by meter/signup options
  const footerHeadingRegex =
    /^#{1,6}\s*(?:What to read next|Read next|Related stories|Related articles|Related content|Related posts|More from\b|More by\b|More articles by\b|More on\b|The Interpreter on\b|Lowy Institute\b|Subscribe to\b|Something feel off\?\s*Check it before you click|Recommended stories|Recommended articles|Trending now|Trending stories|Up next|You might also like|Latest news|More stories|Popular stories|Top stories|About the author|About the authors|Leave a reply|Explore .*? Newsletters|Contact Us|Our Web Pages|Our Books|Our Textbook|Marginal Revolution University|Blogs We Like|Interesting People & Sites|Get the Weekly .*? Newsletter|Try Oso\b|Get Started with Oso|Oso Cloud|Schedule a demo|Book a demo|Talk to an engineer|Join the Community|Join our Community|Related Reading|Further Reading|Ready to get started|Sign up for updates|Share this post)\b/gim;
  const match = footerHeadingRegex.exec(md);
  if (match) {
    if (match.index > 300 && md.length - match.index < md.length * 0.75) {
      md = md.slice(0, match.index).trim();
    }
  }

  // Strip standalone "This one is on us" meter prompts without cutting the preceding or following article body
  md = md.replace(
    /(?:^|\n)#{1,6}\s*This one is on us\.?\s*(?:\n+.*?(?:free articles?|Subscribe|Sign In|Newsletter|read the full article).*?)*(?=\n\n|$)/gi,
    "\n"
  );

  // 8. Strip trailing raw CDATA or XML remnants (e.g. "]]>" or "<![CDATA[")
  md = md.replace(/\]\]\>+/g, "");
  md = md.replace(/<!\[CDATA\[/gi, "");

  // 9. Strip Substack / Medium / Ghost subscription boxes & pledge callouts (bounded to discrete callout blocks)
  md = md.replace(
    /(?:^|\n\n)(?:Subscribe to|Thanks for reading|Upgrade to paid|Leave a comment|Share this post|Pledge your support|Get more from)\b[^\n]*(?:\n[^\n]+){0,4}?(?:\[(?:Subscribe|Pledge support|Sign up)\]\([^)]+\)|(?:Subscribe|Pledge support|Sign up)\b[^\n]*)(?=\n\n|$)/gi,
    ""
  );

  // 10. Strip BleepingComputer & Cyber news "Related Articles" blocks
  md = md.replace(/(?:^|\n)#{1,6}\s*Related Articles:?[\s\S]*?(?=\n\n#{1,6}|\n\n[A-Z]|$)/gi, "");
  md = md.replace(/(?:^|\n)\*+\s*Related Articles:?[\s\S]*?(?=\n\n|\n[#A-Z]|$)/gi, "");

  // 11. Strip inline sponsored blocks & partner promo sections
  md = md.replace(
    /(?:^|\n)#{1,6}\s*(?:Sponsored Content|Sponsored by|Partner Content|Partner Perspective|A Message From Our Sponsor|Presented by|Partner Spotlight)[\s\S]*?(?=\n\n#{1,6}|\n\n[A-Z0-9]|$)/gi,
    ""
  );
  md = md.replace(
    /(?:^|\n)\*+(?:Sponsored Content|Sponsored by|Partner Content|Presented by|This article is sponsored by|This post is brought to you by|A message from our sponsor:?)[\s\S]*?\*+(?:\n|$)/gi,
    ""
  );
  // 12. Strip copyright footers and publisher licensing notices
  md = md.replace(/(?:^|\n)(?:Copyright\s*(?:©|\(c\))|\(c\)|©)\s*\d{4}[^\n]*/gi, "");
  md = md.replace(/(?:^|\n)All [Rr]ights [Rr]eserved\.?[^\n]*/gi, "");
  md = md.replace(/(?:^|\n)Foreign Affairs is published by [^\n]*/gi, "");

  // 13. Strip Substack / newsletter subscription forms and subscribe buttons
  md = md.replace(
    /\[?(?:Subscribe|Sign up|Get more from|Pledge your support)[^\]]*\]?\s*\(https?:\/\/[^\)]*\/subscribe[^\)]*\)/gi,
    ""
  );

  // 14. Strip blog sidebar email widgets and newsletter capture blocks (e.g. Marginal Revolution, Daniel Miessler)
  md = md.replace(
    /(?:^|\n)#{1,6}\s*Subscribe via Email[\s\S]*?(?:Enter your email address to subscribe[^\n]*\n+)?(?:Email Address\s+Subscribe)?[\s\S]*?(?=\n\n#{1,6}|\n\n[A-Z0-9#]|$)/gi,
    ""
  );
  md = md.replace(
    /(?:^|\n)Enter your email address to subscribe to updates\.?\s*\n+(?:Email Address\s+Subscribe)?/gi,
    "\n"
  );
  md = md.replace(/\[(?:Get The Newsletter|Subscribe On YouTube)\]\(https?:\/\/[^\)]+\)/gi, "");

  // 15. Strip social media sharing buttons, share intent links, and share toolbars
  md = md.replace(
    /\[(?:Share\s+(?:on|to|via)\s+[A-Za-z0-9_-]+|Share\s+this(?:\s+article|\s+story|\s+post)?|Share|Tweet|Post\s+to\s+[A-Za-z0-9_-]+)\]\((?:https?:\/\/(?:(?:twitter|x)\.com\/(?:intent\/(?:tweet|post)|share)|(?:www\.)?facebook\.com\/(?:sharer|share\.php)|(?:www\.)?linkedin\.com\/(?:sharing\/share-offsite|shareArticle)|reddit\.com\/submit|threads\.net\/intent\/post|bsky\.app\/intent\/compose|news\.ycombinator\.com\/submitlink)|mailto:\?subject=)[^\)]*\)/gi,
    ""
  );
  md = md.replace(
    /(?:^|\n)Share this:?\s*\n+(?:[\*\-]\s*\[?(?:Twitter|Facebook|LinkedIn|Email|Reddit|Print|Pocket|Tumblr|Pinterest)[^\]\n]*\]?(?:\([^\)\n]*\))?\s*\n*)+/gi,
    "\n"
  );
  md = md.replace(
    /(?:^|\n)Click to share on (?:Twitter|Facebook|LinkedIn|Reddit|Pocket|Pinterest|Tumblr)[^\n]*/gi,
    ""
  );

  // 15b. Strip Foreign Affairs share bar, print/save prompts, citations, and gift links
  md = md.replace(
    /(?:^|\n)\s*Share\s*&\s*\n+\s*Download\s*[\s\S]*?(?=\n\n[A-Z0-9#]|\n[A-Z])/gi,
    ""
  );
  md = md.replace(/(?:^|\n)\s*Close\s+Share[\s\S]*?(?=\n\n[A-Z0-9#]|\n[A-Z])/gi, "");
  md = md.replace(/(?:^|\n)\s*\[Print\]\([^\)]*\)[^\n]*/gi, "");
  md = md.replace(/(?:^|\n)\s*\[Save\]\([^\)]*\)\s*Sign in and save to read later/gi, "");
  md = md.replace(
    /(?:^|\n)\*\s+(?:Share in email|Share on Facebook|Share on X|Share on LinkedIn)[^\n]*/gi,
    ""
  );
  md = md.replace(
    /(?:^|\n)\*\s+Copy Link\s+Copied\s+Article link:[\s\S]*?(?=\n\n[A-Z0-9#]|\n[A-Z])/gi,
    ""
  );
  md = md.replace(/(?:^|\n)\*\s+Gift Link\s+Copied[\s\S]*?(?=\n\n[A-Z0-9#]|\n[A-Z])/gi, "");
  md = md.replace(/(?:^|\n)\*\s+Create Citation\s+Copied[\s\S]*?(?=\n\n[A-Z0-9#]|\n[A-Z])/gi, "");
  md = md.replace(
    /(?:^|\n)\*\s+Request Reprint\s+\[Request reprint permissions here\]\([^\)]*\)\.?/gi,
    ""
  );
  md = md.replace(
    /(?:^|\n)\s*\[?Listen\s+(?:to\s+(?:this\s+article|unlock\s+this\s+feature)|to\s+listen)\]?[^\n]*/gi,
    ""
  );
  md = md.replace(
    /(?:^|\n)\s*Foreign Affairs is published by the Council on Foreign Relations[^\n]*/gi,
    ""
  );
  md = md.replace(
    /(?:^|\n)#{1,6}\s*(?:Subscribe to|Sign up for|Get the)\s+(?:_?Foreign Affairs.*?Newsletter_?|_?Foreign Affairs This Week_?|[A-Za-z\s]+Newsletter)[\s\S]*?(?:\[(?:Sign Up|Subscribe|No, Thanks)\]\([^\)]*\)|\* Note that when you provide[^\n]*\n*|\n\n)/gi,
    ""
  );
  md = md.replace(
    /(?:^|\n)(?:Stay informed on the world's most pressing challenges|Sign in or subscribe to read the full article|You have \d+ free articles? remaining|This one is on us)[\s\S]*?(?=\n\n[A-Z0-9#]|\n[A-Z0-9#]|$)/gi,
    ""
  );
  md = md.replace(/(?:^|\n)\[(?:Sign In|Subscribe|No,\s*Thanks|Sign Up)\]\([^\)]*\)\s*/gi, "\n");

  // 15c. Strip Marginal Revolution RSS feed links, translation flags, and FeedBlitz widgets
  md = md.replace(/(?:^|\n)\*\s*\[RSS Feed\]\(https?:\/\/(?:feeds\.)?feedblitz\.com[^\)]*\)/gi, "");
  md = md.replace(
    /(?:^|\n)(?:\[!\[Image \d+:\s*[a-z-]+\]\([^\)]*\)\s*[A-Za-z\s\(\)]+\]\([^\)]*\)\s*)+/gi,
    ""
  );
  md = md.replace(
    /(?:^|\n)\[!\[Image \d+:\s*[a-z-]+\]\([^\)]*\/flags\/[^\)]*\)\s*[A-Za-z\s\(\)]+\]\([^\)]*\)/gi,
    ""
  );

  // 15d. Strip Oso Cloud / tech blog developer marketing callouts and demo buttons
  md = md.replace(
    /(?:^|\n)#{1,6}\s*(?:Try Oso|Get Started with Oso|Oso Cloud|Schedule a Demo|Talk to an Engineer|Join our Community)[\s\S]*?(?=\n\n#{1,6}|\n\n[A-Z0-9]|$)/gi,
    ""
  );
  md = md.replace(
    /(?:^|\n)\s*\[(?:Try Oso Cloud|Schedule a Demo|Book a Demo|Talk to an Engineer|Read the Docs)\]\([^\)]+\)[^\n]*/gi,
    ""
  );

  // 15e. Strip The Hacker News in-content ad banners, growth trackers, Expert Insights, and company/pages footer
  md = md.replace(/\[\s*!\[.*?\]\([^)]*\)\s*\]\(https?:\/\/thehackernews\.uk[^\)]*\)/gi, "");
  md = md.replace(/\[!\[Image \d+: Expert Insights\][\s\S]*?(?=\n\n|\n[#A-Z0-9]|$)/gi, "");
  md = md.replace(
    /(?:^|\n)Company\s*\n+(?:\*\s+\[(?:About THN|Advertise with us|Contact)\][^\n]*\n*)+[\s\S]*?(?:\[(?:_\w+_)?\s*(?:RSS Feeds|Contact Us)\]\([^\)]*\)\s*)+/gi,
    "\n"
  );
  md = md.replace(/(?:^|\n)\s*[\d,]+\s*Followers\]\(https?:\/\/news\.google\.com[^\)]*\)/gi, "\n");

  // 15f. Strip BleepingComputer webinar sponsor blocks & Hubs.li registration cards
  md = md.replace(
    /(?:^|\n)(?:\[!\[.*?\]\([^\)]*(?:bleepstatic\.com\/c\/p\/|hubs\.li)[^\)]*\)\]\(https?:\/\/hubs\.li[^\)]*\)\s*\n+)?(?:#{1,6}\s*\[?[^\]\n]*\]\(https?:\/\/hubs\.li[^\)]*\)\s*\n+)?[\s\S]*?\[(?:Save your seat|Register now|Sign up)\]\(https?:\/\/hubs\.li[^\)]*\)/gi,
    "\n"
  );

  // 15g. Strip Ars Technica trailing "Read full article" links
  md = md.replace(/(?:^|\n)\[Read full article\]\(https?:\/\/arstechnica\.com[^\)]*\)\s*$/gim, "");

  // 15h. Strip Marginal Revolution syndication notices
  md = md.replace(
    /(?:^|\n)The post \[?[^\]\n]+\]?\(https?:\/\/marginalrevolution\.com[^\)]*\)\s*appeared first on\s*\[?[^\]\n]+\]?\(?[^\)\n]*\)?\.?\s*$/gim,
    ""
  );

  // 15i. Strip Darknet trailing advertisement & SVG data URI placeholders
  md = md.replace(/(?:^|\n)Advertisement\s*$/gim, "");
  md = md.replace(/!\[.*?\]\(data:image\/svg\+xml[^\)]+\)/gi, "");

  // 15j. Strip This Week In 4n6 sponsor table rows and subscription prompts
  md = md.replace(
    /(?:^|\n)\|\s*(?:If your organisation is interested in \[sponsoring|\_No sponsor this week\_)[\s\S]*?\|\s*\n/gi,
    "\n"
  );
  md = md.replace(/(?:^|\n)Subscribe to get the latest posts sent to your email\.?\s*$/gim, "");

  // 15k. Strip Foreign Affairs trailing recommendations & most read carousels
  md = md.replace(
    /(?:^|\n)#{1,6}\s*(?:Recommended|Most Read)[\s\S]*?(?=\n\n#{1,6}\s*(?:Recommended|Most Read)|\n*$)/gi,
    ""
  );
  md = md.replace(/(?:^|\n)#{1,6}\s*(?:Recommended|Most Read)[\s\S]*$/gi, "");
  md = md.replace(/(?:^|\n)Topics\s*&\s*Regions:[\s\S]*?(?=\n\n#{1,6}|\n\n[A-Z]|\n*$)/gi, "");

  // 15l. Strip Dark Reading / Informa TechTarget trailing social links, related reading, author bio cards, and network footer
  md = md.replace(
    /(?:^|\n)#{1,6}\s*(?:Share This Article|About the Author|Related Reading|More on Dark Reading|Trending Stories|Explore More|Join the Conversation)[\s\S]*?(?=\n\n#{1,6}|\n*$)/gi,
    ""
  );
  md = md.replace(
    /(?:^|\n)(?:Share This Article|Share on (?:LinkedIn|X|Facebook|Twitter)|Explore our brands|An Informa TechTarget Publication|Dark Reading Resource Library|Omdia Cybersecurity|Working With Us|Terms of Service\s+Privacy Policy)[\s\S]*$/gi,
    ""
  );

  // 15m. Strip Lowy Institute / The Interpreter tail author bios, topic tag lists, related article blocks, and cookie notices
  md = md.replace(
    /(?:^|\n)(?:About the authors?\s*\n+(?:\[(?:!\[[^\]]*\]\([^\)]+\)\s*)*[^\]]*\]\(https?:\/\/[^\)]*lowyinstitute\.org\/people\/|\[[^\]]+\]\(https?:\/\/[^\)]*lowyinstitute\.org\/people\/)[\s\S]*$|Topics\s*\n+\[[^\]]+\]\(https?:\/\/[^\)]*lowyinstitute\.org\/the-interpreter\/archive\?topic=[\s\S]*$|#{1,6}\s*(?:The Interpreter on|More on|Subscribe to|Lowy Institute)\b[\s\S]*$)/gi,
    ""
  );
  md = md.replace(
    /(?:^|\n)Privacy notice:\s*We use limited cookies[\s\S]*?(?:Ok,\s*got it|$)/gi,
    ""
  );

  // 15n. Strip Malwarebytes Scam Guard & product promo tail blocks
  md = md.replace(
    /(?:^|\n)(?:\*\s*\*\s*\*\s*\n+)?#{1,6}\s*(?:\*\*)?Something feel off\?\s*Check it before you click\.?(?:\*\*)?[\s\S]*?\[Try it free[^\]]*\]\([^\)]*\)\s*/gi,
    "\n"
  );
  md = md.replace(
    /(?:^|\n)(?:\*\s*\*\s*\*\s*\n+)?#{1,6}\s*(?:\*\*)?Something feel off\?\s*Check it before you click\.?(?:\*\*)?[\s\S]*?Malwarebytes Scam Guard[^\n]*(?:\s*\n|$)/gi,
    "\n"
  );

  // 15o. Strip Ars Technica trailing author bio cards & Most Read carousels
  md = md.replace(
    /(?:^|\n)\[!\[Photo of [^\]]+\]\([^\)]*cdn\.arstechnica\.net[^\)]*\)\]\(https?:\/\/arstechnica\.com\/author\/[\s\S]*$/gi,
    ""
  );
  md = md.replace(/(?:^|\n)(?:#{1,6}\s*)?Most Read\s*\n+(?:\s*\d+\.\s+|\s*\*\s+)\[!\[[\s\S]*$/gi, "");

  return md.trim();
}

/**
 * Sanitizes author strings extracted from RSS/Atom feeds:
 * - Strips emails with parenthetical names: "info@thehackernews.com (The Hacker News)" -> "The Hacker News"
 * - Strips parenthetical names with emails: "(The Hacker News) info@thehackernews.com" -> "The Hacker News"
 * - Normalizes pure email addresses: "first.last@domain.com" -> "First Last"
 * - Cleans domain artifacts: "www.theregister.com - Articles" -> "The Register"
 * - Normalizes comma-separated author lists
 */
export function cleanAuthor(rawAuthor?: string | null): string {
  if (!rawAuthor || typeof rawAuthor !== "string") return "";
  let a = decodeHtmlEntities(rawAuthor.trim());

  // 0. Normalize comma-separated author lists (e.g. "Author One,Author Two" -> "Author One, Author Two")
  a = a.replace(/,([^\s])/g, ", $1").replace(/\s+/g, " ");

  // 1. Email with parenthetical name: "user@domain.com (Real Name)"
  const emailWithParen = /^[\w\.-]+@[\w\.-]+\s*\(([^)]+)\)$/.exec(a);
  if (emailWithParen) {
    return emailWithParen[1].trim();
  }

  // 2. Parenthetical name with email: "(Real Name) user@domain.com"
  const parenWithEmail = /^\(([^)]+)\)\s*[\w\.-]+@[\w\.-]+$/.exec(a);
  if (parenWithEmail) {
    return parenWithEmail[1].trim();
  }

  // 3. Domain artifact from feeds like The Register ("www.theregister.com - Articles")
  if (/^www\.theregister\.com/i.test(a)) {
    return "The Register";
  }
  a = a.replace(/^www\.([a-zA-Z0-9_-]+)\.[a-z]{2,}\s*-\s*Articles$/i, "$1");
  a = a.replace(/^www\./i, "");
  a = a.replace(/\s*-\s*Articles$/i, "");

  // 4. Pure email address
  if (/^[\w\.-]+@[\w\.-]+$/.test(a)) {
    const user = a.split("@")[0];
    return user.replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return a.trim();
}

/**
 * Prepares article HTML for rendering in ReaderView:
 * 1. Decodes XML/HTML entity-escaped markup if detected.
 * 2. Strips raw metadata tags (<meta>, <link>, <title>, <head>, <script>, <style>).
 * 3. Strips invisible tracking pixels, broken blob URLs, and external stylesheets.
 * 4. Strips cookie banners, tracker consent dialogs, Substack/Medium widgets, social bubbles, and skip links.
 * 5. Strips trailing CDATA artifacts ("]]>").
 */
export function cleanArticleHtml(rawHtml?: string | null, expectedTitle?: string): string {
  if (!rawHtml || typeof rawHtml !== "string") return "";

  let html = rawHtml;

  // 1. Strip raw CDATA and XML wrapper artifacts
  html = html.replace(/\]\]\>+/g, "").replace(/<!\[CDATA\[/gi, "");

  // 2. Check if content has XML/HTML-encoded tags
  if (
    html.includes("&lt;") &&
    /&lt;\/?(p|div|a|h[1-6]|span|b|i|strong|em|ul|ol|li|img|table|tr|td|th|tbody|thead|meta|blockquote|pre|code|figure|section|article)\b/i.test(
      html
    )
  ) {
    html = decodeHtmlEntities(html);
    if (
      html.includes("&lt;") &&
      /&lt;\/?(p|div|a|h[1-6]|span|b|i|strong|em|ul|ol|li|img)\b/i.test(html)
    ) {
      html = decodeHtmlEntities(html);
    }
  }

  // 3. Strip meta tags, link tags (especially stylesheets), script, style tags, and dangerous active content
  html = html
    .replace(/<meta[^>]*>/gi, "")
    .replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, "")
    .replace(/<link[^>]*>/gi, "")
    .replace(/<title[^>]*>.*?<\/title>/gis, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gis, "")
    .replace(/@media\s+[^{]{1,200}\{(?:[^{}]*\{[^}]*\})*\s*\}/gi, "")
    .replace(
      /\.[a-zA-Z_-][a-zA-Z0-9_\\-]*[\s>+~,:.\[\]="a-zA-Z0-9_\\-]{0,120}\{[a-zA-Z-]+\s*:[^}]{1,500}\}/g,
      ""
    )
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gis, "")
    .replace(/<object[^>]*>[\s\S]*?<\/object>/gis, "")
    .replace(/<embed[^>]*>/gi, "")
    .replace(/<applet[^>]*>[\s\S]*?<\/applet>/gis, "")
    .replace(/<base[^>]*>/gi, "")
    // Repair malformed unclosed HTML tags immediately preceding an <iframe (e.g. Ars Technica `<div class="relative"<iframe`)
    .replace(/<([a-zA-Z0-9]+)\b([^<>]*?)(?=<iframe\b)/gi, "<$1$2>")
    // Repair previously leaked `> referrerpolicy="strict-origin-when-cross-origin"` text outside `<iframe ...>`
    .replace(
      /(<iframe\b[^>]*?)>\s*referrerpolicy=["']strict-origin-when-cross-origin["']/gi,
      '$1 referrerpolicy="strict-origin-when-cross-origin">'
    )
    .replace(/>\s*referrerpolicy=["']strict-origin-when-cross-origin["']/gi, ">")
    .replace(
      /<iframe(?![^>]*src=["']https:\/\/(?:www\.)?(?:youtube\.com|youtube-nocookie\.com)\/embed\/)[^>]*>[\s\S]*?<\/iframe>/gis,
      ""
    )
    .replace(
      /<iframe(?=[^>]*src=["']https:\/\/(?:www\.)?(?:youtube\.com|youtube-nocookie\.com)\/embed\/)(?![^>]*referrerpolicy)([^>]*?)(\/?>)/gi,
      '<iframe$1 referrerpolicy="strict-origin-when-cross-origin"$2'
    );

  // 3b. XSS Defense: Strip all inline DOM event handlers (e.g. onerror, onload, onclick, onmouseover)
  html = html.replace(/\s+on[a-zA-Z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, "");

  // 3c. XSS Defense: Neutralize dangerous pseudo-protocols (javascript:, vbscript:, data:text/html)
  html = html.replace(
    /(?:href|src)\s*=\s*["']\s*(?:javascript|vbscript|data:text\/html):[^"']*["']/gi,
    'href="#"'
  );

  // 4. Strip hidden 0px/1px or display:none tracking images and broken blobs
  html = html.replace(/<img[^>]*style=["'][^"']*display:\s*none[^"']*["'][^>]*>/gi, "");
  html = html.replace(/<img[^>]*width=["']0["'][^>]*>/gi, "");
  html = html.replace(/<img[^>]*height=["']0["'][^>]*>/gi, "");
  html = html.replace(
    /<img[^>]*src=["'](?:blob:http:\/\/localhost\/|https?:\/\/(?:t\.co|analytics\.twitter\.com|bat\.bing\.com|ad\.|doubleclick|google-analytics|stats\.wp\.com|pixel\.).*?)["'][^>]*>/gi,
    ""
  );

  // 5. Strip Jina / crawler metadata headers
  html = html.replace(
    /<p>\s*(?:Published Time|URL Source|Title|Author|Description):\s*.*?<\/p>/gi,
    ""
  );

  // 6. Strip cookie consent dialogs and tracker preferences text
  html = html.replace(
    /<div[^>]*(?:cookie|consent|onetrust|didomi|ethyca|privacy-banner|gdpr)[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );
  html = html.replace(
    /(?:<p>)?(?:Manage your tracker preferences|We use cookies and similar tracking technologies|Targeted advertising cookies and similar trackers|We value your privacy|This website uses cookies)[\s\S]*?(?:Consent powered by [^<]+|Save<\/button>|Accept all cookies|<\/p>)/gi,
    ""
  );

  // 7. Strip subscription widgets, newsletter forms, and reader callout cards
  html = html.replace(
    /<div[^>]*(?:subscription-widget|subscribe-card|newsletter-signup|subscribe-form)[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );
  html = html.replace(
    /<form[^>]*(?:subscription-widget|subscribe-card|newsletter-signup|subscribe-form)[^>]*>[\s\S]*?<\/form>/gi,
    ""
  );
  html = html.replace(
    /<form\b[^>]*>[\s\S]*?(?:email-input|subscription-widget|newsletter-input)[\s\S]*?<\/form>/gi,
    ""
  );
  html = html.replace(/<aside[^>]*(?:subscribe|newsletter|signup)[^>]*>[\s\S]*?<\/aside>/gi, "");

  // 8. Strip social sharing bubbles, comment links, toolbars, and reaction widgets
  html = html.replace(
    /<div[^>]*(?:share-bar|social-share|sharing-|reaction-|comment-bubble|post-share|sharedaddy|sd-sharing-enabled|shareaholic-canvas|addthis_toolbox|a2a_kit|social-sharing|share-box|post-sharing|share-links|social-icons|share-tools)[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );
  html = html.replace(
    /<ul[^>]*(?:share-buttons|social-share|share-list|social-sharing)[^>]*>[\s\S]*?<\/ul>/gi,
    ""
  );
  html = html.replace(
    /<a\b[^>]*href=["'](?:https?:\/\/(?:(?:twitter|x)\.com\/(?:intent\/(?:tweet|post)|share)|(?:www\.)?facebook\.com\/(?:sharer|share\.php)|(?:www\.)?linkedin\.com\/(?:sharing\/share-offsite|shareArticle)|reddit\.com\/submit|threads\.net\/intent\/post|bsky\.app\/intent\/compose|news\.ycombinator\.com\/submitlink)|mailto:\?subject=[^"']*share)[^"']*["'][^>]*>[\s\S]*?<\/a>/gi,
    ""
  );
  html = html.replace(/<a\b[^>]*>\s*<\/a>/gi, "");
  html = html.replace(/<a\b[^>]*>(?:<[^>]+>|\s)*\d[\d,]*\s+(?:Subscribers|Followers)<\/a>/gi, "");
  html = html.replace(/<div\b[^>]*class=["'][^"']*widget_feedblitz[^"']*["'][\s\S]*?<\/div>/gi, "");

  // 9. Strip cyber portal, Atlantic Council, and Dark Reading author boxes, related articles, and promo blocks
  html = html.replace(
    /<div[^>]*(?:cz-related-article-wrapp|bc_author_info|related-article|deal-block|post-sidebar|newsletter-signup-box|article-tools|author-bio-container|more-from-author|ac-expert-card|ac-post-related|donate-banner|pop-posts|popular-posts|related-posts)[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );

  // 9b. Strip Informa TechTarget / Dark Reading brand headers and logo graphics
  html = html.replace(
    /(?:<p>)?\s*Informa TechTarget[\s\S]*?(?:Application Security|Cybersecurity Topics|<\/p>)/gi,
    ""
  );
  html = html.replace(
    /<img[^>]*(?:techtarget|darkreading|informa|brand-logo|site-logo|loader|target-logo)[^>]*>/gi,
    ""
  );

  // 9c. Strip BleepingComputer top branding, menu, byline/date line, and Featured/Latest carousel
  html = html.replace(
    /<div[^>]*class=["'][^"']*\b(?:bc_latest|bc_featured|bc_header|bc_top|cz-latest|featured-carousel|top-stories|cz-author-date|bc_byline)\b[^"']*["'][\s\S]*?<\/div>/gi,
    ""
  );
  html = html.replace(
    /<p>\s*BLEEPINGCOMPUTER\s*<\/p>\s*(?:<p>\s*News\s*<\/p>)?\s*(?:<p>\s*Featured\s*<\/p>)?\s*(?:<p>\s*Latest\s*<\/p>)?[\s\S]*?(?=<p>\s*(?:By\s+|[A-Z][a-z]+ \d{1,2},|\*\*By))/gi,
    ""
  );
  html = html.replace(
    /<p>\s*(?:By\s*)?(?:<a[^>]*>[^<]+<\/a>|[A-Za-z\s]+)\s*•?\s*[A-Z][a-z]+ \d{1,2}, \d{4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM))?(?:\s*\d+)?\s*<\/p>/gi,
    ""
  );
  html = html.replace(
    /<p>\s*By\s*<\/p>\s*<p>\s*[A-Za-z\s]+<\/p>\s*<p>\s*[A-Z][a-z]+ \d{1,2}, \d{4}\s*<\/p>(?:\s*<p>\s*\d{1,2}:\d{2}\s*(?:AM|PM)\s*<\/p>)?(?:\s*<p>\s*\d+\s*<\/p>)?/gi,
    ""
  );

  // 9c-2. Strip The Register top category slugs (e.g. "Security", "Offbeat", "Systems", "Dev") and REG AD markers
  html = html.replace(
    /<p>\s*(?:<a[^>]*>)?\s*(?:Security|Offbeat|Systems|Dev|Data|Software|Hardware|AI(?:\s+and\s+ML|\s+&\s+ML)?|Cloud|Enterprise|On Prem|Bofh|Cyber)\s*(?:<\/a>)?\s*<\/p>/gi,
    ""
  );
  html = html.replace(/<p>\s*REG AD\s*<\/p>/gi, "");

  // 9c-3. Strip Dark Reading / Cyber portal bracketed or unbracketed author/read-time cards
  html = html.replace(
    /<p>\s*\[?\s*(?:<br\s*\/?>)?\s*[A-Za-z\s\.-]+,\s*(?:Contributing Writer|Senior Editor|Associate Editor|Executive Editor|Features Editor|Managing Editor|Editor|Writer|Staff|Analyst|Reporter)[^<]*\d{4}[\s\S]*?\d+\s*Min Read\s*\]?\s*<\/p>/gi,
    ""
  );

  // 9c-4. Strip Lowy Institute / The Interpreter newsletter, topic navigations, and author/date/read-time toolbar
  html = html.replace(
    /<div[^>]*(?:the-informer|interpreter-header|newsletter-wrapper|newsletter-card)[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );
  html = html.replace(
    /(?:<p>)?\s*(?:wsletters|Newsletters)[\s\S]*?(?:Subscribe to The Informer|The Informer)[\s\S]*?(?:Support us|\d+\s*min read\b)[\s\S]*?(?:<\/p>)?/gi,
    ""
  );
  html = html.replace(
    /<p>\s*(?:<a[^>]*>)?[A-Za-z\s\.-]+(?:<\/a>)?\s*<\/p>\s*<p>\s*\d{1,2}\s+[A-Za-z]+\s+\d{4}\s*(?:·|\s*\|\s*|\s+)\s*\d+\s*min\s+read\s*<\/p>(?:\s*<p>\s*(?:Listen\s+Copy link|Listen|Copy link)\s*<\/p>)?/gi,
    ""
  );
  html = html.replace(/<p>\s*(?:Listen\s+Copy link|Listen|Copy link)\s*<\/p>/gi, "");
  html = html.replace(
    /<div[^>]*(?:article__audio|field--name-field-audio|audio-player)[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );

  // 9c-5. Strip "(Opens in new window)" warnings inside and outside links while preserving anchors and hyperlinks
  html = html.replace(
    /<a([^>]*?)>([\s\S]*?)\s*(?:<span[^>]*>)?\s*\((?:opens in (?:a )?new (?:window|tab)|Opens in new window)\)\s*(?:<\/span>)?\s*<\/a>/gi,
    "<a$1>$2</a>"
  );
  html = html.replace(
    /(<\/a>)\s*\((?:opens in (?:a )?new (?:window|tab)|Opens in new window)\)/gi,
    "$1"
  );
  html = html.replace(/\s*\((?:opens in (?:a )?new (?:window|tab)|Opens in new window)\)/gi, "");

  // 9d. Strip Substack / newsletter email headers, app banners, and duplicate titles
  html = html.replace(
    /<div[^>]*(?:post-header|email-header|substack-header|read-in-app|header-anchor-widget)[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );
  html = html.replace(
    /<a[^>]*href=["'][^"']*substack\.com\/app[^"']*["'][^>]*>[\s\S]*?<\/a>/gi,
    ""
  );
  html = html.replace(/<a[^>]*>\s*Read in (?:the\s+)?app\s*<\/a>/gi, "");

  // 9e. Strip sponsored containers, partner promo boxes, and native ad units
  html = html.replace(
    /<div[^>]*(?:sponsored-content|sponsor-box|partner-content|promoted-content|native-ad|ad-unit|partner-perspectives)[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );
  html = html.replace(/<aside[^>]*(?:sponsor|partner|promoted)[^>]*>[\s\S]*?<\/aside>/gi, "");
  html = html.replace(
    /<p>\s*<em>\s*(?:Sponsored by|Presented by|This article is sponsored by|This post is brought to you by|A message from our sponsor)[\s\S]*?<\/em>\s*<\/p>/gi,
    ""
  );

  // 9f. Strip comment bubble icons, Ars Technica comment links, and visual/video ad containers
  html = html.replace(
    /<img[^>]*(?:comment-bubble|comments?-icon|comment\.png|comment-count)[^>]*>/gi,
    ""
  );
  html = html.replace(/<a[^>]*(?:#comments?|comment-bubble)[^>]*>[\s\S]*?<\/a>/gi, "");
  html = html.replace(
    /<div[^>]*(?:ad-container|advertisement|dfp-ad|gpt-ad|sponsor-card|taboola|outbrain|revcontent|comment-bubble|video-ad|ad-video|connatix|primis|aniview|ad-wrapper|mid-content|in-content-interlude)[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );
  html = html.replace(/<p>\s*\d+\/\d+\s*Skip Ad[\s\S]*?<\/p>/gi, "");

  // 9g. Strip share modals, citation copy tools, and newsletter/overlay prompts
  html = html.replace(
    /<div[^>]*(?:article-header-actions|article-tools|article-share|share-modal|fa-newsletter-signup|paywall-barrier|meter-banner|newsletter-tout|gate-barrier)[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );
  html = html.replace(
    /<div[^>]*(?:newsletter-signup|email-capture|tout-container|signup-card|promo-card)[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );
  html = html.replace(
    /<h[1-6][^>]*>\s*(?:Subscribe to _?Foreign Affairs.*?Newsletter_?|Subscribe to _?Foreign Affairs This Week_?|Get the Weekly _?Foreign Affairs_? Newsletter|This one is on us\.?|Stay informed on the world's most pressing challenges)\s*<\/h[1-6]>[\s\S]*?(?:<form[\s\S]*?<\/form>|<div[^>]*>[\s\S]*?<\/div>|<p>[\s\S]*?<\/p>)/gi,
    ""
  );
  html = html.replace(/<p>\s*Foreign Affairs is published by [^<]+<\/p>/gi, "");
  html = html.replace(/<p>\s*\[?Listen to this article\]?[^<]*<\/p>/gi, "");
  html = html.replace(
    /<p>\s*(?:Stay informed on the world's most pressing challenges|Sign in or subscribe to read the full article|You have \d+ free articles? remaining|This one is on us)[\s\S]*?<\/p>/gi,
    ""
  );

  // 9h. Strip Marginal Revolution sidebar widgets, book lists, and translation flags
  html = html.replace(
    /<div[^>]*(?:sidebar|widget|widget_feedblitz|contact-us|our-books|translation-flags|gtranslate)[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );
  html = html.replace(/<ul[^>]*(?:translation-flags|gtranslate)[^>]*>[\s\S]*?<\/ul>/gi, "");

  // 9i. Strip Oso Cloud / Developer marketing callouts and demo buttons
  html = html.replace(
    /<div[^>]*(?:oso-cloud|schedule-demo|demo-cta|developer-cta)[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );
  html = html.replace(
    /<h[1-6][^>]*>\s*(?:Try Oso\b|Get Started with Oso|Oso Cloud|Schedule a Demo|Talk to an Engineer|Join our Community)\s*<\/h[1-6]>[\s\S]*?(?=<h[1-6]|$)/gi,
    ""
  );

  // 9i-2. Strip The Hacker News ads, Expert Insights, and company/pages footer
  html = html.replace(/<a[^>]*href=["'][^"']*thehackernews\.uk[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, "");
  html = html.replace(
    /<div[^>]*(?:expert-insights|pop-posts|popular-posts|comment-container|post-share|company-pages|footer-links)[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );
  html = html.replace(
    /<p>\s*Company\s*<\/p>\s*<ul>[\s\S]*?<\/ul>\s*<p>\s*Pages\s*<\/p>\s*<ul>[\s\S]*?<\/ul>/gi,
    ""
  );
  html = html.replace(
    /<a[^>]*href=["'][^"']*news\.google\.com[^"']*["']>\s*[\d,]+\s*Followers\s*<\/a>/gi,
    ""
  );
  html = html.replace(
    /(?:<p>)?\s*Found this article interesting\?\s*Follow us on (?:Google News|Twitter|LinkedIn|Telegram)[\s\S]*?(?:SHARE[\s]*|Share on [A-Za-z\s]+|Tweet|#link_share|<\/div>|<\/p>)/gi,
    ""
  );
  html = html.replace(/<div[^>]*(?:share-box|post-share|link_share)[^>]*>[\s\S]*?<\/div>/gi, "");
  html = html.replace(/<p>\s*SHARE\s*[]+\s*<\/p>/gi, "");

  // 9i-2b. Strip Foreign Affairs & Carnegie author credentials, photo credits, and "More by [Author]" lists
  html = html.replace(
    /<p>\s*(?:Image|Photo)?\s*(?:[A-Za-z0-9\s,\.-]+\s+)?\/\s+(?:Reuters|Getty Images|AP Photo|Alamy|AFP|AFP\s*\/\s*Getty Images|Bloomberg)\s*<\/p>/gi,
    ""
  );
  html = html.replace(
    /<p>\s*[A-Z\s]{3,}\s+is\s+(?:a|an)\s+[^<]+?(?:Carnegie Endowment|Council on Foreign Relations|Brookings|Center for Strategic and International Studies|National Security Council|Central Intelligence Agency|Senior Fellow|Director)[^<]*<\/p>/gi,
    ""
  );
  html = html.replace(
    /<div[^>]*(?:more-by-author|author-credentials|related-content)[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );
  html = html.replace(/<p>\s*More by [A-Za-z\s\.-]+<\/p>(?:\s*<p>[^<]+<\/p>){1,5}/gi, "");

  // 9i-3. Strip BleepingComputer webinar sponsor boxes and hubs.li links
  html = html.replace(/<div[^>]*(?:webinar-box|sponsor-banner)[^>]*>[\s\S]*?<\/div>/gi, "");
  html = html.replace(/<a[^>]*href=["'][^"']*hubs\.li[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, "");

  // 9i-4. Strip Ars Technica trailing "Read full article" links
  html = html.replace(
    /<p>\s*<a[^>]*href=["'][^"']*arstechnica\.com[^"']*["']>Read full article<\/a>\s*<\/p>/gi,
    ""
  );

  // 9i-5. Strip Marginal Revolution syndication notices
  html = html.replace(
    /<p>\s*The post <a[^>]*href=["'][^"']*marginalrevolution\.com[^"']*["']>[^<]+<\/a>\s*appeared first on[\s\S]*?<\/p>/gi,
    ""
  );

  // 9i-6. Strip Lowy Institute / The Interpreter publication logos, wordmark SVGs, newsletter boxes, and footer sections
  html = html.replace(
    /<p[^>]*>\s*(?:<a[^>]*>\s*)?<img[^>]+(?:alt=["'][^"']*(?:The Interpreter|Lowy Institute|Interpreter)[^"']*["']|src=["'][^"']*(?:269x44\.svg|31-bligh\.svg|5dcouzig\/production\/[^"']*\.svg|(?:the-interpreter|lowyinstitute)[^"']*(?:logo|wordmark|brand|masthead))[^"']*["'])[^>]*>\s*(?:<\/a>)?(?:\s*\|[^<]*)?\s*<\/p>/gi,
    ""
  );
  html = html.replace(
    /(?:<a[^>]*>\s*)?<img[^>]+(?:alt=["'][^"']*(?:The Interpreter|Lowy Institute|Interpreter)[^"']*["']|src=["'][^"']*(?:269x44\.svg|31-bligh\.svg|5dcouzig\/production\/[^"']*\.svg|(?:the-interpreter|lowyinstitute)[^"']*(?:logo|wordmark|brand|masthead))[^"']*["'])[^>]*>\s*(?:<\/a>)?(?:\s*\|[^<\n]*)?/gi,
    ""
  );
  html = html.replace(
    /<div[^>]*(?:interpreter-logo|publication-logo|site-logo|brand-logo)[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );
  html = html.replace(
    /<p>\s*Image(?:\s*\d+)?:\s*(?:The Interpreter|Lowy Institute)\s*<\/p>/gi,
    ""
  );
  html = html.replace(
    /<h[1-6][^>]*>\s*Newsletters\s*<\/h[1-6]>[\s\S]*?Subscribe to The Informer[\s\S]*?(?:<\/p>|<\/div>)/gi,
    ""
  );
  html = html.replace(
    /(?:<p>\s*About the authors?\s*<\/p>\s*<p>\s*<a[^>]*href=["'][^"']*lowyinstitute\.org\/people\/[\s\S]*$|<p>\s*Topics\s*<\/p>\s*<p>\s*<a[^>]*href=["'][^"']*lowyinstitute\.org\/the-interpreter\/archive\?topic=[\s\S]*$|<h[1-6][^>]*>\s*(?:The Interpreter on|More on|Subscribe to|Lowy Institute)\b[\s\S]*$)/gi,
    ""
  );
  html = html.replace(
    /<p>\s*Privacy notice:\s*We use limited cookies[\s\S]*?(?:<p>\s*Ok,\s*got it\s*<\/p>|$)/gi,
    ""
  );
  // Strip Malwarebytes Scam Guard trailing promo in HTML
  html = html.replace(
    /(?:<hr[^>]*>\s*)?<h[1-6][^>]*>\s*(?:<strong>|<b>)?Something feel off\?\s*Check it before you click\.?(?:<\/strong>|<\/b>)?\s*<\/h[1-6]>[\s\S]*?Try it free[^<]*<\/a>\s*<\/p>/gi,
    ""
  );
  html = html.replace(
    /(?:<hr[^>]*>\s*)?<h[1-6][^>]*>\s*(?:<strong>|<b>)?Something feel off\?\s*Check it before you click\.?(?:<\/strong>|<\/b>)?\s*<\/h[1-6]>[\s\S]*?Malwarebytes Scam Guard[\s\S]*?<\/p>/gi,
    ""
  );
  // Strip Ars Technica trailing author bio & Most Read list in HTML
  html = html.replace(
    /<a[^>]*href=["']https?:\/\/arstechnica\.com\/author\/[^"']*["'][^>]*>\s*<img[^>]*alt=["']Photo of [\s\S]*$/gi,
    ""
  );
  html = html.replace(/<h[1-6][^>]*>\s*Most Read\s*<\/h[1-6]>\s*<ol[\s\S]*?<\/ol>/gi, "");

  // 9i-7. Strip ByteByteGo leading sponsored cards and Foreign Affairs top dates
  html = html.replace(
    /<h[1-6][^>]*>[^<]*\(Sponsored\)[^<]*<\/h[1-6]>[\s\S]*?(?:<p>\s*<\/p>|<hr\s*\/?>)/gi,
    ""
  );
  html = html.replace(
    /^<p>\s*(?:(?:January|February|March|April|May|June|July|August|September|October|November|December)\/[A-Za-z]+\s+\d{4}\s+)?Published on\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}\s*<\/p>/gi,
    ""
  );

  // 9i-8. Strip standalone "Advertisement" text and SVG placeholder images
  html = html.replace(/<p>\s*(?:Advertisement|\*Advertisement\*)\s*<\/p>/gi, "");
  html = html.replace(/<img[^>]*src=["']data:image\/svg\+xml[^"']*["'][^>]*>/gi, "");

  // 9i-9. Strip Foreign Affairs and generic recommended & most read carousels and topic bars
  html = html.replace(
    /<div[^>]*(?:data-armstrong-id="wrapper"|recommended-articles|most-read)[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );
  html = html.replace(
    /<div[^>]*>\s*<h[1-6][^>]*>\s*(?:Recommended|Most Read|Topics & Regions)\s*<\/h[1-6]>[\s\S]*?<\/div>/gi,
    ""
  );

  // 9i-10. Strip Dark Reading / Informa TechTarget footer, related reading, author bio cards, and network brand links
  html = html.replace(
    /<div[^>]*(?:article-footer|author-bio|related-reading|trending-stories|explore-brands|network-footer)[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );
  html = html.replace(
    /(?:<p>)?\s*(?:Share This Article|Explore our brands|An Informa TechTarget Publication|Dark Reading Resource Library)[\s\S]*$/gi,
    ""
  );

  // 9j. Strip restrictive inline spacing and line-height styles from paragraphs, divs, spans, and table cells
  html = html.replace(
    /<(?:p|div|span|td)([^>]*?)\s+style=["'][^"']*(?:margin\s*:\s*0|line-height\s*:\s*(?:1|normal|0|10px|12px|14px)|padding\s*:\s*0)[^"']*["']/gi,
    "<$1"
  );

  // 9k. Un-bunch newsletter text: convert multiple linebreaks, combinations of <br>, &nbsp;, and whitespace into paragraph breaks
  html = html.replace(/(?:<br\s*\/?>[\s\u00a0\r\n]*(&nbsp;|\s)*){2,}/gi, "</p><p>");

  // 9l. Normalize carriage returns and convert double newlines (\n\n) into paragraph breaks
  html = html.replace(/\r\n/g, "\n");
  if (!/<p\b/i.test(html)) {
    // If the article has NO <p> tags at all, split by double newlines into paragraphs
    html = html
      .split(/\n{2,}/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => `<p>${chunk.replace(/\n/g, "<br/>")}</p>`)
      .join("\n");
  } else {
    // If <p> tags exist, but there are raw double newlines within text blocks, convert them to paragraph breaks
    html = html.replace(/([^>])\n{2,}([^<])/g, "$1</p><p>$2");
    // Also split any oversized paragraph tags that contain multiple blank-line separated blocks or monolithic text blocks
    html = html.replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi, (match, attrs, inner) => {
      if (inner.includes("\n\n")) {
        return inner
          .split(/\n{2,}/)
          .map((c: string) => `<p${attrs}>${c.trim()}</p>`)
          .join("");
      }
      // If a single paragraph is monolithic (> 600 chars) with NO internal HTML tags (plain text only), split at sentence boundaries
      if (inner.length > 600 && !inner.includes("<")) {
        const sentences = inner.split(/(?<=[.!?])\s+(?=[A-Z0-9"'\''‘“])/);
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
          return chunks.map((c) => `<p${attrs}>${c}</p>`).join("");
        }
      }
      return match;
    });
  }

  // 10. Strip skip links
  html = html.replace(
    /<a[^>]*href=["'][^"']*#(?:main|content)[^"']*["'][^>]*>Skip to (?:main )?content<\/a>/gi,
    ""
  );

  // 11. Deduplicate leading title / subtitle in HTML if expectedTitle matches (standalone heading, paragraph, or newline-prefixed first paragraph)
  if (expectedTitle) {
    const cleanExp = expectedTitle
      .trim()
      .toLowerCase()
      .replace(/[^\w\s]/g, "");
    if (cleanExp.length > 5) {
      // Strip leading h1-h3 that duplicates expectedTitle (allowing optional leading container divs)
      html = html.replace(
        /^(\s*(?:<(?:div|article|section|main)\b[^>]*>\s*)*)<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i,
        (match, prefix, inner) => {
          const innerClean = inner
            .replace(/<[^>]+>/g, "")
            .trim()
            .toLowerCase()
            .replace(/[^\w\s]/g, "");
          if (
            innerClean === cleanExp ||
            (Math.abs(innerClean.length - cleanExp.length) < 15 && innerClean.includes(cleanExp))
          ) {
            return prefix;
          }
          return match;
        }
      );
      // Strip leading standalone paragraph if it is an exact/near duplicate of expectedTitle (or |expectedTitle)
      html = html.replace(
        /^(\s*(?:<(?:div|article|section|main)\b[^>]*>\s*)*)<p[^>]*>\s*(?:<strong>|<b>)?([\s\S]*?)(?:<\/strong>|<\/b>)?\s*<\/p>/i,
        (match, prefix, inner) => {
          const innerClean = inner
            .replace(/<[^>]+>/g, "")
            .replace(/^\s*\|\s*/, "")
            .trim()
            .toLowerCase()
            .replace(/[^\w\s]/g, "");
          if (
            innerClean === cleanExp ||
            (Math.abs(innerClean.length - cleanExp.length) < 15 && innerClean.includes(cleanExp))
          ) {
            return prefix;
          }
          return match;
        }
      );
      // If a <p> starts with a line that matches expectedTitle followed by a newline and body text (e.g. Lowy Institute `<p>Title\nBody...`), strip that leading title line
      html = html.replace(
        /<p([^>]*)>\s*([^\n<]+)\n+([\s\S]*?)<\/p>/i,
        (match, attrs, firstLine, rest) => {
          const firstClean = firstLine
            .replace(/^\s*\|\s*/, "")
            .trim()
            .toLowerCase()
            .replace(/[^\w\s]/g, "");
          if (
            firstClean === cleanExp ||
            (Math.abs(firstClean.length - cleanExp.length) < 15 && firstClean.includes(cleanExp))
          ) {
            return `<p${attrs}>${rest.trim()}</p>`;
          }
          return match;
        }
      );
    }
  }

  // 11b. Deduplicate consecutive identical paragraphs and redundant pullquotes
  html = html.replace(/<p[^>]*>([\s\S]*?)<\/p>\s*<p[^>]*>([\s\S]*?)<\/p>/gi, (match, p1, p2) => {
    const text1 = p1.replace(/<[^>]+>/g, "").trim().toLowerCase().replace(/[^\w]/g, "");
    const text2 = p2.replace(/<[^>]+>/g, "").trim().toLowerCase().replace(/[^\w]/g, "");
    if (
      text1.length > 30 &&
      (text1 === text2 ||
        (Math.abs(text1.length - text2.length) < 15 && (text1.includes(text2) || text2.includes(text1))))
    ) {
      return `<p>${p1}</p>`;
    }
    return match;
  });
  html = html.replace(/<p[^>]*>([\s\S]*?)<\/p>\s*<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (match, p, bq) => {
    const pText = p.replace(/<[^>]+>/g, "").trim().toLowerCase().replace(/[^\w]/g, "");
    const bqText = bq.replace(/<[^>]+>/g, "").trim().toLowerCase().replace(/[^\w]/g, "");
    if (pText.length > 30 && (pText === bqText || pText.includes(bqText) || bqText.includes(pText))) {
      return `<p>${p}</p>`;
    }
    return match;
  });

  // 12. Strip tail boilerplate (What to read next / Related stories)
  const tailMatch = html.match(
    /<h[1-6][^>]*>\s*(?:What to read next|Read next|Related stories|Related articles|Related content|Related posts|More from\b|More on this topic|Recommended stories|Trending now|Trending stories|About the author|About the authors|Explore .*? Newsletters|Contact Us|Our Web Pages|Our Books|Our Textbook|Marginal Revolution University|Blogs We Like|Interesting People & Sites|This one is on us|Get the Weekly .*? Newsletter|Try Oso\b|Get Started with Oso|Oso Cloud|Schedule a Demo|Talk to an Engineer|Join the Community|Join our Community|Related Reading|Further Reading)\b/i
  );
  if (tailMatch && tailMatch.index !== undefined) {
    if (tailMatch.index > 300 && html.length - tailMatch.index < html.length * 0.75) {
      html = html.slice(0, tailMatch.index);
    }
  }

  // 13. Strip copyright notices and publisher licensing footers
  html = html.replace(
    /<p>\s*(?:Copyright\s*(?:©|&copy;|\(c\))|&copy;|©)\s*\d{4}[\s\S]*?<\/p>/gi,
    ""
  );
  html = html.replace(/<p>\s*All [Rr]ights [Rr]eserved\.?\s*<\/p>/gi, "");
  html = html.replace(/<p>\s*Foreign Affairs is published by [^<]+<\/p>/gi, "");

  // 14. Decode remaining HTML entities in text safely
  return html.trim();
}
