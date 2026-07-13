---
name: trim
description: Trim Claude Code context bloat by profiling the real API payload, ranking what each turn pays for, and applying disable flags / deny rules / skillOverrides on approval. Use when the user asks what is eating their context window or tokens per turn, wants the system prompt or tool payload smaller, or types /trim.
---

# Trim

Measure the payload Claude Code ships on every request, give each expensive segment a verdict, and write the trim into settings.json behind an approval gate. Scripts do the arithmetic; you do the judgment.

Branches: full trim is the default (all steps). "What's eating my context?" → steps 1–4, report, stop. "Apply this list I already have" → steps 5–7.

All script paths below are relative to this skill's `scripts/` folder. Work in the scratchpad for captures and patches.

## 1. Baseline

From the target project dir (default: cwd) run `claude -p "/context"` and save the output.
**Done when:** baseline token totals are recorded, or the command's failure is noted and you proceed without a baseline.

## 2. Profile

```bash
bash scripts/profile.sh <target-dir> <scratchpad-out-dir>
```

This spawns the logging proxy, routes a throwaway child `claude -p` probe through it (haiku by default, one cheap call), and prints the capture path. The child is the subject; this session is never measured.
**Done when:** the printed capture file exists and exceeds 10 KB. On failure the script dumps `proxy.log` / `probe.log`; fix from those, and retry with `PORT=<free>` if 8787 was busy.

## 3. Analyze

```bash
node scripts/analyze.mjs <capture.json>
```

Splits the payload into named segments (tool definitions, system blocks, first-turn injections like the skills catalogue and CLAUDE.md), sizes each, and pre-maps each to its removal mechanism in `inventory.json`.
**Done when:** `inventory.json` exists and the ranked table printed.

## 4. Verdicts

Read [references/mechanisms.md](references/mechanisms.md), then read the inventory alongside the project's own signals: CLAUDE.md, `.mcp.json`, installed plugins, hooks, what the repo actually is. A flat byte sort is not the deliverable; weigh each segment's tokens against whether THIS project would ever use it.

Assign every segment of ~200 est tokens or more a verdict: **cut**, **keep**, or **ask**, each with its mechanism and a one-line why grounded in the project. Anything on the mechanisms file's What-NOT-to-cut list gets **ask**, never a silent cut.
**Done when:** every segment at or above ~200 est tokens carries a verdict, and no cut contradicts the What-NOT-to-cut list without the user's say-so.

## 5. Propose and gate

Show the ranked verdict table (segment, ~tokens, verdict, mechanism, why), flag that it reflects baseline injection only (contextually loaded tools are not in it), then AskUserQuestion: apply which verdicts (recommended cuts / everything / let me pick) and which scope (`~/.claude/settings.json` global vs `.claude/settings.json` project).

This is a gate. STOP until answered; no settings write of any kind before the answer.
**Done when:** an explicit approval and scope are recorded.

## 6. Apply

Build the approved patch as JSON in the scratchpad, deny list as BARE tool names only, then:

```bash
node scripts/apply.mjs <settings.json path> <patch.json path>
```

It backs up first and deep-merges, so existing settings survive.
**Done when:** apply.mjs printed both a backup path and a written path.

## 7. Re-measure

Run `claude -p "/context"` from the target dir again (child runs reload settings immediately) and report the before/after delta. Tell the user the current interactive session keeps its old payload until they restart it.
**Done when:** the delta is reported with the baseline-injection caveat, and the restart note is delivered.
