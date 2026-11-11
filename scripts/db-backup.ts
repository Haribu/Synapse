#!/usr/bin/env bun
/**
 * Triggers an atomic SQLite backup via the running Synapse container.
 * Never touches the database file directly from the host.
 */

import { authenticatedFetch, resolveBaseUrl } from "./client";

async function main() {
  const baseUrl = resolveBaseUrl();
  console.log(`[Synapse DB] Requesting atomic backup from ${baseUrl}/api/admin/backup...`);

  try {
    const res = await authenticatedFetch(
      "/api/admin/backup",
      { method: "POST" },
      "Synapse-DB-Backup/1.0"
    );

    if (!res.ok) {
      const err = await res.text();
      console.error(`[Synapse DB] ✗ Backup failed (HTTP ${res.status}):`, err);
      process.exit(1);
    }

    const data = await res.json();
    console.log(`[Synapse DB] ✓ Success:`, data.message);
    if (data.backup) {
      console.log(`  File: ${data.backup.filename}`);
      console.log(`  Size: ${(data.backup.sizeBytes / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`  Duration: ${data.backup.durationMs}ms`);
    }
  } catch (error: any) {
    console.error(`[Synapse DB] ✗ Connection error:`, error.message);
    process.exit(1);
  }
}

main();
