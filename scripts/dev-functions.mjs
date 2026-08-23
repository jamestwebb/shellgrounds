// Local runner for the Netlify v2 functions, for development only.
//
// `netlify dev` is the normal front door, but it cannot run on a host with
// IPv6 disabled: its readiness probe resolves localhost to ::1 and does not
// fall back to IPv4, so it sits in "Timed out waiting for port 3000" against a
// server that is already up. This serves the same functions directly.
//
// v2 functions export `default (Request, context) => Response`, which is plain
// web-standard code, so no emulation is needed. Netlify Blobs is unavailable
// outside the Netlify runtime; store.js already falls back to a JSON file on
// disk (see fileBackend there), so data persists across restarts.
//
// Run: node scripts/dev-functions.mjs [port]      (default 9999)
// Vite proxies /api/* here — see vite.config.js.

import http from 'node:http';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS_DIR = path.join(ROOT, 'netlify', 'functions');
const PORT = Number(process.argv[2] || process.env.FUNCTIONS_PORT || 9999);

const names = readdirSync(FUNCTIONS_DIR)
  .filter(f => f.endsWith('.js'))
  .map(f => f.replace(/\.js$/, ''));

// Most functions are v2 (`export default (Request) => Response`). manifest.js
// is still v1 (`export const handler = (event) => ({statusCode, body})`), which
// Netlify also supports, so adapt it rather than pretend it is missing.
const handlers = new Map();
for (const name of names) {
  const mod = await import(pathToFileURL(path.join(FUNCTIONS_DIR, `${name}.js`)).href);
  if (typeof mod.default === 'function') {
    handlers.set(name, mod.default);
  } else if (typeof mod.handler === 'function') {
    handlers.set(name, async (request) => {
      const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text();
      const event = {
        httpMethod: request.method,
        path: new URL(request.url).pathname,
        queryStringParameters: Object.fromEntries(new URL(request.url).searchParams),
        headers: Object.fromEntries(request.headers),
        body,
        isBase64Encoded: false
      };
      const r = await mod.handler(event, {});
      return new Response(r.body, { status: r.statusCode || 200, headers: r.headers || {} });
    });
  }
}

const server = http.createServer(async (req, res) => {
  // Dev-only: the browser loads the app from Vite on :3000 and calls this
  // server on :9999, so it is a cross-origin request.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const name = url.pathname.replace(/^\/(?:\.netlify\/functions|api)\//, '').split('/')[0];
  // ── Dev-only: hand the local gate its own credentials ─────────────────────
  // The gate asks for a class password and, for a teacher, the instructor
  // setup code. Both live in .env, so working on the gate meant alt-tabbing to
  // a file to read them back, every reload.
  //
  // This is exactly why it lives HERE rather than in netlify/functions/.
  // Netlify deploys that directory and nothing else, so the code that can
  // reveal a setup code is not merely switched off in production — it was
  // never uploaded. A guard that can be misconfigured is a guard that will be.
  if (name === 'dev-credentials') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      dev: true,
      classPassword: process.env.CLASS_PASSWORD || null,
      setupCode: process.env.INSTRUCTOR_SETUP_CODE || null,
      adminHandles: (process.env.ADMIN_HANDLES || '')
        .split(',').map(h => h.trim()).filter(Boolean)
    }));
    console.log(`${req.method} /dev-credentials -> 200 (this server only)`);
    return;
  }

  const handler = handlers.get(name);

  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `No such function '${name}'`, available: [...handlers.keys()] }));
    return;
  }

  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;

    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : body
    });

    // A v2 function's second argument. Only the fields our functions read.
    const response = await handler(request, { site: { id: 'local-dev' }, params: {} });
    const text = await response.text();
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(text);
    console.log(`${req.method} /${name} -> ${response.status}`);
  } catch (err) {
    console.error(`${req.method} /${name} threw:`, err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Function threw', detail: String(err?.message || err) }));
  }
});

// Bind IPv4 explicitly: this host has no ::1.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`dev functions on http://127.0.0.1:${PORT}  (${[...handlers.keys()].join(', ')})`);
});
