// Safely merge a trim patch into a Claude Code settings.json.
// Deep-merges objects, unions arrays (dedup), patch wins on scalars.
// Always writes a timestamped backup first; never clobbers unrelated settings.
//
// Usage: node apply.mjs <settings.json path> <patch.json path>
import fs from 'node:fs';
import path from 'node:path';

const [settingsPath, patchPath] = process.argv.slice(2);
if (!settingsPath || !patchPath) {
  console.error('usage: node apply.mjs <settings.json> <patch.json>');
  process.exit(1);
}

const patch = JSON.parse(fs.readFileSync(patchPath, 'utf8'));
let current = {};
if (fs.existsSync(settingsPath)) {
  current = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const backup = `${settingsPath}.bak-${Date.now()}`;
  fs.copyFileSync(settingsPath, backup);
  console.log(`backup: ${backup}`);
} else {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
}

function merge(base, over) {
  if (Array.isArray(base) && Array.isArray(over)) return [...new Set([...base, ...over])];
  if (base && over && typeof base === 'object' && typeof over === 'object' && !Array.isArray(base) && !Array.isArray(over)) {
    const out = { ...base };
    for (const k of Object.keys(over)) out[k] = k in base ? merge(base[k], over[k]) : over[k];
    return out;
  }
  return over;
}

const merged = merge(current, patch);
fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + '\n');
console.log(`written: ${settingsPath}`);
