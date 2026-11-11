#!/usr/bin/env bun
/**
 * Triggers rehydration, cleaning, and syncing of all targeted/enhanced sources
 * via the running Synapse container API.
 */

import { authenticatedFetch, resolveBaseUrl } from "./client";

async function main() {
  const args = process.argv.slice(2);
  const refetch = args.includes("--refetch");
  const noSync = args.includes("--no-sync");

  const baseUrl = resolveBaseUrl();
  console.log(`[Synapse Rehydrate] Triggering targeted rehydration on ${baseUrl}...`);
  if (refetch) console.log(`  Mode: Full network re-fetch enabled (--refetch)`);

  try {
    const res = await authenticatedFetch(
      "/api/admin/rehydrate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refetch, sync: !noSync }),
      },
      "Synapse-Rehydrate/1.0"
    );

    if (!res.ok) {
      const err = await res.text();
      console.error(`[Synapse Rehydrate] ✗ Failed (HTTP ${res.status}):`, err);
      process.exit(1);
    }

    const data = await res.json();
    console.log(`[Synapse Rehydrate] ✓ Success!`);
    if (data.rehydrate) {
      console.log(`  Total Targeted Articles: ${data.rehydrate.totalTargeted}`);
      console.log(`  Cleaned & Updated in DB: ${data.rehydrate.cleanedStoredCount}`);
      console.log(`  Full Re-fetched Articles: ${data.rehydrate.refetchedCount}`);
      console.log(`  Videos Auto-Tagged: ${data.rehydrate.videosTaggedCount}`);
      console.log(`  Entities Decoded: ${data.rehydrate.entitiesDecodedCount}`);
      console.log(`  Duration: ${data.rehydrate.durationMs}ms`);
    }
    if (data.sync) {
      console.log(
        `[Synapse Sync] ✓ Feeds Synced: ${data.sync.healthyCount} / ${data.sync.totalFeeds} healthy, ${data.sync.newArticlesTotal} new articles.`
      );
    }
  } catch (error: any) {
    console.error(`[Synapse Rehydrate] ✗ Connection error:`, error.message);
    process.exit(1);
  }
}

main();
