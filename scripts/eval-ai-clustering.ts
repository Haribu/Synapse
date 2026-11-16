/**
 * Live evaluation script for AI story clustering.
 * Runs against the configured SYNAPSE_AI_* endpoint in .env with a realistic
 * set of multi-feed RSS articles (true pairs, paraphrased headlines, 3-way stories,
 * same-topic traps, same-feed traps, >48h traps, and weekly roundups).
 */
import { groupArticlesWithAi, getAiClusteringConfig, type AiClusterCandidate } from "../src/lib/utils/ai-clustering";

const now = Date.now();
const hour = 60 * 60 * 1000;

const fixtures: AiClusterCandidate[] = [
  // Group A: Paraphrased product launch (0 shared non-stop title words except maybe company)
  {
    id: "gA-1",
    feedId: "anthropic-blog",
    feedTitle: "Anthropic News",
    feedEditorialType: "official",
    title: "Introducing Claude 4.5 Haiku for low-latency coding",
    snippet: "Today we are releasing our fastest small model with improved tool use and SWE-bench scores.",
    publishedAt: now - 2 * hour,
  },
  {
    id: "gA-2",
    feedId: "the-verge",
    feedTitle: "The Verge",
    feedEditorialType: "news",
    title: "Anthropic's new lightweight AI model targets real-time developer workflows",
    snippet: "The updated Haiku tier cuts response times in half while matching last year's flagship on coding.",
    publishedAt: now - 1 * hour,
  },
  {
    id: "gA-3",
    feedId: "simon-willison",
    feedTitle: "Simon Willison's Weblog",
    feedEditorialType: "independent",
    title: "Notes on the new Haiku 4.5 release",
    snippet: "Tested the new fast Anthropic release on SQLite extraction tasks; latency is noticeably snappier.",
    publishedAt: now - 30 * 60 * 1000,
  },

  // Group B: Same security incident, completely different headline framing
  {
    id: "gB-1",
    feedId: "bleeping-computer",
    feedTitle: "BleepingComputer",
    feedEditorialType: "news",
    title: "Scattered Spider hackers breach major UK retailer's Okta tenant",
    snippet: "Attackers used helpdesk social engineering to enroll rogue MFA devices and exfiltrate customer records.",
    publishedAt: now - 5 * hour,
  },
  {
    id: "gB-2",
    feedId: "krebs",
    feedTitle: "Krebs on Security",
    feedEditorialType: "independent",
    title: "Helpdesk Vishing Campaign Hits British Retail Giant",
    snippet: "Sources confirm threat actors impersonated IT staff to reset MFA tokens on an identity provider.",
    publishedAt: now - 4 * hour,
  },

  // Trap 1: Same broad topic (AI coding / Anthropic) but DIFFERENT event/essay
  {
    id: "trap-topic-1",
    feedId: "pragmatic-eng",
    feedTitle: "The Pragmatic Engineer",
    feedEditorialType: "independent",
    title: "How Stripe structures its internal AI code review pipeline",
    snippet: "A deep dive into static analysis, LLM reviewers, and rollout metrics inside Stripe engineering.",
    publishedAt: now - 3 * hour,
  },
  {
    id: "trap-topic-2",
    feedId: "martinfowler",
    feedTitle: "Martin Fowler",
    feedEditorialType: "independent",
    title: "Context engineering for legacy codebases",
    snippet: "Patterns for keeping agentic coding assistants grounded in architectural boundaries.",
    publishedAt: now - 6 * hour,
  },

  // Trap 2: Same feed as gA-2 (must NOT be grouped with gA-2)
  {
    id: "trap-same-feed",
    feedId: "the-verge",
    feedTitle: "The Verge",
    feedEditorialType: "news",
    title: "Why Apple is delaying its smart home display until next spring",
    snippet: "Supply chain and Siri integration delays push the tabletop hub into 2027.",
    publishedAt: now - 2 * hour,
  },

  // Trap 3: Weekly digest mentioning Anthropic Haiku and UK retailer breach
  {
    id: "trap-digest",
    feedId: "tldr-sec",
    feedTitle: "tl;dr sec",
    feedEditorialType: "community",
    title: "Weekly Roundup #250: Haiku 4.5, UK Retail Breach, and Cloud IAM",
    snippet: "This week's curated links covering Anthropic's new model, helpdesk vishing, and IAM hardening.",
    publishedAt: now - 1 * hour,
  },

  // Trap 4: Stale article (>48h old) about an earlier Anthropic release
  {
    id: "trap-stale",
    feedId: "techcrunch",
    feedTitle: "TechCrunch",
    feedEditorialType: "news",
    title: "Anthropic rolls out Claude 4.5 Haiku preview to enterprise partners",
    snippet: "Early enterprise preview begins ahead of general availability.",
    publishedAt: now - 72 * hour,
  },

  // Group C: 2-source acquisition story
  {
    id: "gC-1",
    feedId: "reuters-tech",
    feedTitle: "Reuters",
    feedEditorialType: "news",
    title: "Cisco agrees to acquire observability startup DashMetrics for $1.8B",
    snippet: "The networking giant will fold DashMetrics into its security and telemetry suite.",
    publishedAt: now - 8 * hour,
  },
  {
    id: "gC-2",
    feedId: "dashmetrics-blog",
    feedTitle: "DashMetrics Blog",
    feedEditorialType: "official",
    title: "DashMetrics is joining Cisco",
    snippet: "We're thrilled to announce our definitive agreement to become part of Cisco.",
    publishedAt: now - 7 * hour,
  },
];

