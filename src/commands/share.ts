import { Command } from 'commander';
import { execCommand, probeUrl } from '../exec.js';
import { output, guidance, localFail, isJsonMode } from '../output.js';
import { getBaseUrl } from '../config.js';
import { absHttpsUrl, normBool } from '../utils.js';
import { shareTokenFromUrl } from '../summary.js';

// connect style apply-all triggers server-side AI generation (30-120s)
const TIMEOUT_STYLE = 600_000;

// Access types accepted by `share publish --access` / `share set --type`
// (mirrors server ShareCommand --form-type validation)
const ACCESS_TYPES = ['visitor', 'all', 'owner', 'secret', 'no'];

/**
 * Map a human-friendly days value to the server's --form-day parameter.
 * Server normalization rule (ShareCommand.set): only 1..30 stay finite;
 * <=0 or >30 collapse to the forever sentinel 3650000. We mirror that (and say so on
 * stderr) instead of failing a publish the user explicitly asked for.
 */
function mapFormDay(days: string | undefined): number {
  if (days === undefined) return 3650000; // default: forever (matches legacy publish)
  const d = String(days).trim().toLowerCase();
  if (d === 'forever') return 3650000;
  const n = Number(d);
  if (!Number.isFinite(n) || n < 0) {
    localFail(`Invalid --days "${days}". Use 1-30 for a limited window, or 0/forever for permanent.`);
  }
  if (n === 0) return 3650000;                     // explicit "permanent" — no notice needed
  if (n > 30) {
    guidance(`ℹ️  --days ${days} → permanent: the server only honours finite windows of 1..30 days (anything above 30 normalizes to the permanent sentinel 3650000).`);
    return 3650000;
  }
  return Math.floor(n);
}

