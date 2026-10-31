// Local stand-in for Vercel: serves public/ and runs the functions of api/ on one address,
// with the Gemini key from .env. Start it with `npm run dev`. It listens on localhost only.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

export const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

// An absolute path inside public/, or null: ".." and encoded tricks must not climb out of it.
export function resolvePublicPath(urlPath, publicDir = PUBLIC) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^[/\\]+/, '');
  const full = resolve(publicDir, relative);
  return full.startsWith(publicDir + sep) ? full : null;
}

// Vercel hands a function a request with a parsed body and a response with status().json().
function vercelStyle(req, res, body) {
  req.body = body;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (value) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(value));
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function loadApi() {
  const load = (name) => import(pathToFileURL(join(ROOT, 'api', name)).href);
  const [ask, ping] = await Promise.all([load('ask.js'), load('ping.js')]);
  // The real limiter would lock you out after a few taps while testing.
  return { ask: ask.createHandler({ allow: () => true }), ping: ping.default };
}

export async function start() {
  try {
    process.loadEnvFile(join(ROOT, '.env'));
  } catch {
    // No .env: the server still runs, the cat just answers with its own phrases.
  }
  const port = Number(process.env.PORT) || 5173;
  const api = await loadApi();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const route = { '/api/ask': api.ask, '/api/ping': api.ping }[url.pathname];
    if (route) {
      const startedAt = performance.now();
      res.on('finish', () => {
        console.log(`${req.method} ${url.pathname} -> ${res.statusCode} in ${Math.round(performance.now() - startedAt)} ms`);
      });
      vercelStyle(req, res, req.method === 'POST' ? await readBody(req) : undefined);
      return route(req, res);
    }
    const file = resolvePublicPath(url.pathname);
    try {
      if (!file) throw new Error('outside public/');
      const data = await readFile(file);
      res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
      // Always fresh: the point of a local server is to see the edit you just made.
      res.setHeader('Cache-Control', 'no-store');
      res.end(data);
    } catch {
      res.statusCode = 404;
      res.end('Not found');
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`Кошачье чутьё: http://localhost:${port}/`);
    console.log(
      process.env.GEMINI_API_KEY
        ? 'Ключ Gemini найден в .env, кот отвечает через нейросеть.'
        : 'Ключа Gemini нет (.env или GEMINI_API_KEY): кот будет говорить запасные фразы.',
    );
    console.log('Остановить: Ctrl+C');
  });
  return server;
}

// Only when run as a script: the tests import this file for resolvePublicPath.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) start();
