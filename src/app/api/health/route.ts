import { NextResponse } from "next/server";
import { sqlite } from "@/lib/db";

export const dynamic = "force-dynamic";

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

    return NextResponse.json({
      status: "ok",
      uptime: Math.round(process.uptime()),
      db: "healthy",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }
}
