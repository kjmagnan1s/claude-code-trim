# Trim mechanisms

Verified against Claude Code v2.1.207, 2026-07. These are version-sensitive; if the CLI is much newer, spot-check the flags against `code.claude.com/docs` before relying on them.

Every mechanism that removes payload from a Claude Code request, and the traps in each. All settings live in `~/.claude/settings.json` (every project), `.claude/settings.json` (one project), or `.claude/settings.local.json` (one project, personal); `scripts/apply.mjs` refuses to write anywhere else.

## Feature flags (broad first pass)

| Flag | Removes |
|---|---|
| `disableBundledSkills: true` | All Anthropic bundled skills at once (dataviz, review, init catalogue). Slash commands stay typable. All-or-nothing; for per-skill control use `skillOverrides`. |
| `disableWorkflows: true` | The multi-agent `Workflow` tool, usually the single largest tool definition. |
| `disableRemoteControl: true` | Remote-control machinery (e.g. `RemoteTrigger`). |
| `disableClaudeAiConnectors: true` | Every claude.ai connector tool block (`mcp__claude_ai_*`: Gmail, Calendar, Figma, Gamma, …). |
| `disableArtifact: true` | The `Artifact` publishing tool. |

## permissions.deny (individual built-in tools)

```json
{ "permissions": { "deny": ["NotebookEdit", "CronCreate"] } }
```

A BARE name (`"NotebookEdit"`) removes the tool's definition from the payload; Claude never sees it. A scoped rule (`"Bash(rm *)"`, `"Skill(dataviz)"`) blocks the matching call but leaves the full definition in the payload, reclaiming zero tokens. To shrink requests, emit bare names only. Scoped rules remain the right tool for safety policy; they are just not a trim mechanism.

## skillOverrides (per-skill control)

Four values, per skill:

- `"on"` — default, fully loaded.
- `"name-only"` — name stays discoverable, body trimmed from the catalogue.
- `"user-invocable-only"` — typable by the user, invisible to the model.
- `"off"` — removed from the payload entirely.

`"user-invocable-only"` is the sweet spot for skills the user fires by hand; the model pays nothing for them.

`scripts/apply.mjs` writes only `"off"` — it enforces disable-only values (SKILL.md step 6). To recommend `"name-only"` or `"user-invocable-only"`, hand the user the exact settings edit to make themselves; do not put those values in the patch.

## MCP servers and plugins

`mcp__<server>__*` tool blocks come from connected MCP servers: remove or disable the server in `.mcp.json`, project config, or the providing plugin. Connector tools (`mcp__claude_ai_*`) fall under `disableClaudeAiConnectors` or per-connector disconnection in the client.

## What NOT to cut

- Task tools, `Workflow`, worktree tools: background jobs and multi-agent runs depend on them. A user who runs `/schedule`, crons, or subagent fan-outs keeps these even though they rank high.
- Anything the project's CLAUDE.md, hooks, or installed skills reference by name.
- Plan-mode tools if the user works in plan mode; `NotebookEdit` if they write notebooks.

## Measurement caveats

- One probe captures BASELINE injection (system prompt, tool defs, catalogues, first-turn context). Tools that load contextually mid-session are not in it. Say so when reporting.
- Byte/4 token estimates are ranking-grade, not billing-grade. The before/after `/context` delta is the honest number.
- The parent session keeps its old payload until restarted; child `claude -p` runs pick up new settings immediately, which is why re-measurement works without a restart.
