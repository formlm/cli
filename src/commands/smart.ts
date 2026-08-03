import { Command, Option } from 'commander';
import { execCommand } from '../exec.js';
import { output } from '../output.js';
import { escapeArg } from '../utils.js';

/**
 * Smart Pipeline Commands
 *
 * Wraps the server-side AssessAgent intelligent pipeline:
 * - smart generate: AssessAgent.plan() + execute() — natural language → full app
 *
 * This is the RECOMMENDED entry point for AI agents (works with any MCP-compatible
 * platform: Claude / Cursor / Codex CLI / Windsurf / etc., or direct CLI usage)
 * because it embeds the full SKILL.md domain knowledge, reference data injection,
 * and multi-step orchestration that newapp.html uses internally.
 */

// ── Timeouts ──────────────────────────────────────────────────────────────────
// Must match mcp.ts constants to ensure CLI and MCP Server have identical behavior.
const TIMEOUT_SMART = 600_000;   // 10min for smart generate (full AI pipeline: plan → execute)

export function registerSmartCommand(parent: Command): void {
  const smart = parent.command('smart').description('Intelligent pipeline — natural language to live app (recommended for AI agents)');

  // ── smart generate ───────────────────────────────────────────

  smart
    .command('generate')
    .description('Create a complete app from natural language description. The server runs AssessAgent: plan → execute. This is the fastest way to get a production-ready assessment app. ⏱️ Estimated: 1-5 min (assessment 60-120s, consultation 180-300s, survey 30-60s). Do NOT cancel — let it complete.')
    .requiredOption('--input <text>', 'Natural language description of the app you want to build (e.g. "a mental health screening questionnaire for college students")')
    .addOption(new Option('--plan-type <type>', 'Plan type: assessment / consultation / survey / exam / quiz / learn (default: auto-detected by AI)').choices(['assessment', 'consultation', 'survey', 'exam', 'quiz', 'learn']))
    .option('--style <style>', 'Visual style preference (e.g. "深色科技风" or "warm and friendly")')
    .addOption(new Option('--question-count <count>', 'Question count range: 10-15 / 15-20 / 20-30').choices(['10-15', '15-20', '20-30']))
    .action(async (opts) => {
      let cmd = `assess smart generate --input "${escapeArg(opts.input)}"`;
      if (opts.planType) cmd += ` --plan-type ${opts.planType}`;
      if (opts.style) cmd += ` --style "${escapeArg(opts.style)}"`;
      if (opts.questionCount) cmd += ` --question-count ${opts.questionCount}`;
      cmd += ' --json';
      const result = await execCommand(cmd, undefined, TIMEOUT_SMART);
      output(result);

      // ── Next Steps guidance (mirrors `app create` behavior) ──────
      // The pipeline returns JSON with appId + URLs. When shareUrl is empty
      // the app is not published yet, so guide the user to publish first.
      if (result.code === 0 && result.data) {
        try {
          const parsed = JSON.parse(result.data);
          const appId: string | undefined = parsed.appId;
          if (appId) {
            console.log('');
            console.log('💡 Next steps:');
            if (!parsed.shareUrl) {
              console.log(`   Publish:   formlm-cli share publish --app ${appId}`);
            } else {
              console.log(`   Fill-in:   ${parsed.shareUrl}`);
            }
            console.log(`   Editor:    ${parsed.builderUrl || `http://formlm.me/mypage/builder.html?id=${appId}`}`);
            console.log(`   Data:      ${parsed.dataUrl || `http://formlm.me/mypage/data.html?id=${appId}`}`);
            console.log(`   Snapshot:  formlm-cli snapshot --app ${appId}`);
          }
        } catch {
          // result.data was not JSON — nothing to extract, skip guidance
        }
      }
    });
}
