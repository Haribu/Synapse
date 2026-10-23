import fs from "fs";
import path from "path";
import TurndownService from "turndown";
import { cleanAuthor, cleanArticleMarkdown } from "@/lib/utils/clean-article";
import { validateSafeUrl } from "@/lib/utils/ssrf";

export interface ObsidianNotePayload {
  title: string;
  sourceUrl: string;
  author?: string;
  publishedAt?: Date;
  contentMarkdown?: string;
  contentHtml?: string;
  thumbnailUrl?: string;
  feedTitle?: string;
  originType?: "rss" | "youtube" | "newsletter_link" | "manual";
  editorialType?: string;
  parentNewsletterTitle?: string;
  userNotes?: string;
  tags?: string[];
  subfolder?: string;
}

export function isVaultConfigured(): boolean {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
  return Boolean(vaultPath && fs.existsSync(vaultPath));
}

export function getVaultPath(): string | null {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
  if (vaultPath && fs.existsSync(vaultPath)) {
    return vaultPath;
  }
  return null;
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  emDelimiter: "_",
});

turndown.addRule("removeGarbage", {
  filter: ["script", "style", "noscript", "iframe"],
  replacement: () => "",
});

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>#^]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

async function downloadImage(url: string, destPath: string): Promise<boolean> {
  try {
    const safeUrl = validateSafeUrl(url);
    const res = await fetch(safeUrl.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Accept: "image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return false;
    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
    return true;
  } catch (err) {
    console.warn(`[ObsidianSync] Failed to download image ${url}:`, err);
    return false;
  }
}

async function localizeImages(
  markdown: string,
  targetDir: string,
  safeTitle: string,
  heroUrl?: string
): Promise<{ localizedMarkdown: string; imageCount: number }> {
  const assetsDir = path.join(targetDir, "assets");
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  // Find all remote markdown images: ![alt](url)
  const mdImgRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s\)\"']+)(?:\s+["'][^"']*["'])?\)/g;
  const urlsToDownload = new Set<string>();

  let match;
  while ((match = mdImgRegex.exec(markdown)) !== null) {
    urlsToDownload.add(match[2]);
  }

  // Also match any raw <img src="https://..."> in markdown
  const htmlImgRegex = /<img[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
  while ((match = htmlImgRegex.exec(markdown)) !== null) {
    urlsToDownload.add(match[1]);
  }

  if (heroUrl && heroUrl.startsWith("http")) {
    urlsToDownload.add(heroUrl);
  }

  let downloadedCount = 0;
  let updatedMarkdown = markdown;
  let idx = 1;

  for (const remoteUrl of urlsToDownload) {
    try {
      let ext = path.extname(new URL(remoteUrl).pathname).toLowerCase();
      if (
        !ext ||
        ext.length > 5 ||
        ![".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(ext)
      ) {
        ext = ".png";
      }

      const isHero = remoteUrl === heroUrl;
      const fileName = isHero ? `${safeTitle}-hero${ext}` : `${safeTitle}-img-${idx++}${ext}`;
      const destPath = path.join(assetsDir, fileName);

      const success = await downloadImage(remoteUrl, destPath);
      if (success) {
        downloadedCount++;
        const localRelativePath = `./assets/${fileName}`;
        updatedMarkdown = updatedMarkdown.split(remoteUrl).join(localRelativePath);
      }
    } catch {
      // Keep remote URL on parsing failure
    }
  }

  // If hero image exists and wasn't already in markdown body, prepend it
  if (heroUrl && urlsToDownload.has(heroUrl)) {
    try {
      const ext = path.extname(new URL(heroUrl).pathname).toLowerCase() || ".png";
      const heroFileName = `${safeTitle}-hero${ext}`;
      const heroDestPath = path.join(assetsDir, heroFileName);
      if (fs.existsSync(heroDestPath) && !updatedMarkdown.includes(heroFileName)) {
        updatedMarkdown = `![Hero Image](./assets/${heroFileName})\n\n${updatedMarkdown}`;
      }
    } catch {
      // ignore
    }
  }

  return { localizedMarkdown: updatedMarkdown, imageCount: downloadedCount };
}

export async function saveToObsidian(
  payload: ObsidianNotePayload
): Promise<{ filePath: string; imagesSaved: number }> {
  const vaultRoot = getVaultPath();
  if (!vaultRoot) {
    throw new Error(
      "OBSIDIAN_VAULT_NOT_MOUNTED: The Obsidian vault path is not configured or does not exist on disk."
    );
  }

  const resolvedVaultRoot = path.resolve(vaultRoot);
  const targetDir = path.resolve(resolvedVaultRoot, payload.subfolder || "01 - Inbox/Synapse");
  if (targetDir !== resolvedVaultRoot && !targetDir.startsWith(resolvedVaultRoot + path.sep)) {
    throw new Error(
      "Invalid vault subfolder: path traversal outside the Obsidian vault is blocked."
    );
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const safeTitle = sanitizeFileName(payload.title || "Untitled Article");
  const fileName = `${safeTitle}.md`;
  const fullPath = path.join(targetDir, fileName);

  let rawMarkdown = payload.contentMarkdown || "";
  if (!rawMarkdown && payload.contentHtml) {
    rawMarkdown = turndown.turndown(payload.contentHtml);
  }
  rawMarkdown = cleanArticleMarkdown(rawMarkdown, payload.title);

  // Download all embedded images into the local Obsidian assets directory
  const { localizedMarkdown, imageCount } = await localizeImages(
    rawMarkdown,
    targetDir,
    safeTitle,
    payload.thumbnailUrl
  );

  const cleanTags = Array.from(
    new Set(
      ["literature-note", ...(payload.tags || [])]
        .map((t) => t.trim().replace(/^#/, "").toLowerCase())
        .filter(Boolean)
    )
  );

  const frontmatterObj: Record<string, any> = {
    title: payload.title,
    source: payload.sourceUrl,
    author: cleanAuthor(payload.author) || "Unknown",
    date_saved: new Date().toISOString(),
    date_published: payload.publishedAt ? payload.publishedAt.toISOString() : undefined,
    feed: payload.feedTitle || undefined,
    origin_type: payload.originType || "rss",
    editorial_type: payload.editorialType || "independent",
    parent_newsletter: payload.parentNewsletterTitle || undefined,
    tags: cleanTags,
    status: "to-review",
    images_archived: imageCount,
  };

  const frontmatterLines = ["---"];
  for (const [key, val] of Object.entries(frontmatterObj)) {
    if (val === undefined) continue;
    if (Array.isArray(val)) {
      frontmatterLines.push(`${key}:`);
      for (const item of val) {
        frontmatterLines.push(`  - ${item}`);
      }
    } else {
      frontmatterLines.push(`${key}: "${String(val).replace(/"/g, '\\"')}"`);
    }
  }
  frontmatterLines.push("---");
  frontmatterLines.push("");

  // Optional User Notes Callout
  let notesBlock = "";
  if (payload.userNotes && payload.userNotes.trim().length > 0) {
    const quotedNotes = payload.userNotes
      .trim()
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    notesBlock = `> [!NOTE] 🧠 Personal Synthesis & Takeaways\n${quotedNotes}\n\n`;
  }

  const noteContent = `${frontmatterLines.join("\n")}\n# ${payload.title}\n\n${notesBlock}**Source:** [${payload.sourceUrl}](${payload.sourceUrl})\n\n${localizedMarkdown}\n`;

  fs.writeFileSync(fullPath, noteContent, "utf8");

  return { filePath: fullPath, imagesSaved: imageCount };
}
