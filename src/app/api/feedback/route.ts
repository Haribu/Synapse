import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { feedback } from "@/lib/db/schema";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { desc, eq } from "drizzle-orm";
import { getVaultPath } from "@/lib/services/obsidian-sync";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      category = "General",
      comment,
      articleId,
      articleTitle,
      currentView,
      status = "open",
      resolutionNotes,
    } = body;

    if (!comment || comment.trim().length === 0) {
      return NextResponse.json({ error: "Comment is required" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const now = new Date();
    const userAgent = req.headers.get("user-agent") || "Unknown Device";

    // 1. Insert into SQLite feedback table
    db.insert(feedback)
      .values({
        id,
        category,
        comment: comment.trim(),
        articleId: articleId || null,
        articleTitle: articleTitle || null,
        currentView: currentView || null,
        deviceInfo: userAgent.slice(0, 200),
        status,
        resolutionNotes: resolutionNotes || null,
        createdAt: now,
      })
      .run();

    // 2. Mirror into Obsidian vault Feedback-Log.md IF mounted
    try {
      const vaultRoot = getVaultPath();
      if (vaultRoot) {
        const targetDir = path.join(vaultRoot, "01 - Inbox/Synapse");
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        const feedbackFilePath = path.join(targetDir, "Feedback-Log.md");

        if (!fs.existsSync(feedbackFilePath)) {
          fs.writeFileSync(
            feedbackFilePath,
            `---\ntitle: "Synapse Feedback & Feature Backlog"\ntags:\n  - synapse\n  - feedback\n  - backlog\ncreated: "${now.toISOString()}"\n---\n\n# 💬 Synapse User Feedback & Ideas\n\nCurated user feedback from Synapse sessions for iteration.\n\n---\n\n`,
            "utf8"
          );
        }

        const logEntry = `### [${category}] ${now.toLocaleString("en-GB")}\n*Status:* ⏳ **Open**\n\n${comment.trim()}\n\n${
          articleTitle ? `*Context Article:* **${articleTitle}**\n` : ""
        }${currentView ? `*View:* \`${currentView}\`\n` : ""}\n---\n\n`;

        fs.appendFileSync(feedbackFilePath, logEntry, "utf8");
      }
    } catch (obsidianErr) {
      console.warn("[Feedback] Could not write to Obsidian vault mirror:", obsidianErr);
    }

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function updateObsidianFeedbackLog(comment: string, newStatus: string, notes?: string | null) {
  try {
    const vaultRoot = getVaultPath();
    if (!vaultRoot) return;
    const feedbackFilePath = path.join(vaultRoot, "01 - Inbox/Synapse/Feedback-Log.md");
    if (!fs.existsSync(feedbackFilePath)) return;

    const fileContent = fs.readFileSync(feedbackFilePath, "utf8");
    const sections = fileContent.split(/\n(?=### )/);
    const key = comment.slice(0, 45).trim().toLowerCase();

    let modified = false;
    const newSections = sections.map((sec) => {
      if (!sec.startsWith("### ")) return sec;
      if (sec.toLowerCase().includes(key)) {
        modified = true;
        const statusBadge =
          newStatus === "implemented" || newStatus === "resolved"
            ? `✅ **Implemented**${notes ? ` — *${notes}*` : ""}`
            : `⏳ **Open**`;
        return sec.replace(/\*Status:\*\s*[^\n]+/i, `*Status:* ${statusBadge}`);
      }
      return sec;
    });

    if (modified) {
      fs.writeFileSync(feedbackFilePath, newSections.join("\n"), "utf8");
    }
  } catch (err) {
    console.warn("[Feedback] Could not sync status to Obsidian:", err);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { id, status, resolutionNotes } = body;

    if (!id) {
      return NextResponse.json({ error: "Feedback ID is required" }, { status: 400 });
    }

    const existing = db.select().from(feedback).where(eq(feedback.id, id)).get();
    if (!existing) {
      return NextResponse.json({ error: "Feedback item not found" }, { status: 404 });
    }

    const updatePayload: Record<string, any> = {};
    if (status) updatePayload.status = status;
    if (resolutionNotes !== undefined) updatePayload.resolutionNotes = resolutionNotes;
    if (status === "implemented" || status === "resolved") {
      updatePayload.resolvedAt = new Date();
    }

    db.update(feedback).set(updatePayload).where(eq(feedback.id, id)).run();

    // Mirror status update to mounted Obsidian Feedback-Log.md
    if (status) {
      updateObsidianFeedbackLog(
        existing.comment,
        status,
        resolutionNotes !== undefined ? resolutionNotes : existing.resolutionNotes
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    // 1. Reconcile statuses from canonical Obsidian Feedback-Log.md IF vault is mounted
    try {
      const vaultRoot = getVaultPath();
      if (vaultRoot) {
        const feedbackFilePath = path.join(vaultRoot, "01 - Inbox/Synapse/Feedback-Log.md");
        if (fs.existsSync(feedbackFilePath)) {
          const fileContent = fs.readFileSync(feedbackFilePath, "utf8");
          const sections = fileContent.split(/\n(?=### )/);

          // Map comment prefix -> { status, notes }
          const statusMap = new Map<string, { status: string; notes?: string }>();
          for (const sec of sections) {
            if (!sec.startsWith("### ")) continue;
            const isImplemented = sec.includes("✅ **Implemented**");
            const isOpen = sec.includes("⏳ **Open**");

            let notes: string | undefined;
            const statusMatch = sec.match(
              /\*Status:\*\s*✅\s*\*\*Implemented\*\*(?:\s*—\s*\*([^*]+)\*)?/i
            );
            if (statusMatch && statusMatch[1]) {
              notes = statusMatch[1].trim();
            }

            const lines = sec.split("\n");
            let commentLines: string[] = [];
            let recording = false;
            for (const l of lines) {
              if (recording) {
                if (
                  l.startsWith("*Context Article:*") ||
                  l.startsWith("*View:*") ||
                  l.startsWith("---")
                )
                  break;
                if (l.trim()) commentLines.push(l.trim());
              } else if (l.startsWith("*Status:*")) {
                recording = true;
              }
            }
            const commentKey = commentLines.join(" ").slice(0, 45).trim().toLowerCase();
            if (commentKey) {
              statusMap.set(commentKey, {
                status: isImplemented ? "implemented" : isOpen ? "open" : "open",
                notes,
              });
            }
          }

          const dbItems = db.select().from(feedback).all();
          for (const item of dbItems) {
            const key = item.comment.slice(0, 45).trim().toLowerCase();
            const match = statusMap.get(key);
            
            // Only update SQLite if Obsidian has newly marked it implemented
            if (match && match.status === "implemented" && item.status !== "implemented") {
              db.update(feedback)
                .set({
                  status: "implemented",
                  resolutionNotes: match.notes || item.resolutionNotes,
                  resolvedAt: item.resolvedAt || new Date(),
                })
                .where(eq(feedback.id, item.id))
                .run();
            } 
            // If SQLite is already implemented, but Obsidian still shows Open, update Obsidian (never downgrade SQLite)
            else if (item.status === "implemented" && match && match.status !== "implemented") {
              updateObsidianFeedbackLog(item.comment, "implemented", item.resolutionNotes);
            }
          }
        }
      }
    } catch (syncErr) {
      console.warn("[Feedback] Vault status sync error:", syncErr);
    }

    // 2. Prune closed feedback older than 7 days from the in-app SQLite database
    // All open items are always preserved; historical closed entries remain in Obsidian Feedback-Log.md
    try {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const allDbItems = db.select().from(feedback).all();
      for (const item of allDbItems) {
        const isClosed = item.status === "implemented" || item.status === "resolved";
        if (isClosed) {
          const itemTime = item.resolvedAt
            ? new Date(item.resolvedAt).getTime()
            : item.createdAt
              ? new Date(item.createdAt).getTime()
              : 0;
          if (itemTime > 0 && itemTime < sevenDaysAgo) {
            db.delete(feedback).where(eq(feedback.id, item.id)).run();
          }
        }
      }
    } catch (pruneErr) {
      console.warn("[Feedback] Could not prune old closed feedback from SQLite:", pruneErr);
    }

    const list = db.select().from(feedback).orderBy(desc(feedback.createdAt)).all();
    return NextResponse.json({ feedback: list });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
