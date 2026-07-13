import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = (name) => path.join(here, '..', 'scripts', name);
const fixture = path.join(here, 'fixtures', 'capture.json');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'trim-test-'));

const run = (name, args) => spawnSync('node', [script(name), ...args], { encoding: 'utf8' });

test('analyze: segments, mechanisms, ordering', () => {
  const dir = tmp();
  const out = path.join(dir, 'inventory.json');
  const r = run('analyze.mjs', [fixture, out]);
  assert.equal(r.status, 0, r.stderr);

  const { totals, segments } = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(totals.toolCount, 5);
  assert.ok(totals.captureBytes > 0);

  const byName = Object.fromEntries(segments.map((s) => [s.name, s]));
  assert.match(byName.Workflow.mechanism, /disableWorkflows/);
  assert.match(byName.NotebookEdit.mechanism, /deny BARE name/);
  assert.match(byName['mcp__claude_ai_Gmail__search_threads'].mechanism, /disableClaudeAiConnectors/);
  assert.match(byName['mcp__someserver__do_thing'].mechanism, /MCP server/);
  assert.match(byName.Skill.mechanism, /skillOverrides/);

  const injection = segments.find((s) => s.kind === 'message-injection');
  assert.ok(injection, 'skills-catalogue injection block detected');
  assert.match(injection.mechanism, /disableBundledSkills/);

  const bytes = segments.map((s) => s.bytes);
  assert.deepEqual(bytes, [...bytes].sort((a, b) => b - a), 'sorted descending');
});

test('analyze: degenerate capture exits non-zero', () => {
  const dir = tmp();
  const empty = path.join(dir, 'empty.json');
  fs.writeFileSync(empty, '{"model":"x","messages":[]}');
  const r = run('analyze.mjs', [empty]);
  assert.equal(r.status, 1);
});

test('apply: deep merge, array union, backup, no clobber', () => {
  const dir = tmp();
  const settings = path.join(dir, 'settings.json');
  const patch = path.join(dir, 'patch.json');
  fs.writeFileSync(
    settings,
    JSON.stringify({
      model: 'opus',
      permissions: { deny: ['Bash(rm -rf *)'], allow: ['Bash(ls*)'] },
      env: { FOO: 'bar' },
    })
  );
  fs.writeFileSync(
    patch,
    JSON.stringify({
      permissions: { deny: ['NotebookEdit', 'Bash(rm -rf *)'] },
      disableWorkflows: true,
      skillOverrides: { dataviz: 'off' },
    })
  );

  const r = run('apply.mjs', [settings, patch]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /keys changed: permissions, disableWorkflows, skillOverrides/);

  const merged = JSON.parse(fs.readFileSync(settings, 'utf8'));
  assert.equal(merged.model, 'opus', 'unrelated scalar survives');
  assert.deepEqual(merged.permissions.allow, ['Bash(ls*)'], 'unrelated array survives');
  assert.deepEqual(merged.permissions.deny, ['Bash(rm -rf *)', 'NotebookEdit'], 'union, deduped');
  assert.equal(merged.disableWorkflows, true);
  assert.equal(merged.skillOverrides.dataviz, 'off');

  const backups = fs.readdirSync(dir).filter((f) => f.startsWith('settings.json.bak-'));
  assert.equal(backups.length, 1, 'backup written');
});

test('apply: malformed settings refused, file untouched', () => {
  const dir = tmp();
  const settings = path.join(dir, 'settings.json');
  const patch = path.join(dir, 'patch.json');
  const malformed = '{ "model": "opus", /* comment */ }';
  fs.writeFileSync(settings, malformed);
  fs.writeFileSync(patch, '{"disableWorkflows": true}');

  const r = run('apply.mjs', [settings, patch]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not valid JSON/);
  assert.equal(fs.readFileSync(settings, 'utf8'), malformed, 'settings untouched');
  const backups = fs.readdirSync(dir).filter((f) => f.startsWith('settings.json.bak-'));
  assert.equal(backups.length, 0, 'no backup of a file that was never parsed');
});

test('receipt: renders card with numbers, deltas, and command', () => {
  const dir = tmp();
  const out = path.join(dir, 'receipt.svg');
  const r = run('receipt.mjs', [
    '--tools-before', '156', '--tools-after', '94',
    '--tokens-before', '92267', '--tokens-after', '57824',
    '--date', '2026-07-13', '--out', out,
  ]);
  assert.equal(r.status, 0, r.stderr);
  const svg = fs.readFileSync(out, 'utf8');
  for (const s of ['156', '94', '~92k', '~58k', '-40%', '-37%', 'npx github:kjmagnan1s/trim-hero', '2026-07-13', '</svg>']) {
    assert.ok(svg.includes(s), `missing ${s}`);
  }
});

test('receipt: refuses missing or non-numeric args', () => {
  const r = run('receipt.mjs', ['--tools-before', '156']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage/);
});
