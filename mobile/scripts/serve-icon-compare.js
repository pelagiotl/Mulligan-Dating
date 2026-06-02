#!/usr/bin/env node
/**
 * Serve assets/previews/ so compare.html images load (file:// blocks cross-folder paths in many viewers).
 * Usage: node scripts/serve-icon-compare.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PREVIEW_DIR = path.join(__dirname, '..', 'assets', 'previews');
const PORT = Number(process.env.ICON_COMPARE_PORT || 8765);
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.md': 'text/plain; charset=utf-8',
};

function compareUrl(port = PORT) {
  return `http://${HOST}:${port}/compare.html`;
}

function openInBrowser(url) {
  if (process.platform !== 'darwin') return;
  try {
    execSync(`open "${url}"`);
  } catch {
    /* ignore */
  }
}

function probePreviewServer(port, cb) {
  const req = http.get(compareUrl(port), (res) => {
    res.resume();
    cb(null, res.statusCode === 200);
  });
  req.on('error', (err) => cb(err));
  req.setTimeout(2000, () => {
    req.destroy();
    cb(new Error('timeout'));
  });
}

const server = http.createServer((req, res) => {
  const raw = req.url?.split('?')[0] || '/';
  const rel = raw === '/' ? '/compare.html' : raw;
  const safe = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
  const file = path.join(PREVIEW_DIR, safe);

  if (!file.startsWith(PREVIEW_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500);
      res.end(err.code === 'ENOENT' ? 'Not found' : 'Error');
      return;
    }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') {
    console.error(err);
    process.exit(1);
  }

  probePreviewServer(PORT, (probeErr, ok) => {
    if (!probeErr && ok) {
      const url = compareUrl(PORT);
      console.log(`Preview server already running on port ${PORT}.`);
      console.log(url);
      openInBrowser(url);
      process.exit(0);
    }

    console.error(
      `Port ${PORT} is in use by another process (not this preview server).`,
      `Stop it or run: ICON_COMPARE_PORT=8766 npm run icons:open-compare`
    );
    process.exit(1);
  });
});

server.listen(PORT, HOST, () => {
  const url = compareUrl(PORT);
  console.log(`Icon compare: ${url}`);
  console.log('Press Ctrl+C to stop.');
  openInBrowser(url);
});
