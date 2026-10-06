import { Command, Option } from 'commander';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execCommand } from '../exec.js';
import { output, guidance, localFail, isJsonMode } from '../output.js';
import { escapeArg, absHttpsUrl } from '../utils.js';
import { getBaseUrl } from '../config.js';
import { shareTokenFromUrl } from '../summary.js';
import { runDoctor, isValidLangCode } from '../doctor.js';

/**
 * Smart Pipeline Commands
 *
 * Wraps the server-side AssessAgent intelligent pipeline:
 * - smart plan: AssessAgent.plan() only — generate execution plan + appId
 * - smart execute: execute a single module (form/scale/connect/report/expert/share)
 * - smart generate: the resumable one-shot convenience over plan + execute×modules
 *   (optionally publish + run the quality doctor)
 *
 * This is the RECOMMENDED entry point for AI agents (works with any MCP-compatible
 * platform: Claude / Cursor / Codex CLI / Windsurf / etc., or direct CLI usage)
 * because it embeds the full SKILL.md domain knowledge, reference data injection,
 * and multi-step orchestration that newapp.html uses internally.
 *
 * Long batches: prefer plan + execute (per-module resumability). `generate` is the
 * sugar for "build me one app now"; it reports each module's structured status and
 * honours FORMLM_NO_EXIT so a driver loop survives a partial run.
 */

// ── Timeouts ──────────────────────────────────────────────────────────────────
// Must match mcp.ts constants to ensure CLI and MCP Server have identical behavior.
// All overridable via FORMLM_TIMEOUT_PLAN / FORMLM_TIMEOUT_EXECUTE / FORMLM_TIMEOUT_STYLE (ms).
const TIMEOUT_PLAN = Number(process.env.FORMLM_TIMEOUT_PLAN) || 120_000;    // 2min for smart plan (Phase 1 only, ~10-30s)
const TIMEOUT_EXECUTE = Number(process.env.FORMLM_TIMEOUT_EXECUTE) || 300_000; // 5min for smart execute (single module, ~30-120s)
const TIMEOUT_STYLE = Number(process.env.FORMLM_TIMEOUT_STYLE) || 600_000;   // 10min for connect style apply-all
const FOREVER = 3650000; // server "permanent" sentinel for share day
const MODULE_ORDER = ['form', 'scale', 'connect', 'report', 'expert', 'share'];

function parseJson(data: any): any {
  if (data === null || data === undefined) return null;
  if (typeof data !== 'string') return data;
  try { return JSON.parse(data); } catch { return null; }
}

// ── Core: plan ────────────────────────────────────────────────────────────────
interface PlanArgs {
  input: string;
  planType?: string;
  style?: string;
  questionCount?: string;
  lang?: string;
  dimensions?: string;
  appName?: string;
  savePlan?: string;
  dryRun?: boolean;
}

/**
 * Run `assess smart plan` and return the exec result plus the parsed payload.
 * On --dry-run the created probe app is deleted again immediately: the server has no
 * plan-without-app mode, and this is the documented way to validate a prompt/spec
 * without leaving residue in the account.
 */
async function runPlan(args: PlanArgs): Promise<{ result: any; parsed: any }> {
  let cmd = `assess smart plan --input "${escapeArg(args.input)}"`;
  if (args.planType) cmd += ` --plan-type ${args.planType}`;
  if (args.style) cmd += ` --style "${escapeArg(args.style)}"`;
  if (args.questionCount) cmd += ` --question-count ${args.questionCount}`;
  if (args.lang) cmd += ` --lang ${args.lang}`;
  if (args.dimensions) cmd += ` --dimensions "${escapeArg(args.dimensions)}"`;
  if (args.appName) cmd += ` --app-name "${escapeArg(args.appName)}"`;
  cmd += ' --json';

  const result = await execCommand(cmd, undefined, TIMEOUT_PLAN);
  const parsed = result.code === 0 ? parseJson(result.data) : null;

  if (result.code === 0 && parsed?.appId && args.dryRun) {
    const removed = await execCommand(`assess app remove --app ${parsed.appId} --json`);
    guidance(`🧪 --dry-run: probe app ${parsed.appId} was ${removed.code === 0 ? 'deleted again' : 'NOT deleted (cleanup failed: ' + removed.message + ')'}`);
  } else if (result.code === 0 && parsed?.appId && args.savePlan) {
    writePlanFile(args.savePlan, parsed);
  }
  return { result, parsed };
}

