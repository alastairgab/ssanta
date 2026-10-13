// Serves ./dist under a GitHub-Pages-style project path (default /secret-santa/) to verify
// that the production build works from a sub-path with no server-side rewrites.
// Usage: node scripts/serve-subpath.mjs [port] [basePath]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const port = Number(process.argv[2] ?? 4173);
const base = (process.argv[3] ?? '/secret-santa/').replace(/\/?$/, '/');
const root = resolve('dist');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith(base)) {
    // Like GitHub Pages: nothing outside the project path, and no SPA fallback.
    res.writeHead(404).end('Not found');
    return;
  }
  const rel = decodeURIComponent(url.pathname.slice(base.length)) || 'index.html';
  const file = normalize(join(root, rel));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const s = await stat(file);
    const target = s.isDirectory() ? join(file, 'index.html') : file;
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': types[extname(target)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`Serving dist at http://localhost:${port}${base}`));
