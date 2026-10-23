import { NextResponse } from "next/server";
import {
  createDatabaseBackup,
  listBackups,
  verifyLiveIntegrity,
} from "@/lib/services/backup-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const integrity = verifyLiveIntegrity();
    const backups = listBackups();

    return NextResponse.json({
      status: "ok",
      integrity,
      backupCount: backups.length,
      backups,
    });
  } catch (error: any) {
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const result = await createDatabaseBackup();
    if (!result.success) {
      return NextResponse.json({ status: "error", error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      status: "ok",
      backup: result,
      message: `Atomic snapshot successfully created: ${result.filename}`,
    });
  } catch (error: any) {
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }
}
