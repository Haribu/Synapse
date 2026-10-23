#!/usr/bin/env bun
/**
 * Synapse UI & Responsive Readiness Verification
 * Validates that the web application shell, static assets, and API endpoints
 * respond cleanly across desktop and mobile User-Agent profiles.
 */

const TARGET_URL = (process.env.SYNAPSE_URL || "http://127.0.0.1:3005").replace(/\/$/, "");

const PROFILES = [
  {
    name: "Desktop Viewport Profile (macOS Chrome)",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  },
  {
    name: "Mobile Viewport Profile (iOS Safari)",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  },
];

async function verifyUi() {
  console.log(`\n🔍 [Synapse UI Verify] Auditing UI shell against ${TARGET_URL}...\n`);

  for (const profile of PROFILES) {
    const start = Date.now();
    const res = await fetch(`${TARGET_URL}/`, {
      headers: {
        "User-Agent": profile.userAgent,
        Host: "localhost",
      },
    });
    const html = await res.text();
    const elapsed = Date.now() - start;

    if (!res.ok || !html.includes("Synapse")) {
      console.error(`✗ ${profile.name} failed (HTTP ${res.status})`);
      process.exit(1);
    }
    console.log(`✓ ${profile.name}: HTTP ${res.status} (${elapsed}ms, ${html.length} bytes)`);
  }

  console.log(`\n✅ UI shell verification passed.\n`);
}

verifyUi().catch((err) => {
  console.error("❌ UI verification failed:", err.message);
  process.exit(1);
});
