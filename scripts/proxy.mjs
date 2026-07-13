// Transparent logging proxy for the Anthropic API.
// Forwards every request untouched to UPSTREAM (the endpoint the user's CLI
// normally talks to), streams the reply back, and writes each /v1/messages
// request body to CAPTURE_DIR. The CLI doesn't notice it's there.
//
// Env: PORT (default 8787), UPSTREAM (default https://api.anthropic.com),
//      CAPTURE_DIR (default ./captures)
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream';

const PORT = Number(process.env.PORT || 8787);
const UPSTREAM = process.env.UPSTREAM || 'https://api.anthropic.com';
const CAPTURE_DIR = process.env.CAPTURE_DIR || './captures';
fs.mkdirSync(CAPTURE_DIR, { recursive: true });
let n = 0;

const server = http.createServer((req, res) => {
  req.on('error', () => {});
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
    const client = upstream.protocol === 'http:' ? http : https;
    const headers = { ...req.headers, host: upstream.host };
    const preq = client.request(
      upstream,
      { method: req.method, headers },
      (pres) => {
        res.writeHead(pres.statusCode, pres.headers);
        pipeline(pres, res, (err) => {
          if (err) console.error(`[trim-proxy] response stream error: ${err.message}`);
        });
      }
    );
    preq.on('error', (e) => {
      console.error(`[trim-proxy] upstream error: ${e.message}`);
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
      res.end(`proxy error: ${e.message}`);
    });
    preq.end(body);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.error(`[trim-proxy] listening on 127.0.0.1:${PORT} -> ${UPSTREAM}`);
});
