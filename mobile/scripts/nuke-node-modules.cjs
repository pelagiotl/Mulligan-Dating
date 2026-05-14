#!/usr/bin/env node
/**
 * When `rm -rf node_modules` fails (e.g. expo-av/android/build "Directory not empty"),
 * Gradle often still holds files. This stops daemons then removes node_modules via rimraf.
 *
 * Usage: from mobile/:  node scripts/nuke-node-modules.cjs
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const mobileDir = path.join(__dirname, "..");
const nodeModules = path.join(mobileDir, "node_modules");

const androidDir = path.join(mobileDir, "android");
const gradlew =
  process.platform === "win32"
    ? path.join(androidDir, "gradlew.bat")
    : path.join(androidDir, "gradlew");

if (fs.existsSync(gradlew)) {
  try {
    console.log("nuke-node-modules: ./gradlew --stop …");
    if (process.platform === "win32") {
      execSync("gradlew.bat --stop", { stdio: "inherit", cwd: androidDir, env: process.env, timeout: 120000 });
    } else {
      execSync("./gradlew --stop", { stdio: "inherit", cwd: androidDir, env: process.env, timeout: 120000 });
    }
  } catch (_) {
    console.warn("nuke-node-modules: gradlew --stop failed (continuing)");
  }
}

if (!fs.existsSync(nodeModules)) {
  console.log("nuke-node-modules: no node_modules — nothing to do.");
  process.exit(0);
}

console.log("nuke-node-modules: npx rimraf node_modules …");
try {
  execSync("npx --yes rimraf@5 node_modules", {
    stdio: "inherit",
    cwd: mobileDir,
    env: process.env,
    timeout: 600000,
  });
} catch (e) {
  console.error("nuke-node-modules: failed:", e && e.message);
  process.exit(1);
}

if (fs.existsSync(nodeModules)) {
  console.error("nuke-node-modules: node_modules still present. Quit Android Studio, reboot if needed.");
  process.exit(1);
}

console.log("nuke-node-modules: done. Run: npm ci");
