# FormLM CLI Installation Guide

The following steps are designed for AI Agents. Some steps require the user to complete actions in a browser.

---

## Prerequisites

Before installing, make sure your environment has:

- **Node.js ≥ 18** (includes npm / npx)

<details>
<summary>How to install Node.js</summary>

```bash
# macOS (Homebrew)
brew install node

# Ubuntu / Debian
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Windows (winget)
winget install OpenJS.NodeJS.LTS
```

Or download from [nodejs.org](https://nodejs.org).
</details>

---

## Step 1 — Install the CLI

```bash
npm install -g @formlm/cli
```

Verify the installation:

```bash
formlm-cli --version
```

> **Don't have npm yet?** You can also run directly without installing:
> ```bash
> npx @formlm/cli --help
> ```

---

## Step 2 — Configure Credentials

FormLM CLI supports three authentication methods. Choose one:

### Method A: Login with Access Token (Recommended — works for ALL accounts)

1. Sign in at [formlm.me](https://formlm.me) — email verification code or Google, no password needed
2. In the workspace, click the avatar / user menu (top right) → **Account Settings**
3. Find **Access Token** and click **Copy**

Then run:

```bash
formlm-cli auth login --token <your-token>
```

> Tokens expire after 7 days. If commands later return `401`, copy a fresh Access Token the same way and login again.

### Method B: Login with Email Verification Code (no browser round-trip)

```bash
formlm-cli auth login
```

Choose option **2** (Email verification code). The whole flow stays in your terminal:

1. A captcha image is saved to `~/.formlm/captcha.gif` and opened automatically — type the 4 digits you see (valid 60s)
2. A 6-digit code is emailed to you (valid 5 minutes) — type it to log in

Works for ALL accounts, including accounts with no password. Rate limits apply (1 code per email per 60s, 10 sends per IP per minute, 5 failed code attempts lock the account for 30 minutes).

### Method C: Login with Email & Password (only if you have set a password)

```bash
formlm-cli auth login
```

Choose option **3**, then the CLI will prompt for email and password interactively.

> **Note:** accounts registered via email verification code or Google sign-in have **no password** — use Method A or B instead. Don't retry a failing password login; switch to the token or the verification code.

### Environment Variables (Alternative)

You can also set credentials via environment variables — no login command needed:

```bash
export FORMLM_BASE_URL=https://formlm.me
export FORMLM_TOKEN=<your-token>
```

Scripting / batch switches (all optional, defaults keep the interactive behaviour):

```bash
export FORMLM_JSON=1        # every command prints ONE parseable line {ok,code,message,data}
                            # (equivalent to passing --json anywhere in the argv)
export FORMLM_NO_EXIT=1     # never process.exit() on failure — a bad command cannot kill your loop
export FORMLM_TIMEOUT_MS=90000      # default request timeout (60000)
export FORMLM_TIMEOUT_PLAN=120000   # smart plan / EXECUTE / STYLE can be raised likewise
export FORMLM_RETRIES=3     # attempts for transient failures (read-only commands retry on 408/429/5xx)
export FORMLM_CONCURRENCY=4 # parallel apps inside snapshot --apps / doctor --apps
```

> Note: `data` in the envelope is already parsed into an object — you do not need to `json.loads` it twice.

---

## Step 3 — Verify

```bash
formlm-cli auth status
```

Expected output:

```
Profile: default
Server:  https://formlm.me
Status:  ✅ Logged in
User:    {...}
```

---

## Step 4 — Connect to an AI Agent (MCP Mode)

FormLM CLI works as a standard MCP Server over stdio — it plugs into **any MCP-compatible AI platform**: Claude Desktop, Cursor, Codex CLI, Windsurf, Cline, or any future MCP client. Claude is used below purely as an example; the setup pattern is identical everywhere except for the config file location/format.

### ⚠️ macOS / Linux users: PATH issue (read this first)

Most desktop AI clients launch the MCP server process using a **restricted shell environment** that does NOT include your normal terminal PATH (e.g. Homebrew `/opt/homebrew/bin` or `nvm` paths). This means `"command": "formlm-cli"` alone often fails with `command not found`, even though it works fine in your terminal.

**Fix: add an explicit `env.PATH`** to the MCP config (works for any JSON-based client):

```json
{
  "mcpServers": {
    "formlm": {
      "command": "formlm-cli",
      "args": ["mcp"],
      "env": {
        "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
```

This covers both Homebrew Node (`/opt/homebrew/bin`) and system/nvm-linked Node (`/usr/local/bin`). If it still fails, run `which formlm-cli` in your terminal and use the full absolute path as `command` instead.

### Config file locations by AI platform

| AI Platform | Config File | Format |
|---|---|---|
| Claude Desktop | macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`<br>Windows: `%APPDATA%\Claude\claude_desktop_config.json` | JSON `mcpServers` |
| Cursor | `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global) | JSON `mcpServers` |
| Codex CLI | `~/.codex/config.toml` | TOML `[mcp_servers.x]` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | JSON `mcpServers` |
| Cline (VS Code) | VS Code MCP settings panel, or `cline_mcp_settings.json` | JSON `mcpServers` |

For JSON-based clients (Claude Desktop / Cursor / Windsurf / Cline), use the same block shown above.

For **Codex CLI** (TOML format), use:

```toml
[mcp_servers.formlm]
command = "formlm-cli"
args = ["mcp"]

[mcp_servers.formlm.env]
PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
```

> **Token is optional in MCP config.** If you don't set `FORMLM_TOKEN`, the AI will prompt you to login via the `auth_login` tool — paste your **Access Token** (easiest; get it from formlm.me → Workspace → Account Settings → Access Token → Copy), or complete an in-chat **email verification-code login** via the `auth_email_code` tool (no browser needed, works for all accounts), or email + password if your account has one.
>
> **For beginners:** After installing, just tell your AI agent: "I want to create an assessment form." It will guide you through login (Access Token, or email verification code — both work for every account) and then build the app for you. The smart generate pipeline includes visual styling, so the form will look professional out of the box.
>
> **After editing the config file, fully quit and restart your AI client** (not just close the window) — MCP servers are only loaded at startup.

### Let your AI Agent install it automatically

Paste the following into any AI chat:

```
Help me install FormLM CLI:
1. Run: npm install -g @formlm/cli
2. Log in — pick whichever is easiest:
   a. Run: formlm-cli auth login --token <your-token>
      (Get the Access Token from formlm.me: sign in → Workspace → top-right user menu →
       Account Settings → Access Token → Copy.)
   b. Or run: formlm-cli auth login  and choose option 2 (email verification code) —
      no password and no browser needed, the whole flow stays in the terminal.
   (Only use option 3, email + password, if your account actually has a password —
    email-verification-code and Google accounts have none.)
3. Add the MCP server config to your client's MCP config file
Repo: https://github.com/formlm/cli
```

---

## Step 5 — Using the Smart Pipeline

The smart pipeline is the recommended way for AI agents to build apps. It wraps the server-side AssessAgent — the same intelligence engine that powers the web UI.

Creation is two-phase: **plan** (creates the app + returns the task list) → **execute** (one module per call). `smart generate` is the one-shot wrapper of exactly those steps.

### Generate a New App (one-shot)

```bash
formlm-cli smart generate --input "Create a workplace stress assessment with 10 questions, 3 dimensions, and detailed score interpretations" \
  --plan-type assessment --lang en --publish --doctor
```

Optional parameters:
- `--plan-type`: `assessment` / `consultation` / `survey` / `exam` / `report` / `learn` (note: `report`, not `quiz`)
- `--style`: visual tone; `--theme` on `connect style` is the design mode instead
- `--question-count`: `5-9` / `10-15` / `15-20` / `20-30` / `30-50` / `50-100`
- `--dimensions "Workload|Autonomy|Support"`: pin dimension names + count so generated content matches an existing page/ledger
- `--app-name "..."`: pin the app display name; `--lang`: anchor the AI output language
- `--publish` / `--access visitor|all|secret` / `--days N`: publish at the end (default anonymous + permanent)
- `--doctor`: run the read-only quality audit and fold its findings into the result
- `--only form,scale` / `--skip connect`, `--save-plan plan.json`

### Or step by step (resumable — recommended for batches)

```bash
formlm-cli smart plan --input "..." --plan-type assessment --lang en --save-plan plan.json
formlm-cli smart execute --app <appId> --module form
formlm-cli smart execute --app <appId> --module scale      # ...connect / report / share
formlm-cli share publish --app <appId>                     # anonymous + permanent by default
formlm-cli doctor --app <appId> --expect-lang en           # verify
```

> The plan is cached server-side for ~10 minutes. After that, `smart execute --app <id> --module <m> --plan-file plan.json` still works — never re-run `smart plan` to "resume", it creates a brand-new app.

### How It Works

1. **Plan**: The server-side AssessAgent generates a task plan from your natural language input
2. **Execute**: Each task streams CLI commands via AI, executes them, and collects results

The smart pipeline automatically:
- Loads SKILL.md domain knowledge for each task
- Enforces P0/P1/P2 constraints
- Handles field key extraction, variable substitution
- Retries failed commands with AI correction

---

## Step 6 — Direct Commands (Fine-Grained Control)

For cases where you need precise control, use direct commands:

### Get a State Snapshot

```bash
formlm-cli snapshot --app <appId>
formlm-cli snapshot --app <appId> --summary      # compact profile: counts / dim names / report pages / expert / share + shareToken
formlm-cli snapshot --apps <id1,id2,...> --summary   # whole batch in ONE process (no per-app cold start)
```

Returns the aggregated state of all modules (form, scale, connect, report, expert, share). Use `--summary` for verification — it means you never have to parse the module tables yourself, and unreadable modules are flagged `_degraded` instead of looking "empty".

### Read Skill Documents

Before constructing commands manually, read the relevant SKILL.md:

```bash
formlm-cli skill form       # Form field rules (P0: --id snake_case, --key X prefix)
formlm-cli skill scale      # Scale dimension rules (P0: range continuity, max=999)
formlm-cli skill connect    # Page styling rules (P0: 6 theme modes, look must include scene+style)
formlm-cli skill report     # Report layout rules (P0: {{double brace}} variables, actual scores in logic)
formlm-cli skill expert     # Expert interpretation rules (P0: full config, set for micro-adjustments)
formlm-cli skill share      # Share/publish rules (P0: idempotent operations)
```

### Scale Commands

```bash
# Add a dimension
formlm-cli scale add --app <appId> --id stress --name "Stress Level" --format sum --kbText "Stress assessment based on..."

# Associate fields (supports batch + auto reverse-scored detection)
formlm-cli scale keys add --app <appId> --scale stress --fields q1,q2,q3 --polarities "q3:negative"

# Configure score ranges
formlm-cli scale data add --app <appId> --scale stress --ranges "0-10:Low stress,11-20:Moderate,21-30:High stress"
```

### Report Commands

```bash
# Add a page
formlm-cli report page add --app <appId> --name "Dimension Summary"   # a page is a 48×68 grid canvas; layout comes from widget coordinates

# Add a chart widget
formlm-cli report widget add --app <appId> --page <pageId> --type scale-chart --format bar --scaleId <dim> --name "Score Distribution" --x 0 --y 0 --w 24 --h 12

# Set widget value with system variables (--page + --property are required)
formlm-cli report widget set --app <appId> --page <pageId> --id <widgetId> --property value --value "{{TotalScore}} / {{ScaleTotal}}"

# Conditional display rules (logic lives under widget)
formlm-cli report widget logic add --app <appId> --page <pageId> --id <widgetId> --min 0 --max 20 --content "<p>Low band</p>"
formlm-cli report widget logic list --app <appId> --page <pageId> --id <widgetId>
```

### Beautify Your Form (Mandatory for Direct Commands)

When using Direct Commands (instead of `smart generate`), the form will use the **default unstyled appearance**.
To apply a professional AI-generated visual style, run this after creating your form:

```bash
# Apply AI-generated style to ALL pages (takes 30-120s, do NOT cancel)
formlm-cli connect style apply-all --app <appId> --look "职场压力评估，深蓝专业风格" --theme minimalist
```

Available design modes (`--theme`): `scenic`, `skeuomorphic`, `liquid`, `glassmorphism`, `immersive`, `minimalist`

The `--look` parameter should describe both the **scenario** and **visual style** (e.g. "心理健康评估，温暖治愈风格" / "deep blue tech, frosted glass cards").

### Expert Commands

```bash
# Full configuration (--name and --kbText are required by the server)
formlm-cli expert config --app <appId> --name "Stress Coach" --role "资深职场心理咨询师" \
  --kbText "..." --theme Warm --enable true

# Single property update (the option is --property; properties: name/role/description/style/welcome/
# prompt/question1..3/kbText/enable/enableWelcome/theme)
formlm-cli expert set --app <appId> --property enable --value true

# Chat with the expert
formlm-cli expert chat --app <appId> --input "Explain my stress score"
```

> Only `consultation` plans generate an expert automatically. For other plan types, add one explicitly with `expert config` — otherwise a page advertising an AI assistant links to nothing (`doctor` flags this as a failure).

### Publish & Verify

```bash
formlm-cli share publish --app <appId>                # anonymous (visitor) + one submission + permanent
formlm-cli share publish --app <appId> --access all   # every LOGGED-IN user only — visitors hit the login page
formlm-cli share set --app <appId> --type visitor --perm 1 --day 0    # raw server parameters
formlm-cli share verify --app <appId>                 # published + anonymous + permanent + reachable
```

> `--days` is only honoured from 1 to 30; `0`/`forever`/anything larger becomes permanent (that is stated on stderr, never silent). And an HTTP 200 on the share URL proves nothing — the SPA shell answers 200 even behind the login gate, so verify with `share verify`.

### Quality Audit (read-only)

```bash
formlm-cli doctor --app <appId>                        # scoring coverage / dead experts / styling / share access
formlm-cli doctor --app <appId> --expect-lang en --deep # + script-consistency scan (widget body text)
formlm-cli doctor --apps <id1,id2,...> --expect-lang en # batch in one process; exit 1 if any app fails
```

---

## Multi-Account Setup

If you manage multiple FormLM environments, use profiles:

```bash
# Add a profile
formlm-cli profile add --name staging --url https://staging.formlm.me --token <tok>

# List all profiles
formlm-cli profile list

# Switch default profile
formlm-cli profile use staging

# Use a specific profile for a single command
formlm-cli --profile staging app list
```

---

## MCP Architecture

### 9 Tools (Layered)

| Tier | Tool | When to Use |
|---|---|---|
| 0 | `auth_login` | Start of session — authenticate (token / email code / password) |
| 0 | `auth_email_code` | Email verification-code login — fetch captcha image & send the code (fully in-chat) |
| 0 | `auth_status` | Check if still logged in |
| 1 | `formlm_generate` | Generate the execution plan (Phase 1; creates the app + task list) |
| 1 | `formlm_execute` | Execute plan modules one by one |
| 2 | `formlm_doctor` | Read-only quality audit (share access, dead experts, language consistency) |
| 2 | `formlm_snapshot` | Before making changes — understand current state (`summary: true` for a compact profile) |
| 2 | `formlm_skill` | Before constructing commands — read domain rules |
| 3 | `formlm_exec` | Direct command execution (scale/report/expert/etc.) |

### 6 Resources (Domain Knowledge)

AI agents can read these MCP resources to understand P0/P1/P2 constraints:

| URI | Content |
|---|---|
| `formlm://skills/form` | Field types, scoring, ID conventions |
| `formlm://skills/scale` | Dimension rules, range continuity, polarity |
| `formlm://skills/connect` | Theme modes, layout formats, style rules |
| `formlm://skills/report` | Widget types, system variables, logic rules |
| `formlm://skills/expert` | AI config, chat behavior, avatar setup |
| `formlm://skills/share` | Access types, publish/unpublish, idempotency |

### Recommended Workflow for AI Agents

1. `auth_login` → Get authenticated
2. `formlm_generate` → Generate the execution plan (returns appId + tasks; the app itself is still empty)
3. `formlm_execute` → Run each planned module; for non-`consultation` plans add the `expert` explicitly with `expert config`
4. `formlm_doctor` (or `formlm_snapshot` with `summary: true`) → Verify state/quality before pointing a page at the app
5. `formlm_exec` → Make changes with fine-grained control
6. If using Direct Commands instead of the pipeline, run `connect style apply-all` to beautify the form (see Step 7 above)

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `command not found: formlm-cli` | Ensure Node.js ≥ 18 is installed and npm global bin is in your `PATH` |
| `❌ [401] Not authenticated` | Run `formlm-cli auth login` (Access Token / email verification code / password — see Step 2) or set `FORMLM_TOKEN` environment variable |
| `❌ [403] Command '...' is not allowed via MCP` | That command is not on the exec whitelist (3-token granularity — see the list in [README.md](README.md#raw-post-apiv1mcpexec-whitelist)). Note `assess snapshot` / `assess field *` do not exist server-side (they are CLI-side wrappers): use the CLI command, or loop `assess <module> query` |
| `❌ [400] Unknown option ...` | The flag does not exist on the **deployed server**. Either drop it or update the server — against an older server some newer flags (`app list --all`, `report page remove --name`, `expert config --enable`, `smart plan --dimensions/--app-name`, `--plan-b64`) are unavailable |
| Command says `ok` but nothing changed | Re-read the app (`snapshot --summary` / `doctor` / `share verify`) instead of trusting the envelope alone; `type=all` means anonymous visitors get the login page |
| Token not working | Tokens expire after 7 days. Copy a fresh Access Token from [formlm.me](https://formlm.me) → Workspace → Account Settings → Access Token |
| Email code login: wrong captcha image (403 at the send step) | The captcha image expires after 60s — restart `formlm-cli auth login`, read the fresh image and retry |
| Email code login: wrong code (403) | Codes expire after 5 minutes. Double-check the 6 digits and retry, or restart `formlm-cli auth login` for a fresh code (same email is limited to 1 send per 60s) |
| Email code login: account locked (429) | 5 failed code attempts lock the account for 30 minutes — wait and retry |
| Email code login: rate limited (429) | Server limits: 1 send per email per 60s, 10 sends per IP per minute. Wait a minute, then request a fresh code |
| `smart generate` takes long | The smart pipeline runs AI plan + execute — expect 60-120s for assessment, 180-300s for consultation. Do NOT cancel — it needs time to generate form, scale, report, and visual styling |

---

## What's Next?

- **Command reference**: `formlm-cli --help`
- **Smart pipeline**: `formlm-cli smart --help`
- **Snapshot**: `formlm-cli snapshot --help`
- **Skill docs**: `formlm-cli skill --help`
- **Scale commands**: `formlm-cli scale --help`
- **Report commands**: `formlm-cli report --help`
- **Expert commands**: `formlm-cli expert --help`
- **Full documentation**: [github.com/formlm/cli](https://github.com/formlm/cli)
