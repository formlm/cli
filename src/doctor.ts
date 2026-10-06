import { execCommand, probeUrl } from './exec.js';
import { getBaseUrl } from './config.js';
import { absHttpsUrl } from './utils.js';
import { asArray, buildSummary } from './summary.js';

/**
 * Doctor core — one-call READ-ONLY quality inspection of an app.
 *
 * Consolidates the audits batch agents otherwise hand-roll outside the CLI (regex scans
 * over dozens of apps, per-page widget queries, `share query` + `curl`). Each finding
 * carries a level so scripts can gate on `fail` while humans review `warn`.
 * Shared by the `doctor` CLI command and the `formlm_doctor` MCP tool so both surfaces
 * give identical verdicts.
 *
 * Checks:
 *   content       form fields / scored questions / dimensions / report pages present
 *   scoredNoDim   scored questions exist but no scale dimension (scores go nowhere)
 *   expert        enabled-but-empty / configured-but-disabled / referenced-but-missing
 *   styling       not styled (plain default look)
 *   report        dimensions without report pages, or report pages with nothing scored
 *   certificate   certificate-like page on an app whose type/name says "certificate"
 *   language      --expect-lang: script-consistency scan of titles (+ widget values with deep)
 *   share         published / anonymous vs login-required / permanence / expiry
 *   reachability  fill-in URL answers (HTTP 200 alone never proves anonymous access)
 */

export type DoctorLevel = 'pass' | 'warn' | 'fail';
export interface DoctorFinding { name: string; level: DoctorLevel; detail: string; fix?: string }
export interface DoctorOptions {
  /** BCP-47 expected language, e.g. en / zh / zh-hant / ja. Enables the language check. */
  expectLang?: string;
  /** Also fetch per-page widget values (N extra queries) for the language scan. */
  deep?: boolean;
  /** Probe the fill-in URL for reachability (default true). */
  probe?: boolean;
}
export interface DoctorReport {
  appId: string;
  appName: string | null;
  appType: string | null;
  ok: boolean;
  failCount: number;
  warnCount: number;
  summary: any;
  findings: DoctorFinding[];
}

const CJK_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
const CERT_NAME_RE = /证书|證書|certificate|diploma|结业|結業|completion/i;

function finding(name: string, level: DoctorLevel, detail: string, fix?: string): DoctorFinding {
  return { name, level, detail, fix };
}

/** Target-language script uses CJK glyphs? (zh/ja/ko families) */
export function langIsCJK(lang: string): boolean {
  const l = String(lang || '').toLowerCase();
  return l.startsWith('zh') || l.startsWith('ja') || l.startsWith('ko');
}

/** BCP-47 shape guard used by both the CLI flag and the MCP tool parameter. */
export function isValidLangCode(lang: string): boolean {
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,4})*$/.test(String(lang || ''));
}

async function jsonExec(cmd: string, timeoutMs?: number): Promise<any> {
  const r = await execCommand(cmd, undefined, timeoutMs);
  if (r.code !== 0) return { __error: `[${r.code}] ${r.message}`, __code: r.code };
  if (r.data === null || r.data === undefined) return null;
  try { return typeof r.data === 'string' ? JSON.parse(r.data) : r.data; } catch { return r.data; }
}

