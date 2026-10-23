import { NextResponse } from "next/server";
import { syncAllFeeds, isBatchSyncInProgress } from "@/lib/services/sync-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ inProgress: isBatchSyncInProgress() });
}

export async function POST(req: Request) {
  try {
    if (isBatchSyncInProgress()) {
      return NextResponse.json(
        { message: "Sync batch is already in progress", inProgress: true },
        { status: 409 }
      );
    }

    // Run sync in background and return immediate 202 Accepted or await summary
    const url = new URL(req.url);
    const asyncMode = url.searchParams.get("async") === "true";

    if (asyncMode) {
      syncAllFeeds({ concurrency: 10, forceAll: true }).catch((err) =>
        console.error("Async sync-all failed", err)
      );
      return NextResponse.json({
        message: "Full feed sync started in background",
        inProgress: true,
      });
    }

    const summary = await syncAllFeeds({ concurrency: 10, forceAll: true });
    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
