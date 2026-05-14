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

function tryStopGradle() {
  const androidDir = path.join(mobileDir, "android");
  const gradlew =
    process.platform === "win32"
      ? path.join(androidDir, "gradlew.bat")
      : path.join(androidDir, "gradlew");
  if (!fs.existsSync(gradlew)) return;
  try {
    console.log(
      "eas-ensure-deps: stopping Gradle daemons (releases locks under node_modules/…/android/build) …"
    );
    if (process.platform === "win32") {
      execSync("gradlew.bat --stop", { stdio: "inherit", cwd: androidDir, env: process.env, timeout: 120000 });
    } else {
      execSync("./gradlew --stop", { stdio: "inherit", cwd: androidDir, env: process.env, timeout: 120000 });
    }
  } catch (_) {
    console.warn("eas-ensure-deps: gradlew --stop failed (continuing — you may need to close Android Studio)");
  }
}

/** expo-av often leaves android/build inside node_modules; rm -rf can fail until Gradle stops. */
function tryRmExpoAvAndroidBuild() {
  const avBuild = path.join(mobileDir, "node_modules", "expo-av", "android", "build");
  if (!fs.existsSync(avBuild)) return;
  try {
    fs.rmSync(avBuild, { recursive: true, force: true });
  } catch (_) {
    /* ignore */
  }
}

function tryRimrafNodeModules() {
  console.log("eas-ensure-deps: trying npx rimraf node_modules (handles stubborn trees on macOS) …");
  execSync("npx --yes rimraf@5 node_modules", {
    stdio: "inherit",
    cwd: mobileDir,
    env: process.env,
    timeout: 600000,
  });
}

const nodeModules = path.join(mobileDir, "node_modules");
if (fs.existsSync(nodeModules)) {
  console.log(
    "eas-ensure-deps: node_modules incomplete — removing it so npm ci can run cleanly …"
  );
  tryStopGradle();
  tryRmExpoAvAndroidBuild();
  try {
    fs.rmSync(nodeModules, { recursive: true, force: true });
  } catch (e) {
    console.warn("eas-ensure-deps: fs.rmSync node_modules failed:", e && e.message);
    try {
      tryRimrafNodeModules();
    } catch (e2) {
      console.error("eas-ensure-deps: rimraf also failed:", e2 && e2.message);
      console.error(
        "Quit Android Studio & emulators, then in mobile/ run:\n" +
          "  cd android && ./gradlew --stop && cd ..\n" +
          "  npx --yes rimraf@5 node_modules && npm ci"
      );
      process.exit(1);
    }
  }
  if (fs.existsSync(nodeModules)) {
    console.error("eas-ensure-deps: node_modules still exists after removal attempts.");
    process.exit(1);
  }
}

console.log("eas-ensure-deps: running npm ci …");
execSync("npm ci", { stdio: "inherit", cwd: mobileDir, env: process.env });
