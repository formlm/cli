import { Command } from 'commander';
import { output, localFail, isJsonMode } from '../output.js';
import { runDoctor, isValidLangCode } from '../doctor.js';

/**
 * Doctor Command — thin CLI wrapper over the shared doctor core (also exposed to MCP
 * clients as the formlm_doctor tool). Read-only; exit code 1 (or an {ok:false} envelope)
 * when blocking findings exist, so batch drivers can gate on it.
 *
 * `--apps a,b,c` audits a batch inside ONE process (connection reuse + no per-app Node
 * cold start), which is the shape batch template production needs for verification.
 */
export function registerDoctorCommand(parent: Command): void {
  parent
    .command('doctor')
    .description('Read-only quality inspection of one app (or a batch via --apps): content/scoring/expert/styling/report/certificate/language/share/reachability. Exit 1 when a "fail" finding exists. Use --expect-lang for the language-consistency scan (replaces hand-rolled batch audits)')
    .option('--app <appId>', 'App ID (single app)')
    .option('--apps <ids>', 'Batch mode: comma-separated app IDs, audited in one process (concurrency via FORMLM_CONCURRENCY, default 4)')
    .option('--expect-lang <bcp47>', 'Expected output language (e.g. en / zh / zh-hant / ja). Flags titles/widget text written in another script (e.g. CJK boilerplate inside an English app)')
    .option('--deep', 'Also scan report widget BODY text (extra per-page queries; slower but catches Chinese certificate text inside English apps)')
    .option('--no-probe', 'Skip the fill-in URL reachability probe')
    .action(async (opts) => {
      if (!opts.app && !opts.apps) localFail('Either --app <appId> or --apps <id1,id2,...> is required.');
      if (opts.app && opts.apps) localFail('Use either --app or --apps, not both.');
      if (opts.expectLang && !isValidLangCode(opts.expectLang)) {
        localFail(`Invalid --expect-lang "${opts.expectLang}". Use a BCP-47 code like en / zh / zh-hant / ja.`);
      }
      const doctorOpts = {
        expectLang: opts.expectLang,
        deep: !!opts.deep,
        probe: opts.probe !== false,
      };

      // ── Batch mode: bounded concurrency inside this process ──────
      if (opts.apps) {
        const ids = String(opts.apps).split(',').map(s => s.trim()).filter(Boolean);
        if (ids.length === 0) localFail('--apps listed no valid app ID.');
        const CONC = Number(process.env.FORMLM_CONCURRENCY) || 4;
        const reports: any[] = new Array(ids.length);
        let cursor = 0;
        const worker = async () => {
          for (;;) {
            const i = cursor++;
            if (i >= ids.length) return;
            try {
              reports[i] = await runDoctor(ids[i], doctorOpts);
            } catch (e: any) {
              reports[i] = { appId: ids[i], ok: false, failCount: 1, warnCount: 0, error: e?.message || String(e), findings: [] };
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(CONC, ids.length) }, worker));

        const failing = reports.filter(r => !r.ok);
        const aggregate = {
          ok: failing.length === 0,
          total: reports.length,
          appsWithIssues: failing.length,
          warnings: reports.reduce((n, r) => n + (r.warnCount || 0), 0),
          apps: reports.map(r => ({
            appId: r.appId,
            appName: r.appName ?? null,
            ok: r.ok,
            failCount: r.failCount,
            warnCount: r.warnCount,
            failed: (r.findings || []).filter((f: any) => f.level === 'fail').map((f: any) => `${f.name}: ${f.detail}`),
            warn: (r.findings || []).filter((f: any) => f.level === 'warn').map((f: any) => `${f.name}: ${f.detail}`),
            error: r.error ?? null,
          })),
        };
        output({
          code: aggregate.ok ? 0 : 400,
          message: aggregate.ok ? `ok (${reports.length} apps)` : `${failing.length}/${reports.length} app(s) have blocking issues`,
          data: JSON.stringify(aggregate),
        });
        return;
      }

      const report = await runDoctor(opts.app, doctorOpts);

      // Machine mode: standard envelope (data = full report). Human mode: readable findings
      // + non-zero exit, because dumping the whole report JSON buries the verdict.
      if (isJsonMode()) {
        output({
          code: report.ok ? 0 : 400,
          message: report.ok
            ? (report.warnCount ? `ok with ${report.warnCount} warning(s)` : 'ok')
            : `${report.failCount} blocking issue(s), ${report.warnCount} warning(s)`,
          data: JSON.stringify(report),
        });
        return;
      }
      const icon = { pass: '✅', warn: '⚠️ ', fail: '❌' } as const;
      console.log(`App ${report.appId}${report.appName ? ' — ' + report.appName : ''}${report.appType ? ` (${report.appType})` : ''}`);
      for (const f of report.findings) {
        console.log(`${icon[f.level]} ${f.name}: ${f.detail}`);
        if (f.fix) console.log(`    ↳ fix: ${f.fix}`);
      }
      if (!report.ok) {
        console.error(`\n❌ ${report.failCount} blocking issue(s), ${report.warnCount} warning(s)`);
        if (process.env.FORMLM_NO_EXIT !== '1') process.exit(1);
      } else {
        console.log(`\n✅ No blocking issues (${report.warnCount} warning(s)).`);
      }
    });
}
