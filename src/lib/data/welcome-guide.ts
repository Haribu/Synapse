/**
 * Synapse Initial Welcome Guide & Philosophy Article
 * Pre-seeded on first boot to eliminate cold-start dead air.
 */

export const WELCOME_FEED = {
  id: "synapse-welcome",
  title: "Synapse Sanctuary",
  feedUrl: "https://synapse.local/welcome.rss",
  siteUrl: "https://github.com/Haribu/synapse",
  category: "General",
  editorialType: "official",
};

export const WELCOME_ARTICLE = {
  id: "welcome-guide",
  feedId: "synapse-welcome",
  guid: "synapse-welcome-guide-v1",
  title: "Welcome to Synapse: Quickstart & Reading Philosophy",
  url: "https://github.com/Haribu/synapse#readme",
  author: "Harry McLaren & The Synapse Community",
  snippet:
    "Your calm, distraction-free reading sanctuary. Learn essential keyboard shortcuts, typography modes, literature notes, Obsidian synchronization, and team digests.",
  fullContentMarkdown: `# Welcome to Synapse: Quickstart & Reading Philosophy

Welcome to **Synapse** — your personal, AI-native reading environment designed for deep focus, research curation, and deliberate thought.

In an internet saturated with attention-hijacking feeds, infinite doomscrolls, and algorithmic rage-bait, Synapse exists as an **Editorial Sanctuary**: a calm space where high-signal newsletters, engineering blogs, academic papers, and long-form writing can be digested with calm focus.

---

## ⚡ 1. The Essential Keyboard Shortcuts

Synapse is built from the ground up for tactile, rapid navigation. Keep your hands on the keyboard:

* **\`j\` / \`k\`** — Jump to the next or previous article in your queue.
* **\`m\`** — Toggle Read / Unread status instantly.
* **\`s\`** — Star or unstar an article into your **Read Later** queue.
* **\`w\`** — Flag or unflag an article for your **Team / Work Digest**.
* **\`[\` / \`]\`** — Decrease or increase reader font size.
* **\`⌘K\` / \`Ctrl+K\`** — Open the instant Command Palette to jump to any feed, view, or category.

---

## 📖 2. Typography & Reading Ergonomics

Reading should never strain your eyes or tax your attention:

* **Warm Paper & Obsidian Ink:** Synapse defaults to soothing, low-contrast palettes (warm editorial cream by day, deep obsidian ink by night) that reduce glare.
* **Dyslexic Mode:** Click the **\`Aa\`** button in the reader top bar (or open Settings) to activate the self-hosted **OpenDyslexic** typeface, paired with wide line spacing and generous column widths.
* **Focus Mode:** Click the maximize button in the reader top bar to collapse the middle list pane and expand the reader into an immersive, single-column reading view.

---

## 🧠 3. Personal Literature Notes & Obsidian Sync

Synapse is more than a reader — it is the top of your personal knowledge funnel:

* **Highlight & Annotate:** As you read, scroll down or open the **Notes Drawer** on the right side of the screen to jot down key takeaways, synthesis notes, and custom tags.
* **Obsidian Vault Sync:** If you mounted your Obsidian vault into Docker (\`/obsidian-vault\`), clicking **Save to Obsidian** exports a clean Markdown literature note with YAML frontmatter, downloads remote images into a local assets folder, and rewrites links to relative paths.
* **Direct Browser Download:** If running Synapse on a remote VPS without a mounted vault, clicking Save automatically triggers a clean \`.md\` file download straight to your browser.

---

## 💼 4. Collaborative Intelligence & Team Digests

Found an article that your coworkers or team must read?

1. Press **\`W\`** or click the **Briefcase** icon in the action bar to flag it.
2. In the navigation sidebar, switch to **Work Items**.
3. Click **Draft Digest** to automatically compile all pending items into a formatted executive summary — ready to send via email or copy as Slack/Teams Markdown.
4. You can customize your organization name and destination email anytime in **Settings > Reader Profile**.

---

## 🚀 5. Adding More Feeds

Ready to build your library?
* Open **Manage Feeds** in the sidebar to add custom RSS, Atom, or YouTube channels.
* Or use **Settings > Storage** to import an existing **OPML** export from Feedly, Inoreader, NetNewsWire, or Miniflux.

Happy reading!
`,
  fullContentHtml: `
<div class="welcome-guide-body">
  <p class="lead mb-6 text-slate-800 dark:text-slate-200">
    Welcome to <strong>Synapse</strong> — your personal, AI-native reading environment designed for deep focus, research curation, and deliberate thought.
  </p>
  <p class="mb-6">
    In an internet saturated with attention-hijacking feeds, infinite doomscrolls, and algorithmic rage-bait, Synapse exists as an <strong>Editorial Sanctuary</strong>: a calm space where high-signal newsletters, engineering blogs, academic papers, and long-form writing can be digested with calm focus.
  </p>
  
  <hr class="my-8 border-slate-200 dark:border-slate-800" />

  <h2 class="text-xl font-bold mb-4 text-slate-900 dark:text-white">⚡ 1. The Essential Keyboard Shortcuts</h2>
  <p class="mb-4">Synapse is built from the ground up for tactile, rapid navigation. Keep your hands on the keyboard:</p>
  <ul class="list-disc pl-5 space-y-2 mb-6">
    <li><kbd class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs">j</kbd> / <kbd class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs">k</kbd> — Jump to the next or previous article in your queue.</li>
    <li><kbd class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs">m</kbd> — Toggle Read / Unread status instantly.</li>
    <li><kbd class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs">s</kbd> — Star or unstar an article into your <strong>Read Later</strong> queue.</li>
    <li><kbd class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs">w</kbd> — Flag or unflag an article for your <strong>Team / Work Digest</strong>.</li>
    <li><kbd class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs">[</kbd> / <kbd class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs">]</kbd> — Decrease or increase reader font size.</li>
    <li><kbd class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs">⌘K</kbd> / <kbd class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs">Ctrl+K</kbd> — Open the instant Command Palette.</li>
  </ul>

  <h2 class="text-xl font-bold mb-4 text-slate-900 dark:text-white">📖 2. Typography &amp; Reading Ergonomics</h2>
  <p class="mb-4">Reading should never strain your eyes or tax your attention:</p>
  <ul class="list-disc pl-5 space-y-2 mb-6">
    <li><strong>Warm Paper &amp; Obsidian Ink:</strong> Synapse defaults to soothing, low-contrast palettes (warm editorial cream by day, deep obsidian ink by night) that reduce eye fatigue.</li>
    <li><strong>Dyslexic Mode:</strong> Click the <strong>Aa</strong> button in the reader top bar (or open Settings) to activate the self-hosted <strong>OpenDyslexic</strong> typeface, paired with wide line spacing.</li>
    <li><strong>Focus Mode:</strong> Click the maximize button in the reader top bar to collapse the middle list pane and expand the reader into an immersive, single-column reading view.</li>
  </ul>

  <h2 class="text-xl font-bold mb-4 text-slate-900 dark:text-white">🧠 3. Personal Literature Notes &amp; Obsidian Sync</h2>
  <p class="mb-4">Synapse is more than a reader — it is the top of your personal knowledge funnel:</p>
  <ul class="list-disc pl-5 space-y-2 mb-6">
    <li><strong>Highlight &amp; Annotate:</strong> As you read, scroll down or open the <strong>Notes Drawer</strong> on the right side of the screen to jot down key takeaways, synthesis notes, and custom tags.</li>
    <li><strong>Obsidian Vault Sync:</strong> If you mounted your Obsidian vault into Docker (<code class="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">/obsidian-vault</code>), clicking <strong>Save to Obsidian</strong> exports a clean Markdown literature note with YAML frontmatter, downloads remote images into a local assets folder, and rewrites links to relative paths.</li>
    <li><strong>Direct Browser Download:</strong> If running Synapse on a remote VPS without a mounted vault, clicking Save automatically triggers a clean <code class="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">.md</code> file download straight to your browser.</li>
  </ul>

  <h2 class="text-xl font-bold mb-4 text-slate-900 dark:text-white">💼 4. Collaborative Intelligence &amp; Team Digests</h2>
  <p class="mb-4">Found an article that your coworkers or team must read?</p>
  <ol class="list-decimal pl-5 space-y-2 mb-6">
    <li>Press <kbd class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs">W</kbd> or click the <strong>Briefcase</strong> icon in the action bar to flag it.</li>
    <li>In the navigation sidebar, switch to <strong>Work Items</strong>.</li>
    <li>Click <strong>Draft Digest</strong> to automatically compile all pending items into a formatted executive summary — ready to send via email or copy as Slack/Teams Markdown.</li>
    <li>You can customize your organization name and destination email anytime in <strong>Settings &gt; Reader Profile</strong>.</li>
  </ol>

  <h2 class="text-xl font-bold mb-4 text-slate-900 dark:text-white">🚀 5. Adding More Feeds</h2>
  <p class="mb-6">
    Ready to build your library? Open <strong>Manage Feeds</strong> in the sidebar to add custom RSS, Atom, or YouTube channels, or visit <strong>Settings &gt; Storage</strong> to import an existing OPML library.
  </p>
  <p class="italic text-slate-500 dark:text-slate-400">Happy reading!</p>
</div>
`,
};
