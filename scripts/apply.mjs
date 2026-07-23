// Safely merge a trim patch into a Claude Code settings.json.
// Deep-merges objects, unions arrays (dedup), patch wins on scalars.
// Always writes a timestamped backup first; never clobbers unrelated settings.
//
// The gate is not just prose: this script REFUSES any patch key that is not a
// trim mechanism, and any destination that is not a Claude Code settings file.
// A trim tool writes disable flags, permissions.deny (bare names), and
// skillOverrides. It never writes permissions.allow, hooks, env, or model, and
// never writes outside a .claude/ settings file. Those refusals are enforced
// here in code so a hijacked or mistaken agent cannot grant itself anything.
//
// Usage: node apply.mjs <settings.json path> <patch.json path>
import fs from 'node:fs';
import path from 'node:path';

const [settingsPath, patchPath] = process.argv.slice(2);
if (!settingsPath || !patchPath) {
  console.error('usage: node apply.mjs <settings.json> <patch.json>');
  process.exit(1);
}

function fail(msg) {
  console.error(`${msg} Nothing was written.`);
  process.exit(1);
}

function readJson(p, label) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`${label} at ${p} is not valid JSON (${e.message}). Fix it or move it aside; nothing was written.`);
    process.exit(1);
  }
}

// Destination must be one of the three documented Claude Code settings files:
// ~/.claude/settings.json (global), <project>/.claude/settings.json,
// or <project>/.claude/settings.local.json. Anything else (a shell rc, a
// credentials file, an arbitrary path) is refused.
function validateSettingsPath(p) {
  let resolved = path.resolve(p);
  const dir = path.dirname(resolved);
  if (fs.existsSync(dir)) resolved = path.join(fs.realpathSync(dir), path.basename(resolved));
  let st = null;
  try {
    st = fs.lstatSync(resolved);
  } catch {}
  if (st?.isSymbolicLink()) {
    try {
      resolved = fs.realpathSync(resolved);
    } catch {
      fail(`refusing to write ${resolved}: it is a symlink to a missing target.`);
    }
  }
  const base = path.basename(resolved);
  const parent = path.basename(path.dirname(resolved));
  if ((base !== 'settings.json' && base !== 'settings.local.json') || parent !== '.claude') {
    fail(`refusing to write ${resolved}: trim-hero only writes a .claude/settings.json, .claude/settings.local.json, or the global ~/.claude/settings.json.`);
  }
  return resolved;
}

// Only trim mechanisms are writable. This is the real approval gate: the model
// proposing a patch cannot smuggle in permissions.allow, hooks, env, or model,
// because this script drops the whole write if it sees a non-trim key.
const DISABLE_FLAGS = new Set([
  'disableBundledSkills',
  'disableWorkflows',
  'disableRemoteControl',
  'disableClaudeAiConnectors',
  'disableArtifact',
]);
const ALLOWED_KEYS = new Set([...DISABLE_FLAGS, 'skillOverrides', 'permissions']);

function validatePatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    fail('patch must be a JSON object of trim mechanisms.');
  }
  for (const k of Object.keys(patch)) {
    if (!ALLOWED_KEYS.has(k)) {
      fail(`patch key ${JSON.stringify(k)} is not a trim mechanism. trim-hero writes only: ${[...ALLOWED_KEYS].join(', ')}.`);
    }
    if (DISABLE_FLAGS.has(k) && patch[k] !== true) {
      fail(`${k} must be true. trim-hero only disables; to re-enable, restore a settings backup instead.`);
    }
  }
  if ('skillOverrides' in patch) {
    const so = patch.skillOverrides;
    if (!so || typeof so !== 'object' || Array.isArray(so)) {
      fail('skillOverrides must be an object mapping skill names to "off".');
    }
    for (const [name, v] of Object.entries(so)) {
      if (v !== 'off') {
        fail(`skillOverrides.${JSON.stringify(name)} must be "off". trim-hero only disables; to re-enable, restore a settings backup instead.`);
      }
    }
  }
  if ('permissions' in patch) {
    const perms = patch.permissions;
    if (!perms || typeof perms !== 'object' || Array.isArray(perms)) {
      fail('permissions must be an object with only a deny array.');
    }
    for (const sub of Object.keys(perms)) {
      if (sub !== 'deny') {
        fail(`permissions.${sub} is not writable by trim-hero. It writes only permissions.deny (bare tool names); permissions.allow and other keys are refused.`);
      }
    }
    if (!Array.isArray(perms.deny) || !perms.deny.every((x) => typeof x === 'string')) {
      fail('permissions.deny must be an array of strings.');
    }
  }
}

const target = validateSettingsPath(settingsPath);
const patch = readJson(patchPath, 'patch');
validatePatch(patch);

let current = {};
if (fs.existsSync(target)) {
  current = readJson(target, 'settings file');
  const backup = `${target}.bak-${Date.now()}`;
  fs.copyFileSync(target, backup);
  console.log(`backup: ${backup}`);
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
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
fs.writeFileSync(target, JSON.stringify(merged, null, 2) + '\n');
console.log(`written: ${target}`);
console.log(`keys changed: ${Object.keys(patch).join(', ')}`);
if (patch.permissions?.deny) console.log(`deny additions: ${patch.permissions.deny.join(', ')}`);
