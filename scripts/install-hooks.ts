#!/usr/bin/env bun
/**
 * scripts/install-hooks.ts
 *
 * Installs Git hooks for Synapse to ensure all changes pass local CI
 * (frozen lockfile parity, static typecheck, unit test suite) BEFORE pushing.
 */

import { writeFileSync, chmodSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const gitHooksDir = join(process.cwd(), ".git", "hooks");

if (!existsSync(gitHooksDir)) {
  mkdirSync(gitHooksDir, { recursive: true });
}

const prePushScript = `#!/bin/sh
# Synapse Pre-Push CI Gate
echo "════════════════════════════════════════════════════════"
echo "🔍 Running Synapse Pre-Push CI Gate (bun run test:ci)..."
echo "════════════════════════════════════════════════════════"
bun run test:ci
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
  echo ""
  echo "❌ Pre-push CI verification FAILED. Push rejected."
  echo "Fix lockfile, type errors, or unit test failures before pushing."
  exit 1
fi
`;

const prePushPath = join(gitHooksDir, "pre-push");

writeFileSync(prePushPath, prePushScript, { mode: 0o755 });
try {
  chmodSync(prePushPath, 0o755);
} catch {}

console.log("✅ Synapse Git pre-push hook installed successfully at:", prePushPath);
