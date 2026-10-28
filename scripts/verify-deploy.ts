/**
 * Unified Synapse Deployment Verification Script
 * Validates container health, core endpoints, and database connection.
 * Usage: bun scripts/verify-deploy.ts
 */

const BASE_URL = process.env.SYNAPSE_URL || "http://127.0.0.1:3005";

interface CheckResult {
  name: string;
  url: string;
  status: number;
  ok: boolean;
  durationMs: number;
  details?: any;
}

async function runCheck(name: string, path: string): Promise<CheckResult> {
  const url = `${BASE_URL}${path}`;
  const start = Date.now();
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Synapse-Deploy-Verifier/1.0" } });
    const durationMs = Date.now() - start;
    let details: any = null;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      details = await res.json().catch(() => null);
    }
    return { name, url, status: res.status, ok: res.ok, durationMs, details };
  } catch (err: any) {
    return {
      name,
      url,
      status: 0,
      ok: false,
      durationMs: Date.now() - start,
      details: err.message,
    };
  }
}

async function main() {
  console.log(`\n🔍 Verifying Synapse deployment at ${BASE_URL}...\n`);

  const checks = await Promise.all([
    runCheck("Health & DB Readiness", "/api/health"),
    runCheck("Root Web UI", "/"),
    runCheck("Feedback Backlog API", "/api/feedback"),
    runCheck("Feeds API", "/api/feeds"),
  ]);

  let allPassed = true;

  for (const c of checks) {
    const icon = c.ok ? "✅" : "❌";
    const statusText = c.status ? `HTTP ${c.status}` : "CONN_REFUSED";
    console.log(`${icon} [${statusText}] ${c.name} (${c.durationMs}ms)`);
    if (c.details && typeof c.details === "object" && c.details.status) {
      console.log(
        `   └─ Version: ${c.details.version || "N/A"} · DB: ${c.details.db || "N/A"} · Uptime: ${c.details.uptime ?? "N/A"}s`
      );
      if (c.details.hygiene) {
        const h = c.details.hygiene;
        console.log(
          `   └─ Hygiene: referrerLeaks=${h.referrerLeaks}, cssSnippetLeaks=${h.cssSnippetLeaks}, openFeedback=${h.openFeedbackCount}`
        );
        if (h.referrerLeaks > 0 || h.cssSnippetLeaks > 0) {
          console.error(`   ❌ Content hygiene regression detected in database!`);
          allPassed = false;
        }
      }
    }
    if (!c.ok) {
      allPassed = false;
      if (c.details) console.log(`   └─ Error:`, c.details);
    }
  }

  console.log("");
  if (allPassed) {
    console.log("🚀 All deployment verification checks PASSED.\n");
    process.exit(0);
  } else {
    console.error("💥 One or more deployment verification checks FAILED.\n");
    process.exit(1);
  }
}

main();
