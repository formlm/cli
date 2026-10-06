import { Command } from 'commander';
import { execCommand } from '../exec.js';
import { output, localFail, isJsonMode, guidance } from '../output.js';
import { asArray, buildSummary } from '../summary.js';

/**
 * Snapshot Command — Aggregated App State Query
 *
 * Fetches the current state of ALL 6 modules (form, scale, connect, report, expert, share)
 * in a single command, returning a unified JSON snapshot. This is the equivalent of
 * newapp.html's "reference data injection" step — it gives the AI agent full context
 * about the current app state before generating modification commands.
 *
 * By default, all modules use --json for consistent structured output.
 * Use --md to switch to markdown format (token-efficient for AI consumption).
 * Use --summary for a compact machine-checkable profile (field/question/dimension counts,
 * report pages, expert/share state, styled flag) — the right tool for batch audits.
 * Use --apps id1,id2 to read a batch inside one process (no per-app Node cold start).
 *
 * NOTE: this command is CLIENT-SYNTHESIZED (6 parallel `assess <module> query` calls over
 * the exec channel). There is no server-side `assess snapshot`, so raw POST /api/v1/mcp/exec
 * with "assess snapshot ..." is expected to be rejected (403) — loop the 6 queries instead.
 */

const VALID_MODULES = ['form', 'scale', 'connect', 'report', 'expert', 'share'];

interface CollectOpts {
  module?: string;
  md?: boolean;
  summary?: boolean;
  withValues?: boolean;
}

interface Collected {
  snapshot: Record<string, unknown>;
  appName: string;
  parsedMods: Record<string, any>;
  errors: string[];
}

/** Read the requested modules (+ app title) for one app and assemble the snapshot. */
async function collect(appId: string, opts: CollectOpts): Promise<Collected> {
  const modules = opts.module ? [opts.module] : VALID_MODULES;
  const format = opts.md && !opts.summary ? '--md' : '--json';

  const commands: Record<string, string> = {
    form: `assess form query --app ${appId} ${format}`,
    scale: `assess scale query --app ${appId} ${format}`,
    connect: `assess connect query --app ${appId} ${format}`,
    report: `assess report query --app ${appId} ${format}`,
    expert: `assess expert query --app ${appId} ${format}`,
    share: `assess share query --app ${appId} ${format}`,
  };

  // App title is not part of any module payload — fetch it once in parallel
  // (assess app use returns {appId,name,description,type}) so page↔app name audits work.
  const [execResults, appResult] = await Promise.all([
    Promise.all(modules.map((m) => execCommand(commands[m]).then((r) => [m, r] as const))),
    execCommand(`assess app use --app ${appId} --json`),
  ]);

  let appName = '';
  if (appResult.code === 0 && appResult.data) {
    try { appName = (typeof appResult.data === 'string' ? JSON.parse(appResult.data) : appResult.data)?.name || ''; } catch {}
  }

  const snapshot: Record<string, unknown> = { appId, appName: appName || null };
  const errors: string[] = [];
  const parsedMods: Record<string, any> = {};

  for (const [module, result] of execResults) {
    if (result.code === 0) {
      if (!opts.md) {
        try {
          snapshot[module] = JSON.parse(result.data);
          parsedMods[module] = snapshot[module];
        } catch {
          snapshot[module] = result.data || result.message;
          parsedMods[module] = null;
        }
      } else {
        snapshot[module] = result.data || result.message;
      }
    } else {
      // Partial-failure visibility: mark degraded instead of a bare null that
      // batch auditors misread as "module exists but empty".
      snapshot[module] = null;
      snapshot['_degraded'] = true;
      errors.push(`${module}: [${result.code}] ${result.message}`);
    }
  }

  // Optional deep-fill: widget values per report page (the compact report query omits value)
  if (opts.withValues && !opts.md && parsedMods.report) {
    try {
      const pages = asArray(parsedMods.report);
      const valueLists = await Promise.all(
        pages.map((p: any) => p?.id
          ? execCommand(`assess report widget list --app ${appId} --page ${p.id} --json`)
          : Promise.resolve(null))
      );
      // report is an ARRAY of pages server-side — attach values per page object
      pages.forEach((p: any, i: number) => {
        const r = valueLists[i];
        let widgets: any = null;
        if (r && r.code === 0 && r.data) { try { widgets = JSON.parse(r.data); } catch { widgets = r.data; } }
        if (p && typeof p === 'object') p.widgetsFull = widgets;
      });
      snapshot.report = pages;
      parsedMods.report = pages;
    } catch { /* keep snapshot as-is if deep-fill fails */ }
  }

  if (errors.length > 0) snapshot['_errors'] = errors;
  return { snapshot, appName, parsedMods, errors };
}

