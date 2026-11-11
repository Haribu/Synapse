#!/usr/bin/env bun
/**
 * Queries Synapse database integrity status via the running container API.
 * Never touches the database file directly from the host.
 */

import { authenticatedFetch, resolveBaseUrl } from "./client";

async function main() {
  const baseUrl = resolveBaseUrl();
  console.log(`[Synapse DB] Checking database integrity via ${baseUrl}/api/admin/backup...`);

  try {
    const res = await authenticatedFetch("/api/admin/backup", {}, "Synapse-DB-Check/1.0");

    if (!res.ok) {
      const err = await res.text();
      console.error(`[Synapse DB] ✗ Status check failed (HTTP ${res.status}):`, err);
      process.exit(1);
    }

    const data = await res.json();
    console.log(`[Synapse DB] Live Integrity:`, data.integrity?.healthy ? "✓ OK" : "✗ CORRUPT");
    if (!data.integrity?.healthy) {
      console.error("  Messages:", data.integrity?.messages);
      process.exit(1);
    }
    console.log(`[Synapse DB] Existing Backups: ${data.backupCount}`);
    for (const b of (data.backups || []).slice(0, 5)) {
      console.log(`  - ${b.filename} (${b.sizeFormatted}, ${b.createdAt})`);
    }
  } catch (error: any) {
    console.error(`[Synapse DB] ✗ Connection error:`, error.message);
    process.exit(1);
  }
}

main();
