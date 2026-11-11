#!/usr/bin/env bun
/**
 * Queries Synapse database integrity status via the running container API.
 * Never touches the database file directly from the host.
 */

import fs from "fs";

export {};

const SYNAPSE_PORT = process.env.SYNAPSE_PORT || "3005";
const BASE_URL = `http://127.0.0.1:${SYNAPSE_PORT}`;

function resolveAllowedEmail(): string {
  if (process.env.ALLOWED_EMAILS) {
    return process.env.ALLOWED_EMAILS.split(",")[0]?.trim() || "";
  }
  try {
    if (fs.existsSync("docker-compose.override.yml")) {
      const content = fs.readFileSync("docker-compose.override.yml", "utf8");
      const match = content.match(/ALLOWED_EMAILS=([^\s\n]+)/);
      if (match?.[1]) {
        return match[1].split(",")[0]?.trim() || "";
      }
    }
  } catch {}
  return "";
}

async function main() {
  console.log(`[Synapse DB] Checking database integrity via ${BASE_URL}/api/admin/backup...`);

  try {
    const allowedEmail = resolveAllowedEmail();
    const headers: Record<string, string> = { "User-Agent": "Synapse-DB-Check/1.0" };
    if (allowedEmail) {
      headers["CF-Access-Authenticated-User-Email"] = allowedEmail;
    }

    const res = await fetch(`${BASE_URL}/api/admin/backup`, { headers });

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