export function registerSnapshotCommand(parent: Command): void {
  parent
    .command('snapshot')
    .description('Get aggregated snapshot of ALL app modules (form + scale + connect + report + expert + share) — one call, full context. Client-synthesized from 6 module queries (no server-side "assess snapshot" exists on the raw exec channel). --summary returns a compact audit profile; --apps runs a batch in one process.')
    .option('--app <appId>', 'App ID (single app)')
    .option('--apps <ids>', 'Batch mode: comma-separated app IDs, read in one process (combine with --summary; concurrency via FORMLM_CONCURRENCY, default 4). Replaces per-app subprocess loops.')
    .option('--module <name>', `Get only a specific module: ${VALID_MODULES.join(' / ')} (default: all)`)
    .option('--md', 'Output all modules in Markdown format (token-efficient for AI, default: JSON)')
    .option('--summary', 'Compact audit profile only (fieldCount/questionCount/dimCount/reportPages/styled/expert/share), instead of full module payloads')
    .option('--with-values', 'In full JSON mode, also fetch each report page widget values (extra report widget list calls; needed to language/content-audit report text — the compact snapshot query omits value)')
    .action(async (opts) => {
      // Validate module name early — prevent silent empty snapshot
      if (opts.module && !VALID_MODULES.includes(opts.module)) {
        localFail(`Invalid module "${opts.module}". Valid: ${VALID_MODULES.join(', ')}`);
      }
      if (!opts.app && !opts.apps) localFail('Either --app <appId> or --apps <id1,id2,...> is required.');
      if (opts.app && opts.apps) localFail('Use either --app or --apps, not both.');
      if (opts.apps && !opts.summary && !opts.module) {
        // Full payloads for a batch would be enormous; require an explicit narrowing.
        guidance('⚠️  --apps without --summary/--module returns full payloads for every app (large). Add --summary for the compact batch profile.');
      }

      // ── Batch mode ───────────────────────────────────────────
      if (opts.apps) {
        const ids = String(opts.apps).split(',').map(s => s.trim()).filter(Boolean);
        if (ids.length === 0) localFail('--apps listed no valid app ID.');
        const CONC = Number(process.env.FORMLM_CONCURRENCY) || 4;
        const out: any[] = new Array(ids.length);
        let cursor = 0;
        const worker = async () => {
          for (;;) {
            const i = cursor++;
            if (i >= ids.length) return;
            const c = await collect(ids[i], opts);
            out[i] = opts.summary
              ? Object.assign({ _degraded: c.errors.length > 0 ? true : undefined }, buildSummary(ids[i], c.appName, c.parsedMods), c.errors.length ? { _errors: c.errors } : {})
              : c.snapshot;
          }
        };
        await Promise.all(Array.from({ length: Math.min(CONC, ids.length) }, worker));
        const anyDegraded = out.some(o => o?._degraded);
        output({
          code: anyDegraded ? 207 : 0,
          message: anyDegraded ? 'partial: one or more apps had unreadable modules' : 'ok',
          data: JSON.stringify({ count: out.length, apps: out }),
        });
        return;
      }

      const c = await collect(opts.app, opts);

      if (opts.summary) {
        const summary = buildSummary(opts.app, c.appName, c.parsedMods);
        if (opts.withValues) summary['_withValuesNote'] = 'widget values fetched per report page (see the full snapshot --with-values output, not part of summary)';
        if (c.errors.length > 0) { summary['_errors'] = c.errors; summary['_degraded'] = true; }
        // Never report ok for a partial read: counts of unreadable modules are 0-by-absence,
        // not truth — code 500 when nothing could be read, 207 when the profile is incomplete.
        const nothingRead = Object.values(c.parsedMods).every(v => v === null);
        const code = c.errors.length === 0 ? 0 : (nothingRead ? 500 : 207);
        if (nothingRead) summary['_note'] = 'All module reads failed — the zero counts below are UNKNOWNS, not empty state.';
        if (isJsonMode()) {
          console.log(JSON.stringify({ ok: code === 0, code, message: code === 0 ? 'ok' : (nothingRead ? 'unreadable' : 'partial'), data: summary }));
        } else {
          console.log(JSON.stringify(summary, null, 2));
          if (code !== 0 && process.env.FORMLM_NO_EXIT !== '1') process.exit(1);
        }
        return;
      }

      if (opts.md) {
        // Markdown mode keeps the historic plain output (no envelope concept)
        console.log(JSON.stringify(c.snapshot, null, 2));
        return;
      }

      // Unified envelope contract: route through output() so snapshot speaks the
      // same {ok,code,message,data} language as every other command under FORMLM_JSON.
      output({
        code: c.errors.length === 0 ? 0 : (Object.keys(c.parsedMods).length > 0 ? 207 : 500),
        message: c.errors.length === 0 ? 'ok' : `partial: ${c.errors.join('; ')}`,
        data: JSON.stringify(c.snapshot),
      });
    });
}
