import { describe, expect, it } from "bun:test";
import { cleanArticleHtml, cleanArticleMarkdown } from "./clean-article";
import { extractSnippet } from "../services/feed-fetcher";

describe("cleanArticleHtml - Hyperlink & Monolithic Text Preservation", () => {
  it("preserves hyperlinks without clipping or leaving dangling attributes (Bug 17/10/2026)", () => {
    const input = `<p>More than half a century ago, the Great Debate, as the French strategist Raymond Aron termed it, broke out between European countries and the <a href="https://www.foreignaffairs.com/regions/united-states">United States</a> over how to preserve European nuclear deterrence in the face of the Soviet Union’s expanding nuclear capabilities.</p>`;

    const cleaned = cleanArticleHtml(input);

    expect(cleaned).toContain(
      '<a href="https://www.foreignaffairs.com/regions/united-states">United States</a>'
    );
    expect(cleaned).toContain("More than half a century ago");
    expect(cleaned).not.toContain('href=""');
  });

  it("preserves multiple hyperlinks with URLs ending in .html or domains (Bug 16/10/2026)", () => {
    const input = `<p>As of Thursday morning, Starshield service was reportedly restored. But the outage revealed a vulnerability that hasn’t gone away, threatening <a href="https://foreignaffairs.com/infrastructure.html">water infrastructure as well.</a> And <a href="https://defenseone.com/global/2026/10/14/ukraine-races-to-field-faster-interceptors-as-russia-hammers-its-energy-grid/">small, cheap, fast drones controlled remotely by operators on the ground using Starshield</a> were grounded.</p>`;

    const cleaned = cleanArticleHtml(input);

    expect(cleaned).toContain(
      '<a href="https://foreignaffairs.com/infrastructure.html">water infrastructure as well.</a>'
    );
    expect(cleaned).toContain(
      '<a href="https://defenseone.com/global/2026/10/14/ukraine-races-to-field-faster-interceptors-as-russia-hammers-its-energy-grid/">small, cheap, fast drones controlled remotely by operators on the ground using Starshield</a>'
    );
  });

  it("safely splits truly monolithic plain-text paragraphs without dropping any text", () => {
    const sentence1 =
      "This is a monolithic paragraph without any HTML tags that exceeds six hundred characters in length.";
    const sentence2 =
      "It contains mentions of websites like example.com and version v1.0 software releases.";
    const sentence3 =
      "All sentences must be cleanly preserved without any missing characters or clipped fragments.";
    const sentence4 =
      "Even when repeated multiple times to exceed the length threshold for automatic splitting.";
    const longText = `${sentence1} ${sentence2} ${sentence3} ${sentence4} `.repeat(3).trim();

    const input = `<p>${longText}</p>`;
    const cleaned = cleanArticleHtml(input);

    expect(cleaned).toContain("example.com");
    expect(cleaned).toContain("v1.0");
    expect(cleaned).toContain(sentence1);
    expect(cleaned).toContain(sentence2);
    expect(cleaned).toContain(sentence3);
    expect(cleaned).toContain(sentence4);
  });
});

describe("cleanArticleMarkdown - Hyperlink Preservation", () => {
  it("preserves markdown links when stripping (opens in new window) warnings", () => {
    const input = `Here is a [link to proceedings (opens in new window)](https://example.com/proceedings) for review.`;
    const cleaned = cleanArticleMarkdown(input);

    expect(cleaned).toContain("[link to proceedings](https://example.com/proceedings)");
    expect(cleaned).not.toContain("(opens in new window)");
  });
});

