# trim

![trim hero](assets/hero.png)

A Claude Code skill that finds and removes the bloat in your per-request payload: tool definitions, skill catalogues, and feature instructions you never use.

## Install

As a plugin (recommended), from inside any Claude Code session:

```
/plugin marketplace add kjmagnan1s/claude-code-trim
/plugin install trim@claude-code-trim
```

Or as a personal skill:

```bash
git clone https://github.com/kjmagnan1s/claude-code-trim.git ~/.claude/skills/trim
```

Either way, open any project and type `/trim` (installed as a plugin it appears as `/trim:trim`), or ask "what's eating my context window."

Requirements: Claude Code and Node (which Claude Code already requires), plus bash and `lsof` (macOS and Linux; on Windows use WSL or Git Bash). No npm dependencies.

## How it works

1. Baseline: records `claude -p "/context"` output.
2. Profile: starts a tiny logging proxy on `127.0.0.1:8787` (loopback only), then spawns a throwaway child `claude -p` probe from your project dir with `ANTHROPIC_BASE_URL` pointed at it. The proxy forwards the request to `api.anthropic.com` untouched, streams the reply back, and writes the request body to a temp dir. The proxy lives for a few seconds and is killed when the probe finishes. The probe defaults to Haiku, so the one forced API call costs pennies.
3. Analyze: splits the captured payload into named, token-sized segments and pre-maps each to its removal mechanism.
4. Verdicts: the agent weighs each segment against your actual project and recommends cut, keep, or ask.
5. Gate: you approve the cuts and pick the scope (global or project settings).
6. Apply: deep-merges the patch into settings.json with a timestamped backup first.
7. Re-measure: reports the before/after token delta.

## Privacy

Everything stays on your machine. The capture file contains your own request payload (system prompt, tool definitions, and injected context such as CLAUDE.md), written to a local temp dir; nothing is uploaded anywhere. The proxy logs request bodies only, never headers, so your API key or OAuth token is never written to disk. The only network traffic is the probe's normal call to Anthropic's API with your own credentials.

## Credits

The measure-then-cut workflow this skill packages comes from Matt Pocock ([@mattpocock](https://x.com/mattpocockuk)) and his article [How to kill the bloat in Claude Code's system prompt](https://www.aihero.dev/how-to-kill-the-bloat-in-claude-codes-system-prompt) at aihero.dev. This skill wraps that process (proxy capture, payload analysis, settings.json mechanisms) into a single `/trim` command.
