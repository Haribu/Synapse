import { NextResponse } from "next/server";
import { getFeedAuditRecommendations } from "@/lib/services/feed-audit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getFeedAuditRecommendations();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[API] /api/feeds/audit error:", error);
    return NextResponse.json({ error: error.message || "Failed to audit feeds" }, { status: 500 });
  }
}
