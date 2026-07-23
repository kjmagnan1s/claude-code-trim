---
name: trim-hero
description: Trim Claude Code context bloat by profiling the real API payload, ranking what each turn pays for, and applying disable flags / deny rules / skillOverrides on approval. Use when the user asks what is eating their context window or tokens per turn, wants the system prompt or tool payload smaller, or types /trim-hero.
---

# Trim Hero

Measure the payload Claude Code ships on every request, give each expensive segment a verdict, and write the trim into settings.json behind an approval gate. Scripts do the arithmetic; you do the judgment.

Branches: full trim is the default (all steps). "What's eating my context?" → steps 1–4, report, stop. "Apply this list I already have" → steps 5–7.

Before step 2, resolve this skill's own directory (the folder containing this SKILL.md; installed as a plugin that is `$CLAUDE_PLUGIN_ROOT`, not the project cwd) and invoke every `scripts/…` command below by absolute path from it. Work in the scratchpad for captures and patches.

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

Build the approved-candidate patch as JSON in the scratchpad first, deny list as BARE tool names only. Show the ranked verdict table (segment, ~tokens, verdict, mechanism, why) AND the exact patch JSON that will be merged, flag that the ranking reflects baseline injection only (contextually loaded tools are not in it), then AskUserQuestion: apply which verdicts (recommended cuts / everything / let me pick) and which scope (`~/.claude/settings.json` global, `.claude/settings.json` project, or `.claude/settings.local.json` project-personal).

This is a gate. STOP until answered; no settings write of any kind before the answer. If the user narrows the selection, rebuild the patch and show it again before writing.
**Done when:** an explicit approval and scope are recorded for the exact patch JSON that was shown.

## 6. Apply

```bash
node scripts/apply.mjs <settings path> <patch.json path>
```

It backs up first and deep-merges, so existing settings survive. The gate is enforced in code, not just here: apply.mjs refuses any patch key that is not a trim mechanism (only disable flags, `permissions.deny` bare names, and `skillOverrides` are writable; `permissions.allow`, `hooks`, `env`, and `model` are rejected) and refuses any destination that is not a `.claude/settings.json`, `.claude/settings.local.json`, or the global `~/.claude/settings.json`. Confirm the keys it reports changed match the approved patch. If it refuses because the existing settings file is not valid JSON (hand-edited comments or trailing commas), nothing was written: tell the user which file is malformed and stop; do not hand-edit their settings to recover.
**Done when:** apply.mjs printed a backup path, a written path, and changed keys matching the approved patch.

## 7. Re-measure

Run `claude -p "/context"` from the target dir again (child runs reload settings immediately) and report the before/after delta. Tell the user the current interactive session keeps its old payload until they restart it.

Then offer the shareable receipt card. On a yes:

```bash
node scripts/receipt.mjs --tools-before N --tools-after N --tokens-before N --tokens-after N --out <scratchpad>/trim-receipt.svg
```

Numbers come from your own step 2/3 measurements (before) and this step's re-measure (after). Rasterize the SVG to PNG with whatever the machine has, in order: headless Chrome (`--headless --screenshot=<out.png> --window-size=1200,675 --force-device-scale-factor=2 file://<card.svg>`), `rsvg-convert`, or `magick`; if none exists, hand over the SVG and say so. Send the user the image.
**Done when:** the delta is reported with the baseline-injection caveat, the restart note is delivered, and the receipt card was offered (delivered on a yes, or declined).
