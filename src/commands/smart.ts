import { Command, Option } from 'commander';
import { execCommand } from '../exec.js';
import { output } from '../output.js';
import { escapeArg } from '../utils.js';

/**
 * Smart Pipeline Commands
 *
 * Wraps the server-side AssessAgent intelligent pipeline:
 * - smart plan: AssessAgent.plan() only — generate execution plan + appId
 * - smart execute: execute a single module (form/scale/connect/report/expert/share)
 *
 * This is the RECOMMENDED entry point for AI agents (works with any MCP-compatible
 * platform: Claude / Cursor / Codex CLI / Windsurf / etc., or direct CLI usage)
 * because it embeds the full SKILL.md domain knowledge, reference data injection,
 * and multi-step orchestration that newapp.html uses internally.
 */

// ── Timeouts ──────────────────────────────────────────────────────────────────
// Must match mcp.ts constants to ensure CLI and MCP Server have identical behavior.
const TIMEOUT_PLAN = 120_000;   // 2min for smart plan (Phase 1 only, ~10-30s)
const TIMEOUT_EXECUTE = 300_000; // 5min for smart execute (single module, ~30-120s)

export function registerSmartCommand(parent: Command): void {
  const smart = parent.command('smart').description('Intelligent pipeline — natural language to live app (recommended for AI agents)');

  // ── smart plan ───────────────────────────────────────────────

  smart
    .command('plan')
    .description('Generate execution plan only (Phase 1). Returns plan JSON + appId. Use with smart execute for step-by-step generation to avoid AI client timeouts.')
    .requiredOption('--input <text>', 'Natural language description of the app you want to build')
    .addOption(new Option('--plan-type <type>', 'Plan type').choices(['assessment', 'consultation', 'survey', 'exam', 'quiz', 'learn']))
    .option('--style <style>', 'Visual style preference')
    .addOption(new Option('--question-count <count>', 'Question count range').choices(['10-15', '15-20', '20-30']))
    .action(async (opts) => {
      let cmd = `assess smart plan --input "${escapeArg(opts.input)}"`;
      if (opts.planType) cmd += ` --plan-type ${opts.planType}`;
      if (opts.style) cmd += ` --style "${escapeArg(opts.style)}"`;
      if (opts.questionCount) cmd += ` --question-count ${opts.questionCount}`;
      cmd += ' --json';
      const result = await execCommand(cmd, undefined, TIMEOUT_PLAN);
      output(result);

      // ── Next Steps guidance ──────
      if (result.code === 0 && result.data) {
        try {
          const parsed = JSON.parse(result.data);
          if (parsed.appId && parsed.plan) {
            console.log('');
            console.log('💡 Next steps — execute modules sequentially:');
            const modules = (parsed.tasks || []).map((t: any) => t.skill);
            for (const m of modules) {
              console.log(`   formlm-cli smart execute --app ${parsed.appId} --module ${m} --plan '${parsed.plan}'`);
            }
            console.log(`   Snapshot:  formlm-cli snapshot --app ${parsed.appId}`);
          }
        } catch {
          // result.data was not JSON — skip guidance
        }
      }
    });

  // ── smart execute ────────────────────────────────────────────

  smart
    .command('execute')
    .description('Execute a single module from the plan. Each module completes within ~60s, well within AI client timeouts (~300s).')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--module <name>', 'Module: form / scale / connect / report / expert / share')
    .requiredOption('--plan <json>', 'Plan JSON from smart plan (or updated plan from previous smart execute)')
    .action(async (opts) => {
      let cmd = `assess smart execute --app ${opts.app} --module ${opts.module} --plan "${escapeArg(opts.plan)}" --json`;
      const result = await execCommand(cmd, undefined, TIMEOUT_EXECUTE);
      output(result);

      // ── Next Steps guidance ──────
      if (result.code === 0 && result.data) {
        try {
          const parsed = JSON.parse(result.data);
          if (parsed.appId && parsed.plan) {
            const moduleOrder = ['form', 'scale', 'connect', 'report', 'expert', 'share'];
            const currentIdx = moduleOrder.indexOf(opts.module);
            const nextModule = moduleOrder[currentIdx + 1];
            console.log('');
            console.log('💡 Next steps:');
            if (nextModule) {
              console.log(`   Execute next: formlm-cli smart execute --app ${parsed.appId} --module ${nextModule} --plan '${parsed.plan}'`);
            } else {
              console.log(`   ✅ All modules done!`);
              console.log(`   Editor:    https://formlm.me/mypage/builder.html?id=${parsed.appId}`);
              console.log(`   Data:      https://formlm.me/mypage/data.html?id=${parsed.appId}`);
              console.log(`   Snapshot:  formlm-cli snapshot --app ${parsed.appId}`);
            }
          }
        } catch {
          // result.data was not JSON — skip guidance
        }
      }
    });
}