const loop2Adversarial: AiClusterCandidate[] = [
  // Trap: Two DIFFERENT CVEs in the same vendor (Ivanti) within 12 hours -> MUST NOT group
  {
    id: "cve-diff-1",
    feedId: "bleeping-computer",
    feedTitle: "BleepingComputer",
    feedEditorialType: "news",
    title: "Ivanti patches critical RCE flaw CVE-2026-41001 in Connect Secure",
    snippet: "Administrators urged to apply patch for CVE-2026-41001 affecting gateway appliances.",
    publishedAt: now - 2 * hour,
  },
  {
    id: "cve-diff-2",
    feedId: "the-record",
    feedTitle: "The Record",
    feedEditorialType: "news",
    title: "New Ivanti Policy Secure DoS bug CVE-2026-41099 disclosed",
    snippet: "A medium-severity denial of service issue CVE-2026-41099 impacts Policy Secure.",
    publishedAt: now - 1 * hour,
  },

  // Trap: Two DIFFERENT AI funding rounds on the same day -> MUST NOT group
  {
    id: "fund-1",
    feedId: "techcrunch",
    feedTitle: "TechCrunch",
    feedEditorialType: "news",
    title: "AI coding startup Cursor raises $400M Series C",
    snippet: "The valuation climbs as enterprise adoption of AI editors accelerates.",
    publishedAt: now - 4 * hour,
  },
  {
    id: "fund-2",
    feedId: "venturebeat",
    feedTitle: "VentureBeat",
    feedEditorialType: "news",
    title: "Voice AI lab ElevenLabs closes $250M growth round",
    snippet: "Fresh capital will expand dubbing and real-time speech synthesis.",
    publishedAt: now - 3 * hour,
  },

  // True group: YouTube video + official blog on the exact same release -> SHOULD group
  {
    id: "yt-1",
    feedId: "fireship-yt",
    feedTitle: "Fireship",
    feedEditorialType: "community",
    title: "Bun 2.0 just changed JavaScript forever...",
    snippet: "Oven released Bun 2.0 today with native Windows builds and zero-copy SQLite.",
    publishedAt: now - 2 * hour,
  },
  {
    id: "blog-1",
    feedId: "bun-blog",
    feedTitle: "Bun Blog",
    feedEditorialType: "official",
    title: "Bun v2.0",
    snippet: "Native Windows support, faster bundler, and built-in SQLite improvements.",
    publishedAt: now - 3 * hour,
  },

  // Trap: Newsletter/digest whose title doesn't match our regex ("This Week in Rust 612") -> AI should NOT group with individual Rust news
  {
    id: "rust-digest",
    feedId: "twir",
    feedTitle: "This Week in Rust",
    feedEditorialType: "community",
    title: "This Week in Rust 612",
    snippet: "Updates on Rust 1.94, Bun FFI bindings, and Cargo workspace caching.",
    publishedAt: now - 1 * hour,
  },
];

async function main() {
  const config = getAiClusteringConfig();
  if (!config) {
    console.error("AI clustering is not configured in .env");
    process.exit(1);
  }

  console.log(`Evaluating ${fixtures.length} articles using model=${config.model} at ${config.baseUrl}`);
  const start = Date.now();
  const groups = await groupArticlesWithAi(fixtures, { config });
  const elapsed = Date.now() - start;

  console.log(`\nCompleted in ${elapsed}ms. Formed ${groups.length} group(s):\n`);
  for (const g of groups) {
    console.log(`=== Group (Primary: ${g.primaryId}) ===`);
    if (g.reason) console.log(`Reason: ${g.reason}`);
    for (const id of g.memberIds) {
      const item = fixtures.find((f) => f.id === id);
      console.log(`  - [${id}] (${item?.feedTitle}) ${item?.title}`);
    }
    console.log("");
  }

  const groupedIds = new Set(groups.flatMap((g) => g.memberIds));
  const ungrouped = fixtures.filter((f) => !groupedIds.has(f.id));
  console.log(`Ungrouped (${ungrouped.length}):`);
  for (const u of ungrouped) {
    console.log(`  - [${u.id}] (${u.feedTitle}) ${u.title}`);
  }

  console.log(`\n--- LOOP 2 (Adversarial Traps: ${loop2Adversarial.length} articles) ---`);
  const start2 = Date.now();
  const groups2 = await groupArticlesWithAi(loop2Adversarial, { config });
  console.log(`Completed in ${Date.now() - start2}ms. Formed ${groups2.length} group(s):\n`);
  for (const g of groups2) {
    console.log(`=== Group (Primary: ${g.primaryId}) ===`);
    if (g.reason) console.log(`Reason: ${g.reason}`);
    for (const id of g.memberIds) {
      const item = loop2Adversarial.find((f) => f.id === id);
      console.log(`  - [${id}] (${item?.feedTitle}) ${item?.title}`);
    }
    console.log("");
  }
  const groupedIds2 = new Set(groups2.flatMap((g) => g.memberIds));
  const ungrouped2 = loop2Adversarial.filter((f) => !groupedIds2.has(f.id));
  console.log(`Ungrouped (${ungrouped2.length}):`);
  for (const u of ungrouped2) {
    console.log(`  - [${u.id}] (${u.feedTitle}) ${u.title}`);
  }
}

main();
