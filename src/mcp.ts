import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { execCommand, authLogin, authMe } from './exec.js';
import { addProfile, getActiveProfile, getBaseUrl } from './config.js';

// ── Helper: escape user input for embedding in CLI command strings ──────────
// tokenizeCommand (server-side PipelineFilterCommand) supports \" as escaped
// double-quote inside a quoted arg. Backslashes must also be escaped first.
// Newlines / tabs are normalized to spaces since CLI commands must be single-line.
function escapeArg(s: string): string {
  return s
    .replace(/\\/g, '\\\\')   // \ → \\  (must be first)
    .replace(/"/g, '\\"')      // " → \"
    .replace(/\r?\n|\r/g, ' ') // newlines → space
    .replace(/\t/g, ' ')       // tabs → space
    .trim();
}

// ── Helper: format exec result as MCP text content ──────────────────────────
function toText(r: { code: number; message: string; data: any }): string {
  return r.code === 0 ? (r.data || r.message) : `❌ [${r.code}] ${r.message}`;
}

// ── Helper: format formlm_generate result for better AI consumption ────────────
// Extracts key fields (appId, shareUrl, planType, taskCount) from JSON result
// and presents them in a structured summary for the AI Agent to relay to the user.
// The full raw JSON is intentionally NOT dumped here (it can be very long for
// multi-task pipelines) — use formlm_snapshot if full detail is needed.
function formatGenerateResult(r: { code: number; message: string; data: any }): string {
  if (r.code !== 0) {
    return `❌ [${r.code}] ${r.message}`;
  }
  const raw = r.data || r.message;
  if (typeof raw !== 'string') {
    return String(raw);
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.appId) {
      const lines: string[] = [];
      const status = parsed.status === 'partial_error' ? '⚠️ Partial Success' : '✅ Success';
      lines.push(status);
      if (parsed.appId) lines.push(`📋 App ID: ${parsed.appId}`);
      if (parsed.planType) lines.push(`🎯 Type: ${parsed.planType}`);
      if (parsed.description) lines.push(`📝 Description: ${parsed.description}`);
      if (parsed.taskCount != null) lines.push(`📊 Tasks: ${parsed.taskCount}`);
      if (parsed.shareUrl) lines.push(`🔗 Fill-in URL: ${parsed.shareUrl}`);
      if (parsed.builderUrl) lines.push(`🎨 Editor URL: ${parsed.builderUrl}`);
      if (parsed.dataUrl) lines.push(`📊 Data URL: ${parsed.dataUrl}`);
      if (parsed.tasks && Array.isArray(parsed.tasks)) {
        const done = parsed.tasks.filter((t: any) => t.status === 'done').length;
        const errors = parsed.tasks.filter((t: any) => t.status === 'error').length;
        if (errors > 0) {
          lines.push(`⚠️ ${done}/${parsed.tasks.length} tasks done, ${errors} errors`);
          if (Array.isArray(parsed.tasks)) {
            const errorTasks = parsed.tasks.filter((t: any) => t.status === 'error');
            for (const t of errorTasks) {
              lines.push(`   ✗ ${t.name || t.id || 'task'}: ${t.error || t.message || 'unknown error'}`);
            }
          }
        } else {
          lines.push(`✅ All ${parsed.tasks.length} tasks completed`);
        }
      }
      lines.push('');
      lines.push('🔍 Use formlm_snapshot to see full app details (do not dump raw JSON to the user).');
      return lines.join('\n');
    }
  } catch {
    // Not JSON, return as-is
  }
  return raw;
}