/** Persist the full AssessPlan JSON (envelope carries it stringified in data.plan). */
function writePlanFile(file: string, parsed: any): string {
  try {
    const fullPlan = typeof parsed?.plan === 'string' ? parsed.plan : JSON.stringify(parsed?.plan ?? parsed);
    fs.writeFileSync(file, fullPlan);
    guidance(`💾 Full plan JSON saved to: ${file}`);
    return file;
  } catch (e: any) {
    guidance(`⚠️ Could not write the plan file "${file}": ${e?.message || e} — resume will need --plan <inline JSON> instead.`);
    return '';
  }
}

/**
 * Map a requested validity to the server --form-day value.
 * Server rule: only 1..30 stay finite; anything else is the permanent sentinel.
 * Returns null for an unusable input (non-numeric / negative).
 */
function mapDays(raw: string | number | undefined): { days: number; normalized: boolean } | null {
  if (raw === undefined || raw === null || raw === '') return { days: FOREVER, normalized: false };
  const s = String(raw).trim().toLowerCase();
  if (s === 'forever') return { days: FOREVER, normalized: false };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n === 0) return { days: FOREVER, normalized: false };   // explicit permanent, no notice
  if (n > 30) return { days: FOREVER, normalized: true };      // server cannot express >30
  return { days: Math.floor(n), normalized: false };
}

// ── Core: execute one module ──────────────────────────────────────────────────
interface ExecuteArgs {
  app: string;
  module: string;
  plan?: string;
  planFile?: string;
  clearFirst?: boolean;
}

async function runExecute(args: ExecuteArgs): Promise<any> {
  if (args.clearFirst && args.module !== 'scale') {
    localFail('--clear-first is only supported for --module scale (other modules are already idempotent or have no clear command).');
  }
  if (args.clearFirst) {
    const cleared = await execCommand(`assess scale clear --app ${args.app} --json`);
    if (cleared.code !== 0) {
      localFail(`--clear-first could not clear scale dimensions: [${cleared.code}] ${cleared.message}`);
    }
    guidance('🧹 Existing scale dimensions cleared (--clear-first).');
  }

  let cmd = `assess smart execute --app ${args.app} --module ${args.module}`;
  let planJson = args.plan;
  if (args.planFile) {
    try {
      planJson = fs.readFileSync(args.planFile, 'utf-8');
    } catch (e: any) {
      localFail(`--plan-file unreadable: ${e?.message || e}`);
    }
  }
  if (planJson) {
    // Transport contract: the plan travels as Base64 in ONE argv token (--plan-b64).
    // Inline JSON is NOT safe on this channel — the server's command preprocessing
    // (CliServiceImpl.splitBatchCommands / splitBySemicolon / quote normalisation)
    // cuts the payload at every `, assess …` / `;` / quote inside task text, so the
    // plan silently degenerates into unrelated sub-commands (measured live).
    // Base64 contains no spaces, quotes, commas or semicolons, so it survives intact.
    let encoded: string;
    try {
      encoded = Buffer.from(JSON.stringify(JSON.parse(planJson)), 'utf-8').toString('base64');
    } catch {
      localFail('--plan value is not valid JSON (check the file written by smart plan --save-plan).');
      return undefined as never;
    }
    cmd += ` --plan-b64 ${encoded}`;
  }
  cmd += ' --json';
  // Style generation is the slowest module — give connect its own budget.
  const timeout = args.module === 'connect' ? TIMEOUT_STYLE : TIMEOUT_EXECUTE;
  return execCommand(cmd, undefined, timeout);
}

