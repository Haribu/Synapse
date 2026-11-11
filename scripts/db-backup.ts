#!/usr/bin/env bun
/**
 * Triggers an atomic SQLite backup via the running Synapse container.
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
  console.log(`[Synapse DB] Requesting atomic backup from ${BASE_URL}/api/admin/backup...`);

  try {
    const allowedEmail = resolveAllowedEmail();
    const headers: Record<string, string> = { "User-Agent": "Synapse-DB-Backup/1.0" };
    if (allowedEmail) {
      headers["CF-Access-Authenticated-User-Email"] = allowedEmail;
    }

    const res = await fetch(`${BASE_URL}/api/admin/backup`, {
      method: "POST",
      headers,
    });

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
