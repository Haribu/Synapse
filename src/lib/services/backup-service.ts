import path from "path";
import fs from "fs";
import { sqlite } from "@/lib/db";
import {
  checkDatabaseInvariants,
  type DatabaseInvariantsReport,
} from "@/lib/db/reconcile";

const BACKUP_DIR = process.env.SYNAPSE_BACKUP_DIR || path.join(process.cwd(), "backups");

export interface BackupInfo {
  filename: string;
  filepath: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Ensure backup directory exists.
 */
export function ensureBackupDir(): string {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  return BACKUP_DIR;
}

export type DataInvariantsReport = DatabaseInvariantsReport;

/**
 * Verify that core user-data floors are intact before rotating backups or passing deploy checks.
 * Delegates to unified checkDatabaseInvariants with environmental calibration.
 */
export function verifyDataInvariants(
  customDb: any = sqlite,
  thresholds?: Partial<{ feeds: number; readingSessions: number; starred: number; work: number }>
): DataInvariantsReport {
  return checkDatabaseInvariants(customDb, thresholds);
}

/**
 * Perform a live, zero-lock SQLite atomic snapshot using VACUUM INTO.
 * Guarantees a fully defragmented, non-WAL verified backup file.
 */
export async function createDatabaseBackup(): Promise<{
  success: boolean;
  filename: string;
  filepath: string;
  sizeBytes: number;
  durationMs: number;
  prunedCount?: number;
  error?: string;
}> {
  const startTime = Date.now();
  ensureBackupDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `synapse-backup-${timestamp}.db`;
  const targetPath = path.join(BACKUP_DIR, filename);

  try {
    // VACUUM INTO creates a brand new, defragmented single-file database copy atomically
    sqlite.exec(`VACUUM INTO '${targetPath.replace(/'/g, "''")}';`);

    const stat = fs.statSync(targetPath);
    const durationMs = Date.now() - startTime;

    console.log(
      `[BackupService] ✓ Created atomic backup: ${filename} (${formatBytes(stat.size)}, ${durationMs}ms)`
    );

    // Anti-poisoning guard: only prune older backups if current data invariants pass
    // and the new backup is at least 50% of the largest existing backup size.
    const invariants = verifyDataInvariants(sqlite);
    const existingBackups = listBackups();
    const maxExistingSize = existingBackups.reduce((max, b) => Math.max(max, b.sizeBytes), 0);
    const sizeHealthy = maxExistingSize === 0 || stat.size >= maxExistingSize * 0.5;

    let prunedCount = 0;
    if (invariants.healthy && sizeHealthy) {
      prunedCount = pruneOldBackups(7);
    } else {
      console.warn(
        `[BackupService] ⚠️ Skipping backup pruning to protect historical snapshots (invariantsHealthy=${invariants.healthy}, sizeHealthy=${sizeHealthy}, violations=${invariants.violations.join(", ")})`
      );
    }

    return {
      success: true,
      filename,
      filepath: targetPath,
      sizeBytes: stat.size,
      durationMs,
      prunedCount,
    };
  } catch (error: any) {
    console.error("[BackupService] ✗ Backup failed:", error);
    // Remove incomplete file if it exists
    if (fs.existsSync(targetPath)) {
      try {
        fs.unlinkSync(targetPath);
      } catch {}
    }
    return {
      success: false,
      filename,
      filepath: targetPath,
      sizeBytes: 0,
      durationMs: Date.now() - startTime,
      error: error.message,
    };
  }
}

/**
 * List all existing backups ordered from newest to oldest.
 */
export function listBackups(): BackupInfo[] {
  ensureBackupDir();

  try {
    const files = fs.readdirSync(BACKUP_DIR);
    return files
      .filter((f) => f.startsWith("synapse-backup-") && f.endsWith(".db"))
      .map((f) => {
        const fp = path.join(BACKUP_DIR, f);
        const stat = fs.statSync(fp);
        return {
          filename: f,
          filepath: fp,
          sizeBytes: stat.size,
          sizeFormatted: formatBytes(stat.size),
          createdAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

/**
 * Prune old backups, retaining the most recent `keepCount` snapshots
 * plus preserving at least one historical anchor snapshot (>24h old) if present.
 */
export function pruneOldBackups(keepCount = 7): number {
  const backups = listBackups();
  if (backups.length <= keepCount) return 0;

  const nowMs = Date.now();
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;
  // Find the newest backup that is at least 24 hours old to serve as a daily anchor
  const anchorBackup = backups.find(
    (b) => nowMs - new Date(b.createdAt).getTime() >= twentyFourHoursMs
  );

  const toDelete = backups
    .slice(keepCount)
    .filter((b) => !anchorBackup || b.filename !== anchorBackup.filename);
  let deletedCount = 0;

  for (const b of toDelete) {
    try {
      fs.unlinkSync(b.filepath);
      deletedCount++;
      console.log(`[BackupService] Pruned old backup: ${b.filename}`);
    } catch (e) {
      console.warn(`[BackupService] Failed to delete old backup ${b.filename}:`, e);
    }
  }

  return deletedCount;
}

/**
 * Run a full PRAGMA integrity_check on the live database.
 */
export function verifyLiveIntegrity(): {
  healthy: boolean;
  messages: string[];
} {
  try {
    const rows = sqlite.pragma("integrity_check") as Array<{ integrity_check: string }>;
    const messages = rows.map((r) => r.integrity_check);
    const healthy = messages.length === 1 && messages[0] === "ok";
    return { healthy, messages };
  } catch (error: any) {
    return { healthy: false, messages: [error.message] };
  }
}
