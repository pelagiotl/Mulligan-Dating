#!/usr/bin/env node
/**
 * EAS runs early steps that JSON-parse package.json. On iCloud Desktop, files can
 * report a size but read as empty until fully materialized — that yields
 * "Cannot parse an empty JSON string" with no useful hint.
 */
const fs = require("fs");
const path = require("path");

const pkgPath = path.join(__dirname, "..", "package.json");
let raw;
try {
  raw = fs.readFileSync(pkgPath, "utf8");
} catch (e) {
  console.error("Cannot read package.json:", pkgPath, e.message);
  process.exit(1);
}

if (!raw || !String(raw).trim()) {
  console.error(`
package.json is empty on disk: ${pkgPath}

This often happens when the project lives on iCloud Desktop/Documents with
"Optimize Mac Storage" — the file can show a size but not download bytes yet.

Fix: In Finder, right-click the repo folder → Download Now; or move the repo to
a non-iCloud path; or disable Optimize Mac Storage for Desktop/Documents.
`);
  process.exit(1);
}

try {
  JSON.parse(raw);
} catch (e) {
  console.error("package.json is not valid JSON:", pkgPath, e.message);
  process.exit(1);
}

console.log("eas-preflight: package.json OK (%s bytes)", Buffer.byteLength(raw, "utf8"));

const mobileRoot = path.join(__dirname, "..");
const repoRoot = path.join(mobileRoot, "..");
console.log("eas-preflight: building from repo root:", repoRoot);
console.log("eas-preflight: mobile app dir:", mobileRoot);

/** Fail fast if stale UI copy is still in tree (wrong APK shipped when these slip through). */
const staleUiChecks = [
  {
    rel: "src/screens/PhoneLoginScreen.tsx",
    mustNotInclude: ["Meet cool people", "Actually hangout"],
  },
  {
    rel: "src/navigation/AppNavigator.tsx",
    mustNotInclude: ['emojiIcon">👀', 'emojiIcon">🔥'],
  },
];
for (const check of staleUiChecks) {
  const filePath = path.join(mobileRoot, check.rel);
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (e) {
    console.warn("eas-preflight: could not read %s (%s)", filePath, e.message);
    continue;
  }
  for (const bad of check.mustNotInclude) {
    if (text.includes(bad)) {
      console.error(
        "eas-preflight: stale UI in %s — found %j. Fix before EAS build.",
        check.rel,
        bad
      );
      process.exit(1);
    }
  }
}
console.log("eas-preflight: mobile UI copy checks passed");

const nestedCopy = path.join(repoRoot, "Mulligan-Dating");
if (fs.existsSync(nestedCopy)) {
  console.warn(
    "eas-preflight: found %s — remove this nested copy (duplicate repo). It bloats disk and can break EAS when using git archive.",
    nestedCopy
  );
}