export async function runDoctor(appId: string, opts: DoctorOptions = {}): Promise<DoctorReport> {
  // Module payloads + app title (app use also carries `type`), all in parallel
  const [appRaw, form, scale, connect, report, expert, share] = await Promise.all([
    jsonExec(`assess app use --app ${appId} --json`),
    jsonExec(`assess form query --app ${appId} --json`),
    jsonExec(`assess scale query --app ${appId} --json`),
    jsonExec(`assess connect query --app ${appId} --json`),
    jsonExec(`assess report query --app ${appId} --json`),
    jsonExec(`assess expert query --app ${appId} --json`),
    jsonExec(`assess share query --app ${appId} --json`),
  ]);
  const urls = await jsonExec(`assess app urls --app ${appId} --json`);

  const mods: Record<string, any> = {
    form: form && !form.__error ? form : null,
    scale: scale && !scale.__error ? scale : null,
    connect: connect && !connect.__error ? connect : null,
    report: report && !report.__error ? report : null,
    // expert query --json yields the literal "无数据" when unconfigured → not an object
    expert: expert && !expert.__error && typeof expert === 'object' ? expert : null,
    share: share && !share.__error ? share : null,
  };
  const degraded: string[] = [];
  for (const [name, val] of Object.entries<any>({ form, scale, connect, report, expert, share })) {
    if (val && val.__error) degraded.push(`${name}: ${val.__error}`);
  }

  const appName = (appRaw && !appRaw.__error && appRaw.name) || '';
  const appType = (appRaw && !appRaw.__error && appRaw.type) || '';
  const s = buildSummary(appId, appName, mods);
  const findings: DoctorFinding[] = [];

  // ── content ─────────────────────────────────────────────────
  if (degraded.length > 0) {
    findings.push(finding('fetch', 'warn', `Some modules could not be read; their checks were SKIPPED (they did not pass): ${degraded.join('; ')}`));
  }
  if (!mods.form) {
    findings.push(finding('content', 'fail', 'Form module unreadable or absent — the app has no field definitions.'));
  } else if (s.fieldCount === 0) {
    findings.push(finding('content', 'fail', 'App has 0 fields — the fill-in page will be blank.', `formlm-cli field add --app ${appId} --id q1 --title "..." --type radio`));
  } else {
    findings.push(finding('content', 'pass', `${s.fieldCount} fields (${s.questionCount} scored), ${s.dimCount} dimensions, ${s.reportPageCount} report pages.`));
  }
  if (s.questionCount > 0 && s.dimCount === 0) {
    findings.push(finding('scoredNoDim', 'fail', `${s.questionCount} scored questions exist but NO scale dimension is defined — answers are collected yet never scored, so report scores stay empty.`, `formlm-cli scale add --app ${appId} --id <dim> --name "<Dim>" --format sum --kbText "..."`));
  }

  // ── expert ──────────────────────────────────────────────────
  const expertObj = mods.expert;
  if (expertObj) {
    if (s.expertEnabled && !s.expertHasContent) {
      findings.push(finding('expert', 'fail', 'Expert is ENABLED but has no name/knowledge/prompt — the final page shows a dead AI assistant chat.', `formlm-cli expert config --app ${appId} --name "..." --role "..." --kbText "..." --enable true`));
    } else if (!s.expertEnabled && s.expertHasContent) {
      findings.push(finding('expert', 'warn', 'Expert is configured but DISABLED (enable=false) — it will not appear for respondents.', `formlm-cli expert set --app ${appId} --property enable --value true`));
    } else if (s.expertEnabled) {
      findings.push(finding('expert', 'pass', `Expert enabled: ${expertObj.name || '(unnamed)'}.`));
    }
  }
  // A report/final page embedding the expert widget while no enabled expert exists = dead entry point
  if (mods.report) {
    const refsExpert = JSON.stringify(mods.report).includes('train-expert');
    if (refsExpert && !s.expertEnabled) {
      findings.push(finding('expertRef', 'fail', 'A report widget of type train-expert exists but no enabled expert is configured — that entry point is a dead link.', `formlm-cli expert config --app ${appId} --name "..." --role "..." --kbText "..." --enable true`));
    }
  }

  // ── styling ─────────────────────────────────────────────────
  if (mods.connect) {
    if (s.styled === false) {
      findings.push(finding('styling', 'warn', 'App is not styled — it renders with the plain default look.', `formlm-cli connect style apply-all --app ${appId} --look "<scene + visual tone>"`));
    } else if (s.styled === true) {
      findings.push(finding('styling', 'pass', 'Visual style applied.'));
    }
  }

  // ── report / scoring drift ──────────────────────────────────
  if (s.dimCount > 0 && s.reportPageCount === 0) {
    findings.push(finding('report', 'fail', `${s.dimCount} dimensions exist but the report has 0 pages — respondents submit and receive nothing.`));
  } else if (s.dimCount === 0 && s.questionCount === 0 && s.reportPageCount > 0) {
    findings.push(finding('report', 'warn', 'Report pages exist but nothing is scored (0 dimensions, 0 scored questions) — score-driven widgets will stay empty.'));
  }

  // ── certificate heuristics (name/type based → advisory) ─────
  // A certificate page is expected for exam/learn (completion certificates) and for apps whose
  // type/name says certificate; elsewhere it is usually an AI-attached boilerplate tail page.
  const certExpected = /(^|[^a-z])(exam|learn|cert|diploma|credential|training|course)/i.test(`${appType} ${appName}`);
  const certPages = s.reportPages.filter((p: any) => p.name && CERT_NAME_RE.test(String(p.name)));
  if (certPages.length > 0 && !certExpected) {
    findings.push(finding('certificate', 'warn', `Certificate-like page(s) present (${certPages.map((p: any) => `${p.id}:${p.name}`).join(', ')}) but the app type/name (${appType || appName || 'unnamed'}) does not indicate a certificate. Verify it was intended — AI generation sometimes attaches a boilerplate 结业证书 page to plain screenings/screeners.`, `formlm-cli report page remove --app ${appId} --id <pageId>`));
  }

  // ── language consistency (opt-in) ───────────────────────────
  if (opts.expectLang) {
    const expectCJK = langIsCJK(opts.expectLang);
    const texts: { where: string; text: string }[] = [];
    for (const f of asArray(mods.form)) {
      if (f?.title) texts.push({ where: `form ${f.id || f.key}`, text: String(f.title) });
      if (f?.name) texts.push({ where: `form ${f.id || f.key}.name`, text: String(f.name) });
    }
    for (const d of asArray(mods.scale)) {
      if (d?.name) texts.push({ where: `scale ${d.id}`, text: String(d.name) });
    }
    for (const p of s.reportPages) {
      if (p.name) texts.push({ where: `report page ${p.id}`, text: String(p.name) });
    }
    // Widget VALUES are omitted by the compact report query — fetch per page when asked
    if (opts.deep && s.reportPageCount > 0) {
      const lists = await Promise.all(
        s.reportPages.map((p: any) => p.id ? jsonExec(`assess report widget list --app ${appId} --page ${p.id} --json`) : Promise.resolve(null))
      );
      lists.forEach((list: any, i: number) => {
        if (!list || list.__error) return;
        for (const w of asArray(list)) {
          const v = typeof w?.value === 'string' ? w.value : '';
          if (v) texts.push({ where: `report widget ${s.reportPages[i].id}/${w.id}`, text: v.replace(/<[^>]+>/g, ' ') });
        }
      });
    }
    const offenders = texts.filter(t => expectCJK ? !CJK_RE.test(t.text) : CJK_RE.test(t.text));
    if (offenders.length > 0) {
      const sample = offenders.slice(0, 8).map(o => `${o.where}="${o.text.slice(0, 40)}"`).join(', ');
      findings.push(finding('language', 'fail', `${offenders.length} text(s) do not match --expect-lang ${opts.expectLang}${opts.deep ? ' (titles + widget values scanned)' : ' (titles/labels only; pass deep=true to include widget body text)'}: ${sample}${offenders.length > 8 ? ' …' : ''}`, 'fix with report widget set / field update, or regenerate the module with smart plan --lang ' + opts.expectLang));
    } else {
      findings.push(finding('language', 'pass', `All scanned texts match --expect-lang ${opts.expectLang} (${texts.length} strings${opts.deep ? ', incl. widget values' : ''}).`));
    }
  }

  // ── share / access ──────────────────────────────────────────
  const shareForm = mods.share && typeof mods.share === 'object' ? (mods.share.form ?? mods.share) : null;
  const type = shareForm?.type ?? urls?.shareType ?? null;
  const day = Number(shareForm?.day ?? urls?.shareDay ?? 0);
  const perm = shareForm?.perm ?? urls?.sharePerm ?? '?';
  const fillAbs = urls?.shareUrlAbsolute || absHttpsUrl(getBaseUrl(), urls?.shareUrl || '');
  if (!type || type === 'no') {
    findings.push(finding('share', 'fail', 'App is NOT published — respondents cannot reach any fill-in URL.', `formlm-cli share publish --app ${appId} --access visitor`));
  } else if (type === 'all' || type === 'owner') {
    findings.push(finding('share', 'fail', `Published as type=${type}, which REQUIRES a logged-in FormLM account — anonymous visitors get the login page, not the form. Use visitor for "anyone can fill".`, `formlm-cli share publish --app ${appId} --access visitor`));
  } else {
    findings.push(finding('share', 'pass', `Published as type=${type}, perm=${perm}, ${day >= 3650000 ? 'permanent' : 'valid ' + day + ' day(s)'}.`));
  }
  if (day > 0 && day < 3650000) {
    findings.push(finding('shareExpiry', 'warn', `Share link expires in ${day} day(s) (only 1..30 are finite server-side) — long-lived pages should re-publish with --days forever.`));
  }
  if (opts.probe !== false && fillAbs && type && type !== 'no') {
    const probe = await probeUrl(fillAbs);
    if (!probe.ok) {
      findings.push(finding('reachability', 'fail', `Fill-in URL did not answer OK (HTTP ${probe.status || 'no response'}${probe.message ? ': ' + probe.message : ''}).`));
    } else {
      findings.push(finding('reachability', 'pass', `Fill-in URL answered HTTP ${probe.status} (200 alone does not prove anonymous access — read the share check).`));
    }
  }

  const fails = findings.filter(f => f.level === 'fail');
  const warns = findings.filter(f => f.level === 'warn');
  return {
    appId,
    appName: appName || null,
    appType: appType || null,
    ok: fails.length === 0,
    failCount: fails.length,
    warnCount: warns.length,
    summary: s,
    findings,
  };
}
