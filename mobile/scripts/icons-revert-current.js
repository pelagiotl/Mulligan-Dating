#!/usr/bin/env node
/**
 * Restore pink/purple icons from assets/previews/backup-current/
 * (created by npm run icons:apply-midnight).
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const mobileDir = path.join(__dirname, '..');
const repoRoot = path.join(mobileDir, '..');
const backupDir = path.join(mobileDir, 'assets', 'previews', 'backup-current');

const RESTORE = [
  ['icon.png', path.join(mobileDir, 'assets', 'icon.png')],
  ['favicon.png', path.join(mobileDir, 'assets', 'favicon.png')],
  ['adaptive-icon.png', path.join(mobileDir, 'assets', 'adaptive-icon.png')],
  ['splash.png', path.join(mobileDir, 'assets', 'splash.png')],
  ['app-icon.png', path.join(repoRoot, 'frontend', 'public', 'app-icon.png')],
  ['favicon.png', path.join(repoRoot, 'frontend', 'public', 'favicon.png')],
];

function main() {
  if (!fs.existsSync(backupDir)) {
    console.error('No backup at assets/previews/backup-current/ — run icons:apply-midnight first, or restore files manually.');
    process.exit(1);
  }

  for (const [name, dest] of RESTORE) {
    const src = path.join(backupDir, name);
    if (!fs.existsSync(src)) {
      console.warn('Skip missing backup:', name);
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }

  console.log('✅ Restored production icons from backup-current/');
  execSync('bash scripts/sync-native-from-assets.sh', { cwd: mobileDir, stdio: 'inherit' });
  console.log('   Rebuild iOS/Android to refresh home screen + splash.');
}

main();
