// Split a captured /v1/messages request body into named, token-sized segments
// and pre-map each to its removal mechanism. Arithmetic only; the judgment
// ranking (would THIS project ever use it?) belongs to the agent.
//
// Usage: node analyze.mjs <capture.json> [inventory-out.json]
// Prints a ranked table to stdout; writes inventory JSON beside the capture
// (or to the second arg).
import fs from 'node:fs';
import path from 'node:path';

const capturePath = process.argv[2];
if (!capturePath) {
  console.error('usage: node analyze.mjs <capture.json> [inventory-out.json]');
  process.exit(1);
}
const outPath =
  process.argv[3] || path.join(path.dirname(capturePath), 'inventory.json');

const body = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
const est = (bytes) => Math.round(bytes / 4); // ~4 bytes/token; ranking-grade estimate

// Built-in tools a dedicated settings flag removes wholesale.
const FLAG_MAP = {
  Workflow: 'disableWorkflows: true',
  Artifact: 'disableArtifact: true',
  RemoteTrigger: 'disableRemoteControl: true (if you never use remote/cloud control) or deny bare name',
};

function mechanismFor(toolName) {
  if (FLAG_MAP[toolName]) return FLAG_MAP[toolName];
  if (toolName.startsWith('mcp__claude_ai_'))
    return 'disableClaudeAiConnectors: true (all claude.ai connectors) or disconnect this connector';
  if (toolName.startsWith('mcp__plugin_'))
    return 'disable the plugin (or its MCP server) that provides it';
  if (toolName.startsWith('mcp__'))
    return 'remove/disable this MCP server in .mcp.json or its plugin';
  if (toolName === 'Skill')
    return 'keep the tool; shrink its catalogue via disableBundledSkills / skillOverrides';
  return 'permissions.deny BARE name (scoped rules block calls but leave the definition)';
}

const segments = [];

// Tool definitions: the article's ranked table.
for (const tool of body.tools || []) {
  const bytes = Buffer.byteLength(JSON.stringify(tool), 'utf8');
  segments.push({
    kind: 'tool',
    name: tool.name,
    bytes,
    estTokens: est(bytes),
    mechanism: mechanismFor(tool.name),
    preview: (tool.description || '').slice(0, 100),
  });
}

// System prompt blocks.
const sys = body.system;
const sysBlocks = typeof sys === 'string' ? [{ text: sys }] : sys || [];
sysBlocks.forEach((b, i) => {
  const text = b.text || JSON.stringify(b);
  const bytes = Buffer.byteLength(text, 'utf8');
  segments.push({
    kind: 'system',
    name: `system[${i}]`,
    bytes,
    estTokens: est(bytes),
    mechanism: 'mostly fixed; skill/agent catalogues inside it shrink via disableBundledSkills / skillOverrides',
    preview: text.slice(0, 100).replace(/\s+/g, ' '),
  });
});

// First-message injected context (system-reminders often carry the skills
// catalogue, CLAUDE.md, and MCP instructions here rather than in `system`).
const first = (body.messages || [])[0];
const firstBlocks =
  typeof first?.content === 'string'
    ? [{ text: first.content }]
    : first?.content || [];
firstBlocks.forEach((b, i) => {
  const text = b.text || JSON.stringify(b);
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes < 400) return; // skip the probe prompt itself and trivial blocks
  const isSkills = /skills? .*available|Skill tool/i.test(text);
  segments.push({
    kind: 'message-injection',
    name: `message[0].content[${i}]`,
    bytes,
    estTokens: est(bytes),
    mechanism: isSkills
      ? 'skills catalogue: disableBundledSkills, skillOverrides (apply.mjs patches only "off"; "user-invocable-only" / "name-only" are hand edits — see references/mechanisms.md), or uninstall plugins'
      : 'injected context (CLAUDE.md / MCP instructions / hooks): trim the source file, disconnect the server, or remove the hook',
    preview: text.slice(0, 100).replace(/\s+/g, ' '),
  });
});

segments.sort((a, b) => b.bytes - a.bytes);

if (segments.length === 0) {
  console.error('[trim] no segments found; capture looks degenerate (no tools/system/injections)');
  process.exit(1);
}

const captureBytes = fs.statSync(capturePath).size;
const totals = {
  model: body.model,
  toolCount: (body.tools || []).length,
  totalBytes: segments.reduce((s, x) => s + x.bytes, 0),
  captureBytes,
  estTokens: segments.reduce((s, x) => s + x.estTokens, 0),
};

fs.writeFileSync(outPath, JSON.stringify({ totals, segments }, null, 2));

console.log(
  `[trim] ${totals.toolCount} tools · ${totals.totalBytes.toLocaleString()} of ${captureBytes.toLocaleString()} capture bytes counted · ~${totals.estTokens.toLocaleString()} est tokens (model: ${totals.model})`
);
console.log(`${'segment'.padEnd(44)} ${'kind'.padEnd(18)} ${'bytes'.padStart(8)} ${'~tok'.padStart(7)}`);
for (const s of segments.slice(0, 40)) {
  console.log(
    `${s.name.slice(0, 43).padEnd(44)} ${s.kind.padEnd(18)} ${String(s.bytes).padStart(8)} ${String(s.estTokens).padStart(7)}`
  );
}
if (segments.length > 40) console.log(`… ${segments.length - 40} more (see inventory)`);
console.log(`inventory: ${outPath}`);
