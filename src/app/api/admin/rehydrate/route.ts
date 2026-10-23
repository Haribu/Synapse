import { NextResponse } from "next/server";
import { rehydrateAndCleanTargetedSources, syncAllFeeds } from "@/lib/services/sync-engine";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const refetch = Boolean(body.refetch);
    const sync = body.sync !== false;
    const limit = typeof body.limit === "number" ? body.limit : 1000;
    const sinceHours = typeof body.sinceHours === "number" ? body.sinceHours : 58;

    const rehydrateSummary = await rehydrateAndCleanTargetedSources({ refetch, limit, sinceHours });

    let syncSummary = null;
    if (sync) {
      syncSummary = await syncAllFeeds({ concurrency: 16 });
    }

    return NextResponse.json({
      success: true,
      rehydrate: rehydrateSummary,
      sync: syncSummary,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
