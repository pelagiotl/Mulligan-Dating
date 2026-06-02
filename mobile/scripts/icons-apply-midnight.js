#!/usr/bin/env node
/**
 * Promote midnight preview icons into production paths.
 * Backs up current icons to assets/previews/backup-current/ first.
 *
 * Revert: npm run icons:revert-current
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const mobileDir = path.join(__dirname, '..');
const repoRoot = path.join(mobileDir, '..');
const previewDir = path.join(mobileDir, 'assets', 'previews');
const backupDir = path.join(previewDir, 'backup-current');
const midnightIcon = path.join(previewDir, 'app-icon-midnight.png');
const midnightAdaptive = path.join(previewDir, 'adaptive-icon-midnight.png');

const PAIRS = [
  [path.join(mobileDir, 'assets', 'icon.png'), 'icon.png'],
  [path.join(mobileDir, 'assets', 'favicon.png'), 'favicon.png'],
  [path.join(mobileDir, 'assets', 'adaptive-icon.png'), 'adaptive-icon.png'],
  [path.join(mobileDir, 'assets', 'splash.png'), 'splash.png'],
  [path.join(repoRoot, 'frontend', 'public', 'app-icon.png'), 'app-icon.png'],
  [path.join(repoRoot, 'frontend', 'public', 'favicon.png'), 'favicon.png'],
];

function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function main() {
  if (!fs.existsSync(midnightIcon)) {
    console.error('Run npm run icons:preview-midnight first.');
    process.exit(1);
  }

  fs.mkdirSync(backupDir, { recursive: true });
  for (const [dest, name] of PAIRS) {
    if (fs.existsSync(dest)) {
      copy(dest, path.join(backupDir, name));
    }
  }

  copy(midnightIcon, path.join(mobileDir, 'assets', 'icon.png'));
  copy(midnightIcon, path.join(mobileDir, 'assets', 'favicon.png'));
  copy(midnightIcon, path.join(mobileDir, 'assets', 'splash.png'));
  copy(midnightIcon, path.join(repoRoot, 'frontend', 'public', 'app-icon.png'));
  copy(midnightIcon, path.join(repoRoot, 'frontend', 'public', 'favicon.png'));

  if (fs.existsSync(midnightAdaptive)) {
    copy(midnightAdaptive, path.join(mobileDir, 'assets', 'adaptive-icon.png'));
  } else {
    copy(midnightIcon, path.join(mobileDir, 'assets', 'adaptive-icon.png'));
  }

  console.log('✅ Backed up current icons → assets/previews/backup-current/');
  console.log('✅ Promoted midnight preview into production asset paths');
  console.log('   Syncing native trees…');
  execSync('bash scripts/sync-native-from-assets.sh', { cwd: mobileDir, stdio: 'inherit' });
  console.log('');
  console.log('   Revert anytime: npm run icons:revert-current');
  console.log('   Rebuild iOS/Android to see on device/simulator.');
}

main();
