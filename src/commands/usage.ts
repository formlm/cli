import { Command } from 'commander';
import { authMe } from '../exec.js';
import { isJsonMode } from '../output.js';

/**
 * `formlm-cli usage` — one-call quota & credit probe (plan / app slots / AI credits).
 *
 * Why it exists: the server enforces a free-plan app cap (403 `app-limit`) and bills AI
 * credits at plan completion, but until now there was no way to SEE the remaining budget
 * before hitting a wall — the web shows it, the terminal/agents could not. Reads the
 * extended GET /api/v1/mcp/auth/me (additive fields; against an older server the usage
 * fields are simply missing and this command degrades to "n/a" instead of lying).
 *
 * Slot basis mirrors the server gate: used = in-use + recycle bin (purge frees a slot).
 */

function tryParse(s: any): any {
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch { return null; }
}

export function registerUsageCommand(parent: Command): void {
  parent
    .command('usage')
    .description('Show your plan, app-slot usage (in-use + recycle bin) and AI credits — check BEFORE batch creating')
    .action(async () => {
      const me = await authMe();
      if (me.code !== 0) {
        // authMe 的本地未登录分支只回一句 "Not logged in"——补全新手需要的指路文案
        const hint = me.message && me.message.length > 20 ? me.message
          : 'Not logged in. Run: formlm-cli auth login (no password? choose "email verification code" — first login auto-registers), or copy your Access Token from formlm.me → Workspace → Account Settings and run: auth login --token <your-token>';
        if (isJsonMode()) {
          console.log(JSON.stringify({ ok: false, code: me.code, message: hint, data: null }));
        } else {
          console.log(`❌ ${hint}`);
        }
        return;
      }
      const d: any = tryParse(me.data) || {};
      const unlimited: boolean = d.appLimitUnlimited === true;
      const hasUsage = typeof d.appUsage === 'number' && (unlimited || typeof d.appLimit === 'number');
      const hasCredit = typeof d.credit === 'number';
      const remaining = hasUsage && !unlimited
        ? Math.max(0, (d.appLimit as number) - (d.appUsage as number))
        : null;

      if (isJsonMode()) {
        console.log(JSON.stringify({
          ok: true, code: 0, message: 'ok',
          data: {
            account: d.account ?? null,
            plan: d.tenantType ?? null,
            appsUsed: hasUsage ? d.appUsage : null,
            appLimit: unlimited ? null : (hasUsage ? d.appLimit : null),
            appsRemaining: remaining,
            unlimited,
            credits: hasCredit ? d.credit : null,
            slotBasis: 'in-use + recycle bin (purging a deleted app frees the slot)',
            serverReportsUsage: hasUsage,
            serverReportsCredits: hasCredit,
          },
        }));
        return;
      }

      console.log('📊 FormLM account usage');
      if (d.account) console.log(`   Account:        ${d.account}`);
      if (d.tenantType) console.log(`   Plan:           ${d.tenantType}`);
      if (hasUsage) {
        const cap = unlimited ? 'unlimited' : `${d.appLimit}`;
        const left = remaining === null ? '' : `   (${remaining} left)`;
        console.log(`   Apps:           ${d.appUsage} / ${cap}${left}`);
        if (!unlimited && remaining === 0) {
          console.log('   ⚠️  Slot cap reached — creating returns 403 app-limit. Apps in the RECYCLE BIN');
          console.log('      still hold a slot: purge one at formlm.me → Workspace, or upgrade (#/vip).');
        }
      } else {
        console.log('   Apps:           n/a (the server does not report usage yet — needs a newer deployment)');
      }
      if (hasCredit) {
        console.log(`   AI credits:     ${d.credit}`);
        if (d.credit <= 0) {
          console.log('   ℹ️  Credits are at 0 — generation still works (billing is capped, never blocks),');
          console.log('      top-up / upgrade: formlm.me → Workspace → #/vip');
        }
      } else {
        console.log('   AI credits:     n/a (the server does not report credits yet — needs a newer deployment)');
      }
      if (hasUsage && !unlimited && remaining !== null && remaining > 0) {
        console.log('   Note:           slot basis = in-use + recycle bin; purge a deleted app to free one.');
      }
    });
}
