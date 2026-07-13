#!/usr/bin/env node
// One-line installer: npx github:kjmagnan1s/claude-code-trim
//
// Installs trim as a managed Claude Code plugin (marketplace add + install),
// falling back to a git clone into ~/.claude/skills/trim when the CLI is
// missing or too old for plugins. Never installs both: a plugin install and a
// skills-dir copy with the same name shadow each other.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = 'kjmagnan1s/claude-code-trim';
const SKILLS_COPY = path.join(os.homedir(), '.claude', 'skills', 'trim');

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}`.trim(), missing: r.error?.code === 'ENOENT' };
};

console.log('claude-code-trim installer\n');

if (fs.existsSync(SKILLS_COPY)) {
  console.log(`Already installed as a personal skill at ${SKILLS_COPY}.`);
  console.log('Update it with: git -C ~/.claude/skills/trim pull');
  console.log('(Not installing the plugin on top: same-name plugin and skills-dir copies shadow each other.)');
  process.exit(0);
}

const probe = run('claude', ['--version']);
if (!probe.missing) {
  const add = run('claude', ['plugin', 'marketplace', 'add', REPO]);
  const addOk = add.ok || /already/i.test(add.out);
  if (addOk) {
    const install = run('claude', ['plugin', 'install', `trim@claude-code-trim`]);
    if (install.ok || /already installed/i.test(install.out)) {
      console.log('Installed as a plugin: trim@claude-code-trim');
      console.log('\nRestart Claude Code, then type /trim (or ask "what\'s eating my context window").');
      process.exit(0);
    }
    console.log(`Plugin install failed, falling back to a skills-dir clone.\n  ${install.out.split('\n')[0]}`);
  } else {
    console.log(`Marketplace add failed, falling back to a skills-dir clone.\n  ${add.out.split('\n')[0]}`);
  }
} else {
  console.log('claude CLI not found on PATH, falling back to a skills-dir clone.');
}

const clone = run('git', ['clone', '--depth', '1', `https://github.com/${REPO}.git`, SKILLS_COPY]);
if (!clone.ok) {
  console.error(`git clone failed:\n${clone.out}`);
  console.error(`\nManual install: git clone https://github.com/${REPO}.git ~/.claude/skills/trim`);
  process.exit(1);
}
console.log(`Installed as a personal skill at ${SKILLS_COPY}`);
console.log('\nRestart Claude Code, then type /trim (or ask "what\'s eating my context window").');
