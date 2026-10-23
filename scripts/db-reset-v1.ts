#!/usr/bin/env bun
/**
 * Triggers the v1.0.0 Production Reset via Synapse Container API.
 * Resets reading stats and marks articles from last 48h as unread.
 */

export {};

const SYNAPSE_PORT = process.env.SYNAPSE_PORT || "3005";
const BASE_URL = `http://127.0.0.1:${SYNAPSE_PORT}`;

async function main() {
  console.log(`[Synapse v1.0.0 Reset] Requesting reset from ${BASE_URL}/api/admin/reset-stats...`);

  try {
    const res = await fetch(`${BASE_URL}/api/admin/reset-stats`, {
      method: "POST",
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[Synapse v1.0.0 Reset] ✗ Failed (HTTP ${res.status}):`, err);
      process.exit(1);
    }

    const data = await res.json();
    console.log(`[Synapse v1.0.0 Reset] ✓ ${data.message}`);
    console.log(`  Total Articles: ${data.resetMetrics.totalArticles}`);
    console.log(`  Unread (Last 48 Hours): ${data.resetMetrics.unreadArticlesLast48Hours}`);
    console.log(`  Archived as Read: ${data.resetMetrics.archivedReadArticles}`);
    console.log(`  Sessions Cleared: ${data.resetMetrics.readingSessionsCleared}`);
    console.log(`  Engagement Zeroed: ${data.resetMetrics.engagementMetricsZeroed}`);
    if (data.postBackup) {
      console.log(
        `  Snapshot Created: ${data.postBackup.filename} (${(data.postBackup.sizeBytes / (1024 * 1024)).toFixed(2)} MB)`
      );
    }
  } catch (error: any) {
    console.error(`[Synapse v1.0.0 Reset] ✗ Connection error:`, error.message);
    process.exit(1);
  }
}

main();