// ── MCP timeouts ─────────────────────────────────────────────────────────────
// Most commands complete in < 5 seconds.
// Smart pipeline (AssessAgent) takes 30-300 seconds.
const TIMEOUT_DEFAULT  = 60_000;   // 60s for all direct CLI commands
const TIMEOUT_SMART    = 600_000;  // 10min for formlm_generate (consultation can take 5min+)
const TIMEOUT_STYLE    = 600_000;  // 10min for connect style apply/apply-all (AI-generated styles can take 60-120s)

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: 'formlm',
    version: '0.2.0',
  });

  // ════════════════════════════════════════════════════════════════
  //  MCP RESOURCES — Domain Knowledge (SKILL.md × 6)
  // ════════════════════════════════════════════════════════════════
  // AI agents should read these BEFORE generating commands to ensure
  // they follow all P0/P1/P2 domain constraints.
  // Resources are lazy-loaded — call formlm_skill to fetch on demand.
  // ════════════════════════════════════════════════════════════════

  const skillIds = ['form', 'scale', 'connect', 'report', 'expert', 'share'] as const;
  const skillDescriptions: Record<string, string> = {
    form:    'Form field management — field types, scoring options, P0: --id uses snake_case (e.g. q1_anxiety), --key uses X-prefix fieldKey (e.g. X1). NEVER mix them.',
    scale:   'Scale dimension scoring — P0: range boundaries must be continuous (next.min = prev.max + 1), highest tier max must be 999, --kbText is required.',
    connect: 'Page styling & themes — P0: --theme must be one of 6 design modes (scenic/skeuomorphic/liquid/glassmorphism/immersive/minimalist). --look must include scenario + visual style description.',
    report:  'Report pages & widgets — P0: system variables use {{double braces}} e.g. {{TotalScore}}, logic conditions use actual score values (never percentages).',
    expert:  'AI expert agent config — P0: "expert config" for full setup (requires --kbText), "expert set" only for single-property micro-adjustments. --kbText is required.',
    share:   'Share & publish settings — share set command is naturally idempotent (safe to re-run). --form-type all --form-perm 1 --form-day 3650000 for standard public access.',
  };

  for (const skillId of skillIds) {
    server.resource(
      skillId,
      `formlm://skills/${skillId}`,
      {
        description: skillDescriptions[skillId],
        mimeType: 'text/markdown',
      },
      async (uri) => {
        const r = await execCommand(`assess skill ${skillId}`, undefined, TIMEOUT_DEFAULT);
        return {
          contents: [{
            uri: uri.href,
            text: r.code === 0 ? (r.data || r.message) : `Error loading skill: ${r.message}`,
            mimeType: 'text/markdown',
          }],
        };
      }
    );
  }

  // ════════════════════════════════════════════════════════════════
  //  MCP TOOLS — Layered Architecture (6 tools, down from 34)
  //
  //  Recommended workflow:
  //    1. auth_login → authenticate
  //    2. formlm_generate → build a complete new app from scratch, OR
  //       formlm_skill (read domain rules) + formlm_exec (direct commands)
  //    3. formlm_snapshot → check current state
  //    4. formlm_exec → direct fine-grained commands for modifications
  // ════════════════════════════════════════════════════════════════

  // ── Tier 0: Authentication ────────────────────────────────────

  server.tool('auth_login',
    [
      'Login to FormLM with a token or email + password.',
      '',
      'IMPORTANT: At the START of any FormLM session (before calling formlm_generate/formlm_exec),',
      'call auth_status first. If not logged in, call this tool immediately — ask the user for their email + password',
      '(easiest, no browser needed) or a token. Do NOT wait for a 401 error before authenticating.',
    ].join('\n'), {
    token: z.string().optional().describe('Auth token (get it from formlm.me → DevTools → Cookies → Authorization)'),
    email: z.string().optional().describe('Account email (use together with password)'),
    password: z.string().optional().describe('Account password (use together with email)'),
  }, async (params) => {
    if (params.token) {
      addProfile({ name: 'default', url: getBaseUrl(), token: params.token, active: true });
      const result = await authMe();
      if (result.code === 0) {
        const userInfo = typeof result.data === 'object' ? (result.data as any).userName : result.data;
        return { content: [{ type: 'text' as const, text: `✅ Login successful! User: ${userInfo}` }] };
      }
      return { content: [{ type: 'text' as const, text: `⚠️ Token saved but verification failed: ${result.message}` }] };
    }
    if (params.email && params.password) {
      const result = await authLogin(params.email, params.password);
      if (result.code === 0 && result.data) {
        const token = typeof result.data === 'string' ? result.data : (result.data as any).token || '';
        addProfile({ name: 'default', url: getBaseUrl(), token, active: true });
        return { content: [{ type: 'text' as const, text: '✅ Login successful!' }] };
      }
      return { content: [{ type: 'text' as const, text: `❌ Login failed: ${result.message}` }] };
    }
    return { content: [{ type: 'text' as const, text: '❌ Either token or both email and password are required.' }] };
  });

  server.tool('auth_status', 'Check current login status', {}, async () => {
    const profile = getActiveProfile();
    if (!profile) {
      return { content: [{ type: 'text' as const, text: '❌ Not logged in. Use auth_login to authenticate.' }] };
    }
    const result = await authMe();
    if (result.code === 0) {
      const userInfo = typeof result.data === 'object' ? (result.data as any).userName : result.data;
      return { content: [{ type: 'text' as const, text: `✅ Logged in. Server: ${profile.url}\nUser: ${userInfo}` }] };
    }
    return { content: [{ type: 'text' as const, text: `❌ Token invalid: ${result.message}` }] };
  });

  // ── Tier 1: Smart Pipeline (Natural Language → Full App) ────────
  //
  // This tool wraps the server-side AssessAgent intelligence.
  // It is the RECOMMENDED entry point for AI agents:
  //   - Same engine that powers newapp.html (SKILL.md constraints, reference data injection, retry)
  //   - One call replaces 30+ sequential formlm_exec calls
  //   - Returns appId + full task execution log
  //   - WARNING: may take 60-300 seconds for complex apps (consultation: 6 tasks)

  server.tool('formlm_generate',
    [
      'Create a COMPLETE production-ready assessment app from natural language.',
      'Server runs: Plan AI (assess-plan.md) → per-task SKILL.md injection → CLI execution → result collection.',
      'Equivalent to the full newapp.html pipeline. Returns JSON with appId, planType, shareUrl, task statuses, and full execution log.',
      '',
      '## Scene Templates (when user description is vague, present these and ask them to choose):',
      '1. assessment: 评估量表 — 多维度打分 + 分值区间解读报告 (MOST COMMON, for psych/workplace/health)',
      '2. consultation: 咨询评估 — 评估 + AI专家对话解读 (for mental health / coaching)',
      '3. survey: 问卷调查 — 仅收集数据，无打分 (for feedback / research)',
      '4. exam: 考试测验 — 标准答案 + 对错判分 (for education / training)',
      '5. quiz: 趣味测试 — 轻松风格 + 结果分类 (for engagement / personality)',
      '6. learn: 学习卡片 — 知识点 + 自测题 (for micro-learning)',
      '',
      '## Progress Feedback (tell the user BEFORE calling):',
      'Tell the user: "正在生成完整的评估应用，包含表单/量表/报告/发布等步骤，预计需要2-5分钟，请耐心等待..."',
      'Expected duration: assessment 60-120s / consultation 180-300s / survey 30-60s.',
      '',
      '## AFTER SUCCESS:',
      '1. Parse the returned JSON — it contains THREE URLs you must present to the user:',
      '   - shareUrl: the fill-in URL for respondents to submit answers',
      '   - builderUrl: the visual editor URL for online modification (builder.html)',
      '   - dataUrl: the data management URL for viewing collected responses (data.html)',
      '2. Present ALL THREE URLs to the user prominently — they need all three to manage their app.',
      '3. Use formlm_snapshot to verify the generated app if needed.',
      '4. If the user needs the URLs again later, use formlm_exec: "assess app urls --app <appId> --json".',
      '',
      '## ON FAILURE:',
      '- If timeout: ask user to simplify the description (fewer dimensions, fewer questions).',
      '- If partial success: use formlm_snapshot to check what was generated, then use formlm_exec to complete.',
      '- Always offer to retry with a simplified description.',
      '',
      '## Reference Documents:',
      'If the user has reference documents (questionnaire files, scoring criteria), ask them to paste the content',
      'directly into the chat. The input supports up to 8000 characters. For longer documents, summarize key points:',
      'dimensions, question count, scoring rules.',
      '',
      'WARNING: Takes 60-300 seconds. Do NOT cancel — let it complete.',
    ].join('\n'), {
    input: z.string().describe(
      'Natural language description of the app. Be specific: mention topic, audience, number of questions, dimensions/subscales, scoring, visual style. ' +
      'Example: "A workplace stress assessment for office workers with 3 dimensions (workload, autonomy, support), 15 questions, score 0-60, detailed result interpretation, dark professional style". ' +
      'Supports up to 8000 characters. If user pastes reference documents, include them here.'
    ),
    planType: z.string().optional().describe(
      'Plan type. Choose based on user needs: ' +
      '"assessment" (scoring+report, for psych/workplace/health evaluations, MOST COMMON), ' +
      '"consultation" (scoring+report+AI expert chat, for mental health/coaching), ' +
      '"survey" (no scoring, for feedback/research), ' +
      '"exam" (correct-answer scoring, for education/training), ' +
      '"quiz" (fun result categories, for engagement), ' +
      '"learn" (knowledge cards + self-test, for micro-learning). ' +
      'Default: auto-detected by Plan AI based on your description.'
    ),
    style: z.string().optional().describe(
      'Visual style preference. Suggested options: "温暖亲切" (warm friendly, for health/care), ' +
      '"正式专业" (formal professional, for workplace/corporate), ' +
      '"简洁直接" (minimal clean, for general use), ' +
      '"轻松活泼" (lively playful, for quiz/education). ' +
      'Or custom: "深色科技风" / "warm friendly pastel" / "minimal clean white".'
    ),
    questionCount: z.string().optional().describe(
      'Target question count range: "10-15" (quick screening, 3-5 min), ' +
      '"15-20" (standard assessment, 5-8 min), ' +
      '"20-30" (deep assessment, 8-15 min). Default: auto-decided by AI based on planType.'
    ),
  }, async (params) => {
    let cmd = `assess smart generate --input "${escapeArg(params.input)}"`;
    if (params.planType) cmd += ` --plan-type ${params.planType}`;
    if (params.style)    cmd += ` --style "${escapeArg(params.style)}"`;
    if (params.questionCount) cmd += ` --question-count ${params.questionCount}`;
    cmd += ' --json';
    const r = await execCommand(cmd, undefined, TIMEOUT_SMART);
    const text = formatGenerateResult(r);
    return { content: [{ type: 'text' as const, text }] };
  });

  // ── Tier 2: State & Knowledge ────────────────────────────────────

  server.tool('formlm_snapshot',
    [
      'Get aggregated snapshot of ALL 6 app modules in a single call.',
      'Returns: form fields, scale dimensions+ranges, connect page styles, report pages+widgets, expert config, share status.',
      '',
      'Call this BEFORE making changes to understand what already exists.',
      'Call this AFTER formlm_generate to verify the generated app.',
    ].join('\n'), {
    appId: z.string().describe('App ID'),
    module: z.string().optional().describe('Get only one module: form / scale / connect / report / expert / share (default: all 6)'),
  }, async (params) => {
    const modules = params.module ? [params.module] : ['form', 'scale', 'connect', 'report', 'expert', 'share'];
    const commands: Record<string, string> = {
      form:    `assess form query --app ${params.appId} --json`,
      scale:   `assess scale query --app ${params.appId} --json`,
      connect: `assess connect query --app ${params.appId} --json`,
      report:  `assess report query --app ${params.appId} --json`,
      expert:  `assess expert query --app ${params.appId} --json`,
      share:   `assess share query --app ${params.appId} --json`,
    };

    const entries = modules.filter((m) => commands[m]);
    const results = await Promise.all(
      entries.map((m) => execCommand(commands[m], undefined, TIMEOUT_DEFAULT).then((r) => [m, r] as const))
    );

    const snapshot: Record<string, unknown> = { appId: params.appId };
    const errors: string[] = [];

    for (const [module, result] of results) {
      if (result.code === 0) {
        // All modules now use --json, so parse uniformly
        try { snapshot[module] = JSON.parse(result.data); }
        catch { snapshot[module] = result.data || result.message; }
      } else {
        snapshot[module] = null;
        errors.push(`${module}: ${result.message}`);
      }
    }

    if (errors.length > 0) snapshot['_errors'] = errors;

    return { content: [{ type: 'text' as const, text: JSON.stringify(snapshot, null, 2) }] };
  });

  server.tool('formlm_skill',
    [
      'Get the full SKILL.md domain knowledge for a specific skill module.',
      'Same documents that AssessAgent loads internally — contains P0/P1/P2 constraints, parameter rules, examples.',
      '',
      'You can also read these via MCP resources: formlm://skills/<skillId>',
      'READ the relevant skill BEFORE constructing formlm_exec commands manually.',
    ].join('\n'), {
    skillId: z.string().describe('Skill ID: form / scale / connect / report / expert / share'),
  }, async (params) => {
    const valid = ['form', 'scale', 'connect', 'report', 'expert', 'share'];
    if (!valid.includes(params.skillId)) {
      return { content: [{ type: 'text' as const, text: `❌ Invalid skill ID. Valid: ${valid.join(', ')}` }] };
    }
    const r = await execCommand(`assess skill ${params.skillId}`, undefined, TIMEOUT_DEFAULT);
    return { content: [{ type: 'text' as const, text: toText(r) }] };
  });

  // ── Tier 3: Direct Execution (Advanced) ──────────────────────────
  //
  // Whitelisted command prefixes (first 3 tokens are checked):
  //   assess app    : list / create / use / update / remove
  //   assess form   : query / find / types / config / add / update / remove / move / set-property
  //   assess scale  : query / find / add / update / set / remove / clear / config / keys / data
  //   assess connect: query / find / types / config / cover-page / final-page / main-page / style
  //   assess report : query / find / update / page / widget / logic
  //   assess expert : query / find / config / set / avatar / remove / chat
  //   assess share  : set / query / url
  //   assess smart  : generate
  //   assess skill  : form / scale / connect / report / expert / share

  server.tool('formlm_exec',
    [
      'Execute a raw FormLM CLI command directly.',
      'Use this for fine-grained control that formlm_generate doesn\'t cover, or for modifying existing apps.',
      '',
      'IMPORTANT: All commands must start with "assess". Read formlm_skill first to ensure P0 compliance.',
      '',
      'SAFETY — destructive operations (remove/delete):',
      '  Before running ANY "remove" command (app/form/scale/expert), first run the matching',
      '  "query"/"list"/"find" command to show the user the EXACT name of what will be deleted,',
      '  then get explicit confirmation ("Delete app \'X\' (id: Y)? This cannot be undone.").',
      '  NEVER call a remove command based on a vague reference ("delete it", "remove that one")',
      '  without first resolving and confirming the exact target. Deletion is irreversible.',
      '',
      'Whitelisted prefixes (3-token match):',
      '  App:     assess app list/create/use/update/remove/urls',
      '  Form:    assess form query/find/types/config/add/update/remove/move/set-property',
      '  Scale:   assess scale query/find/add/update/set/remove/clear/config/keys/data',
      '  Connect: assess connect query/find/types/config/cover-page/final-page/main-page/style',
      '  Report:  assess report query/find/update/page/widget/logic',
      '  Expert:  assess expert query/find/config/set/avatar/remove/chat',
      '  Share:   assess share set/query/url',
      '',
      'Common patterns:',
      '  "assess app list --json"                                                                    (discover appId by name)',
      '  "assess app urls --app <id> --json"                                                         (get fill-in/editor/data URLs)',
      '  "assess form add --app <id> --id q1 --name \\"Name\\" --type radio --options \\"A:1,B:2,C:3\\" --json"',
      '  "assess scale add --app <id> --id stress --name \\"Stress\\" --format sum --kbText \\"...\\" --json"',
      '  "assess scale keys add --app <id> --scale stress --fields X1,X2,X3 --json"',
      '  "assess scale data add --app <id> --scale stress --ranges \\"0-7:Normal,8-14:Mild,15-21:Severe\\" --json"',
      '  "assess share set --app <id> --form-type all --form-perm 1 --form-day 3650000 --json"',
      '  "assess share url --app <id>"',
      '  "assess connect style apply-all --app <id> --look \"心理健康评估，温暖治愈风格\" --theme minimalist --json"  (AI style, takes 30-120s)',
      '  "assess app remove --app <id> --json"                                                        (IRREVERSIBLE — confirm first, see SAFETY above)',
    ].join('\n'), {
    command: z.string().describe(
      'Full CLI command starting with "assess". Do NOT include the "formlm-cli" prefix. ' +
      'Add --json flag for structured output. Escape inner quotes with \\".'
    ),
  }, async (params) => {
    // Use longer timeout for commands that trigger server-side AI generation
    const isStyleCmd = params.command.includes('connect style apply');
    const timeout = isStyleCmd ? TIMEOUT_STYLE : TIMEOUT_DEFAULT;
    const r = await execCommand(params.command, undefined, timeout);
    return { content: [{ type: 'text' as const, text: toText(r) }] };
  });

  // ── Start Server ──────────────────────────────────────────────────

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('FormLM MCP Server v0.2.0 running on stdio (6 tools + 6 resources)');
}
