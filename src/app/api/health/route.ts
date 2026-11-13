import { NextResponse } from "next/server";
import { sqlite } from "@/lib/db";
import { APP_VERSION } from "@/lib/version";
import { reconcileFeedbackWithObsidian } from "@/app/api/feedback/route";
import { rehydrateAndCleanTargetedSources } from "@/lib/services/sync-engine";
import { createDatabaseBackup, verifyDataInvariants } from "@/lib/services/backup-service";

export const dynamic = "force-dynamic";

let startupHygieneTriggeredForVersion: string | null = null;
const HYGIENE_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedHealthMetrics: {
  hygiene: {
    referrerLeaks: number;
    cssSnippetLeaks: number;
    openFeedbackCount: number;
  };
  invariants: ReturnType<typeof verifyDataInvariants>;
  cachedAt: number;
} | null = null;

export async function GET() {
  try {
    // Probe SQLite connection and schema readiness
    const check = sqlite.prepare("SELECT 1 as ok").get() as { ok: number };
    if (!check || check.ok !== 1) {
      return NextResponse.json(
        { status: "error", error: "Database probe failed" },
        { status: 500 }
      );
    }

    // Automatically reconcile Obsidian Feedback-Log.md with SQLite, create release snapshot, and trigger one-time in-place hygiene sweep per version
    if (startupHygieneTriggeredForVersion !== APP_VERSION) {
      startupHygieneTriggeredForVersion = APP_VERSION;
      setImmediate(() => {
        try {
          reconcileFeedbackWithObsidian();
        } catch {}
      });

      try {
        const lastVerRow = sqlite
          .prepare("SELECT value FROM settings WHERE key = 'last_hygiene_version'")
          .get() as { value: string } | undefined;
        if (!lastVerRow || lastVerRow.value !== APP_VERSION) {
          // Take an automatic atomic snapshot whenever a new version boots
          createDatabaseBackup().catch(() => {});

          rehydrateAndCleanTargetedSources({ refetch: false, limit: 3000, sinceHours: 0 })
            .then(() => {
              sqlite
                .prepare(
                  "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('last_hygiene_version', ?, CAST(strftime('%s', 'now') AS INTEGER))"
                )
                .run(APP_VERSION);
              cachedHealthMetrics = null;
            })
            .catch(() => {});
        }
      } catch {}
    }

    const now = Date.now();
    if (!cachedHealthMetrics || now - cachedHealthMetrics.cachedAt > HYGIENE_CACHE_TTL_MS) {
      const hygiene = sqlite
        .prepare(
          `SELECT
            (SELECT count(*) FROM feed_items WHERE full_content_html LIKE '%> referrerpolicy=%') AS referrerLeaks,
            (SELECT count(*) FROM feed_items WHERE snippet LIKE '%{padding%' OR snippet LIKE '%.kadence-%') AS cssSnippetLeaks,
            (SELECT count(*) FROM feedback WHERE status = 'open') AS openFeedbackCount`
        )
        .get() as {
        referrerLeaks: number;
        cssSnippetLeaks: number;
        openFeedbackCount: number;
      };

      const invariants = verifyDataInvariants(sqlite);
      cachedHealthMetrics = { hygiene, invariants, cachedAt: now };
    }

    const { hygiene, invariants } = cachedHealthMetrics;

    return NextResponse.json(
      {
        status: invariants.healthy ? "ok" : "degraded",
        version: APP_VERSION,
        uptime: Math.round(process.uptime()),
        db: invariants.healthy ? "healthy" : "invariants_violated",
        hygiene,
        invariants,
        timestamp: new Date().toISOString(),
      },
      { status: invariants.healthy ? 200 : 503 }
    );
  } catch (error: any) {
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }
}
