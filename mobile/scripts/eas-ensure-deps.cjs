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

console.log("eas-ensure-deps: node_modules missing or incomplete — running npm ci …");
execSync("npm ci", { stdio: "inherit", cwd: mobileDir, env: process.env });
