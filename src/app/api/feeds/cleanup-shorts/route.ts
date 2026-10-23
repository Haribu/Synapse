import { NextResponse } from "next/server";
import { purgeYouTubeShorts } from "@/lib/services/sync-engine";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = purgeYouTubeShorts();
    return NextResponse.json({
      success: true,
      message: `Successfully purged ${result.deletedCount} YouTube Shorts`,
      deletedCount: result.deletedCount,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
