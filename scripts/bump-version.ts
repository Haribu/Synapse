#!/usr/bin/env bun
/**
 * scripts/bump-version.ts
 *
 * Automated SemVer version bumper for Synapse.
 * Synchronizes package.json and src/lib/version.ts with git commit hash & build date.
 *
 * Usage:
 *   bun scripts/bump-version.ts [patch|minor|major|rc|<custom-version>]
 *
 * Examples:
 *   bun scripts/bump-version.ts rc       # 1.0.0-rc1 -> 1.0.0-rc2
 *   bun scripts/bump-version.ts patch    # 1.0.0-rc2 -> 1.0.0 (or 1.0.0 -> 1.0.1)
 *   bun scripts/bump-version.ts minor    # 1.0.0 -> 1.1.0
 *   bun scripts/bump-version.ts major    # 1.0.0 -> 2.0.0
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pkgPath = resolve(rootDir, "package.json");
const versionFilePath = resolve(rootDir, "src/lib/version.ts");

function getGitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: rootDir, encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

function computeNextVersion(current: string, bumpType: string): string {
  const rcMatch = current.match(/^(\d+\.\d+\.\d+)-rc\.?(\d+)$/i);
  const semverMatch = current.match(/^(\d+)\.(\d+)\.(\d+)$/);

  if (bumpType === "rc") {
    if (rcMatch) {
      const base = rcMatch[1];
      const rcNum = parseInt(rcMatch[2], 10) + 1;
      return `${base}-rc${rcNum}`;
    } else if (semverMatch) {
      const [_, major, minor, patch] = semverMatch;
      return `${major}.${minor}.${parseInt(patch, 10) + 1}-rc1`;
    }
    return `${current}-rc1`;
  }

  if (bumpType === "patch") {
    if (rcMatch) {
      // Promoting RC to official release
      return rcMatch[1];
    } else if (semverMatch) {
      const [_, major, minor, patch] = semverMatch;
      return `${major}.${minor}.${parseInt(patch, 10) + 1}`;
    }
  }

  if (bumpType === "minor") {
    if (rcMatch) {
      const [major, minor] = rcMatch[1].split(".");
      return `${major}.${parseInt(minor, 10) + 1}.0`;
    } else if (semverMatch) {
      const [_, major, minor] = semverMatch;
      return `${major}.${parseInt(minor, 10) + 1}.0`;
    }
  }

  if (bumpType === "major") {
    const base = rcMatch ? rcMatch[1] : current;
    const major = parseInt(base.split(".")[0], 10) + 1;
    return `${major}.0.0`;
  }

  // Explicit custom version provided (e.g. "1.0.0-rc2" or "1.0.0")
  if (/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(bumpType)) {
    return bumpType;
  }

  throw new Error(
    `Unknown bump type: "${bumpType}". Must be 'patch', 'minor', 'major', 'rc', or a valid SemVer string.`
  );
}

function main() {
  const arg = process.argv[2] || "rc";

  const pkgJson = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const currentVersion = pkgJson.version || "1.0.0";
  const nextVersion = computeNextVersion(currentVersion, arg);
  const gitCommit = getGitCommit();
  const buildDate = getToday();

  console.log(`\n📦 Bumping Synapse version:`);
  console.log(`   Previous: v${currentVersion}`);
  console.log(`   Next:     v${nextVersion}`);
  console.log(`   Commit:   ${gitCommit}`);
  console.log(`   Date:     ${buildDate}\n`);

  // 1. Update package.json
  pkgJson.version = nextVersion;
  writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + "\n", "utf-8");
  console.log(`✓ Updated package.json`);

  // 2. Update src/lib/version.ts
  const versionFileContent = `export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "${nextVersion}";
export const GIT_COMMIT = process.env.NEXT_PUBLIC_GIT_COMMIT || "${gitCommit}";
export const BUILD_DATE = process.env.NEXT_PUBLIC_BUILD_DATE || "${buildDate}";
export const COPYRIGHT_YEAR = "${new Date().getFullYear()}";
export const COPYRIGHT_OWNER = "Harry McLaren";
export const COPYRIGHT_NOTICE = \`© \${COPYRIGHT_YEAR} \${COPYRIGHT_OWNER}\`;
`;

  writeFileSync(versionFilePath, versionFileContent, "utf-8");
  console.log(`✓ Updated src/lib/version.ts`);
  console.log(`\n🎉 Successfully bumped to v${nextVersion}!\n`);
}

main();
