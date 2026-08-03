import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { execCommand, authLogin, authMe } from './exec.js';
import { addProfile, getActiveProfile, getBaseUrl } from './config.js';
import { VERSION } from './version.js';
import { escapeArg } from './utils.js';

// escapeArg now lives in ./utils.js (shared with commands/smart.ts) so that the
// direct CLI and the MCP Server use a single, consistent escaping implementation.

// ── Helper: format exec result as MCP text content ──────────────────────────
function toText(r: { code: number; message: string; data: any }): string {
  return r.code === 0 ? (r.data || r.message) : `❌ [${r.code}] ${r.message}`;
}

// ── Helper: format formlm_generate (smart plan) result for AI consumption ──────
// Extracts key fields (appId, planType, tasks) from plan result
// and presents them with next-step guidance for sequential module execution.
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
      lines.push('✅ Plan generated successfully');
      lines.push(`📋 App ID: ${parsed.appId}`);
      if (parsed.planType) lines.push(`🎯 Type: ${parsed.planType}`);
      if (parsed.description) lines.push(`📝 Description: ${parsed.description}`);
      if (parsed.taskCount != null) lines.push(`📊 Tasks: ${parsed.taskCount}`);
      if (parsed.tasks && Array.isArray(parsed.tasks)) {
        lines.push('');
        lines.push('Tasks:');
        for (const t of parsed.tasks) {
          lines.push(`  ${t.seq}. [${t.skill}] ${t.title}`);
        }
        lines.push('');
        lines.push('📋 Plan JSON (pass this to each smart execute call):');
        lines.push(parsed.plan || '');
        lines.push('');
        lines.push('Next: Use formlm_execute to execute each module sequentially:');
        for (const t of parsed.tasks) {
          lines.push(`  formlm_execute: appId=${parsed.appId}, module=${t.skill}, plan=<plan_json_above>`);
        }
      }
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
const TIMEOUT_PLAN     = 120_000;  // 2min for smart plan (Phase 1 only, ~10-30s)
const TIMEOUT_EXECUTE  = 300_000;  // 5min for smart execute (single module, ~30-120s)
const TIMEOUT_STYLE    = 600_000;  // 10min for connect style apply/apply-all (AI-generated styles can take 60-120s)

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: 'formlm',
    version: VERSION,
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
  //  MCP TOOLS — Layered Architecture (7 tools)
  //
  //  Recommended workflow (smart pipeline):
  //    1. auth_login → authenticate
  //    2. formlm_generate → generate plan (Phase 1, ~10-30s)
  //    3. formlm_execute → execute each module sequentially (form→scale→connect→report→expert→share)
  //    4. formlm_snapshot → verify the app
  //    5. formlm_exec → fine-grained modifications (advanced)
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

  // ── Tier 1: Smart Pipeline (Natural Language → Plan + Sequential Execute) ─
  //
  // This tool generates an execution plan (Phase 1 only, ~10-30s).
  // After getting the plan, use formlm_exec to execute each module sequentially.

  server.tool('formlm_generate',
    [
      'Generate an execution plan from natural language description (Phase 1 only — does NOT execute any module).',
      'Server runs: Plan AI (assess-plan.md) → generates task list for 6 modules (form/scale/connect/report/expert/share).',
      'Returns: appId, planType, plan JSON, and task list. Takes ~10-30 seconds.',
      '',
      '## Scene Templates (when user description is vague, present these and ask them to choose):',
      '1. assessment: 评估量表 — 多维度打分 + 分值区间解读报告 (MOST COMMON, for psych/workplace/health)',
      '2. consultation: 咨询评估 — 评估 + AI专家对话解读 (for mental health / coaching)',
      '3. survey: 问卷调查 — 仅收集数据，无打分 (for feedback / research)',
      '4. exam: 考试测验 — 标准答案 + 对错判分 (for education / training)',
      '5. quiz: 趣味测试 — 轻松风格 + 结果分类 (for engagement / personality)',
      '6. learn: 学习卡片 — 知识点 + 自测题 (for micro-learning)',
      '',
      '## AFTER SUCCESS — execute modules sequentially via formlm_execute:',
      'For each module in the task list (form → scale → connect → report → expert → share), call:',
      '  formlm_execute with appId, module, and the plan JSON from this result',
      '',
      '## USER FEEDBACK (IMPORTANT for good UX):',
      'After getting the plan, tell the user: "✅ 计划已生成！" and list the modules.',
      'Before each formlm_execute call, tell the user which module is being generated.',
      'After each call, tell the user the module is done.',
      'After the last module (share), the 3 app URLs are returned automatically — present them to the user.',
      '',
      'After all modules are executed, use formlm_snapshot to verify the app.',
      '',
      '## Reference Documents:',
      'If the user has reference documents (questionnaire files, scoring criteria), ask them to paste the content',
      'directly into the chat. The input supports up to 8000 characters.',
    ].join('\n'), {
    input: z.string().describe(
      'Natural language description of the app. Be specific: mention topic, audience, number of questions, dimensions/subscales, scoring, visual style. ' +
      'Example: "A workplace stress assessment for office workers with 3 dimensions (workload, autonomy, support), 15 questions, score 0-60, detailed result interpretation, dark professional style". ' +
      'Supports up to 8000 characters. If user pastes reference documents, include them here.'
    ),
    planType: z.enum(['assessment', 'consultation', 'survey', 'exam', 'quiz', 'learn']).optional().describe(
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
    questionCount: z.enum(['10-15', '15-20', '20-30']).optional().describe(
      'Target question count range: "10-15" (quick screening, 3-5 min), ' +
      '"15-20" (standard assessment, 5-8 min), ' +
      '"20-30" (deep assessment, 8-15 min). Default: auto-decided by AI based on planType.'
    ),
  }, async (params) => {
    let cmd = `assess smart plan --input "${escapeArg(params.input)}"`;
    if (params.planType) cmd += ` --plan-type ${params.planType}`;
    if (params.style)    cmd += ` --style "${escapeArg(params.style)}"`;
    if (params.questionCount) cmd += ` --question-count ${params.questionCount}`;
    cmd += ' --json';
    const r = await execCommand(cmd, undefined, TIMEOUT_PLAN);
    const text = formatGenerateResult(r);
    return { content: [{ type: 'text' as const, text }] };
  });

  // ── Tier 1b: Smart Execute (Single Module) ──────────────────────
  //
  // Executes one module at a time from the plan generated by formlm_generate.
  // Takes structured params (appId, module, plan) — no manual JSON escaping needed.
  // When the last module (share) completes, auto-fetches the 3 app URLs.

  server.tool('formlm_execute',
    [
      'Execute a single module from the plan generated by formlm_generate.',
      'Call this sequentially for each module, following the task list order from formlm_generate.',
      'Default order: form → scale → connect → report → expert → share.',
      'Takes ~30-120 seconds per module. Do NOT cancel.',
      '',
      '## USER FEEDBACK (IMPORTANT for good UX):',
      'Before calling, tell the user: "正在生成 [module] 模块..."',
      'After calling, tell the user: "✅ [module] 模块完成"',
      'After the last module (share), present the 3 URLs to the user.',
      '',
      '## PLAN PASSING:',
      'Pass the plan JSON from formlm_generate (or the updated plan from the previous formlm_execute call).',
      'The updated plan JSON is included in each response — use it for the next call.',
    ].join('\n'), {
    appId: z.string().describe('App ID from formlm_generate result'),
    module: z.string().describe('Module to execute: form / scale / connect / report / expert / share'),
    plan: z.string().describe('Plan JSON from formlm_generate or previous formlm_execute response'),
  }, async (params) => {
    const cmd = `assess smart execute --app ${params.appId} --module ${params.module} --plan "${escapeArg(params.plan)}" --json`;
    const r = await execCommand(cmd, undefined, TIMEOUT_EXECUTE);

    if (r.code !== 0) {
      return { content: [{ type: 'text' as const, text: `❌ [${r.code}] ${r.message}` }] };
    }

    const raw = r.data || r.message;
    let text: string;
    try {
      const parsed = JSON.parse(raw);
      const lines: string[] = [];
      const status = parsed.taskStatus || 'unknown';

      if (status === 'error') {
        lines.push(`❌ Module '${params.module}' failed (status: error)`);
        if (parsed.error) lines.push(`Error: ${parsed.error}`);
      } else {
        lines.push(`✅ Module '${params.module}' completed (status: ${status})`);
      }

      // Include updated plan JSON for the next call
      if (parsed.plan) {
        lines.push('');
        lines.push('📋 Updated Plan JSON (use this for the next formlm_execute call):');
        lines.push(parsed.plan);
      }

      // If this is the share module (last one), auto-fetch URLs
      if (params.module === 'share') {
        const urlResult = await execCommand(`assess app urls --app ${params.appId} --json`, undefined, TIMEOUT_DEFAULT);
        if (urlResult.code === 0) {
          try {
            const urls = JSON.parse(urlResult.data || urlResult.message);
            lines.push('');
            lines.push('🎉 All modules complete! Your app is ready:');
            if (urls.shareUrl) lines.push(`🔗 Fill-in URL: ${urls.shareUrl}`);
            if (urls.builderUrl) lines.push(`🎨 Editor URL: ${urls.builderUrl}`);
            if (urls.dataUrl) lines.push(`📊 Data URL: ${urls.dataUrl}`);
            lines.push('');
            lines.push(`App ID: ${params.appId}`);
          } catch {
            lines.push('');
            lines.push('🎉 All modules complete!');
            lines.push(`Use formlm_exec: "assess app urls --app ${params.appId} --json" to get the app URLs.`);
          }
        } else {
          lines.push('');
          lines.push('🎉 All modules complete!');
          lines.push(`Use formlm_exec: "assess app urls --app ${params.appId} --json" to get the app URLs.`);
        }
      } else {
        lines.push('');
        lines.push('Next: Call formlm_execute with the next module and the updated plan JSON above.');
      }

      text = lines.join('\n');
    } catch {
      text = raw || r.message;
    }

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
    const validModules = ['form', 'scale', 'connect', 'report', 'expert', 'share'];
    const modules = params.module ? [params.module] : validModules;
    // Validate module name early — prevent silent empty results
    if (params.module && !validModules.includes(params.module)) {
      return { content: [{ type: 'text' as const, text: `❌ Invalid module "${params.module}". Valid: ${validModules.join(', ')}` }] };
    }
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
  // Whitelisted command prefixes (first 2 tokens are checked):
  //   assess app    : list / create / use / update / remove
  //   assess form   : query / find / types / config / add / update / remove / move / set-property
  //   assess scale  : query / find / add / update / set / remove / clear / config / keys / data
  //   assess connect: query / find / types / config / cover-page / final-page / main-page / style
  //   assess report : query / find / update / page / widget / logic
  //   assess expert : query / find / config / set / avatar / remove / chat
  //   assess share  : set / query / url
  //   assess smart  : plan / execute
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
      'Whitelisted prefixes (2-token match):',
      '  App:     assess app list/create/use/update/remove/urls',
      '  Form:    assess form query/find/types/config/add/update/remove/move/set-property',
      '  Scale:   assess scale query/find/add/update/set/remove/clear/config/keys/data',
      '  Connect: assess connect query/find/types/config/cover-page/final-page/main-page/style',
      '  Report:  assess report query/find/update/page/widget/logic',
      '  Expert:  assess expert query/find/config/set/avatar/remove/chat',
      '  Share:   assess share set/query/url',
      '  Smart:   assess smart plan/execute',
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
    // Defense-in-depth: enforce the documented whitelisted command prefixes
    // before sending anything to the server. Prevents LLM hallucinations from
    // issuing arbitrary commands and avoids wasteful network round-trips.
    const head = params.command.trim().split(/\s+/).slice(0, 2).join(' ');
    const allowedPrefixes = ['assess app', 'assess form', 'assess scale', 'assess connect', 'assess report', 'assess expert', 'assess share', 'assess smart', 'assess skill'];
    if (!allowedPrefixes.includes(head)) {
      return {
        content: [{
          type: 'text' as const,
          text: `❌ Command must start with one of the whitelisted prefixes (assess app/form/scale/connect/report/expert/share/smart/skill). Got: "${params.command.substring(0, 80)}"`,
        }],
      };
    }
    // Use longer timeout for commands that trigger server-side AI generation
    const isStyleCmd = params.command.includes('connect style apply');
    const isSmartPlan = params.command.includes('smart plan');
    const isSmartExecute = params.command.includes('smart execute');
    const timeout = isStyleCmd ? TIMEOUT_STYLE : isSmartExecute ? TIMEOUT_EXECUTE : isSmartPlan ? TIMEOUT_PLAN : TIMEOUT_DEFAULT;
    const r = await execCommand(params.command, undefined, timeout);
    return { content: [{ type: 'text' as const, text: toText(r) }] };
  });

  // ── Start Server ──────────────────────────────────────────────────

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`FormLM MCP Server v${VERSION} running on stdio (7 tools + 6 resources)`);
}
