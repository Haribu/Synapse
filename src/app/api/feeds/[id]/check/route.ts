import { NextResponse } from "next/server";
import { syncSingleFeed } from "@/lib/services/sync-engine";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await syncSingleFeed(id);

    return NextResponse.json({
      healthy: result.healthy,
      status: result.status,
      newItemsCount: result.newItemsCount,
      durationMs: result.durationMs,
      error: result.error,
      message: result.healthy
        ? `Feed is healthy. Fetched ${result.newItemsCount} new items (${result.durationMs}ms).`
        : `Check failed: ${result.error}`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
