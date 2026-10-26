import { describe, expect, it } from "bun:test";
import { cleanArticleHtml, cleanArticleMarkdown } from "./clean-article";

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

  it("preserves legitimate YouTube embed iframes with strict referrerpolicy", () => {
    const input = `<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" width="560" height="315"></iframe>`;
    const cleaned = cleanArticleHtml(input);

    expect(cleaned).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ"');
    expect(cleaned).toContain('referrerpolicy="strict-origin-when-cross-origin"');
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
});
