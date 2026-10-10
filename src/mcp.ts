import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { execCommand, authLogin, authLoginCode, authMe, authSendEmailCode, fetchCaptchaImage } from './exec.js';
import { addProfile, getActiveProfile, getBaseUrl } from './config.js';
import { VERSION } from './version.js';
import { escapeArg } from './utils.js';
import { buildSummary, shareTokenFromUrl } from './summary.js';
import { runDoctor, isValidLangCode } from './doctor.js';

// escapeArg now lives in ./utils.js (shared with commands/smart.ts) so that the
// direct CLI and the MCP Server use a single, consistent escaping implementation.

// ── Helper: format exec result as MCP text content ──────────────────────────
function toText(r: { code: number; message: string; data: any }): string {
  return r.code === 0 ? (r.data || r.message) : `❌ [${r.code}] ${r.message}`;
}

// ── Helper: format formlm_generate (smart plan) result for AI consumption ──────
// Extracts key fields (appId, planType, name, tasks) from plan result
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
      if (parsed.name) lines.push(`📛 Name: ${parsed.name}`);
      if (parsed.description) lines.push(`📝 Description: ${parsed.description}`);
      if (parsed.taskCount != null) lines.push(`📊 Tasks: ${parsed.taskCount}`);
      if (parsed.tasks && Array.isArray(parsed.tasks)) {
        lines.push('');
        lines.push('Tasks:');
        for (const t of parsed.tasks) {
          lines.push(`  ${t.seq}. [${t.skill}] ${t.title}`);
        }
        lines.push('');
        lines.push('Next: Use formlm_execute to execute each module sequentially (plan is cached server-side for ~10 minutes):');
        for (const t of parsed.tasks) {
          lines.push(`  formlm_execute: appId=${parsed.appId}, module=${t.skill}`);
        }
        // Coverage warning: plans other than consultation have no expert task, so callers
        // must not assume an AI expert exists (pages advertising one would be dead links).
        const done = parsed.tasks.map((t: any) => t.skill);
        if (!done.includes('expert')) {
          lines.push('');
          lines.push(`⚠️ This plan has NO 'expert' module — smart execute --module expert will fail.`);
          lines.push(`   Need an AI expert? Add it explicitly: formlm_exec "assess expert config --app ${parsed.appId} --name ... --role ... --kbText ... --json"`);
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
const TIMEOUT_DEFAULT  = Number(process.env.FORMLM_TIMEOUT_MS) || 60_000;   // 60s for all direct CLI commands
const TIMEOUT_PLAN     = Number(process.env.FORMLM_TIMEOUT_PLAN) || 120_000;  // 2min for smart plan (Phase 1 only, ~10-30s)
const TIMEOUT_EXECUTE  = Number(process.env.FORMLM_TIMEOUT_EXECUTE) || 300_000; // 5min for smart execute (single module, ~30-120s)
const TIMEOUT_STYLE    = Number(process.env.FORMLM_TIMEOUT_STYLE) || 600_000;  // 10min for connect style apply/apply-all (AI-generated styles can take 60-120s)

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
    expert:  'AI expert agent config — P0: "expert config" for full setup (requires --name AND --kbText), "expert set --property <p> --value <v>" for single-property micro-adjustments (e.g. --property enable). NOTE: only consultation plans auto-generate an expert; assessment/exam plans do not — add one explicitly.',
    share:   'Share & publish settings — share set command is naturally idempotent (safe to re-run). Access types: visitor = anonymous no-login ("anyone can fill", the usual public choice); all = every LOGGED-IN FormLM user (anonymous visitors hit the login page); secret = password; owner = creator only. Day rule: 1..30 finite, <=0 or >30 normalize to permanent (sentinel 3650000).',
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
  // MCP TOOLS — Layered Architecture (10 tools)
  //
  //  Recommended workflow (smart pipeline):
  //    1. auth_login → authenticate
  //    2. formlm_generate → generate plan (Phase 1, ~10-30s)
  //    3. formlm_execute → execute each module sequentially (form→scale→connect→report→expert→share)
  //    4. formlm_doctor → verify quality (share access / expert / language / coverage)
  //       (formlm_snapshot → full or --summary state when you need the raw modules)
  //    5. formlm_exec → fine-grained modifications (advanced)
  // ════════════════════════════════════════════════════════════════

  // ── Tier 0: Authentication ────────────────────────────────────

  server.registerTool('auth_login', {
    title: 'Login to FormLM',
    description: [
      'Login to FormLM. Three methods, in order of preference:',
      '',
      '1. Access Token (recommended): ask the user to copy it from',
      '   formlm.me → Workspace → Account Settings → Access Token → Copy, then pass it as `token`.',
      '',
      '2. Email verification code (no password needed, fully in-chat, works for ALL accounts):',
      '   a. Call auth_email_code { email } — returns a captcha image (show it to the user)',
      '   b. Ask the user to read the 4 digits from the image, then call auth_email_code { email, captcha }',
      '   c. A 6-digit code is emailed to the user (valid 5 minutes) — ask them for it',
      '   d. Call this tool with { email, code }',
      '',
      '3. email + password: only for accounts that HAVE set a password.',
      '   Accounts registered via email verification code or Google have NO password.',
      '   If password login fails with 401/403, do NOT retry — switch to method 1 or 2.',
      '',
      'IMPORTANT: At the START of any FormLM session (before calling formlm_generate/formlm_exec),',
      'call auth_status first. If not logged in, authenticate immediately. Do NOT wait for a 401 error.',
    ].join('\n'),
    inputSchema: {
    token: z.string().optional().describe('Access token from formlm.me → Workspace → Account Settings → Access Token → Copy'),
    email: z.string().optional().describe('Account email (use with `code` for verification-code login, or with `password`)'),
    code: z.string().optional().describe('Email verification code (6 digits, valid 5 min) — request it via auth_email_code first'),
    password: z.string().optional().describe('Account password (use together with email; verification-code/Google accounts have no password)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
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
    if (params.email && params.code) {
      const result = await authLoginCode(params.email, params.code);
      if (result.code === 0 && result.data) {
        const token = typeof result.data === 'string' ? result.data : (result.data as any).token || '';
        addProfile({ name: 'default', url: getBaseUrl(), token, active: true });
        return { content: [{ type: 'text' as const, text: '✅ Login successful!' }] };
      }
      if (result.code === 403) {
        return { content: [{ type: 'text' as const, text: '❌ Invalid or expired verification code. The code is valid for 5 minutes — ask the user to double-check it and retry. If it expired, call auth_email_code again (new captcha → new code). If the account reports 429, it is locked for 30 minutes after 5 failed attempts — wait and retry later.' }] };
      }
      if (result.code === 429) {
        return { content: [{ type: 'text' as const, text: '❌ Too many attempts — rate limited. Wait a minute, then request a fresh code via auth_email_code.' }] };
      }
      return { content: [{ type: 'text' as const, text: `❌ Login failed: ${result.message}` }] };
    }
    if (params.email && params.password) {
      const result = await authLogin(params.email, params.password);
      if (result.code === 0 && result.data) {
        const token = typeof result.data === 'string' ? result.data : (result.data as any).token || '';
        addProfile({ name: 'default', url: getBaseUrl(), token, active: true });
        return { content: [{ type: 'text' as const, text: '✅ Login successful!' }] };
      }
      return { content: [{ type: 'text' as const, text: `❌ Login failed: ${result.message}\nHint: accounts registered via email verification code or Google have no password. Use the token method (Account Settings → Access Token) or email verification code (auth_email_code) instead.` }] };
    }
    return { content: [{ type: 'text' as const, text: '❌ Provide `token`, or `email` + `code`, or `email` + `password`. Recommended: ask the user for the Access Token (formlm.me → Workspace → Account Settings), or start an email verification-code login via auth_email_code.' }] };
  });

  server.registerTool('auth_email_code', {
    title: 'Request email verification code',
    description: [
      'Request an email verification code for FormLM login (part of auth_login method 2 — no password needed).',
      '',
      'Two-step usage:',
      '1. Call WITHOUT `captcha` → returns a captcha image. Show it to the user and ask them to read the 4 digits.',
      '   (The image is a human-verification gate — you cannot solve it yourself; the user must read it.)',
      '2. Call WITH `captcha` (the 4 digits) → if correct, a 6-digit code is emailed to the user (valid 5 minutes).',
      '   Then ask the user for that code and call auth_login with { email, code }.',
      '',
      'Server rate limits (anti-abuse): 1 send per email per 60s, 10 sends per IP per minute.',
      'On 429, tell the user to wait a minute. On 403, the digits were wrong — fetch a fresh image and try once more.',
    ].join('\n'),
    inputSchema: {
    email: z.string().describe('Account email (the verification code will be sent here)'),
    captcha: z.string().optional().describe('The 4 digits the user read from the captcha image (omit on first call to get the image)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (params) => {
    if (!params.captcha) {
      const cap = await fetchCaptchaImage(params.email);
      if (!cap.ok || !cap.image) {
        return { content: [{ type: 'text' as const, text: `❌ Failed to fetch captcha image: ${cap.message}` }] };
      }
      const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [
        {
          type: 'image',
          data: cap.image.toString('base64'),
          mimeType: 'image/gif',
        },
        {
          type: 'text',
          text: '👆 Captcha image (valid 60s). Show it to the user and ask them to read the 4 digits, then call auth_email_code again with { email, captcha }. If this client cannot display images, run `formlm-cli auth login` in a terminal instead (option 2 saves the image to ~/.formlm/captcha.gif and opens it).',
        },
      ];
      return { content };
    }
    const send = await authSendEmailCode(params.email, params.captcha);
    if (send.code === 200) {
      return { content: [{ type: 'text' as const, text: `✅ Verification code sent to ${params.email}. Ask the user to check their inbox (and spam folder) and give you the 6-digit code (valid 5 minutes), then call auth_login with { email, code }.` }] };
    }
    if (send.code === 403) {
      return { content: [{ type: 'text' as const, text: '❌ Wrong captcha digits. Call auth_email_code again WITHOUT captcha to get a fresh image, and ask the user to read it once more.' }] };
    }
    if (send.code === 429) {
      return { content: [{ type: 'text' as const, text: '❌ Rate limited (1 send per email per 60s, 10 per IP per minute). Ask the user to wait a minute, then request a fresh captcha image.' }] };
    }
    return { content: [{ type: 'text' as const, text: `❌ Failed to send code: ${send.message}` }] };
  });

  server.registerTool('auth_status', {
    title: 'Check login status',
    description: [
      'Check current login status.',
      'Tokens expire after 7 days — if this returns "Token invalid (expired)", ask the user to copy a fresh',
      'Access Token from formlm.me → Workspace → Account Settings and re-login via auth_login.',
    ].join('\n'),
    inputSchema: {},
    outputSchema: {
      loggedIn: z.boolean(),
      message: z.string(),
      url: z.string().optional(),
      user: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async () => {
    const profile = getActiveProfile();
    if (!profile) {
      const text = '❌ Not logged in. Use auth_login to authenticate (recommended: Access Token from formlm.me → Workspace → Account Settings).';
      return { content: [{ type: 'text' as const, text }], structuredContent: { loggedIn: false, message: text } };
    }
    const result = await authMe();
    if (result.code === 0) {
      const userInfo = typeof result.data === 'object' ? (result.data as any).userName : result.data;
      const text = `✅ Logged in. Server: ${profile.url}\nUser: ${userInfo}`;
      return { content: [{ type: 'text' as const, text }], structuredContent: { loggedIn: true, message: text, url: profile.url, user: String(userInfo ?? '') } };
    }
    const text = `❌ Token invalid: ${result.message}\nTokens expire after 7 days. Ask the user to copy a fresh Access Token from formlm.me → Workspace → Account Settings, then re-login via auth_login.`;
    return { content: [{ type: 'text' as const, text }], structuredContent: { loggedIn: false, message: text, url: profile.url } };
  });

  server.registerTool('formlm_usage', {
    title: 'Account usage & budget',
    description: [
      'Report the logged-in account budget: plan, app-slot usage, and AI credits — check BEFORE batch creating.',
      'Free plan caps at 10 apps (in-use AND recycle-bin apps hold a slot; purging frees it): once full,',
      'app create / formlm_generate fail with 403 "app-limit". AI credits are billed per completed generation',
      '(capped at zero — generation never blocks). When slots are full, tell the user: purge the recycle bin',
      'at formlm.me → Workspace or upgrade (formlm.me → #/vip).',
      'Requires a server that reports usage fields; on an older server those lines come back "n/a".',
    ].join('\n'),
    inputSchema: {},
    outputSchema: {
      ok: z.boolean(),
      message: z.string(),
      account: z.string().optional(),
      plan: z.string().optional(),
      appsUsed: z.number().optional(),
      appsLimit: z.number().optional(),
      appsUnlimited: z.boolean().optional(),
      appsLeft: z.number().optional(),
      credits: z.number().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async () => {
    const me = await authMe();
    if (me.code !== 0) {
      const text = `❌ ${me.message}`;
      return { content: [{ type: 'text' as const, text }], structuredContent: { ok: false, message: text } };
    }
    let d: any = me.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
    d = d || {};
    const unlimited = d.appLimitUnlimited === true;
    const lines: string[] = ['📊 FormLM account usage'];
    if (d.account) lines.push(`   Account:       ${d.account}`);
    if (d.tenantType) lines.push(`   Plan:          ${d.tenantType}`);
    if (typeof d.appUsage === 'number') {
      const cap = unlimited ? 'unlimited' : String(d.appLimit);
      const left = unlimited ? '' : `   (${Math.max(0, Number(d.appLimit) - d.appUsage)} left)`;
      lines.push(`   Apps:          ${d.appUsage} / ${cap}${left}`);
      if (!unlimited && Math.max(0, Number(d.appLimit) - d.appUsage) === 0) {
        lines.push('   ⚠️ Slot cap reached — creating returns 403 app-limit. Recycle-bin apps still hold a slot:');
        lines.push('      purge one at formlm.me → Workspace, or upgrade (#/vip).');
      }
    } else {
      lines.push('   Apps:          n/a (server too old to report usage)');
    }
    if (typeof d.credit === 'number') {
      lines.push(`   AI credits:    ${d.credit}`);
      if (d.credit <= 0) lines.push('   ℹ️ Credits at 0 — generation still works (billing capped, never blocks); top-up at #/vip.');
    } else {
      lines.push('   AI credits:    n/a (server too old to report credits)');
    }
    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
      structuredContent: {
        ok: true,
        message: lines.join('\n'),
        account: d.account ? String(d.account) : undefined,
        plan: d.tenantType ? String(d.tenantType) : undefined,
        appsUsed: typeof d.appUsage === 'number' ? d.appUsage : undefined,
        appsLimit: !unlimited && d.appLimit !== undefined ? Number(d.appLimit) : undefined,
        appsUnlimited: unlimited,
        appsLeft: !unlimited && typeof d.appUsage === 'number' ? Math.max(0, Number(d.appLimit) - d.appUsage) : undefined,
        credits: typeof d.credit === 'number' ? d.credit : undefined,
      },
    };
  });

  // ── Tier 1: Smart Pipeline (Natural Language → Plan + Sequential Execute) ─
  //
  // This tool generates an execution plan (Phase 1 only, ~10-30s).
  // After getting the plan, use formlm_exec to execute each module sequentially.

  server.registerTool('formlm_generate', {
    title: 'Generate execution plan',
    description: [
      'Generate an execution plan from natural language description (Phase 1 only — does NOT execute any module).',
      'Server runs: Plan AI (assess-plan.md) → generates task list for 6 modules (form/scale/connect/report/expert/share).',
      'Returns: appId, planType, name, plan JSON, and task list. Takes ~10-30 seconds.',
      'This tool is plan-only — the name "generate" predates the split. There is no single call that produces a live app;',
      'that is generate → execute×N (or the CLI `formlm-cli smart generate` wrapper).',
      '',
      '## Scene Templates (when user description is vague, present these and ask them to choose):',
      '1. assessment: 评估量表 — 多维度打分 + 分值区间解读报告 (MOST COMMON, for psych/workplace/health)',
      '2. consultation: 咨询评估 — 评估 + AI专家对话解读 (for mental health / coaching)',
      '3. survey: 问卷调查 — 仅收集数据，无打分 (for feedback / research)',
      '4. exam: 考试测验 — 标准答案 + 对错判分 (for education / training)',
      '5. report: 外部评测 — 对外部对象打分评价+报告 (for performance reviews / 360 feedback)',
      '6. learn: 学习卡片 — 知识点 + 自测题 (for micro-learning)',
      '',
      '## AFTER SUCCESS — execute modules sequentially via formlm_execute:',
      'The plan is cached server-side (~10 min TTL) — just call formlm_execute with appId and module for each module.',
      'No need to pass the plan JSON back — it is handled automatically.',
      'IMPORTANT: module coverage depends on planType. Only `consultation` plans include the `expert` module;',
      'assessment / exam / report / survey / learn plans do NOT. If the app must have an AI expert, create it',
      'explicitly afterwards with formlm_exec: "assess expert config --app <id> --name ... --role ... --kbText ..."',
      '(otherwise the published page promises an expert the app does not have — silent functional gap).',
      'After the ~10 min cache expires, formlm_execute still works if you pass the plan JSON back via `plan`',
      '(the full plan is returned in this tool\'s output) — re-running this tool would create a NEW app instead.',
      '',
      '## USER FEEDBACK (IMPORTANT for good UX):',
      'After getting the plan, tell the user: "✅ 计划已生成！" and list the modules.',
      'Before each formlm_execute call, tell the user which module is being generated.',
      'After each call, tell the user the module is done.',
      'After the last module (share), the 3 app URLs are returned automatically — present them to the user.',
      '',
      'After all modules are executed, use formlm_doctor to verify quality (and formlm_snapshot for raw state).',
      '',
      '## Reference Documents:',
      'If the user has reference documents (questionnaire files, scoring criteria), ask them to paste the content',
      'directly into the chat. The input supports up to 8000 characters.',
    ].join('\n'),
    inputSchema: {
    input: z.string().describe(
      'Natural language description of the app. Be specific: mention topic, audience, number of questions, dimensions/subscales, scoring, visual style. ' +
      'Example: "A workplace stress assessment for office workers with 3 dimensions (workload, autonomy, support), 15 questions, score 0-60, detailed result interpretation, dark professional style". ' +
      'Supports up to 8000 characters. If user pastes reference documents, include them here.'
    ),
    planType: z.enum(['assessment', 'consultation', 'survey', 'exam', 'report', 'learn']).optional().describe(
      'Plan type. Choose based on user needs: ' +
      '"assessment" (scoring+report, for psych/workplace/health evaluations, MOST COMMON), ' +
      '"consultation" (scoring+report+AI expert chat, for mental health/coaching), ' +
      '"survey" (no scoring, for feedback/research), ' +
      '"exam" (correct-answer scoring, for education/training), ' +
      '"report" (external evaluation/rating of others, for performance reviews), ' +
      '"learn" (knowledge cards + self-test, for micro-learning). ' +
      'Default: auto-detected by Plan AI based on your description.'
    ),
    style: z.string().optional().describe(
      'Visual style preference. Suggested options: "温暖亲切" (warm friendly, for health/care), ' +
      '"正式专业" (formal professional, for workplace/corporate), ' +
      '"简洁直接" (minimal clean, for general use), ' +
      '"轻松活泼" (lively playful, for exam/learn scenarios). ' +
      'Or custom: "深色科技风" / "warm friendly pastel" / "minimal clean white".'
    ),
    questionCount: z.enum(['5-9', '10-15', '15-20', '20-30', '30-50', '50-100']).optional().describe(
      'Target question count range: "5-9" (micro check-in, ~2 min), '
      + '"10-15" (quick screening, 3-5 min), ' +
      '"15-20" (standard assessment, 5-8 min), ' +
      '"20-30" (deep assessment, 8-15 min), ' +
      '"30-50" (facet-level), "50-100" (full inventory). Default: auto-decided by AI based on planType.'
    ),
    dimensions: z.string().optional().describe(
      'PIN the scoring dimensions (names and count) instead of letting the Plan AI invent them — separate with | or ; ' +
      '(e.g. "Natural Finish|Glam Intensity|Editorial|Color Confidence"). Use whenever an external page/ledger already ' +
      'names the dimensions: unpinned dimensions get renamed/recounted by the AI and every dependent page needs rework.'
    ),
    appName: z.string().optional().describe(
      'PIN the app display name (default: chosen by the Plan AI). Use for batch creation when the caller must know the ' +
      'exact name up front to map apps to pages/ledgers.'
    ),
    lang: z.string().optional().describe(
      'BCP-47 language code (e.g. "zh", "zh-hant", "zh-tw", "en", "ja"). Injects an [OUTPUT LANGUAGE] directive ' +
      'that anchors AI output language for the plan AND every module execute. This is the only language entry point ' +
      'on the MCP channel (no Accept-Language header available there) — without it, non-default-language apps drift ' +
      '(e.g. zh-hant apps got Simplified Chinese page names and missed certificate pages). ' +
      'Default: server default (Simplified Chinese).'
    ),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (params) => {
    let cmd = `assess smart plan --input "${escapeArg(params.input)}"`;
    if (params.planType) cmd += ` --plan-type ${params.planType}`;
    if (params.style)    cmd += ` --style "${escapeArg(params.style)}"`;
    if (params.questionCount) cmd += ` --question-count ${params.questionCount}`;
    if (params.dimensions) cmd += ` --dimensions "${escapeArg(params.dimensions)}"`;
    if (params.appName) cmd += ` --app-name "${escapeArg(params.appName)}"`;
    if (params.lang)     cmd += ` --lang ${params.lang}`;
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

  server.registerTool('formlm_execute', {
    title: 'Execute plan module',
    description: [
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
      'Plan is cached server-side (~10 min) after formlm_generate — no need to pass it manually.',
      'Just call formlm_execute with appId and module for each module in sequence.',
      'If you get "Plan not found in server cache", pass the plan JSON from the formlm_generate output into `plan`',
      '— do NOT re-run formlm_generate (that creates a brand-new app).',
      'Success is structured: the response carries appId / module / taskStatus / status(success|error) — trust taskStatus,',
      'not human wording. A retried `scale` execute appends dimensions unless existing ones are cleared first',
      '(formlm_exec: "assess scale clear --app <id>").',
    ].join('\n'),
    inputSchema: {
    appId: z.string().describe('App ID from formlm_generate result'),
    module: z.string().describe('Module to execute: form / scale / connect / report / expert / share'),
    plan: z.string().optional().describe('Full plan JSON (optional — the plan is cached server-side for ~10 min after formlm_generate; pass this only to resume after the cache expired)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (params) => {
    let cmd = `assess smart execute --app ${params.appId} --module ${params.module}`;
    if (params.plan) {
      // Same transport contract as the CLI: plan goes as Base64 in ONE token. Inline JSON is
      // cut apart by the server command preprocessor (task text contains ", assess ..." or ";"),
      // which silently replaces the plan with unrelated sub-commands.
      try {
        cmd += ` --plan-b64 ${Buffer.from(JSON.stringify(JSON.parse(params.plan)), 'utf-8').toString('base64')}`;
      } catch {
        return { content: [{ type: 'text' as const, text: '❌ `plan` is not valid JSON — pass the full plan object returned by formlm_generate (its "plan" field).' }] };
      }
    }
    cmd += ' --json';
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

      // If this is the share module (last one), auto-fetch URLs
      if (params.module === 'share') {
        const urlResult = await execCommand(`assess app urls --app ${params.appId} --json`, undefined, TIMEOUT_DEFAULT);
        if (urlResult.code === 0) {
          try {
            const urls = JSON.parse(urlResult.data || urlResult.message);
            lines.push('');
            lines.push('🎉 All modules complete! Your app is ready:');
            if (urls.shareUrlAbsolute || urls.shareUrl) lines.push(`🔗 Fill-in URL: ${urls.shareUrlAbsolute || urls.shareUrl}`);
            // shareToken is a first-class field server-side; fall back to URL extraction for older servers
            const token = urls.shareToken || shareTokenFromUrl(urls.shareUrl);
            if (token) lines.push(`🔑 ShareToken:   ${token}`);
            if (urls.shareType) lines.push(`🌐 Access type:  ${urls.shareType}${urls.shareDay >= 3650000 ? ' (permanent)' : ''}${urls.shareType === 'all' ? ' — requires login!' : ''}`);
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
        lines.push('Next: Call formlm_execute with the next module (plan is cached server-side).');
      }

      text = lines.join('\n');
    } catch {
      text = raw || r.message;
    }

    return { content: [{ type: 'text' as const, text }] };
  });

  // ── Tier 2: State & Knowledge ────────────────────────────────────

  server.registerTool('formlm_snapshot', {
    title: 'App state snapshot',
    description: [
      'Get aggregated snapshot of ALL 6 app modules in a single call.',
      'Returns: form fields, scale dimensions+ranges, connect page styles, report pages+widgets, expert config, share status.',
      '',
      'Call this BEFORE making changes to understand what already exists.',
      'Call this AFTER formlm_generate to verify the generated app.',
      '',
      'Prefer summary=true for batch audits / consistency checks: it returns a compact profile',
      '(appName, fieldCount, questionCount, dimCount+dimNames, reportPageCount+reportPages,',
      'styled, expertEnabled/expertHasContent, share.type/perm/day/forever/shareToken) instead of',
      'the full module payloads, so you do not have to parse widget layoutData or markdown tables.',
      'If any module fetch fails the result carries _errors/_degraded — treat it as UNKNOWN, not as "empty module".',
    ].join('\n'),
    inputSchema: {
    appId: z.string().describe('App ID'),
    module: z.string().optional().describe('Get only one module: form / scale / connect / report / expert / share (default: all 6)'),
    summary: z.boolean().optional().describe('Return the compact audit profile instead of full module payloads (recommended for batch verification)'),
    },
    outputSchema: {
      mode: z.enum(['full', 'summary']),
      data: z.unknown(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async (params) => {
    const validModules = ['form', 'scale', 'connect', 'report', 'expert', 'share'];
    const modules = params.module ? [params.module] : validModules;
    // Validate module name early — prevent silent empty results
    if (params.module && !validModules.includes(params.module)) {
      const text = `❌ Invalid module "${params.module}". Valid: ${validModules.join(', ')}`;
      return { content: [{ type: 'text' as const, text }], structuredContent: { mode: 'full' as const, data: { error: text } } };
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
    // App title is not part of any module payload — fetch it in parallel for name↔page audits
    const [results, appResult] = await Promise.all([
      Promise.all(
        entries.map((m) => execCommand(commands[m], undefined, TIMEOUT_DEFAULT).then((r) => [m, r] as const))
      ),
      execCommand(`assess app use --app ${params.appId} --json`, undefined, TIMEOUT_DEFAULT),
    ]);

    let appName = '';
    if (appResult.code === 0 && appResult.data) {
      try { appName = (typeof appResult.data === 'string' ? JSON.parse(appResult.data) : appResult.data)?.name || ''; } catch {}
    }

    const snapshot: Record<string, unknown> = { appId: params.appId, appName: appName || null };
    const errors: string[] = [];
    const parsedMods: Record<string, any> = {};

    for (const [module, result] of results) {
      if (result.code === 0) {
        // All modules now use --json, so parse uniformly
        try { snapshot[module] = JSON.parse(result.data); parsedMods[module] = snapshot[module]; }
        catch { snapshot[module] = result.data || result.message; parsedMods[module] = null; }
      } else {
        // Partial-failure visibility so auditors never read a fetch error as "module is empty"
        snapshot[module] = null;
        snapshot['_degraded'] = true;
        errors.push(`${module}: [${result.code}] ${result.message}`);
      }
    }

    if (errors.length > 0) snapshot['_errors'] = errors;

    if (params.summary) {
      const summary = buildSummary(params.appId, appName, parsedMods);
      if (errors.length > 0) {
        summary['_errors'] = errors;
        summary['_degraded'] = true;
        // Zero counts from a failed read are UNKNOWNS — say so, or batch auditors report
        // "app has 0 fields / not published" for apps that were simply unreachable.
        if (Object.values(parsedMods).every(v => v === null)) {
          summary['_note'] = 'All module reads failed — the zero counts are UNKNOWNS, not empty state. Retry before concluding.';
        }
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(summary) }], structuredContent: { mode: 'summary', data: summary } };
    }

    return { content: [{ type: 'text' as const, text: JSON.stringify(snapshot, null, 2) }], structuredContent: { mode: 'full', data: snapshot } };
  });

  server.registerTool('formlm_doctor', {
    title: 'Quality audit (read-only)',
    description: [
      'Read-only quality inspection of ONE app — the fastest way to verify a generated app before wiring it into a page.',
      'Returns {ok, failCount, warnCount, summary, findings[]} where each finding is {name, level(pass|warn|fail), detail, fix?}.',
      '',
      'Checks: content/scoring coverage, expert enabled-but-empty or referenced-but-missing (dead AI assistant),',
      'styling applied, dimensions without report pages, unexpected certificate page, share access semantics',
      '(type=all/owner = login required — anonymous respondents get the login page, NOT the form), link expiry,',
      'and fill-in URL reachability.',
      'Set expectLang (e.g. "en", "zh-hant") to catch text written in the wrong script — the classic batch defect',
      'where an English app ends up with Chinese certificate/report boilerplate. Use deep=true to also scan report',
      'widget BODY text (extra queries; titles/labels are always scanned).',
      '',
      'Read-only: this tool never writes. Apply the returned `fix` commands via formlm_exec.',
    ].join('\n'),
    inputSchema: {
    appId: z.string().describe('App ID'),
    expectLang: z.string().optional().describe('BCP-47 expected language, e.g. "en" / "zh" / "zh-hant" / "ja". Enables the script-consistency scan.'),
    deep: z.boolean().optional().describe('Also fetch and scan report widget body text (slower, more accurate language check)'),
    probe: z.boolean().optional().describe('Probe the fill-in URL for reachability (default true)'),
    },
    outputSchema: {
      ok: z.boolean(),
      message: z.string(),
      appId: z.string().optional(),
      failCount: z.number().optional(),
      warnCount: z.number().optional(),
      findings: z.array(z.object({
        name: z.string(),
        level: z.enum(['pass', 'warn', 'fail']),
        detail: z.string(),
        fix: z.string().optional(),
      })).optional(),
      summary: z.unknown().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async (params) => {
    if (params.expectLang && !isValidLangCode(params.expectLang)) {
      const text = `❌ Invalid expectLang "${params.expectLang}". Use a BCP-47 code like en / zh / zh-hant / ja.`;
      return { content: [{ type: 'text' as const, text }], structuredContent: { ok: false, message: text, appId: params.appId } };
    }
    const report = await runDoctor(params.appId, {
      expectLang: params.expectLang,
      deep: !!params.deep,
      probe: params.probe !== false,
    });
    const lines: string[] = [];
    lines.push(report.ok
      ? `✅ Doctor passed (${report.warnCount} warning(s)) — ${report.appName || report.appId}`
      : `❌ Doctor found ${report.failCount} blocking issue(s), ${report.warnCount} warning(s) — ${report.appName || report.appId}`);
    for (const f of report.findings) {
      const icon = f.level === 'pass' ? '✅' : f.level === 'warn' ? '⚠️ ' : '❌';
      lines.push(`${icon} ${f.name}: ${f.detail}`);
      if (f.fix) lines.push(`    ↳ fix: ${f.fix}`);
    }
    lines.push('');
    lines.push('Compact summary: ' + JSON.stringify(report.summary));
    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
      structuredContent: {
        ok: report.ok,
        message: lines.join('\n'),
        appId: report.appId,
        failCount: report.failCount,
        warnCount: report.warnCount,
        findings: report.findings,
        summary: report.summary,
      },
    };
  });

  server.registerTool('formlm_skill', {
    title: 'Domain knowledge doc',
    description: [
      'Get the full SKILL.md domain knowledge for a specific skill module.',
      'Same documents that AssessAgent loads internally — contains P0/P1/P2 constraints, parameter rules, examples.',
      '',
      'You can also read these via MCP resources: formlm://skills/<skillId>',
      'READ the relevant skill BEFORE constructing formlm_exec commands manually.',
    ].join('\n'),
    inputSchema: {
    skillId: z.string().describe('Skill ID: form / scale / connect / report / expert / share'),
    },
    outputSchema: {
      skillId: z.string(),
      markdown: z.string(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async (params) => {
    const valid = ['form', 'scale', 'connect', 'report', 'expert', 'share'];
    if (!valid.includes(params.skillId)) {
      const text = `❌ Invalid skill ID. Valid: ${valid.join(', ')}`;
      return { content: [{ type: 'text' as const, text }], structuredContent: { skillId: params.skillId, markdown: text } };
    }
    const r = await execCommand(`assess skill ${params.skillId}`, undefined, TIMEOUT_DEFAULT);
    const text = toText(r);
    return { content: [{ type: 'text' as const, text }], structuredContent: { skillId: params.skillId, markdown: text } };
  });

  // ── Tier 3: Direct Execution (Advanced) ──────────────────────────
  //
  // Whitelisted commands — server granularity is 3 tokens (McpV1Api.ALLOWED_SUBCOMMANDS):
  //   assess app    : list / create / use / current / update / remove / urls
  //   assess form   : query / find / types / config / add / update / remove / move / set-property
  //   assess scale  : query / find / add / update / set / remove / clear / config / keys / data
  //   assess connect: query / find / types / config / cover-page / final-page / main-page / style
  //   assess report : query / find / update / page / widget (widget carries the `logic` sub-command)
  //   assess expert : query / find / config / set / avatar / remove / chat
  //   assess share  : set / query / url / api / flavor
  //   assess smart  : plan / execute
  //   assess skill  : form / scale / connect / report / expert / share
  // NOTE: `snapshot` and `field ...` are CLIENT-side synthesized CLI commands (they fan out
  // to `assess <module> query`), so "assess snapshot" / "assess field list" are not on this
  // channel and return 403 by design — use the formlm_snapshot tool or the module queries.

  server.registerTool('formlm_exec', {
    title: 'Run FormLM CLI command',
    description: [
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
      'Whitelisted commands (3-token granularity; anything else returns 403):',
      '  App:     assess app list/create/use/current/update/remove/urls',
      '  Form:    assess form query/find/types/config/add/update/remove/move/set-property',
      '  Scale:   assess scale query/find/add/update/set/remove/clear/config/keys/data',
      '  Connect: assess connect query/find/types/config/cover-page/final-page/main-page/style',
      '  Report:  assess report query/find/update/page/widget  (conditional rules: assess report widget logic add/list/remove)',
      '  Expert:  assess expert query/find/config/set/avatar/remove/chat',
      '  Share:   assess share set/query/url/api/flavor',
      '  Smart:   assess smart plan/execute',
      '  Skill:   assess skill form/scale/connect/report/expert/share',
      '  NOT available here: assess snapshot / assess field * (CLI-only wrappers of the module queries)',
      '',
      'Common patterns:',
      '  "assess app list --all --with-urls --json"                                                     (full inventory incl. shareToken per app)',
      '  "assess app urls --app <id> --json"                                                            (URLs + published/shareType/shareToken)',
      '  "assess form add --app <id> --id q1 --name \\"Name\\" --type radio --options \\"A:1,B:2,C:3\\" --json"',
      '  "assess scale add --app <id> --id stress --name \\"Stress\\" --format sum --kbText \\"...\\" --json"',
      '  "assess scale keys add --app <id> --scale stress --fields X1,X2,X3 --json"',
      '  "assess scale data add --app <id> --scale stress --bands \\"Normal:desc||Mild:desc||Severe:desc\\" --json"  (recommended: server auto-computes even boundaries + 999 sentinel)',
      '  "assess scale data add --app <id> --scale stress --ranges \\"0-7:Normal,8-14:Mild,15-21:Severe\\" --json"    (manual boundaries; only for non-even knowledge-specified thresholds)',
      '  "assess share set --app <id> --form-type visitor --form-perm 1 --form-day 0 --json"   (anonymous + permanent)',
      '  "assess share set --app <id> --form-type all --form-perm 1 --json"                    (logged-in users only)',
      '  "assess share query --app <id> --json"                                                (verify type/perm/day triple)',
      '  "assess expert config --app <id> --name \\"...\\" --role \\"...\\" --kbText \\"...\\" --json"  (adds + enables an expert; --name/--kbText required)',
      '  "assess expert set --app <id> --property enable --value false --json"                 (single-property toggle)',
      '  "assess connect style apply-all --app <id> --look \\"心理健康评估，温暖治愈风格\\" --theme minimalist --json"  (AI style, takes 30-120s)',
      '  "assess app remove --app <id> --json"                                                        (IRREVERSIBLE — confirm first, see SAFETY above)',
    ].join('\n'),
    inputSchema: {
    command: z.string().describe(
      'Full CLI command starting with "assess". Do NOT include the "formlm-cli" prefix. ' +
      'Add --json flag for structured output. Escape inner quotes with \\".'
    ),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
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
  console.error(`FormLM MCP Server v${VERSION} running on stdio (10 tools + 6 resources)`);
}
