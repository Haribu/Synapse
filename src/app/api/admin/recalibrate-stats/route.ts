import { NextResponse } from "next/server";
import { db, sqlite } from "@/lib/db";
import { createDatabaseBackup } from "@/lib/services/backup-service";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    // 1. Safety backup snapshot before making modifications
    const preBackup = await createDatabaseBackup();

    // 2. Perform atomic recalibration of historical telemetry
    const recalibrateTx = sqlite.transaction(() => {
      // Reclassify sessions based on 3-tier dwell thresholds:
      // < 10s: flick (quick dismissal)
      const flicksResult = sqlite
        .prepare(
          `
        UPDATE reading_sessions 
        SET action = 'flick' 
        WHERE duration_seconds < 10 
          AND action IN ('read', 'skim', 'flick')
      `
        )
        .run();

      // 10s - 29s: skim (summary scan)
      const skimsResult = sqlite
        .prepare(
          `
        UPDATE reading_sessions 
        SET action = 'skim' 
        WHERE duration_seconds >= 10 
          AND duration_seconds < 30 
          AND action IN ('read', 'skim', 'flick')
      `
        )
        .run();

      // >= 30s: genuine engaged read
      const readsResult = sqlite
        .prepare(
          `
        UPDATE reading_sessions 
        SET action = 'read' 
        WHERE duration_seconds >= 30 
          AND action IN ('read', 'skim', 'flick')
      `
        )
        .run();

      // Reset is_engaged_read on feed_items where duration was < 30s
      const unengageResult = sqlite
        .prepare(
          `
        UPDATE feed_items 
        SET is_engaged_read = 0 
        WHERE is_engaged_read = 1 
          AND (
            coalesce(read_duration_seconds, 0) < 30
            OR id NOT IN (
              SELECT DISTINCT target_id 
              FROM reading_sessions 
              WHERE action = 'read' AND duration_seconds >= 30
            )
          )
      `
        )
        .run();

      // Ensure items with verified >= 30s dwell are correctly flagged as engaged reads
      const engageResult = sqlite
        .prepare(
          `
        UPDATE feed_items 
        SET is_engaged_read = 1 
        WHERE id IN (
          SELECT DISTINCT target_id 
          FROM reading_sessions 
          WHERE action = 'read' AND duration_seconds >= 30
        )
      `
        )
        .run();

      return {
        flicksUpdated: flicksResult.changes,
        skimsUpdated: skimsResult.changes,
        readsConfirmed: readsResult.changes,
        itemsUnengaged: unengageResult.changes,
        itemsEngagedConfirmed: engageResult.changes,
      };
    });

    const metrics = recalibrateTx();

    return NextResponse.json({
      status: "ok",
      message: "Option A Recalibration successfully applied to historical telemetry",
      preBackup,
      metrics,
    });
  } catch (error: any) {
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }
}
