# formlm-cli

> The official CLI & MCP Server for [FormLM](https://formlm.me) — let AI Agents build and manage your forms directly.

[![npm version](https://img.shields.io/npm/v/@formlm/cli)](https://www.npmjs.com/package/@formlm/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![MCP Registry](https://img.shields.io/badge/Official%20MCP%20Registry-me.formlm%2Fcli-blue)](https://registry.modelcontextprotocol.io/)
[![smithery badge](https://smithery.ai/badge/formlm/cli)](https://smithery.ai/servers/formlm/cli)

**Keywords**: FormLM CLI, MCP Server, AI Agent form builder, form automation, assessment platform CLI, Claude MCP, Cursor MCP, AI-powered forms, formlm-cli, npm CLI tool

---

## What is FormLM?

**[FormLM](https://formlm.me)** is an AI-powered form & assessment platform. It lets you build smart forms, scoring quizzes, and professional evaluation reports — all with natural language instructions.

With `formlm-cli`, you can control FormLM directly from your terminal or plug it into any AI Agent (Claude, Cursor, GPT, etc.) as an **MCP Server** — no UI needed.

> Visit the official website: **[https://formlm.me](https://formlm.me)**
>
> `formlm-cli` is listed in the **official MCP Registry** as [`me.formlm/cli`](https://registry.modelcontextprotocol.io/) — search "formlm" in any MCP-capable client (Claude Desktop, Cursor, VS Code Copilot, Codex CLI) to install it.

---

## What's New in v0.5.4

Structured output everywhere: all **10 MCP tools now declare an `outputSchema`** and return machine-checkable `structuredContent` on every call path (success, partial and error) — `auth_login` ({ok, message, user}), `auth_email_code` ({stage: captcha|sent|failed}), `formlm_generate` ({ok, appId, planType, tasks[]}), `formlm_execute` ({ok, taskStatus, shareToken, shareUrl, builderUrl, dataUrl, accessType}) and `formlm_exec` ({ok, code, message, data}). Batch consumers and directory quality scanners can rely on fields instead of prose.

---

## What's New in v0.5.3

Tool-metadata quality for MCP directories and safer agent UX:

- **All 10 MCP tools now expose standard `annotations`** (read-only / destructive / idempotent / open-world hints) and a human-readable **`title`** — supporting clients can show risk badges and friendly labels before executing anything (`formlm_exec` is explicitly marked destructive; `formlm_doctor`/`formlm_snapshot` read-only).
- **Five read-only tools return validated structured output**: `auth_status`, `formlm_usage`, `formlm_snapshot`, `formlm_doctor` and `formlm_skill` now declare an `outputSchema` and ship a machine-checkable `structuredContent` alongside the human text — batch auditors can consume fields instead of parsing prose (e.g. `doctor.findings[].fix`, `snapshot.data._degraded`, `usage.appsLeft`).
- The tool table above now lists all **10** tools — it had lagged at 9 since `formlm_usage` was added.

---

## What's New in v0.5.0

Hardening round driven by real agent field reports (batch runs of 50 apps), plus a second pass that re-checked every reported item against the code and machine-verified all documented commands.

- **`share publish` now defaults to anonymous access** (`--access visitor`) and exposes `--access / --perm / --days / --no-style`; a new `share set` subcommand passes the raw server parameters through, so "anyone + permanent" no longer requires calling the internal API. Previously publish was hard-wired to `form-type all`, which **requires login** — anonymous respondents got the login page.
- **`expert config --enable` no longer self-destructs**: the value is forwarded space-separated (`--enable true`) and the server accepts it again. Before, `--enable=true` was rejected as an unknown option, the whole command was discarded, yet the envelope still reported success.
- **Parameter errors are no longer reported as success**: `picocli` validation failures now map to `code != 0` / `ok:false` instead of hiding the error text inside `data` with `code:0`.
- **Uniform machine output**: `snapshot` and `auth status` now honour `--json`/`FORMLM_JSON=1` with the same `{ok,code,message,data}` envelope as everything else, and human guidance lines moved to stderr, so stdout is a single parseable line.
- **`app remove` is a real alias of `app delete`**; `app list` gained `--all / --limit / --page / --with-urls`; `app urls` returns `shareToken`, `published`, `shareType/Perm/Day` and absolute https URLs.
- **New `doctor` command** (and MCP `formlm_doctor` tool): one read-only call per app covering scoring coverage, dead/empty experts, styling, unexpected certificate pages, language consistency (`--expect-lang`, `--deep` scans widget text) and share access + reachability.
- **New `snapshot --summary`** compact audit profile (counts, dimension names, report pages, expert flags, share type/perm/day + shareToken) — batch verification no longer needs to parse full module payloads.
- **Resume after the plan cache expires**: `smart plan --save-plan <file>` + `smart execute --plan-file <file>` (the server plan cache is ~10 minutes, and the docs now say so).
- **Retry/backoff**: read-only commands retry with exponential backoff on 408/429/5xx; writes are never auto-retried. Tunable via `FORMLM_RETRIES` / `FORMLM_TIMEOUT_MS`.
- `report page remove --name "结业证书"` resolves page names server-side; `report page update` verifies the page exists (opt into upsert with `--upsert`); write confirmations are compact; `widget remove` now persists (it previously returned success without saving).

- **`smart generate` now exists** as a resumability-preserving wrapper over `plan → execute×N → (--publish) → (--doctor)`, and the README finally matches the command surface. Earlier versions documented a `smart generate` that was never implemented (the first command every agent ran, and it failed).
- **Generation is now pin-able**: `smart plan --dimensions "A|B|C"` fixes the scoring dimension names and count, `--app-name` fixes the app display name, `--dry-run` validates a prompt without leaving a residue app. Unpinned dimensions used to be renamed/recounted by the AI, forcing page↔app rework (batch measurement: 11/13 pages).
- **Docs are now machine-verified against the command surface**: every `formlm-cli …` example in README/INSTALL is executed and checked for unknown/missing options (149 examples, 0 drifts), so documented commands cannot silently diverge again.
- `smart plan` output carries structured `modules` / `missingModules`, so callers can detect coverage gaps (e.g. no `expert` for non-consultation plans) without parsing prose; the raw exec `403` now lists the whitelisted command set.

---

## What's New in v0.2.1

- **Field ID validation**: `field add --id` now enforces snake_case regex (`^[a-zA-Z0-9_]+$`)
- **Snapshot `--md` flag**: Unified JSON output by default, with optional `--md` for markdown format
- **Error handler**: Missing required options now print usage hints instead of bare error messages
- **Server-side fixes**: SessionContext appId sync, ScaleCommand B5 reversal removal, CLI --app extraction

---

## What's New in v0.2.0

The MCP architecture has been completely redesigned from the ground up:

- **34 flat tools → 6 layered tools + 6 knowledge resources**
- **Intelligence Layer**: `formlm_generate` wraps the server-side AssessAgent pipeline
- **Domain Knowledge**: 6 MCP resources expose SKILL.md files directly to AI agents
- **State Awareness**: `formlm_snapshot` aggregates all module states in one call
- **P0 Constraints**: Embedded directly in command descriptions — AI sees them every time

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│         AI Agent (any MCP Client: Claude / Cursor /       │
│           Codex CLI / Windsurf / Cline / ...)             │
├─────────────────────────────────────────────────────────┤
│  Tier 0: auth_login, auth_email_code, auth_status      │
│  Tier 1: formlm_generate                   ← Smart Pipeline │
│  Tier 2: formlm_snapshot, formlm_skill ← State + Knowledge│
│  Tier 3: formlm_exec                    ← Direct Commands │
├─────────────────────────────────────────────────────────┤
│  Resources: formlm://skills/{form,scale,connect,        │
│              report,expert,share}                        │
├─────────────────────────────────────────────────────────┤
│               formlm-cli MCP Server                      │
├─────────────────────────────────────────────────────────┤
│            FormLM Server (McpV1Api)                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │AssessAgent│ │BuilderAgent│ │CliService│ │SKILL.md  │    │
│  │ (Plan+   │ │ (Think+  │ │ (picocli │ │ (domain  │    │
│  │  Execute) │ │  Reflect)│ │  dispatch)│ │  rules)  │    │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## Installation

```bash
npm install -g @formlm/cli
```

Requires Node.js ≥ 18.

For a detailed step-by-step guide (including MCP setup for Claude Desktop / Cursor / Codex CLI / Windsurf / Cline), see **[INSTALL.md](INSTALL.md)**.

---

## Quick Start

### 1. Login

```bash
# Recommended: copy your Access Token from the web app
# (formlm.me → sign in → Workspace → top-right user menu → Account Settings → Access Token → Copy)
formlm-cli auth login --token <your-token>

# Interactive login — pick one of three methods:
#   1) Access Token    (same as above)
#   2) Email verification code  (no password, no browser — fully in the terminal)
#   3) Email + password (only if your account has set a password —
#      email-verification-code and Google accounts have none)
#
# New here without an account? Pick method 2 — the first email-code login
# registers the account automatically (with free AI credits); no website visit needed.
formlm-cli auth login
```

```bash
# Check your remaining budget BEFORE batch work — plan, app slots (free plan: 10 apps,
# recycle-bin apps still hold a slot) and AI credits:
formlm-cli usage
```

### 2. Smart Pipeline (AI-recommended)

Creation is a **two-phase pipeline** (`plan` → `execute` per module). `smart generate` is the one-shot wrapper
of the same steps when you do not need per-module control:

```bash
# One-shot: plan → execute every module → publish anonymously → quality audit
formlm-cli smart generate \
  --input "Create a workplace stress assessment with 10 questions, 3 dimensions (workload, autonomy, support), and detailed score interpretations" \
  --plan-type assessment --question-count 10-15 --lang en --publish --doctor
```

Or step by step (recommended for batches — every step is resumable):

```bash
# Phase 1 — plan (~10-30s): creates the app and returns appId + task list.
# --save-plan keeps the full plan JSON on disk so modules can still be executed
# after the server-side plan cache (~10 min) expires.
formlm-cli smart plan --input "Create a workplace stress assessment with 10 questions, 3 dimensions, and detailed score interpretations" \
  --plan-type assessment --question-count 10-15 --lang en --dimensions "Workload|Autonomy|Support" --save-plan plan.json

# Phase 2 — execute every module listed by the plan, in order (~30-120s each):
formlm-cli smart execute --app <appId> --module form
formlm-cli smart execute --app <appId> --module scale
formlm-cli smart execute --app <appId> --module connect
formlm-cli smart execute --app <appId> --module report
formlm-cli smart execute --app <appId> --module share

# Publish so anonymous visitors can fill it in (each respondent submits once, permanent):
formlm-cli share publish --app <appId>            # --access visitor is the default
#   ⚠️ an un-styled app auto-gets a default style here (30-120s AI) — pass --no-style to skip

# Verify quality in one read-only call (see Doctor below):
formlm-cli doctor --app <appId> --expect-lang en
```

> **⚠️ Module coverage depends on planType.** Only `consultation` plans include an `expert` task;
> `assessment / exam / report / survey / learn` do not. `smart plan` prints a warning when a module is
> missing — add an expert explicitly with `formlm-cli expert config --app <appId> --name ... --role ... --kbText ...`.

> **⚠️ Styling:** the `connect` module of the pipeline applies the visual style. If you skip the pipeline and use
> Direct Commands instead, you MUST run `connect style apply-all`, otherwise the form keeps the plain unstyled look.

### 3. Get All App URLs (after creating)

```bash
# Get fill-in, editor, data management, and Data API URLs in one call
formlm-cli app urls --app <appId>
# Returns: shareUrl (relative /s/<token>), shareUrlAbsolute (https, iframe-ready),
#          shareToken, published, shareType/sharePerm/shareDay,
#          builderUrl (editor), dataUrl (data management),
#          apiUrl + apiHelpUrl (Data API, empty until enabled)
```

### 4. Enable the Data API (form backend for any page)

```bash
# Turn a form into a data endpoint — static sites, local pages, and AI apps
# can POST submissions straight to it (CORS enabled, no server needed)
formlm-cli share api --app <appId> --submit true --query true
# Then point your HTML form / fetch / curl at the returned endpoint.
# Append ?help to the endpoint for its Markdown docs (readable by AI agents).
```

### 5. Beautify Your Form (if using Direct Commands)

```bash
# Apply AI-generated visual style to all pages (takes 30-120s)
formlm-cli connect style apply-all --app <appId> --look "职场压力评估，深蓝专业风格" --theme minimalist
```

### 6. Direct Commands (for fine-grained control)

```bash
# Get a snapshot of all module states
formlm-cli snapshot --app <appId>
formlm-cli snapshot --app <appId> --md              # Markdown format (token-efficient for AI)
formlm-cli snapshot --app <appId> --summary          # compact audit profile (batch verification)
formlm-cli snapshot --app <appId> --with-values      # include report widget body text

# Read a skill document before constructing commands
formlm-cli skill form
formlm-cli skill scale

# Scale commands
formlm-cli scale query --app <appId>
formlm-cli scale add --app <appId> --id stress --name "Stress Level" --format sum --kbText "..."
formlm-cli scale keys add --app <appId> --scale stress --fields q1,q2,q3
formlm-cli scale data add --app <appId> --scale stress --bands "Low:desc||Moderate:desc||High:desc"   # recommended: server auto-computes even boundaries + 999 sentinel

# Report commands
formlm-cli report query --app <appId>
formlm-cli report page add --app <appId> --name "Summary"                     # page type defaults to A4
formlm-cli report widget add --app <appId> --page <pageId> --type scale-chart --format bar --scaleId <dim> --x 0 --y 0 --w 24 --h 12
formlm-cli report widget logic add --app <appId> --page <pageId> --id <widgetId> --min 0 --max 20 --content "<p>Keep it up</p>"

# Expert commands (--name and --kbText are required by the server)
formlm-cli expert query --app <appId>
formlm-cli expert config --app <appId> --name "Career Coach" --role "资深职业规划师" --kbText "..." --theme Warm
formlm-cli expert set --app <appId> --property enable --value true   # single-property toggle

# Quality audit (read-only)
formlm-cli doctor --app <appId>
formlm-cli doctor --app <appId> --expect-lang en --deep
```

### 7. Use as MCP Server

```bash
formlm-cli mcp
```

This starts the MCP Server (stdio transport) with 10 tools + 6 resources, ready for AI Agents to connect.

---

## Command Reference

### Smart Pipeline (AI-recommended)

There are two ways in: `smart plan` + `smart execute` (explicit, resumable — recommended for batches),
or `smart generate`, which is a thin wrapper over exactly those steps:

```bash
# Phase 1 — plan only (creates the app, returns appId + tasks; cached server-side ~10min)
formlm-cli smart plan --input "..." [--plan-type assessment] [--style "温暖亲切"] [--question-count 10-15] \
  [--lang en] [--dimensions "Focus|Sleep|Load"] [--app-name "Team Focus Check"] \
  [--save-plan plan.json] [--dry-run]

# Phase 2 — execute one module at a time (form / scale / connect / report / expert / share)
formlm-cli smart execute --app <appId> --module form
formlm-cli smart execute --app <appId> --module scale --plan-file plan.json   # after the cache expired
formlm-cli smart execute --app <appId> --module scale --clear-first          # re-run without duplicating dimensions

# One-shot wrapper — plan → execute every module → optional publish → optional doctor
formlm-cli smart generate --input "..." --plan-type assessment --lang en --publish --doctor
formlm-cli smart generate --input "..." --only form,scale,report       # partial build
formlm-cli smart generate --input "..." --skip connect                 # leave styling out
```

> **Pinning vs. improvising.** By default the Plan AI invents dimension names/count and the app name, which
> breaks page↔app consistency in batch runs. Use `--dimensions` to pin the dimension list (exact names + count)
> and `--app-name` to pin the display name; verify afterwards with `snapshot --summary` (it reports `dimNames`).
>
> **`--dry-run`** validates a prompt/spec and deletes the probe app again (the server always creates an app when
> planning), so experimentation leaves no residue.
>
> **Success is machine-readable**: `smart execute` returns `data.taskStatus` (`success` / `error`), and
> `smart generate` returns `{appId, modules:[{module,status,error}], publish, doctor, resumeHint}` — trust those
> fields, not the human wording. On a mid-run failure the app is kept and `resumeHint` gives the exact resume command.

### Snapshot

```bash
# Get all module states in one call (JSON by default)
formlm-cli snapshot --app <appId>
formlm-cli snapshot --app <appId> --module scale    # Only scale module
formlm-cli snapshot --app <appId> --md             # Markdown format (token-efficient for AI)
formlm-cli snapshot --app <appId> --summary        # Compact audit profile (counts/dim names/report pages/expert/share + shareToken)
formlm-cli snapshot --app <appId> --with-values    # + report widget body text (per-page queries)
formlm-cli snapshot --apps <id1,id2,...> --summary # Batch: N apps in ONE process (connection reuse, FORMLM_CONCURRENCY parallel apps, default 4)
```

Measured: 5 apps × 7 module queries = 35 requests in ~13s in a single process, versus one cold Node
process per app before (the old serial-subprocess pattern took roughly 5× that, plus no connection reuse).

`snapshot` is **client-synthesized**: it fans out to the 6 `assess <module> query` commands. There is no
server-side `assess snapshot`, so calling that over raw `POST /api/v1/mcp/exec` returns 403 by design — loop
the 6 queries yourself when you need HTTP-side batching. If a module fetch fails, the result carries
`_errors` / `_degraded` (treat it as unknown, not as "empty module").

### Doctor (read-only quality audit)

```bash
# One call per app: content/scoring coverage, expert sanity, styling,
# unexpected certificate pages, share access semantics, link reachability
formlm-cli doctor --app <appId>

# Whole batch in one process (aggregate envelope; exit 1 if any app fails)
formlm-cli doctor --apps <id1,id2,...> --expect-lang en

# Add the language-consistency scan (classic batch defect: English app shipped with Chinese boilerplate)
formlm-cli doctor --app <appId> --expect-lang en            # titles/labels
formlm-cli doctor --app <appId> --expect-lang zh-hant --deep  # also scan report widget body text
formlm-cli doctor --app <appId> --no-probe                  # skip the fill-in URL reachability probe
```

Output is the standard envelope; `ok:false` + exit 1 when a `fail`-level finding exists, so batch drivers
can gate on it. Each finding carries a ready-to-run `fix` command. Read-only — it never writes.

### Skill Documents

```bash
# Get SKILL.md domain knowledge (P0/P1/P2 constraints, command templates)
formlm-cli skill form       # Form field rules
formlm-cli skill scale      # Scale dimension rules
formlm-cli skill connect    # Page styling rules
formlm-cli skill report     # Report layout rules
formlm-cli skill expert     # Expert interpretation rules
formlm-cli skill share      # Share/publish rules
```

### Auth

```bash
formlm-cli auth login --token <tok>   # Login with Access Token (recommended: formlm.me → Account Settings)
formlm-cli auth login                 # Interactive login — 1) Access Token, 2) email verification code (no password needed), 3) email + password
formlm-cli auth status                # Check current login state (tokens expire after 7 days)
formlm-cli auth logout                # Clear local token
```

### Usage (quota & credits)

```bash
formlm-cli usage                      # plan / app slots (in-use + recycle bin) / AI credits
FORMLM_JSON=1 formlm-cli usage        # {account,plan,appsUsed,appLimit,appsRemaining,unlimited,credits,...}
```

Check the remaining budget BEFORE batch work: the free plan caps at 10 apps (403 `app-limit` once full —
recycle-bin apps still hold a slot, purge to free) and a completed smart generation bills ≈ 20 credits
(credits are capped at zero and never block generation). On an older server the usage/credit lines degrade
to `n/a` — the command never guesses numbers it cannot read.

### Profile (multi-account)

```bash
formlm-cli profile add --name work --url https://formlm.me --token <tok>
formlm-cli profile list
formlm-cli profile use work           # Switch default profile
formlm-cli --profile work app list    # Use a profile for one command
```

### App

```bash
formlm-cli app list                                               # first page (latest 20)
formlm-cli app list --all                                          # full inventory (server page size capped at 500)
formlm-cli app list --limit 100 --page 2                           # explicit paging
formlm-cli app list --all --with-urls                              # + published/shareType/sharePerm/shareDay/shareUrl/shareToken per app
formlm-cli app list --name "wellness"                              # filter by app name
formlm-cli app create --name "My Form" --description "..."
formlm-cli app get --app <appId>
formlm-cli app update --app <appId> --name "New Name" --theme blue
formlm-cli app delete --app <appId>                                # Delete an app (irreversible)
formlm-cli app remove --app <appId>                                # alias of app delete
formlm-cli app urls --app <appId>                                  # Get fill-in / editor / data URLs + shareToken
```

### Field

```bash
formlm-cli field schema                                         # All supported field types
formlm-cli field config --type radio                            # Configurable props for a type
formlm-cli field list --app <appId>
formlm-cli field find --app <appId> --id q1                     # Get a single field
formlm-cli field add --app <appId> --id q1 --name "Name" --type input --required
formlm-cli field update --app <appId> --id q1 --title "Your Full Name"
formlm-cli field remove --app <appId> --id q1
formlm-cli field set-property --app <appId> --id q1 --property options.0.score --value 5
```

### Scale (Dimensions & Scoring)

```bash
formlm-cli scale query --app <appId>                          # List all dimensions
formlm-cli scale find --app <appId> --id <scaleId>            # Find a dimension
formlm-cli scale add --app <appId> --id stress --name "Stress" --format sum --kbText "..."
formlm-cli scale update --app <appId> --id stress --name "Stress Level"
formlm-cli scale set --app <appId> --id stress --property direction --value negative
formlm-cli scale remove --app <appId> --id stress
formlm-cli scale clear --app <appId>
formlm-cli scale config --app <appId> --enable-single true

# Associate fields with a dimension
formlm-cli scale keys add --app <appId> --scale stress --fields q1,q2,q3 [--polarities "q3:negative"]
formlm-cli scale keys remove --app <appId> --scale stress --fields q1
formlm-cli scale keys list --app <appId> --scale stress
formlm-cli scale keys set --app <appId> --scale stress --fields q3 --negScore true

# Configure score ranges
formlm-cli scale data add --app <appId> --scale stress --bands "Low:desc||Moderate:desc||High:desc"   # recommended: server auto-computes even boundaries + 999 sentinel (ordered lowest→highest score)
formlm-cli scale data add --app <appId> --scale stress --ranges "0-10:Low,11-20:High"                   # manual boundaries; only for non-even knowledge-specified thresholds
formlm-cli scale data update --app <appId> --scale stress --id <dataId> --value "Moderate"
formlm-cli scale data remove --app <appId> --scale stress --id <dataId>
formlm-cli scale data list --app <appId> --scale stress
formlm-cli scale data clear --app <appId> --scale stress
```

### Connect (Page Styling & Visual Design)

```bash
formlm-cli connect query --app <appId> [--type cover|main|final] [--filter <keyword>] --md
formlm-cli connect find --app <appId> --filter <keyword>
formlm-cli connect types [--category cover|main|final] --verbose
formlm-cli connect config --category cover --format rich-text

# Cover page management
formlm-cli connect cover-page add --app <appId> --id cover_main --name "Welcome" --format rich-text --value "<h1>Hello</h1>"
formlm-cli connect cover-page update --app <appId> --id cover_main --name "New Title"
formlm-cli connect cover-page find --app <appId> [--id cover_main]
formlm-cli connect cover-page remove --app <appId> [--id cover_main]

# Final page management
formlm-cli connect final-page add --app <appId> --id final_report --name "Thank You" --enable-report true
formlm-cli connect final-page update --app <appId> --id final_report --name "Done"
formlm-cli connect final-page find --app <appId> [--id final_report]
formlm-cli connect final-page remove --app <appId> [--id final_report]

# Main page management
formlm-cli connect main-page set --app <appId> --format card
formlm-cli connect main-page set --app <appId> --field X1 --description "<p>Context</p>"

# Visual style
formlm-cli connect style set --app <appId> --type cover --bg "#f3f3fe" --fg "#ffffff" --font "#01105c"
formlm-cli connect style query --app <appId> --type cover
formlm-cli connect style apply --app <appId> --look "deep blue tech, frosted glass cards" [--theme Minimal] [--layout flat]
formlm-cli connect style apply-all --app <appId> --look "light warm Japanese style" [--theme Minimal] [--layout flat]
formlm-cli connect style move --app <appId> --id <pageId> --direction up
```

### Report (Pages & Widgets)

```bash
formlm-cli report query --app <appId>                           # List all report pages
formlm-cli report find --app <appId> --filter <keyword>         # Find report widget

# Note: update goes through the explicit owners — `report page update` (page name/bg/style/svg)
# and `report widget update` (widget props). The server also accepts the merged
# `assess report update --page <pageId> [--id <widgetId>]` form on the raw exec channel.

# Page management (a page is a 48-col × 68-row grid canvas; layout comes from widget x/y/w/h, not a page flag)
formlm-cli report page add --app <appId> --name "Summary" [--type A4]
formlm-cli report page update --app <appId> --id <pageId> --name "Overview"      # fails if the id does not exist
formlm-cli report page update --app <appId> --id <pageId> --name "Overview" --upsert   # opt into the server upsert (creates a blank page)
formlm-cli report page remove --app <appId> --id <pageId>
formlm-cli report page remove --app <appId> --name "结业证书"                       # locate by human-readable name

# Widget management (every widget command needs --page; set/find/update/remove also need --id)
formlm-cli report widget list --app <appId> --page <pageId>
formlm-cli report widget find --app <appId> --page <pageId> --id <widgetId>          # full detail incl. HTML value
formlm-cli report widget set --app <appId> --page <pageId> --id <widgetId> --property value --value "{{TotalScore}}"
formlm-cli report widget add --app <appId> --page <pageId> --type scale-chart --format bar --scaleId <dim> --x 0 --y 0 --w 24 --h 12
formlm-cli report widget update --app <appId> --page <pageId> --id <widgetId> --name "Updated Chart"
formlm-cli report widget remove --app <appId> --page <pageId> --id <widgetId>
formlm-cli report widget types --verbose                                             # all widget types (+ descriptions)
formlm-cli report widget config --type scale-chart                                   # configurable properties of one type

# Conditional display rules (logic lives UNDER widget)
formlm-cli report widget logic add --app <appId> --page <pageId> --id <widgetId> --min 0 --max 20 --content "<p>Low band text</p>"
formlm-cli report widget logic list --app <appId> --page <pageId> --id <widgetId>
formlm-cli report widget logic remove --app <appId> --page <pageId> --id <widgetId> --logicId <logicId>
```

### Expert (AI Interpretation)

```bash
formlm-cli expert query --app <appId>                    # Query expert config (--md for a compact table)
formlm-cli expert find --app <appId>                     # Full config incl. prompt/welcome text
formlm-cli expert config --app <appId> --name "Dr. AI" --role "Career coach" \
  --kbText "..." [--welcome ...] [--question1 ...] [--theme Warm] [--enable true]   # create/update (name + kbText required)
formlm-cli expert set --app <appId> --property enable --value true    # single-property toggle;
                                                                        # properties: name/role/description/style/welcome/
                                                                        # prompt/question1..3/kbText/enable/enableWelcome/theme
formlm-cli expert avatar --app <appId> --url <url> --enable true      # needs an existing expert (config first)
formlm-cli expert remove --app <appId>
formlm-cli expert chat --app <appId> --input "Explain my score"
```

> Boolean flags are forwarded space-separated (`--enable true`), never `--enable=true` — the server parses them
> with picocli `arity 0..1`. `expert config` enables the agent by default; pass `--enable false` to configure it
> while leaving it switched off.

### Share (Publish & Access)

```bash
# Access types (know these — "public" is ambiguous):
#   visitor = anonymous, no login required  → "anyone can fill" (the usual public form)
#   all     = every LOGGED-IN FormLM user   → anonymous visitors hit the login page
#   secret  = password-protected   |   owner = creator only   |   no = unpublish
formlm-cli share publish --app <appId>                      # anonymous (visitor) + one submission + permanent
formlm-cli share publish --app <appId> --access all --perm 2 --days 14    # explicit control
formlm-cli share publish --app <appId> --no-style            # skip the automatic style fallback
formlm-cli share set --app <appId> --type visitor --perm 1 --day 0        # raw server parameters (idempotent)
formlm-cli share unpublish --app <appId>
formlm-cli share query --app <appId>                        # authoritative type/perm/day triple
formlm-cli share verify --app <appId>                       # published + anonymous + permanent + reachability in one call
formlm-cli share url --app <appId>                          # URLs incl. shareToken
formlm-cli share api --app <appId>                          # Configure the Data API (form backend endpoint)
formlm-cli share api --app <appId> --submit true --query true --auto-create true
```

> **Validity rule (server-side):** only `--days 1..30` are honoured as a finite window; `0`, `forever`, or anything
> above 30 normalizes to permanent (sentinel `3650000`). There is no 90-day/1-year publish window on this channel.
>
> **Verifying "anyone can access":** `curl` returning 200 on the share URL proves nothing — the SPA shell answers 200
> even behind the login gate. Use `share verify` (or read `share query`'s type/perm/day triple).
>
> **`smart execute --module share` vs `share publish`:** the pipeline's share module applies the plan's publish
> settings; `share publish` is the explicit, idempotent CLI entry that also guarantees anonymous + permanent
> defaults and prints the final URLs/`shareToken`. Re-running `share publish` is safe. If you never styled the
> app, publish auto-applies a default style first (30-120s AI generation) — pass `--no-style` to skip that.

The Data API turns a form into an HTTP data endpoint: `POST` JSON to the endpoint (or use the `/form` path for native HTML forms), read records back via the query endpoint, and hand the `?help` URL to an AI agent so it can discover the API on its own.

---

## MCP Integration

FormLM CLI works as a standard MCP Server over stdio and plugs into **any MCP-compatible AI platform** — Claude Desktop, Cursor, Codex CLI, Windsurf, Cline, etc.

> **⚠️ macOS/Linux users:** desktop AI clients often launch the MCP server without your full terminal PATH, which can cause `command not found` errors. See **[INSTALL.md → Step 4](INSTALL.md#step-4--connect-to-an-ai-agent-mcp-mode)** for the `env.PATH` fix, per-platform config file locations (including Codex CLI's TOML format), and the full setup guide.

> **No token? No problem.** If you omit `FORMLM_TOKEN`, the AI will prompt you to authenticate via the `auth_login` tool — paste your Access Token (from formlm.me → Workspace → Account Settings; recommended), complete an in-chat email verification-code login via `auth_email_code` (no browser needed), or use email + password directly in the chat.

---

## Available MCP Tools (10)

| Tier | Tool | Description |
|---|---|---|
| 0 | `auth_login` | Login with Access Token (recommended), email verification code, or email + password |
| 0 | `auth_email_code` | Email verification-code login — fetch the captcha image & send the code (fully in-chat) |
| 0 | `auth_status` | Check current login status |
| 0 | `formlm_usage` | Account budget at a glance: plan, app-slot usage, AI credits — check before batch creating |
| 1 | `formlm_generate` | Generate the execution plan (Phase 1: creates the app, returns appId + tasks) |
| 1 | `formlm_execute` | Execute plan modules one by one after `formlm_generate` |
| 2 | `formlm_doctor` | Read-only quality audit of one app (scoring coverage, dead experts, styling, certificate pages, language consistency, share access, reachability) |
| 2 | `formlm_snapshot` | Aggregated state of all modules; `summary: true` returns the compact audit profile |
| 2 | `formlm_skill` | Fetch SKILL.md domain knowledge for a skill module |
| 3 | `formlm_exec` | Execute any whitelisted CLI command directly |

## Available MCP Resources (6)

| Resource URI | Description |
|---|---|
| `formlm://skills/form` | Form field SKILL.md — P0 constraints, field types, scoring rules |
| `formlm://skills/scale` | Scale dimension SKILL.md — range rules, polarity, direction |
| `formlm://skills/connect` | Connect page SKILL.md — theme modes, layout formats |
| `formlm://skills/report` | Report layout SKILL.md — widget types, variables, logic |
| `formlm://skills/expert` | Expert interpretation SKILL.md — AI config, chat rules |
| `formlm://skills/share` | Share/publish SKILL.md — access types, idempotency |

---

## Environment Variables

| Variable | Description |
|---|---|
| `FORMLM_BASE_URL` | FormLM server URL (default: `https://formlm.me`) |
| `FORMLM_TOKEN` | Your auth token (alternative to `auth login`; keeps secrets out of shell history) |
| `FORMLM_JSON=1` | Machine output: every command prints ONE parseable line `{ok,code,message,data}` on stdout (equivalent to the global `--json` flag) |
| `FORMLM_NO_EXIT=1` | Batch safety: never `process.exit()` on failure — a bad command cannot kill your driver loop (errors surface as `ok:false` envelopes / thrown errors) |
| `FORMLM_TIMEOUT_MS` | Default per-command request timeout (ms, default 60000) |
| `FORMLM_TIMEOUT_PLAN` / `FORMLM_TIMEOUT_EXECUTE` / `FORMLM_TIMEOUT_STYLE` | Override the smart-plan (120s), smart-execute (300s) and style (600s) timeouts |
| `FORMLM_RETRIES` | Max attempts for transient failures (default 3). Read-only commands retry on 408/429/5xx; writes are never auto-retried |
| `FORMLM_CONCURRENCY` | In-process parallelism for batch commands (`snapshot --apps`, `doctor --apps`), default 4 |

---

## Scripting & Batch Use

```bash
# One parseable line per command; guidance/hints go to stderr, stdout stays clean:
FORMLM_JSON=1 FORMLM_NO_EXIT=1 formlm-cli snapshot --app <appId> --summary
FORMLM_JSON=1 formlm-cli share verify --app <appId>        # {ok, data:{type,forever,anonymous,httpStatus,shareToken}}
FORMLM_JSON=1 formlm-cli doctor  --app <appId> --expect-lang en   # ok:false when a fail-level finding exists

# Whole batch in one process (no per-app Node cold start; tunable with FORMLM_CONCURRENCY):
FORMLM_JSON=1 formlm-cli doctor   --apps id1,id2,id3 --expect-lang en
FORMLM_JSON=1 formlm-cli snapshot --apps id1,id2,id3 --summary
```

Envelope: `{ "ok": bool, "code": int, "message": string, "data": object|null }` — `data` is always parsed
(no double-decoding needed), and validation/parameter errors now come back with a non-zero `code`
instead of hiding the error text inside `data` while reporting success.

### Status codes

| Code | Meaning | What to do |
|---|---|---|
| `0` | Success | — |
| `207` | Partial (multi-module reads where one module failed) | Result carries `_errors`/`_degraded`; re-check that module, don't assume it is empty |
| `400` | Bad request / parameter or validation error | Read `message`; the server echoes picocli's hint (valid values, missing option) |
| `401` | Not authenticated — token missing, or **expired (tokens last 7 days)** | `formlm-cli auth login` (method 1 or 2) / `--token-stdin` / set `FORMLM_TOKEN` |
| `403` | Command not on the exec whitelist · wrong credentials/verification code · **free-plan app cap reached (message starts `app-limit:`)** | See the whitelist below and Quotas & Limits; `app-limit` → delete unused apps (purge the recycle bin too) or upgrade |
| `408` | Request timed out client-side | Retry read-only; for `smart execute` re-run that module (writes are not auto-retried) |
| `429` | Rate limited — login attempts, send-code quotas, **AI commands (`message` starts `rate-limit:`)** | Wait, then retry with backoff; batch flows should stay under the AI limit below |
| `500` | Transport failure or server error | Retried automatically for read-only commands |

### Quotas & limits (server-enforced)

| Limit | Value | Behavior when reached |
|---|---|---|
| Apps per free-plan account | **10** (recycle-bin apps still hold a slot — purge to free) | `app create` / `smart plan` return `403` with `app-limit:` in the message; upgrade at formlm.me → Workspace → `#/vip` |
| AI commands per account | **60 segments/minute** (`smart plan` / `smart execute` / `expert chat`; one full `smart generate` ≈ 7 segments) | `429` with `rate-limit:`; slow down or use `FORMLM_CONCURRENCY` ≤ 4 |
| AI credits per generated app | a completed smart generation settles as **one billing event (≈ 20 credits)** when all its modules have run; new accounts start with ≈ 100 free credits | Deduction is capped at zero and **never blocks** generation (same behaviour as the web app) |
| Expert chat usage | per-app daily compute budget + per-account daily round cap | rejected with `round-limit:` in the message; try again the next day |

### Raw `POST /api/v1/mcp/exec` whitelist

The exec channel accepts 3-token command paths only (`assess <module> <action>`). Everything else returns
`403 not allowed via MCP` **by design** — notably `assess snapshot` and `assess field …` do not exist on the
server (they are client-side wrappers), so batch HTTP consumers must call the underlying queries:

```
assess app      list | create | use | current | update | remove | urls
assess form     query | find | types | config | add | update | remove | move | set-property
assess scale    query | find | add | update | set | remove | clear | config | keys | data
assess connect  query | find | types | config | cover-page | final-page | main-page | style
assess report   query | find | update | page | widget        (conditional logic is `report widget logic …`)
assess expert   query | find | config | set | avatar | remove | chat
assess share    set | query | url | api | flavor
assess smart    plan | execute
assess skill    form | scale | connect | report | expert | share
```

### Throughput notes

- Every CLI invocation is a fresh Node process plus its own HTTP calls; for large batches, run independent
  apps concurrently (the server tolerates moderate parallelism) rather than serially.
- `snapshot`/`doctor` fan out their module queries in parallel; use `--module` / `--summary` to keep payloads small.
- Slow server? Raise `FORMLM_TIMEOUT_MS` and `FORMLM_RETRIES` instead of hand-rolling retry loops.
- Batch over many apps **inside one process**: `snapshot --apps …` / `doctor --apps …`, or import the built
  module directly (`import { execCommand } from '@formlm/cli/dist/exec.js'`) and loop — HTTP connections are
  reused and there is no per-app Node cold start.

### Version coupling (CLI ↔ server)

Some commands rely on server options added together with them; against an older server they fail with a
visible `400 Unknown option …` (never a silent success, thanks to the false-success guard):

| Needs server support | Command / flag |
|---|---|
| ✔ | `app list --all / --limit / --page / --with-urls` |
| ✔ | `app urls` native `shareToken` + `published/shareType/…` (the CLI fills `shareToken` from `shareUrl` as a fallback) |
| ✔ | `report page remove --name "…"` (name→id resolution moved server-side, so raw exec benefits too) |
| ✔ | `expert config --enable true\|false` (fall back to `expert set --property enable` on an old server) |
| ✔ | `smart plan --dimensions / --app-name`, `smart execute --plan-file` (`--plan-b64` transport) |
| ✔ | `usage` / MCP `formlm_usage` fields (`tenantType/credit/appUsage/appLimit` on `GET /api/v1/mcp/auth/me`) — degrades to `n/a` on an older server |

---

## Links

- **Website**: [https://formlm.me](https://formlm.me)
- **Platform**: Sign up and start building at [formlm.me](https://formlm.me)
- **GitHub**: [https://github.com/formlm/cli](https://github.com/formlm/cli)
- **npm**: [https://www.npmjs.com/package/@formlm/cli](https://www.npmjs.com/package/@formlm/cli)
- **Smithery**: [https://smithery.ai/servers/formlm/cli](https://smithery.ai/servers/formlm/cli)

---

## Contact

Have questions, feedback, or need help getting started?

📧 **[hello@formlm.me](mailto:hello@formlm.me)**

Feel free to reach out — we're happy to help.

---

## License

MIT © [FormLM](https://formlm.me)