export function registerSmartCommand(parent: Command): void {
  const smart = parent.command('smart').description('Intelligent pipeline — natural language to live app (recommended for AI agents). Steps: smart plan → smart execute per module; "smart generate" is the one-shot wrapper of those steps.');

  // ── smart plan ───────────────────────────────────────────────

  smart
    .command('plan')
    .description('Generate execution plan only (Phase 1). Returns plan JSON + appId. Then run smart execute for each module (plan cached server-side ~10min). Tip: --save-plan keeps the plan on disk so execute can still resume after the cache expires.')
    .requiredOption('--input <text>', 'Natural language description of the app you want to build')
    .addOption(new Option('--plan-type <type>', 'Plan type').choices(['assessment', 'consultation', 'survey', 'exam', 'report', 'learn']))
    .option('--style <style>', 'Visual style preference')
    .addOption(new Option('--question-count <count>', 'Question count range').choices(['5-9', '10-15', '15-20', '20-30', '30-50', '50-100']))
    .option('--lang <lang>', 'BCP-47 language code (e.g. zh / zh-hant / zh-tw / en / ja). Injects an [OUTPUT LANGUAGE] directive that anchors AI output language for the plan AND every module execute — the only language entry point on the CLI/MCP channel (no Accept-Language header available there)')
    .option('--dimensions <names>', 'Pin scoring dimensions (pipe/semicolon separated, e.g. "Natural Finish|Glam|Editorial"). The plan AI must keep these exact names and count — use when an external page/ledger already defines them')
    .option('--app-name <name>', 'Pin the app display name (default: Plan AI chooses). Use when the name must match a ledger/page exactly')
    .option('--save-plan <file>', 'Also write the full plan JSON to this file (for smart execute --plan-file after the server cache expires)')
    .option('--dry-run', 'Validate the prompt/spec and return the would-be plan, then delete the probe app again (the server always creates an app when planning; this cleans it up so probing leaves no residue)')
    .action(async (opts) => {
      const { result, parsed } = await runPlan(opts);
      output(result);

      // ── Next Steps guidance (stderr-friendly via guidance()) ──────
      if (result.code === 0 && parsed?.appId) {
        const modules = (parsed.tasks || []).map((t: any) => t.skill);
        if (opts.dryRun) {
          guidance('');
          guidance('💡 --dry-run: the probe app above was deleted. Re-run without --dry-run to keep it and execute the modules.');
          return;
        }
        guidance('');
        guidance('💡 Next steps — execute modules sequentially (plan cached server-side ~10min, no --plan needed; after expiry use --plan-file):');
        for (const m of modules) {
          guidance(`   formlm-cli smart execute --app ${parsed.appId} --module ${m}`);
        }
        guidance(`   One-shot:  formlm-cli smart generate --input "<same description>" --publish`);
        // Plan-type coverage is not universal: only consultation plans include `expert`.
        // Surface what is missing so callers don't ship pages promising an AI expert
        // that the app does not have (silent exam/assessment gap seen in batch runs).
        const missing = MODULE_ORDER.filter(m => !modules.includes(m));
        if (missing.length > 0) {
          guidance(`   ⚠️ Plan does NOT include: ${missing.join(', ')} — smart execute for these will report "No task found".`);
          if (missing.includes('expert')) {
            guidance(`      Add an expert deterministically: formlm-cli expert config --app ${parsed.appId} --name "..." --role "..." --kbText "..." --enable true`);
          }
        }
        guidance(`   Snapshot:  formlm-cli snapshot --app ${parsed.appId} --summary`);
      }
    });

  // ── smart execute ────────────────────────────────────────────

  smart
    .command('execute')
    .description('Execute a single module from the plan. Plan is cached server-side (~10min) after smart plan — no --plan needed. After the cache expires, resume an EXISTING app with --plan-file <saved plan JSON> (or --plan <inline JSON>). Each module completes within ~60s.')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--module <name>', `Module: ${MODULE_ORDER.join(' / ')}`)
    .option('--plan <json>', 'Plan JSON inline (fallback when the server cache expired; transmitted Base64-safe as --plan-b64)')
    .option('--plan-file <file>', 'Plan JSON file (written by smart plan --save-plan) — fallback when server cache expired')
    .option('--clear-first', 'For module=scale only: clear existing dimensions before executing, so a retried run REPLACES instead of appending duplicate dimensions')
    .action(async (opts) => {
      const result = await runExecute(opts);
      output(result);

      // ── Structured success signal + Next Steps guidance ──────
      // (script callers should trust data.taskStatus/status, not human text)
      const parsed = result.code === 0 ? parseJson(result.data) : null;
      if (parsed?.appId) {
        if (parsed.taskStatus === 'error') {
          guidance(`⚠️ Module '${opts.module}' ended with status=error: ${parsed.error || 'see output'}`);
        }
        const nextModule = MODULE_ORDER[MODULE_ORDER.indexOf(opts.module) + 1];
        guidance('');
        guidance('💡 Next steps:');
        if (nextModule) {
          guidance(`   Execute next: formlm-cli smart execute --app ${parsed.appId} --module ${nextModule}`);
        } else {
          guidance(`   ✅ All modules done!`);
          guidance(`   Verify:    formlm-cli doctor --app ${parsed.appId}`);
          guidance(`   Publish:   formlm-cli share publish --app ${parsed.appId}`);
          guidance(`   Snapshot:  formlm-cli snapshot --app ${parsed.appId} --summary`);
        }
      }
    });

  // ── smart generate ───────────────────────────────────────────

  smart
    .command('generate')
    .description(
      'One-shot convenience over the pipeline: plan → execute every planned module in order → (optional) publish → (optional) doctor. ' +
      'Progress and per-module status go to stderr under --json so stdout stays one parseable envelope; the saved plan path is reported for --plan-file resume if a module fails midway. ' +
      'For full resumability/observability prefer explicit plan + execute; this is the short path.'
    )
    .requiredOption('--input <text>', 'Natural language description of the app you want to build')
    .addOption(new Option('--plan-type <type>', 'Plan type').choices(['assessment', 'consultation', 'survey', 'exam', 'report', 'learn']))
    .option('--style <style>', 'Visual style preference')
    .addOption(new Option('--question-count <count>', 'Question count range').choices(['5-9', '10-15', '15-20', '20-30', '30-50', '50-100']))
    .option('--lang <lang>', 'BCP-47 language code (e.g. zh / zh-hant / en / ja) — anchors the AI output language for the plan and every module')
    .option('--dimensions <names>', 'Pin scoring dimensions (pipe/semicolon separated) so generated dimensions match an existing page/ledger')
    .option('--app-name <name>', 'Pin the app display name')
    .option('--save-plan <file>', 'Where to write the full plan JSON (default: auto-named next to the profile dir). Reported on failure for --plan-file resume')
    .option('--only <modules>', 'Execute only these modules (comma-separated subset of ' + MODULE_ORDER.join('/') + ')')
    .option('--skip <modules>', 'Skip these modules (comma-separated)')
    .option('--publish', 'After all modules, publish the app for anonymous access (share publish --access visitor) and return the fill-in URL + shareToken')
    .option('--access <type>', 'With --publish: visitor (default, anonymous) / all (requires login) / secret (password)', 'visitor')
    .option('--days <n>', 'With --publish: validity in days (1-30), or 0/forever (default)', 'forever')
    .option('--doctor', 'After generating, run the read-only quality audit and include its findings in the result')
    .action(async (opts) => {
      const only = opts.only ? String(opts.only).split(',').map((m: string) => m.trim()).filter(Boolean) : null;
      const skip = opts.skip ? String(opts.skip).split(',').map((m: string) => m.trim()).filter(Boolean) : [];
      for (const m of [...(only || []), ...skip]) {
        if (!MODULE_ORDER.includes(m)) localFail(`Invalid module "${m}". Valid: ${MODULE_ORDER.join(', ')}`);
      }
      if (opts.access && !['visitor', 'all', 'secret', 'owner', 'no'].includes(String(opts.access).trim())) {
        localFail(`Invalid --access "${opts.access}". Valid: visitor / all / secret / owner / no.`);
      }

      // ── Phase 1: plan (always keep a plan file for resume) ──────
      const { result: planResult, parsed: plan } = await runPlan({ ...opts, savePlan: opts.savePlan });
      if (planResult.code !== 0 || !plan?.appId) {
        output(planResult);
        return;
      }
      const appId: string = plan.appId;
      const savePlan = opts.savePlan
        ? String(opts.savePlan)
        : (writePlanFile(path.join(os.tmpdir(), `formlm-plan-${appId}.json`), plan) || '');
      const planned: string[] = (plan.tasks || []).map((t: any) => t.skill);
      const modules = (only || planned).filter(m => MODULE_ORDER.includes(m) && !skip.includes(m));
      guidance(`📋 Plan ready — appId=${appId}, type=${plan.planType || '?'}, tasks=${planned.join(' → ') || '(none)'}`);
      if (savePlan) guidance(`↩️  Resume any module later with: formlm-cli smart execute --app ${appId} --module <m> --plan-file ${savePlan}`);
      const missing = MODULE_ORDER.filter(m => !planned.includes(m));
      if (missing.length > 0) guidance(`ℹ️  Not covered by this plan: ${missing.join(', ')}${missing.includes('expert') ? ' (add later with: formlm-cli expert config --app ' + appId + ' ...)' : ''}`);

      // ── Phase 2: execute modules sequentially ──────────────────
      const moduleResults: any[] = [];
      let failedAt: string | null = null;
      for (const m of modules) {
        guidance(`⏳ Generating module: ${m} (30-120s, do not cancel)…`);
        const r = await runExecute({ app: appId, module: m });
        const p = r.code === 0 ? parseJson(r.data) : null;
        const status = r.code !== 0 ? 'error' : (p?.taskStatus === 'error' ? 'error' : 'success');
        moduleResults.push({
          module: m,
          status,
          code: r.code,
          error: r.code !== 0 ? r.message : (p?.error ?? null),
        });
        guidance(`${status === 'success' ? '✅' : '❌'} ${m}: ${status}${status !== 'success' ? ' — ' + (r.code !== 0 ? r.message : (p?.error || 'see output')) : ''}`);
        if (status !== 'success') {
          failedAt = m;
          guidance(`⏸️  Stopped at module '${m}'. Fix the cause, then resume WITHOUT re-creating the app:`);
          guidance(`   formlm-cli smart execute --app ${appId} --module ${m} --plan-file ${savePlan}`);
          guidance(`   formlm-cli smart execute --app ${appId} --module <next> --plan-file ${savePlan}`);
          break;
        }
      }

      // ── Phase 3: optional publish ─────────────────────────────
      let publish: any = null;
      if (!failedAt && opts.publish) {
        const mapped = mapDays(opts.days);
        if (!mapped) {
          localFail(`Invalid --days "${opts.days}". Use 1-30, or 0/forever for permanent.`);
        }
        const day = mapped!.days;
        if (mapped!.normalized) {
          guidance(`ℹ️  --days ${opts.days} normalized to permanent (the server only honours finite windows of 1..30 days).`);
        }
        guidance('🚀 Publishing…');
        const pub = await execCommand(`assess share set --app ${appId} --form-type ${opts.access} --form-perm 1 --form-day ${day} --json`);
        const urlsRes = pub.code === 0 ? await execCommand(`assess app urls --app ${appId} --json`) : null;
        const urls = urlsRes && urlsRes.code === 0 ? parseJson(urlsRes.data) : null;
        const fillAbs = urls?.shareUrlAbsolute || absHttpsUrl(getBaseUrl(), urls?.shareUrl || '');
        publish = {
          ok: pub.code === 0,
          access: opts.access,
          days: day,
          shareUrl: urls?.shareUrl ?? null,
          shareUrlAbsolute: fillAbs || null,
          shareToken: urls?.shareToken || shareTokenFromUrl(urls?.shareUrl || ''),
          error: pub.code === 0 ? null : pub.message,
        };
        guidance(`${publish.ok ? '✅' : '❌'} Published (access=${opts.access}, ${day === FOREVER ? 'permanent' : day + ' day(s)'})${publish.ok ? ' → ' + (fillAbs || '(no url)') : ' — ' + publish.error}`);
      }

      // ── Phase 4: optional doctor ──────────────────────────────
      let doctor: any = null;
      if (!failedAt && opts.doctor) {
        const expectLang = opts.lang && isValidLangCode(String(opts.lang)) ? String(opts.lang) : undefined;
        if (opts.lang && !expectLang) guidance(`⚠️ --lang "${opts.lang}" is not a BCP-47 code — skipping the doctor language check (other checks still run).`);
        guidance('🩺 Running the read-only quality audit (doctor)…');
        doctor = await runDoctor(appId, { expectLang, deep: false, probe: !!opts.publish });
      }

      const ok = !failedAt && (!publish || publish.ok) && (!doctor || doctor.ok);
      const payload = {
        appId,
        appName: plan.name ?? (opts.appName || null),
        planType: plan.planType ?? null,
        ok,
        modules: moduleResults,
        skipped: skip,
        notInPlan: missing,
        failedAt,
        resumeHint: failedAt
          ? (savePlan
            ? `formlm-cli smart execute --app ${appId} --module ${failedAt} --plan-file ${savePlan}`
            : `formlm-cli smart execute --app ${appId} --module ${failedAt} (plan may still be cached server-side; re-plan is NOT an option — it creates a new app)`)
          : null,
        planFile: savePlan,
        publish,
        doctor: doctor ? {
          ok: doctor.ok,
          failCount: doctor.failCount,
          warnCount: doctor.warnCount,
          findings: doctor.findings,
        } : null,
      };
      const message = failedAt
        ? `stopped at module '${failedAt}'`
        : (publish && !publish.ok ? `published failed: ${publish.error}`
          : (doctor && !doctor.ok ? `doctor found ${doctor.failCount} blocking issue(s)` : 'ok'));
      output({ code: ok ? 0 : 400, message, data: JSON.stringify(payload) });
      if (!isJsonMode() && !ok) {
        // output() already printed the failure line; keep the resume hint visible on stdout too
        console.log(failedAt ? `Resume: ${payload.resumeHint}` : `Doctor: formlm-cli doctor --app ${appId}`);
      }
    });
}