describe("cleanArticleHtml - Cross-Site Scripting (XSS) & Active Content Sanitization", () => {
  it("strips inline DOM event handlers (onerror, onload, onclick)", () => {
    const input = `<p>Test <img src="x" onerror="alert(document.cookie)" onload="hack()"> with <a href="https://example.com" onclick="steal()">Link</a></p>`;
    const cleaned = cleanArticleHtml(input);

    expect(cleaned).not.toContain("onerror");
    expect(cleaned).not.toContain("onload");
    expect(cleaned).not.toContain("onclick");
    expect(cleaned).not.toContain("alert(document.cookie)");
    expect(cleaned).toContain('<a href="https://example.com">Link</a>');
  });

  it("neutralizes dangerous pseudo-protocols (javascript:, data:text/html)", () => {
    const input = `<p><a href="javascript:alert(1)">Click Me</a> and <iframe src="javascript:alert(2)"></iframe></p>`;
    const cleaned = cleanArticleHtml(input);

    expect(cleaned).not.toContain("javascript:alert(1)");
    expect(cleaned).not.toContain("<iframe");
    expect(cleaned).toContain('href="#"');
  });

  it("strips dangerous active tags (object, embed, applet, base)", () => {
    const input = `<object data="malicious.swf"></object><embed src="bad.pdf"><base href="https://attacker.com"><p>Content</p>`;
    const cleaned = cleanArticleHtml(input);

    expect(cleaned).not.toContain("<object");
    expect(cleaned).not.toContain("<embed");
    expect(cleaned).not.toContain("<base");
    expect(cleaned).toContain("<p>Content</p>");
  });

  it("preserves legitimate YouTube embed iframes with strict referrerpolicy inside the opening tag (Feedback 712cfe23)", () => {
    const input = `<div class="ars-video-container"><div class="relative"<iframe class="absolute" src="https://www.youtube.com/embed/uJqaGLmZpGo?start=0&wmode=transparent" allowfullscreen=""></iframe></div></div>`;
    const cleaned = cleanArticleHtml(input);

    expect(cleaned).toContain('<div class="relative"><iframe');
    expect(cleaned).toContain('src="https://www.youtube.com/embed/uJqaGLmZpGo?start=0&wmode=transparent"');
    expect(cleaned).toContain('referrerpolicy="strict-origin-when-cross-origin"></iframe>');
    expect(cleaned).not.toContain('> referrerpolicy=');
    expect(cleaned).not.toContain('"> referrerpolicy=');
  });

  it("repairs previously leaked > referrerpolicy attribute outside iframe tags", () => {
    const corrupted = `<div class="relative"><iframe src="https://www.youtube.com/embed/uJqaGLmZpGo"> referrerpolicy="strict-origin-when-cross-origin"</iframe></div>`;
    const cleaned = cleanArticleHtml(corrupted);

    expect(cleaned).toContain(
      '<iframe src="https://www.youtube.com/embed/uJqaGLmZpGo" referrerpolicy="strict-origin-when-cross-origin"></iframe>'
    );
    expect(cleaned).not.toContain("> referrerpolicy=");
  });
});

describe("cleanArticleMarkdown & cleanArticleHtml - Malwarebytes / Kadence CSS & Empty-Alt Images (Feedback 769dcf80)", () => {
  it("strips leaked WordPress Kadence CSS rules and preserves empty-alt Markdown images ![](url)", () => {
    const rawHtml = `<p>.kt-inside-inner-col{padding-top:20px;padding-bottom:20px;}.kadence-column123 > .kt-inside-inner-col{margin-top:10px;}@media all and (max-width: 1024px){.kadence-column123 > .kt-inside-inner-col{padding-top:10px;}}Social media feeds are overflowing with eerie, AI-generated Halloween clips.</p><p><img src="https://www.malwarebytes.com/wp-content/uploads/sites/2/2026/10/halloween_1-1.png?w=1024" alt="" /></p><h3><strong>Something feel off? Check it before you click.</strong></h3><p>Use <strong>Malwarebytes Scam Guard</strong> to check links. <a href="https://www.malwarebytes.com/scam-guard">Try it free →</a></p>`;
    const rawMd = `.kt-inside-inner-col{padding-top:20px;padding-bottom:20px;}@media all and (max-width: 1024px){.kadence-column123 > .kt-inside-inner-col{padding-top:10px;}}Social media feeds are overflowing with eerie, AI-generated Halloween clips.

![](https://www.malwarebytes.com/wp-content/uploads/sites/2/2026/10/halloween_1-1.png?w=1024)

!

* * *

### **Something feel off? Check it before you click.**

Use **Malwarebytes Scam Guard** to check links. [Try it free →](https://www.malwarebytes.com/scam-guard)`;

    const cleanedHtml = cleanArticleHtml(rawHtml, "AI Halloween videos: Who’s getting your photos?");
    const cleanedMd = cleanArticleMarkdown(rawMd, "AI Halloween videos: Who’s getting your photos?");
    const snippet = extractSnippet(rawHtml, rawHtml);

    expect(cleanedHtml).not.toContain(".kt-inside-inner-col");
    expect(cleanedHtml).not.toContain("@media");
    expect(cleanedHtml).not.toContain("Malwarebytes Scam Guard");
    expect(cleanedHtml).toContain("Social media feeds are overflowing");
    expect(cleanedHtml).toContain("halloween_1-1.png");

    expect(cleanedMd).not.toContain(".kt-inside-inner-col");
    expect(cleanedMd).not.toContain("@media");
    expect(cleanedMd).not.toContain("Malwarebytes Scam Guard");
    expect(cleanedMd).toContain(
      "![](https://www.malwarebytes.com/wp-content/uploads/sites/2/2026/10/halloween_1-1.png?w=1024)"
    );
    expect(cleanedMd).not.toMatch(/(?:^|\n)!\s*(?:\n|$)/);

    expect(snippet).not.toContain(".kt-inside-inner-col");
    expect(snippet).toContain("Social media feeds are overflowing");
  });
});

