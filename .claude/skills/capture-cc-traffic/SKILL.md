---
name: capture-cc-traffic
description: Capture the exact HTTP request that real Claude Code CLI sends to the upstream API — headers, body, system blocks — for debugging stealth proxies, comparing cloak output against real CLI, or reverse-engineering CLI behavior. Use this skill whenever the user mentions mimicking Claude Code, debugging stealth headers, comparing real CLI traffic to a proxy/relay, the Claude Cloak project, diagnosing why a relay (中转站) rejects a cloak request, comparing cloak body shape against relay policy, investigating 中转站政策与真 CLI 流量的差异, or asks "what does the real CLI actually send", even if they don't explicitly say "capture traffic".
---

# Capturing Real Claude Code Outbound Traffic

The goal is to get a complete recording of one real Claude Code CLI request — every header, the full JSON body including all `system` blocks — and use it as ground truth when building a stealth proxy or relay that needs to look like Claude Code.

This skill exists because three subtle traps make naive capture attempts silently fail.

## The Three Traps

**Trap 1 — `~/.claude/settings.json` has an `env` block that overrides shell env.**
If `settings.json` contains `env: { ANTHROPIC_BASE_URL: "..." }`, that wins over any `ANTHROPIC_BASE_URL=...` you set in your shell. Even `env -i ANTHROPIC_BASE_URL=...` does not help — the CLI re-injects the settings.json env after spawn. The capture run will appear to succeed (exit 0) but route to the wrong host and our echo server stays empty.

**Trap 2 — `--settings <file>` merges, it does not replace.**
The help text says "additional settings", which is literal. Passing `--settings /tmp/empty-env.json` cannot null out the global `env` block; an empty `{}` merge leaves the existing keys untouched. The only reliable override is to **temporarily rewrite `~/.claude/settings.json` itself**.

**Trap 3 — `--bare` and `--print` have non-obvious input requirements.**
`--bare` disables OAuth and requires `ANTHROPIC_API_KEY` (not `ANTHROPIC_AUTH_TOKEN`), and it reads the prompt from stdin — it will not consume the argv prompt. `--print` accepts argv but blocks waiting on stdin unless you redirect `< /dev/null`. Forget either and the run hangs into a timeout with no captured request.

## What to Do

Run `scripts/capture.sh` from this skill directory. It handles the whole flow: starts a localhost echo server, backs up and neutralizes `~/.claude/settings.json`, runs `claude --print` with `ANTHROPIC_BASE_URL=http://localhost:7700`, then restores settings even if the run fails.

```bash
bash <skill_dir>/scripts/capture.sh "say OK"
```

Outputs:
- `/tmp/cc-capture/echo.log` — raw `::REQ::` chunks for every HTTP request the CLI made
- `/tmp/cc-capture/parsed.json` — structured summary (model, system block sizes, headers, metadata, thinking, tools count)
- `/tmp/cc-capture/system-blocks/block{0,1,2,...}.txt` — each system block dumped as its own file so they can be diffed or copied into the cloak's template assets

Then read `parsed.json` and the `system-blocks/*.txt` files to compare against whatever the cloak is currently sending.

## Two Modes That Look Identical But Are Not

`claude --print "..."` runs in entrypoint `sdk-cli`, which produces the **Agent SDK** identity block:

> You are a Claude agent, built on Anthropic's Claude Agent SDK.

True interactive `claude` (no `--print`) uses entrypoint `cli` and produces the **main CLI** identity block:

> You are Claude Code, Anthropic's official CLI for Claude.

The large second system block (the multi-thousand-token instructions body) is **shared between both modes**, so `--print` is good enough for capturing it. But if a middleman strictly matches against the *first* identity block, the cloak should emit the `cli` variant (`Tb1` in cli.js), not the `sdk-cli` variant (`Fq4`).

To capture the interactive-mode identity instead, run `scripts/capture.sh --interactive "say OK"`. This pipes the prompt via stdin in a way that mimics an interactive turn rather than `--print`.

## What a Healthy Capture Looks Like

After a successful run, expect roughly:
- 1 HEAD request to `/` (CLI's reachability probe)
- 1 or more POST requests to `/v1/messages?beta=true`
- The POST body's `system` field is an array of 3 blocks: billing header → identity → main instruction body (~26 KB)
- `metadata.user_id` is a JSON-stringified `{device_id, account_uuid, session_id}` object
- The billing header text begins with `x-anthropic-billing-header: cc_version=X.Y.Z.<3hex>; cc_entrypoint=cli; cch=00000;` — note the **literal `00000`**, not a real hash

If only the HEAD request shows up and no POST follows, the CLI bailed out before sending the message — usually because Trap 3 (stdin) was hit. If the POST goes somewhere other than `localhost:7700`, Trap 1 (settings.json env) was not neutralized.

## Restoring State

`capture.sh` always restores `~/.claude/settings.json` from the backup, including on Ctrl-C, but if something goes very wrong (the script is killed -9, the system reboots), the backup will sit at `~/.claude/settings.json.cc-capture.bak`. Restoring it is a plain `mv`. Until restored, the user's normal Claude Code CLI will route to `http://localhost:7700` and fail to reach Anthropic.

## Anchoring Findings to cli.js Source

When a capture surfaces a field whose origin is unclear, the fastest way to identify the source code is anchor-search against the bundled CLI implementation. Use `scripts/find-cli.sh` to locate it regardless of install method:

```bash
CLI="$(bash <skill_dir>/scripts/find-cli.sh)"
node -e 'const s=require("fs").readFileSync(process.argv[1],"utf8"); console.log(s.indexOf(process.argv[2]))' \
  "$CLI" 'x-anthropic-billing-header: cc_version='
```

For CLI versions <~2.1.166, `find-cli.sh` returns `cli.js` (a JS bundle, directly readable). For 2.1.167+, it returns the platform-specific native binary that ships under `@anthropic-ai/claude-code-<plat>-<arch>/bin/claude`. Anchor literals still work against the native binary via `strings -n 30 "$CLI" | grep -F <anchor>` or `grep -aoE` because Bun's SEA embeds the JS source verbatim.

Useful anchors and what they locate in cli.js 2.1.112 (most still work in 2.1.167):

| Anchor literal | Function it points to | What it builds |
|---|---|---|
| `x-anthropic-billing-header: cc_version=` | `dk8(q)` | The billing block text, including the negated `bedrock/aws/mantle` ternary that controls `cch=00000;` |
| `claude-code-20250219` | `ZR1(model)` in 2.1.112, `N4_` registry in 2.1.167 | Runtime `anthropic-beta` assembly |
| `claude-cli/${` | `OI()` | User-Agent string with optional `agent-sdk` / `client-app` / `workload` suffixes |
| `You are Claude Code, Anthropic's` | `Tb1`/`pq4`/`Fq4` | The three identity-line constants |
| `function I8(` | `I8()` | Returns `B8.sessionId` for the `X-Claude-Code-Session-Id` header |

The 2.1.167 refactor moved per-feature betas into a frozen registry `N4_` whose elements are `{ header, ... }` objects, with order mapping to feature names like `claude_code`, `oauth_auth`, `interleaved_thinking`, `effort`, `task_budgets`, `mid_conversation_system`, etc. The `WPK` map (`N4_.map(h => [h.header, h])`) is the reverse lookup from header token to feature object.
