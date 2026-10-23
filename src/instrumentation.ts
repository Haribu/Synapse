export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Only run on the Node.js server during production runtime, not during static build phase
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return;
    }

    console.log("[Synapse] 🚀 Server boot detected. Scheduling startup feed synchronization...");

    // Dynamically import to keep initial process startup lean
    const { syncAllFeeds } = await import("@/lib/services/sync-engine");

    // Wait 30s for the server to finish binding port 3000, compiling routes, and settling
    setTimeout(() => {
      syncAllFeeds({ concurrency: 10 })
        .then((summary) => {
          console.log(
            `[Synapse] ✓ Startup sync finished in ${(summary.durationMs / 1000).toFixed(1)}s: ` +
              `${summary.healthyCount} healthy feeds, ${summary.newArticlesTotal} new articles ingested.`
          );
        })
        .catch((err) => {
          console.error("[Synapse] ⚠ Startup sync error:", err);
        });
    }, 2500);

    // Schedule automatic background synchronization every 30 minutes
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;
    setInterval(() => {
      console.log("[Synapse] ⏰ Running scheduled 30m background feed synchronization...");
      syncAllFeeds({ concurrency: 10 })
        .then((summary) => {
          console.log(
            `[Synapse] ✓ Scheduled sync finished in ${(summary.durationMs / 1000).toFixed(1)}s: ` +
              `${summary.healthyCount} healthy feeds, ${summary.newArticlesTotal} new articles ingested.`
          );
        })
        .catch((err) => {
          console.error("[Synapse] ⚠ Scheduled sync error:", err);
        });
    }, THIRTY_MINUTES_MS);
  }
}