export function registerShareCommand(parent: Command): void {
  const share = parent.command('share').description('Share & publish management — set command is naturally idempotent (safe to re-run)');

  share
    .command('publish')
    .description(
      'Publish the form. Access semantics (must know): --access visitor = anonymous, no login required ("anyone can fill" — the common public choice, and the DEFAULT); ' +
      '--access all = every logged-in FormLM user (anonymous visitors get bounced to a login page); --access secret = password-protected. ' +
      'Each respondent submits once (perm 1) and stays open until unpublished unless --days/--perm override it. ' +
      'Auto-applies a default visual style first if the app was never styled (extra 30-120s AI generation; use --no-style to skip).'
    )
    .requiredOption('--app <appId>', 'App ID')
    .option('--access <type>', 'Access type: visitor (anonymous, default) / all (login required) / secret (password)', 'visitor')
    .option('--perm <n>', 'Fill permission: 1 = one submission per respondent (default), 2 = multiple, 3 = management', '1')
    .option('--days <n>', 'Validity in days: 1-30 (server only supports finite windows in 1..30; anything else becomes permanent), or 0/forever (default)', 'forever')
    .option('--no-style', 'Skip the auto style-apply fallback when the app is not yet styled')
    .action(async (opts) => {
      const access = String(opts.access).trim();
      if (!ACCESS_TYPES.includes(access)) {
        localFail(`Invalid --access "${opts.access}". Valid: ${ACCESS_TYPES.join(' / ')} (visitor = anonymous no-login; all = requires login).`);
      }
      const perm = Number(opts.perm);
      if (![1, 2, 3].includes(perm)) {
        localFail(`Invalid --perm "${opts.perm}". Valid: 1 (once) / 2 (many) / 3 (management).`);
      }
      const formDay = mapFormDay(opts.days);
      // Skip style fallback: commander sets opts.style === false when --no-style passed
      const allowStyle = opts.style !== false;

      // ── Connect style fallback: check if form has been styled ──
      let needsStyle = true;
      if (allowStyle) {
        const queryResult = await execCommand(`assess connect query --app ${opts.app} --json`);
        if (queryResult.code === 0 && queryResult.data) {
          try {
            const query = JSON.parse(queryResult.data);
            if (query.styled === true) needsStyle = false;
          } catch {}
        }
      } else {
        needsStyle = false;
      }
      if (needsStyle) {
        guidance('🎨 No visual style detected. Auto-applying default style (AI generation, may take 30-120s)...');
        const styleResult = await execCommand(
          `assess connect style apply-all --app ${opts.app} --theme minimalist --look "professional assessment form, clean modern design, clear typography, subtle color palette" --json`,
          undefined,
          TIMEOUT_STYLE,
        );
        if (styleResult.code === 0) {
          guidance('✅ Visual style applied successfully.');
        } else {
          guidance(`⚠️ Style auto-apply skipped: ${styleResult.message}`);
        }
      }

      // ── Publish the form ──
      const cmd = `assess share set --app ${opts.app} --form-type ${access} --form-perm ${perm} --form-day ${formDay} --json`;
      const result = await execCommand(cmd);
      // ── After publishing, fetch URLs and fold them INTO the data (JSON mode stays a single pure envelope on stdout) ──
      // shareUrlAbsolute can lag one moment behind the share write (the share row is
      // persisted async), so retry once when the URL/token is still missing.
      if (result.code === 0) {
        let urls: any = null;
        for (let attempt = 0; attempt < 2 && !urls?.shareUrl; attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, 800));
          const urlsResult = await execCommand(`assess app urls --app ${opts.app} --json`);
          if (urlsResult.code === 0 && urlsResult.data) {
            try { urls = JSON.parse(urlsResult.data); } catch { urls = null; }
          }
        }
        if (urls) {
          const fillAbs = urls.shareUrlAbsolute || absHttpsUrl(getBaseUrl(), urls.shareUrl);
          try {
            const merged = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
            if (merged && typeof merged === 'object') {
              merged.urls = urls;
              result.data = JSON.stringify(merged);
            }
          } catch {}
          // Human mode: echo the URL block to stdout; JSON mode: guidance() reroutes to stderr.
          if (!isJsonMode()) {
            console.log('');
            console.log('📋 App URLs:');
            if (fillAbs) console.log(`   Fill-in URL:   ${fillAbs}`);
            const token = urls.shareToken || shareTokenFromUrl(urls.shareUrl);
            if (token) console.log(`   ShareToken:    ${token}`);
            if (urls.builderUrl) console.log(`   Editor URL:    ${absHttpsUrl(getBaseUrl(), urls.builderUrl)}`);
            if (urls.dataUrl) console.log(`   Data URL:      ${absHttpsUrl(getBaseUrl(), urls.dataUrl)}`);
            if (urls.apiUrl) console.log(`   Data API:      ${urls.apiUrl}`);
            else if (urls.apiUrl === '') console.log('   Data API:      (not enabled — run: formlm-cli share api --app ' + opts.app + ' --submit true)');
          } else {
            const token = urls.shareToken || shareTokenFromUrl(urls.shareUrl);
            guidance(`💡 Fill-in URL: ${fillAbs}${token ? `  ShareToken: ${token}` : ''}`);
          }
        }
      }
      output(result);
    });

  share
    .command('set')
    .description(
      'Set share/publish config directly (idempotent — safe to re-run). Exposes the raw server parameters so every access ' +
      'combination (e.g. "anonymous + unlimited validity" = --type visitor --day 0) is reachable without going through publish. ' +
      'Server day rule: only 1..30 stay finite; <=0 or >30 normalize to permanent (sentinel 3650000).'
    )
    .requiredOption('--app <appId>', 'App ID')
    .option('--type <formType>', 'Form share type: visitor (anonymous no-login) / all (logged-in users) / secret (password) / owner (creator only) / no (unpublish)')
    .option('--perm <n>', 'Fill permission: 1 = once, 2 = many, 3 = management')
    .option('--day <n>', 'Validity in days (1..30), or 0/forever/>30 = permanent sentinel 3650000')
    .action(async (opts) => {
      if (opts.type && !ACCESS_TYPES.includes(String(opts.type).trim())) {
        localFail(`Invalid --type "${opts.type}". Valid: ${ACCESS_TYPES.join(' / ')}.`);
      }
      let cmd = `assess share set --app ${opts.app}`;
      if (opts.type) cmd += ` --form-type ${String(opts.type).trim()}`;
      if (opts.perm !== undefined) cmd += ` --form-perm ${opts.perm}`;
      if (opts.day !== undefined) cmd += ` --form-day ${mapFormDay(String(opts.day))}`;
      cmd += ' --json';
      output(await execCommand(cmd));
    });

  share
    .command('unpublish')
    .description('Unpublish the app')
    .requiredOption('--app <appId>', 'App ID')
    .action(async (opts) => {
      const cmd = `assess share set --app ${opts.app} --form-type no --json`;
      const result = await execCommand(cmd);
      output(result);
    });

  share
    .command('verify')
    .description(
      'One-call publish verification: authoritative access triple (type/perm/day) + reachability probe. ' +
      'Use it instead of share query + curl so "anonymous + permanent" is provable in one step. ' +
      'Reading: anonymous=true only when type=visitor; HTTP 200 alone proves nothing (the SPA shell answers 200 behind the login gate).'
    )
    .requiredOption('--app <appId>', 'App ID')
    .option('--no-probe', 'Skip the HTTPS reachability probe of the fill-in URL')
    .action(async (opts) => {
      const urlsResult = await execCommand(`assess app urls --app ${opts.app} --json`);
      let urls: any = null;
      if (urlsResult.code === 0 && urlsResult.data) {
        try { urls = JSON.parse(urlsResult.data); } catch {}
      }
      const queryResult = await execCommand(`assess share query --app ${opts.app} --json`);
      let shareForm: any = null;
      if (queryResult.code === 0 && queryResult.data) {
        try {
          const q = JSON.parse(queryResult.data);
          shareForm = q.form ?? q;
        } catch {}
      }
      const type = shareForm?.type ?? urls?.shareType ?? null;
      const day = shareForm?.day ?? urls?.shareDay ?? null;
      const perm = shareForm?.perm ?? urls?.sharePerm ?? null;
      const fillAbs = urls?.shareUrlAbsolute || absHttpsUrl(getBaseUrl(), urls?.shareUrl);
      const published = Boolean(type && type !== 'no');
      const check: any = {
        appId: opts.app,
        published,
        type,
        perm,
        day,
        forever: Number(day ?? 0) >= 3650000,
        anonymous: type === 'visitor',
        needsLogin: type === 'all' || type === 'owner',
        shareUrl: fillAbs || null,
        shareToken: urls?.shareToken || shareTokenFromUrl(urls?.shareUrl),
      };
      if (opts.probe !== false && fillAbs) {
        const probe = await probeUrl(fillAbs);
        check.httpStatus = probe.status;
        check.reachable = probe.ok;
        if (!probe.ok) check.probeMessage = probe.message;
      }
      const problems: string[] = [];
      if (!published) problems.push('not published (type is empty or "no") — run: formlm-cli share publish --app ' + opts.app);
      if (check.needsLogin) problems.push(`type=${type} requires a logged-in user; anonymous visitors hit the login page — use --access visitor for public forms`);
      if (check.reachable === false) problems.push(`fill-in URL not reachable (HTTP ${check.httpStatus || 'no response'}${check.probeMessage ? ': ' + check.probeMessage : ''})`);
      check.ok = problems.length === 0;
      check.problems = problems;
      if (isJsonMode()) {
        console.log(JSON.stringify({ ok: check.ok, code: check.ok ? 0 : 400, message: check.ok ? 'ok' : problems.join('; '), data: check }));
      } else {
        console.log(JSON.stringify(check, null, 2));
      }
    });

  share
    .command('api')
    .description('Configure the Data API — a form backend for static sites, local pages, and AI apps. Point a form action or fetch at the endpoint and submissions land in FormLM. Append ?help to the endpoint for its Markdown docs (readable by AI agents).')
    .requiredOption('--app <appId>', 'App ID')
    .option('--submit <bool>', 'Enable the submit endpoint (true/false)')
    .option('--query <bool>', 'Enable the query endpoint (true/false)')
    .option('--summary <bool>', 'Enable the summary endpoint (true/false)')
    .option('--auto-create <bool>', 'Auto-create fields for unknown keys in submissions (true/false)')
    .action(async (opts) => {
      let cmd = `assess share api --app ${opts.app}`;
      const submit = normBool(opts.submit);
      if (submit !== undefined) cmd += ` --submit ${submit}`;
      const query = normBool(opts.query);
      if (query !== undefined) cmd += ` --query ${query}`;
      const summary = normBool(opts.summary);
      if (summary !== undefined) cmd += ` --summary ${summary}`;
      const autoCreate = normBool(opts.autoCreate);
      if (autoCreate !== undefined) cmd += ` --auto-create ${autoCreate}`;
      cmd += ' --json';
      const result = await execCommand(cmd);
      output(result);
      // Friendly endpoint summary for humans and agents (stderr in JSON mode)
      if (result.code === 0 && result.data) {
        try {
          const api = JSON.parse(result.data);
          if (api.apiUrl) {
            guidance('');
            guidance('🔌 Data API endpoint:');
            guidance(`   POST JSON:  ${api.apiUrl}`);
            guidance(`   POST form:  ${api.apiUrl}/form`);
            guidance(`   API Docs:   ${api.apiHelpUrl}`);
          }
        } catch {}
      }
    });

  share
    .command('query')
    .description(
      'Query publish status. Read the triple type/perm/day to verify access: type=visitor means anonymous no-login, ' +
      'type=all means logged-in users only; day>=3650000 (or "forever" in --md) means permanent. ' +
      'Note: curl 200 on the share URL does NOT prove anonymous access — the SPA shell answers 200 even behind the login gate.'
    )
    .requiredOption('--app <appId>', 'App ID')
    .option('--md', 'Markdown table output')
    .action(async (opts) => {
      let cmd = `assess share query --app ${opts.app}`;
      cmd += opts.md ? ' --md' : ' --json';
      output(await execCommand(cmd));
    });

  share
    .command('url')
    .description('Get all app URLs (fill-in, editor, data management, Data API). JSON output includes shareToken and published/shareType summaries.')
    .requiredOption('--app <appId>', 'App ID')
    .action(async (opts) => {
      // Use app urls to return all 3 URLs (fill-in, editor, data) in one call
      const cmd = `assess app urls --app ${opts.app} --json`;
      const result = await execCommand(cmd);
      // Guarantee shareToken as a first-class field even against older servers
      // that only return shareUrl (server now emits shareToken natively; this is a compat fill).
      if (result.code === 0 && result.data && isJsonMode()) {
        try {
          const urls = JSON.parse(result.data);
          if (!urls.shareToken) {
            urls.shareToken = shareTokenFromUrl(urls.shareUrl);
            result.data = JSON.stringify(urls);
          }
        } catch {}
      }
      output(result);
    });
}
