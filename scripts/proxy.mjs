// Transparent logging proxy for the Anthropic API.
// Forwards every request untouched, streams the reply back, and writes each
// /v1/messages request body to CAPTURE_DIR. The CLI doesn't notice it's there.
//
// Env: PORT (default 8787), UPSTREAM (default https://api.anthropic.com),
//      CAPTURE_DIR (default ./captures)
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT || 8787);
const UPSTREAM = process.env.UPSTREAM || 'https://api.anthropic.com';
const CAPTURE_DIR = process.env.CAPTURE_DIR || './captures';
fs.mkdirSync(CAPTURE_DIR, { recursive: true });
let n = 0;

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);

    if (req.method === 'POST' && req.url.includes('/v1/messages') && body.length > 0) {
      const file = path.join(CAPTURE_DIR, `capture-${String(++n).padStart(2, '0')}.json`);
      fs.writeFileSync(file, body);
      console.error(`[trim-proxy] captured ${body.length} bytes -> ${file}`);
    }

    const upstream = new URL(req.url, UPSTREAM);
    const headers = { ...req.headers, host: upstream.host };
    const preq = https.request(
      upstream,
      { method: req.method, headers },
      (pres) => {
        res.writeHead(pres.statusCode, pres.headers);
        pres.pipe(res);
      }
    );
    preq.on('error', (e) => {
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end(`proxy error: ${e.message}`);
    });
    preq.end(body);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.error(`[trim-proxy] listening on 127.0.0.1:${PORT} -> ${UPSTREAM}`);
});
