import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, 'dist');
const port = Number(process.env.PORT) || 4173;
const apiTarget = (process.env.API_PROXY_TARGET || 'https://mulligan-backend.onrender.com').replace(
  /\/$/,
  '',
);

const app = express();

app.use(
  '/api',
  createProxyMiddleware({
    target: apiTarget,
    changeOrigin: true,
    xfwd: true,
  }),
);

app.use(
  '/uploads',
  createProxyMiddleware({
    target: apiTarget,
    changeOrigin: true,
  }),
);

app.use(express.static(dist, { maxAge: '1h' }));

app.get('*', (_req, res) => {
  res.sendFile(path.join(dist, 'index.html'));
});

app.listen(port, () => {
  console.log(`Mulligan web listening on ${port}; API proxy -> ${apiTarget}`);
});
