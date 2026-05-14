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
