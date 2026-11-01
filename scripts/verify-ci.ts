#!/usr/bin/env bun
/**
 * scripts/verify-ci.ts
 *
 * Local CI Pipeline Verification for Synapse.
 * Replicates the exact GitHub Actions CI workflow locally:
 * 1. Frozen lockfile verification (bun install --frozen-lockfile)
 * 2. Static typecheck (bun x tsc --noEmit)
 * 3. Unit test suite (bun test)
 *
 * Usage:
 *   bun scripts/verify-ci.ts
 *   or via container: docker compose --profile test run --rm tester
 */

import { spawnSync } from "child_process";

interface Step {
  name: string;
  command: string;
  args: string[];
  remedyOnFailure?: string;
}

const steps: Step[] = [
  {
    name: "Lockfile Parity (bun install --frozen-lockfile)",
    command: "bun",
    args: ["install", "--frozen-lockfile"],
    remedyOnFailure:
      "Dependencies in package.json mismatch bun.lock. Run 'bun install' (or containerized bun install) to synchronize bun.lock.",
  },
  {
    name: "TypeScript Check (bun x tsc --noEmit)",
    command: "bun",
    args: ["x", "tsc", "--noEmit"],
    remedyOnFailure: "TypeScript errors found. Fix typing errors or missing exports before publishing.",
  },
  {
    name: "Unit Test Suite (bun test)",
    command: "bun",
    args: ["test"],
    remedyOnFailure: "Unit tests failed. Resolve test failures before publishing.",
  },
];

async function runStep(step: Step, index: number, total: number): Promise<boolean> {
  console.log(`\n[${index}/${total}] ⏳ ${step.name}...`);
  const start = Date.now();

  const proc = spawnSync(step.command, step.args, {
    stdio: "inherit",
    env: process.env,
  });

  const durationMs = Date.now() - start;

  if (proc.status !== 0) {
    console.error(`\n❌ [${step.name}] FAILED (exit code: ${proc.status}) in ${durationMs}ms`);
    if (step.remedyOnFailure) {
      console.error(`💡 Remedy: ${step.remedyOnFailure}\n`);
    }
    return false;
  }

  console.log(`✅ [${step.name}] PASSED (${durationMs}ms)`);
  return true;
}

async function main() {
  console.log("════════════════════════════════════════════════════════");
  console.log("🚀 Synapse Local CI Pipeline Verification");
  console.log("════════════════════════════════════════════════════════");

  for (let i = 0; i < steps.length; i++) {
    const passed = await runStep(steps[i], i + 1, steps.length);
    if (!passed) {
      console.error("\n💥 Local CI Pipeline Verification FAILED. Do NOT push or publish.");
      process.exit(1);
    }
  }

  console.log("\n════════════════════════════════════════════════════════");
  console.log("🎉 All Local CI Checks PASSED cleanly! Safe to commit & publish.");
  console.log("════════════════════════════════════════════════════════\n");
  process.exit(0);
}

main();
