# formlm-cli

> The official CLI & MCP Server for [FormLM](https://formlm.me) — let AI Agents build and manage your forms directly.

[![npm version](https://img.shields.io/npm/v/@formlm/cli)](https://www.npmjs.com/package/@formlm/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

**Keywords**: FormLM CLI, MCP Server, AI Agent form builder, form automation, assessment platform CLI, Claude MCP, Cursor MCP, AI-powered forms, formlm-cli, npm CLI tool

---

## What is FormLM?

**[FormLM](https://formlm.me)** is an AI-powered form & assessment platform. It lets you build smart forms, scoring quizzes, and professional evaluation reports — all with natural language instructions.

With `formlm-cli`, you can control FormLM directly from your terminal or plug it into any AI Agent (Claude, Cursor, GPT, etc.) as an **MCP Server** — no UI needed.

> Visit the official website: **[https://formlm.me](https://formlm.me)**

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
│  Tier 0: auth_login, auth_status                         │
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
formlm-cli auth login
# or use a token directly
# You can copy your token from Account > Personal Info page on the web app.
formlm-cli auth login --token <your-token>
```

### 2. Smart Pipeline (AI-recommended)

```bash
# Generate a complete assessment app from natural language
# This includes form design, scale config, report pages, AND visual styling — all in one step.
# Expected time: 60-120s for assessment, 180-300s for consultation. Do NOT cancel.
formlm-cli smart generate --input "Create a workplace stress assessment with 10 questions, 3 dimensions, and detailed score interpretations"
```

> **⚠️ Smart generate already includes visual styling.** If you skip smart generate and use Direct Commands (below) instead, you MUST run `connect style apply-all` to beautify your form — otherwise it will use the default unstyled appearance.

### 3. Get All App URLs (after creating)

```bash
# Get fill-in, editor, data management, and Data API URLs in one call
formlm-cli app urls --app <appId>
# Returns: shareUrl (fill-in), builderUrl (editor), dataUrl (data management),
#          apiUrl (Data API endpoint, if enabled), apiHelpUrl (endpoint + ?help)
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

# Read a skill document before constructing commands
formlm-cli skill form
formlm-cli skill scale

# Scale commands
formlm-cli scale query --app <appId>
formlm-cli scale add --app <appId> --id stress --name "Stress Level" --format sum --kbText "..."
formlm-cli scale keys add --app <appId> --scale stress --fields q1,q2,q3
formlm-cli scale data add --app <appId> --scale stress --ranges "0-10:Low,11-20:Moderate,21-30:High"

# Report commands
formlm-cli report query --app <appId>
formlm-cli report page add --app <appId> --name "Summary" --layout grid
formlm-cli report widget add --app <appId> --page <pageId> --type chart --chartType bar --name "Score Chart"

# Expert commands
formlm-cli expert query --app <appId>
formlm-cli expert config --app <appId> --enableChat true
```

### 7. Use as MCP Server

```bash
formlm-cli mcp
```

This starts the MCP Server (stdio transport) with 6 tools + 6 resources, ready for AI Agents to connect.

---

## Command Reference

### Smart Pipeline (AI-recommended)

```bash
# Generate a complete app from natural language
formlm-cli smart generate --input "..." [--plan-type assessment] [--style "温暖亲切"] [--question-count 10-15]
```

### Snapshot

```bash
# Get all module states in one call (JSON by default)
formlm-cli snapshot --app <appId>
formlm-cli snapshot --app <appId> --module scale    # Only scale module
formlm-cli snapshot --app <appId> --md             # Markdown format (token-efficient for AI)
```

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
formlm-cli auth login                 # Interactive login
formlm-cli auth login --token <tok>   # Login with token
formlm-cli auth status                # Check current login state
formlm-cli auth logout                # Clear local token
```

### Profile (multi-account)

```bash
formlm-cli profile add --name work --url https://formlm.me --token <tok>
formlm-cli profile list
formlm-cli profile use work           # Switch default profile
formlm-cli --profile work app list    # Use a profile for one command
```

### App

```bash
formlm-cli app list
formlm-cli app create --name "My Form" --description "..."
formlm-cli app update --app <appId> --name "New Name" --theme blue
formlm-cli app remove --app <appId>                        # Delete an app (irreversible)
formlm-cli app urls --app <appId>                          # Get fill-in / editor / data URLs
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
formlm-cli scale set --app <appId> --id stress --direction negative
formlm-cli scale remove --app <appId> --id stress
formlm-cli scale clear --app <appId>
formlm-cli scale config --app <appId> --enable-single true

# Associate fields with a dimension
formlm-cli scale keys add --app <appId> --scale stress --fields q1,q2,q3 [--polarities "q3:negative"]
formlm-cli scale keys remove --app <appId> --scale stress --fields q1
formlm-cli scale keys list --app <appId> --scale stress
formlm-cli scale keys set --app <appId> --scale stress --fields q3 --negScore true

# Configure score ranges
formlm-cli scale data add --app <appId> --scale stress --ranges "0-10:Low,11-20:High"
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
formlm-cli connect cover-page add --app <appId> --id cover_main --name "Welcome" --format text --value "<h1>Hello</h1>"
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
formlm-cli report update --app <appId> --page <pageId> --name "New Name"

# Page management
formlm-cli report page add --app <appId> --name "Summary" --layout grid
formlm-cli report page update --app <appId> --id <pageId> --name "Overview"
formlm-cli report page remove --app <appId> --id <pageId>

# Widget management
formlm-cli report widget list --app <appId> --page <pageId>
formlm-cli report widget find --app <appId> --filter <keyword>
formlm-cli report widget set --app <appId> --id <widgetId> --value "{{TotalScore}}"
formlm-cli report widget add --app <appId> --page <pageId> --type chart --chartType bar --name "Score Chart"
formlm-cli report widget update --app <appId> --id <widgetId> --name "Updated Chart"
formlm-cli report widget remove --app <appId> --id <widgetId>
formlm-cli report widget types --category chart
formlm-cli report widget config --type chart --prop chartType

# Logic rules
formlm-cli report logic add --app <appId> --page <pageId> --condition "score>20" --action show
formlm-cli report logic list --app <appId> --page <pageId>
formlm-cli report logic remove --app <appId> --id <logicId>
```

### Expert (AI Interpretation)

```bash
formlm-cli expert query --app <appId>                    # Query expert config
formlm-cli expert find --app <appId>                     # Find expert details
formlm-cli expert config --app <appId> --enableChat true # Full configuration
formlm-cli expert set --app <appId> --key model --value gpt-4
formlm-cli expert avatar --app <appId> --name "Dr. AI" --avatar <url>
formlm-cli expert remove --app <appId>
formlm-cli expert chat --app <appId> --message "Explain my score"
```

### Share

```bash
formlm-cli share publish --app <appId>      # Publish (each respondent can submit once; unlimited respondents)
formlm-cli share unpublish --app <appId>    # Unpublish
formlm-cli share query --app <appId>        # Check publish status
formlm-cli share url --app <appId>          # Get the shareable URL
formlm-cli share api --app <appId>          # Configure the Data API (form backend endpoint)
formlm-cli share api --app <appId> --submit true --query true --auto-create true
```

The Data API turns a form into an HTTP data endpoint: `POST` JSON to the endpoint (or use the `/form` path for native HTML forms), read records back via the query endpoint, and hand the `?help` URL to an AI agent so it can discover the API on its own.

---

## MCP Integration

FormLM CLI works as a standard MCP Server over stdio and plugs into **any MCP-compatible AI platform** — Claude Desktop, Cursor, Codex CLI, Windsurf, Cline, etc.

> **⚠️ macOS/Linux users:** desktop AI clients often launch the MCP server without your full terminal PATH, which can cause `command not found` errors. See **[INSTALL.md → Step 4](INSTALL.md#step-4--connect-to-an-ai-agent-mcp-mode)** for the `env.PATH` fix, per-platform config file locations (including Codex CLI's TOML format), and the full setup guide.

> **No token? No problem.** If you omit `FORMLM_TOKEN`, the AI will prompt you to authenticate via the `auth_login` tool — just provide your email + password (or token) directly in the chat.

---

## Available MCP Tools (6)

| Tier | Tool | Description |
|---|---|---|
| 0 | `auth_login` | Login with token or email + password |
| 0 | `auth_status` | Check current login status |
| 1 | `formlm_generate` | Generate a complete app from natural language (AssessAgent pipeline) |
| 2 | `formlm_snapshot` | Get aggregated state of all modules (form/scale/connect/report/expert/share) |
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
| `FORMLM_TOKEN` | Your auth token (alternative to `auth login`) |

---

## Links

- **Website**: [https://formlm.me](https://formlm.me)
- **Platform**: Sign up and start building at [formlm.me](https://formlm.me)
- **GitHub**: [https://github.com/formlm/cli](https://github.com/formlm/cli)
- **npm**: [https://www.npmjs.com/package/@formlm/cli](https://www.npmjs.com/package/@formlm/cli)

---

## Contact

Have questions, feedback, or need help getting started?

📧 **[hello@formlm.me](mailto:hello@formlm.me)**

Feel free to reach out — we're happy to help.

---

## License

MIT © [FormLM](https://formlm.me)