describe("cleanArticleMarkdown & cleanArticleHtml - Lowy Institute / The Interpreter (Bug 25/10/2026)", () => {
  it("strips publication logos and wordmarks from Lowy Institute / The Interpreter markdown", () => {
    const input = `# Pacific women are already doing the work. COP31 must back them

![The Interpreter](https://www.lowyinstitute.org/themes/custom/lowy_theme/images/the-interpreter-logo.svg)

Image 4: The Interpreter

Jane Doe
25 October 2026 4 min read
Listen Copy link

Pacific women are on the front lines of climate adaptation across the region.`;

    const cleaned = cleanArticleMarkdown(input, "Pacific women are already doing the work. COP31 must back them");

    expect(cleaned).not.toContain("![The Interpreter]");
    expect(cleaned).not.toContain("Image 4: The Interpreter");
    expect(cleaned).not.toContain("Listen Copy link");
    expect(cleaned).not.toContain("4 min read");
    expect(cleaned).toContain("Pacific women are on the front lines");
  });

  it("deduplicates repeated lead paragraphs and adjacent duplicate content in markdown", () => {
    const input = `Pacific women are on the front lines of climate adaptation across the region.

Pacific women are on the front lines of climate adaptation across the region.

They manage water security and build community resilience.`;

    const cleaned = cleanArticleMarkdown(input);

    const matches = cleaned.match(/Pacific women are on the front lines/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
    expect(cleaned).toContain("They manage water security and build community resilience.");
  });

  it("strips publication logos, audio toolbars, and duplicate paragraphs in HTML", () => {
    const input = `<div>
      <img src="https://www.lowyinstitute.org/sites/default/files/the-interpreter-logo.png" alt="The Interpreter" />
      <p>Image: The Interpreter</p>
      <p><a href="https://www.lowyinstitute.org/people/jane-doe">Jane Doe</a></p>
      <p>25 October 2026 4 min read</p>
      <p>Listen Copy link</p>
      <p>Pacific women are on the front lines of climate adaptation across the region.</p>
      <p>Pacific women are on the front lines of climate adaptation across the region.</p>
      <p>Second paragraph with unique research findings.</p>
    </div>`;

    const cleaned = cleanArticleHtml(input);

    expect(cleaned).not.toContain("the-interpreter-logo");
    expect(cleaned).not.toContain("Image: The Interpreter");
    expect(cleaned).not.toContain("Listen Copy link");
    expect(cleaned).not.toContain("4 min read");
    const matches = cleaned.match(/Pacific women are on the front lines/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
    expect(cleaned).toContain("Second paragraph with unique research findings.");
  });

  it("strips Sanity.io SVG wordmark links, pipe-delimited duplicate titles, newline-joined lead titles, and tail sections (Feedback ff5206e1)", () => {
    const title = "Australian rifles, private guns and PNG’s 2027 election";
    const mdInput = `# ${title}

[![Image 3: The Interpreter](https://cdn.sanity.io/images/5dcouzig/production/d6620f354868dc5293cf6b12f9ecd6561d361b25-269x44.svg)](https://www.lowyinstitute.org/the-interpreter/archive)|${title}

${title}
Gun violence has become a critical issue in Papua New Guinea ahead of the 2027 national election.

[Michael Kabuni](https://www.lowyinstitute.org/people/michael-kabuni)

28 October 2026 5 min read

The proliferation of high-powered firearms poses severe challenges for electoral security.

About the author
[![Image 5: Michael Kabuni](https://cdn.sanity.io/images/5dcouzig/production/avatar.jpg)](https://www.lowyinstitute.org/people/michael-kabuni)
## The Interpreter on Papua New Guinea
## Subscribe to
### Lowy Institute
![Image 10](https://www.lowyinstitute.org/images/31-bligh.svg)
Privacy notice: We use limited cookies to understand how visitors interact with our website.
Ok, got it`;

    const htmlInput = `<div>
      <p><a href="https://www.lowyinstitute.org/the-interpreter/archive"><img src="https://cdn.sanity.io/images/5dcouzig/production/d6620f354868dc5293cf6b12f9ecd6561d361b25-269x44.svg" alt="Image 3: The Interpreter"></a>|${title}</p>
      <p>${title}\nGun violence has become a critical issue in Papua New Guinea ahead of the 2027 national election.</p>
      <p><a href="https://www.lowyinstitute.org/people/michael-kabuni">Michael Kabuni</a></p>
      <p>28 October 2026 5 min read</p>
      <p>The proliferation of high-powered firearms poses severe challenges for electoral security.</p>
      <p>About the author</p>
      <p><a href="https://www.lowyinstitute.org/people/michael-kabuni">Michael Kabuni</a></p>
      <h2>The Interpreter on Papua New Guinea</h2>
      <h3>Lowy Institute</h3>
      <img src="https://www.lowyinstitute.org/images/31-bligh.svg" alt="31 Bligh">
      <p>Privacy notice: We use limited cookies to understand how visitors interact with our website.</p>
      <p>Ok, got it</p>
    </div>`;

    const cleanedMd = cleanArticleMarkdown(mdInput, title);
    const cleanedHtml = cleanArticleHtml(htmlInput, title);

    expect(cleanedMd).not.toContain("269x44.svg");
    expect(cleanedMd).not.toContain("31-bligh.svg");
    expect(cleanedMd).not.toContain("Image 3: The Interpreter");
    expect(cleanedMd).not.toContain(title);
    expect(cleanedMd).not.toContain("The Interpreter on Papua New Guinea");
    expect(cleanedMd).not.toContain("Privacy notice:");
    expect(cleanedMd).toContain("Gun violence has become a critical issue in Papua New Guinea");

    expect(cleanedHtml).not.toContain("269x44.svg");
    expect(cleanedHtml).not.toContain("31-bligh.svg");
    expect(cleanedHtml).not.toContain("Image 3: The Interpreter");
    expect(cleanedHtml).not.toContain(title);
    expect(cleanedHtml).not.toContain("The Interpreter on Papua New Guinea");
    expect(cleanedHtml).not.toContain("Privacy notice:");
    expect(cleanedHtml).toContain("Gun violence has become a critical issue in Papua New Guinea");
  });

  it("remaps Cloudflare-blocked Marginal Revolution image mirrors and enforces referrerpolicy='no-referrer' on img tags", () => {
    const rawHtml = `<p>Adam Nash has a <a href="https://adamnash.blog/2026/10/25/why-do-older-people-have-most-of-the-money/">good post</a> on wealth inequality:</p>
<p><a href="https://marginalrevolution.com/wp-content/uploads/2026/10/us-household-median-net-worth-by-age-2024-3.webp"><img fetchpriority="high" decoding="async" class="wp-image-94089 alignleft" src="https://marginalrevolution.com/wp-content/uploads/2026/10/us-household-median-net-worth-by-age-2024-3.webp" alt="Census wealth chart" width="404" height="261" /></a>…Every year, we pull the most recent data.</p>`;

    const rawMd = `Adam Nash has a [good post](https://adamnash.blog/2026/10/25/why-do-older-people-have-most-of-the-money/) on wealth inequality:

[![](https://marginalrevolution.com/wp-content/uploads/2026/10/us-household-median-net-worth-by-age-2024-3.webp)](https://marginalrevolution.com/wp-content/uploads/2026/10/us-household-median-net-worth-by-age-2024-3.webp)…Every year, we pull the most recent data.`;

    const cleanedHtml = cleanArticleHtml(rawHtml, "Inequality in Equal Land");
    const cleanedMd = cleanArticleMarkdown(rawMd, "Inequality in Equal Land");

    expect(cleanedHtml).toContain('referrerpolicy="no-referrer"');
    expect(cleanedHtml).not.toContain("marginalrevolution.com/wp-content/uploads/2026/10/us-household-median-net-worth-by-age-2024-3.webp");
    expect(cleanedHtml).toContain("adamnash.blog/wp-content/uploads/2026/10/us-household-median-net-worth-by-age-2024-3.jpg");

    expect(cleanedMd).not.toContain("marginalrevolution.com/wp-content/uploads/2026/10/us-household-median-net-worth-by-age-2024-3.webp");
    expect(cleanedMd).toContain("adamnash.blog/wp-content/uploads/2026/10/us-household-median-net-worth-by-age-2024-3.jpg");
  });
});
