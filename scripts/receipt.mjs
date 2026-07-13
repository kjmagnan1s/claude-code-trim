// Render a shareable receipt card (SVG) from a trim's before/after numbers.
// Zero dependencies; hedge theme baked in. PNG conversion is left to the
// caller (macOS: qlmanage -t -s 2400; or rsvg-convert / magick if present).
//
// Usage: node receipt.mjs --tools-before 156 --tools-after 94 \
//          --tokens-before 92267 --tokens-after 57824 [--out receipt.svg] [--date YYYY-MM-DD]
import fs from 'node:fs';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
}
const need = ['tools-before', 'tools-after', 'tokens-before', 'tokens-after'];
if (need.some((k) => !args[k] || isNaN(Number(args[k])))) {
  console.error(`usage: node receipt.mjs --tools-before N --tools-after N --tokens-before N --tokens-after N [--out file.svg] [--date YYYY-MM-DD]`);
  process.exit(1);
}
const tb = Number(args['tools-before']);
const ta = Number(args['tools-after']);
const kb = Number(args['tokens-before']);
const ka = Number(args['tokens-after']);
const out = args.out || 'trim-receipt.svg';
const date = args.date || new Date().toISOString().slice(0, 10);

const k = (n) => (n >= 10000 ? `~${Math.round(n / 1000)}k` : String(n));
const pct = (before, after) => `-${Math.round(((before - after) / before) * 100)}%`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// hedge palette
const C = {
  bg: '#10140f',
  panel: '#161b14',
  cream: '#e8e4d8',
  tan: '#eebd7a',
  sage: '#7aa35e',
  sageDim: '#3a5232',
  hairline: '#282726',
  muted: '#8f8b80',
};

const W = 1200, H = 675;
const BAR_W = 380;
const row = (label, before, after, y, fmt = String) => {
  const ratio = Math.max(0.05, Math.min(1, after / before));
  return `
  <text x="90" y="${y}" font-family="ui-monospace, Menlo, monospace" font-size="17" letter-spacing="3" fill="${C.sage}">${esc(label)}</text>
  <text x="90" y="${y + 74}" font-family="-apple-system, 'Helvetica Neue', Arial, sans-serif" font-weight="800" font-size="66" fill="${C.cream}">${esc(fmt(before))}<tspan fill="${C.muted}" font-weight="400"> → </tspan><tspan fill="${C.tan}">${esc(fmt(after))}</tspan></text>
  <rect x="700" y="${y + 22}" width="${BAR_W}" height="16" rx="2" fill="${C.sageDim}"/>
  <rect x="700" y="${y + 22}" width="${Math.round(BAR_W * ratio)}" height="16" rx="2" fill="${C.sage}"/>
  <rect x="${700 + Math.round(BAR_W * ratio)}" y="${y + 22}" width="2" height="16" fill="${C.cream}"/>
  <text x="${700 + BAR_W}" y="${y + 74}" text-anchor="end" font-family="ui-monospace, Menlo, monospace" font-size="26" fill="${C.tan}">${pct(before, after)}</text>`;
};

// small leaf flecks, deterministic positions
const flecks = [
  [1042, 96, 9], [1078, 122, 6], [1104, 88, 7], [1064, 74, 5], [1120, 130, 5],
].map(([x, y, s]) => `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.45}" fill="${C.sage}" opacity="0.7" transform="rotate(35 ${x} ${y})"/>`).join('\n  ');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="${C.hairline}" stroke-width="2"/>
  <text x="90" y="126" font-family="-apple-system, 'Helvetica Neue', Arial, sans-serif" font-weight="800" font-size="54" fill="${C.cream}"><tspan fill="${C.tan}">/</tspan>trim-hero</text>
  <text x="90" y="168" font-family="ui-monospace, Menlo, monospace" font-size="17" letter-spacing="4" fill="${C.muted}">CONTEXT PAYLOAD RECEIPT</text>
  ${flecks}
  <line x1="90" y1="212" x2="${W - 90}" y2="212" stroke="${C.hairline}" stroke-width="1"/>
  ${row('TOOLS', tb, ta, 280)}
  ${row('TOKENS PER REQUEST', kb, ka, 430, k)}
  <line x1="90" y1="566" x2="${W - 90}" y2="566" stroke="${C.hairline}" stroke-width="1"/>
  <text x="90" y="612" font-family="ui-monospace, Menlo, monospace" font-size="20" fill="${C.sage}">npx github:kjmagnan1s/trim-hero</text>
  <text x="${W - 90}" y="612" text-anchor="end" font-family="ui-monospace, Menlo, monospace" font-size="17" fill="${C.muted}">${esc(date)}</text>
</svg>
`;

fs.writeFileSync(out, svg);
console.log(`receipt: ${out}`);
console.log(`tools ${tb} -> ${ta} (${pct(tb, ta)}) · tokens ${k(kb)} -> ${k(ka)} (${pct(kb, ka)})`);
