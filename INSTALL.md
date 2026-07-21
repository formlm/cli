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

FormLM CLI supports two authentication methods. Choose one:

### Method A: Login with Email & Password (Recommended — Easiest)

```bash
formlm-cli auth login
```

The CLI will prompt for email and password interactively. This is the simplest method — no browser DevTools needed.

### Method B: Login with Token

If you already have a token from the FormLM website:

1. Sign in at [formlm.me](https://formlm.me)
2. Open browser DevTools (`F12` or `⌘+Shift+I`)
3. Go to **Application → Cookies**
4. Copy the value of the `Authorization` cookie

Then run:

```bash
formlm-cli auth login --token <your-token>
```

### Environment Variables (Alternative)

You can also set credentials via environment variables — no login command needed:

```bash
export FORMLM_BASE_URL=https://formlm.me
export FORMLM_TOKEN=<your-token>
```

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

> **Token is optional in MCP config.** If you don't set `FORMLM_TOKEN`, the AI will prompt you to login via the `auth_login` tool — just provide your **email and password** (easiest) or token in the chat.
>
> **For beginners:** After installing, just tell your AI agent: "I want to create an assessment form." It will guide you through login (email + password) and then build the app for you.
>
> **After editing the config file, fully quit and restart your AI client** (not just close the window) — MCP servers are only loaded at startup.

### Let your AI Agent install it automatically

Paste the following into any AI chat:

```
Help me install FormLM CLI:
1. Run: npm install -g @formlm/cli
2. Run: formlm-cli auth login   (interactive — enter email + password)
3. Add the MCP server config to your client's MCP config file
Repo: https://github.com/formlm/cli
```

---

## Step 5 — Using the Smart Pipeline (v0.2.0+)

The smart pipeline is the recommended way for AI agents to build and modify apps. It wraps the server-side AssessAgent/BuilderAgent — the same intelligence engine that powers the web UI.

### Preview a Plan (Optional — Review Before Executing)

```bash
formlm-cli smart plan --input "Create a workplace stress assessment with 10 questions, 3 dimensions"
```

Returns the task list for review — no execution. After reviewing, run `smart create` with the same input to execute.

### Generate a New App

```bash
formlm-cli smart create --input "Create a workplace stress assessment with 10 questions, 3 dimensions, and detailed score interpretations"
```

Optional parameters:
- `--plan-type`: assessment / consultation / survey / exam / quiz / learn
- `--style`: Visual style (Noir, Minimal, Warm, etc.)
- `--question-count`: Range like 10-15, 15-20, 20-30

### Modify an Existing App

```bash
formlm-cli smart modify --app <appId> --input "Add a new dimension for workplace social support"
```

### How It Works

1. **Plan**: The server-side AssessAgent generates a task plan from your natural language input
2. **Execute**: Each task streams CLI commands via AI, executes them, and collects results
3. **Reflect** (modify only): The BuilderAgent validates changes and provides a summary

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
```

Returns the aggregated state of all modules (form, scale, connect, report, expert, share) in one JSON.

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
formlm-cli report page add --app <appId> --name "Dimension Summary" --layout grid

# Add a chart widget
formlm-cli report widget add --app <appId> --page <pageId> --type chart --chartType bar --name "Score Distribution"

# Set widget value with system variables
formlm-cli report widget set --app <appId> --id <widgetId> --value "{{TotalScore}} / {{ScaleTotal}}"
```

### Expert Commands

```bash
# Full configuration
formlm-cli expert config --app <appId> --enableChat true --model gpt-4

# Single property update
formlm-cli expert set --app <appId> --key model --value gpt-4

# Chat with the expert
formlm-cli expert chat --app <appId> --message "Explain my stress score"
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

## MCP Architecture (v0.2.0)

### 9 Tools (Layered)

| Tier | Tool | When to Use |
|---|---|---|
| 0 | `auth_login` | Start of session — authenticate |
| 0 | `auth_status` | Check if still logged in |
| 1 | `formlm_plan` | Preview plan before executing (optional, for user review) |
| 1 | `formlm_create` | Build a complete new app from scratch |
| 1 | `formlm_modify` | Modify an existing app with natural language |
| 1 | `formlm_confirm` | Confirm and execute a medium/high risk plan returned by `formlm_modify` — no web UI needed |
| 2 | `formlm_snapshot` | Before making changes — understand current state |
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
2. `formlm_plan` → (Optional) Preview the plan before executing
3. `formlm_create` → Generate a complete app (recommended)
4. `formlm_snapshot` → Check the current state
5. `formlm_modify` → Make changes (recommended) or `formlm_exec` for fine-grained control
6. If `formlm_modify` returns a plan preview (medium/high risk), show the plan to the user and, once confirmed, call `formlm_confirm` with the exact same plan — entirely via chat, no web UI needed

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `command not found: formlm-cli` | Ensure Node.js ≥ 18 is installed and npm global bin is in your `PATH` |
| `❌ [401] Not authenticated` | Run `formlm-cli auth login` or set `FORMLM_TOKEN` environment variable |
| `❌ [403] Command '...' is not allowed via MCP` | That command is not in the MCP whitelist — only whitelisted commands are permitted |
| Token not working | Tokens may expire. Get a fresh token from [formlm.me](https://formlm.me) DevTools |
| `smart create` takes long | The smart pipeline runs AI plan + execute — expect 30-120 seconds for full generation |
| `smart modify` shows "Plan Preview" | Medium/high-risk changes require confirmation. Show the returned plan to the user, then call `formlm_confirm` (MCP) or `assess smart confirm --plan-json ...` (CLI) with the exact plan to execute — no web UI needed. |

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
