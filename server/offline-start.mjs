import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createOfflineApi, OfflineApiError } from './offline-api.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(root, 'public');
const args = process.argv.slice(2);
if (args.length && !(args.length === 2 && args[0] === '--port')) throw new Error('Usage: node start.mjs [--port 8787]');
const port = Number(args[1] || process.env.ATLAS_PORT || 8787);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose a port from 1024 to 65535.');
const snapshot = JSON.parse(gunzipSync(await fs.readFile(path.join(root, 'data/snapshot.json.gz'))));
const api = createOfflineApi(snapshot);
const config = 'window.__ATLAS_OFFLINE__=true;window.__MANUS_CONFIG__={};';
const mimes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf', '.zip': 'application/zip', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
function send(res, method, status, type, body, headers = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': payload.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(method === 'HEAD' ? undefined : payload);
}
function fail(res, method, status, code, message) { send(res, method, status, 'application/json', JSON.stringify({ error: { code, message } })); }
const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET';
  try {
    // Also refuse DNS-rebinding Host headers; never expose a LAN listener.
    const host = (req.headers.host || '').split(':')[0].toLowerCase();
    if (!['127.0.0.1', 'localhost'].includes(host)) return fail(res, method, 403, 'LOCAL_ONLY', 'This package is available only on this computer.');
    if (method !== 'GET' && method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return fail(res, method, 405, 'READ_ONLY', 'Atlas endpoints are read-only.'); }
    // Validate raw URL before URL normalization can erase dot segments.
    const rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (/[\\\x00-\x1f]/.test(rawPath) || rawPath.split('/').some(part => part === '..' || part === '.')) return fail(res, method, 400, 'UNSAFE_PATH', 'Unsafe path.');
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    const pathname = decodeURIComponent(url.pathname);
    if (pathname === '/api/platform/config.js') return send(res, method, 200, 'text/javascript; charset=utf-8', config);
    if (pathname === '/api/health') return send(res, method, 200, 'application/json', JSON.stringify({ ok: true, offline: true, profiles: snapshot.profiles.length, capturedAt: snapshot.capturedAt }));
    if (pathname.startsWith('/api/atlas/')) {
      const result = api.handle(url.pathname.slice('/api/atlas'.length), url.searchParams);
      return send(res, method, 200, result.type, result.type === 'application/json' ? JSON.stringify(result.body) : result.body, result.download ? { 'Content-Disposition': `attachment; filename="${result.download}"` } : {});
    }
    if (pathname.startsWith('/api/')) return fail(res, method, 404, 'ENDPOINT_NOT_FOUND', 'Offline endpoint not found.');
    const relative = pathname.replace(/^\/+/, '');
    const filename = path.resolve(publicRoot, relative || 'index.html');
    if (filename !== publicRoot && !filename.startsWith(publicRoot + path.sep)) return fail(res, method, 400, 'UNSAFE_PATH', 'Unsafe path.');
    let target = filename;
    let stat;
    try { stat = await fs.stat(target); } catch {}
    if (!stat?.isFile()) {
      // Known client routes only. Missing assets and APIs must never receive HTML.
      if (/^\/(?:hub\/[^/]+|print\/[^/]+|methodology)?\/?$/.test(pathname)) target = path.join(publicRoot, 'index.html');
      else return fail(res, method, 404, 'FILE_NOT_FOUND', 'Offline file not found.');
    }
    const real = await fs.realpath(target);
    if (!real.startsWith(publicRoot + path.sep)) return fail(res, method, 403, 'UNSAFE_PATH', 'Unsafe file path.');
    let content = await fs.readFile(real);
    const ext = path.extname(real).toLowerCase();
    if (ext === '.html') content = Buffer.from(content.toString('utf8')
      .replace(/<head([^>]*)>/i, `<head$1><script>${config}</script><style>body.atlas-offline a[href^="http"]::after{content:" · internet required";font-size:.8em;font-weight:400;color:#666}@media print{body.atlas-offline a[href^="http"]::after{content:""}}</style>`)
      .replace(/<body([^>]*)>/i, '<body$1 class="atlas-offline">'));
    return send(res, method, 200, mimes[ext] || 'application/octet-stream', content, { 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'self'; base-uri 'self'", 'Referrer-Policy': 'no-referrer' });
  } catch (error) {
    if (error instanceof OfflineApiError) return fail(res, method, error.status, error.code, error.message);
    if (error instanceof URIError) return fail(res, method, 400, 'UNSAFE_PATH', 'Invalid path encoding.');
    console.error('[Offline Atlas] Request could not be completed.');
    if (!res.headersSent) fail(res, method, 500, 'OFFLINE_REQUEST_FAILED', 'The offline request could not be completed. No live fallback is used.');
    else res.end();
  }
});
server.on('error', error => { console.error(`Offline server could not start: ${error.code || 'ERROR'}. Try node start.mjs --port 8788 if this port is already used.`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Life Science Atlas offline snapshot\nOpen http://127.0.0.1:${port}\nCaptured ${snapshot.capturedAt} · ${snapshot.profiles.length} profiles\nLocal computer only. Stop with Ctrl+C.`));
