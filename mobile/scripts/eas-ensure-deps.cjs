#!/usr/bin/env node
/**
 * EAS runs `npx expo config` locally first; that needs node_modules (e.g. expo-build-properties).
 * Fresh clones often skip `npm ci` — install once if deps are missing.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const mobileDir = path.join(__dirname, "..");
const marker = path.join(mobileDir, "node_modules", "expo-build-properties", "package.json");

if (fs.existsSync(marker)) {
  process.exit(0);
}

const nodeModules = path.join(mobileDir, "node_modules");
if (fs.existsSync(nodeModules)) {
  console.log(
    "eas-ensure-deps: node_modules incomplete — removing it so npm ci can run cleanly …"
  );
  try {
    fs.rmSync(nodeModules, { recursive: true, force: true });
  } catch (e) {
    console.error("eas-ensure-deps: failed to remove node_modules:", e && e.message);
    console.error(
      "Close Xcode, simulators, and Finder windows under node_modules, then run:\n" +
        "  rm -rf node_modules && npm ci"
    );
    process.exit(1);
  }
}

console.log("eas-ensure-deps: running npm ci …");
execSync("npm ci", { stdio: "inherit", cwd: mobileDir, env: process.env });
