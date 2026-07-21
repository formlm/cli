import { Command } from 'commander';
import { execCommand } from '../exec.js';
import { output } from '../output.js';

/**
 * Smart Pipeline Commands
 *
 * Wraps the server-side AssessAgent / BuilderAgent intelligent pipelines:
 * - smart create: AssessAgent.plan() + execute() — natural language → full app
 * - smart plan: AssessAgent.plan() only — preview plan without executing
 * - smart modify: BuilderAgent Think → Plan → Execute → Reflect — modify existing app
 *
 * These are the RECOMMENDED entry points for AI agents (works with any MCP-compatible
 * platform: Claude / Cursor / Codex CLI / Windsurf / etc., or direct CLI usage)
 * because they embed the full SKILL.md domain knowledge, reference data injection,
 * and multi-step orchestration that newapp.html uses internally.
 */
export function registerSmartCommand(parent: Command): void {
  const smart = parent.command('smart').description('Intelligent pipeline — natural language to live app (recommended for AI agents)');

  // ── smart create ──────────────────────────────────────────────

  smart
    .command('create')
    .description('Create a complete app from natural language description. The server runs AssessAgent: plan → execute → reflect. This is the fastest way to get a production-ready assessment app')
    .requiredOption('--input <text>', 'Natural language description of the app you want to build (e.g. "a mental health screening questionnaire for college students")')
    .option('--plan-type <type>', 'Plan type: assessment / consultation / survey / exam / quiz / learn (default: auto-detected by AI)')
    .option('--style <style>', 'Visual style preference (e.g. "深色科技风" or "warm and friendly")')
    .option('--question-count <count>', 'Question count range: 10-15 / 15-20 / 20-30')
    .action(async (opts) => {
      let cmd = `assess smart create --input "${opts.input}"`;
      if (opts.planType) cmd += ` --plan-type ${opts.planType}`;
      if (opts.style) cmd += ` --style "${opts.style}"`;
      if (opts.questionCount) cmd += ` --question-count ${opts.questionCount}`;
      cmd += ' --json';
      const result = await execCommand(cmd);
      output(result);
    });

  // ── smart plan ───────────────────────────────────────────────

  smart
    .command('plan')
    .description('Preview the execution plan WITHOUT executing it. Returns the task list for user review. Equivalent to newapp.html review stage')
    .requiredOption('--input <text>', 'Natural language description of the app you want to build')
    .option('--plan-type <type>', 'Plan type: assessment / consultation / survey / exam / quiz / learn (default: auto-detected by AI)')
    .option('--style <style>', 'Visual style preference (e.g. "深色科技风" or "warm and friendly")')
    .option('--question-count <count>', 'Question count range: 10-15 / 15-20 / 20-30')
    .action(async (opts) => {
      let cmd = `assess smart plan --input "${opts.input}"`;
      if (opts.planType) cmd += ` --plan-type ${opts.planType}`;
      if (opts.style) cmd += ` --style "${opts.style}"`;
      if (opts.questionCount) cmd += ` --question-count ${opts.questionCount}`;
      cmd += ' --json';
      const result = await execCommand(cmd);
      output(result);
    });

  // ── smart modify ──────────────────────────────────────────────

  smart
    .command('modify')
    .description('Modify an existing app using natural language. The server runs BuilderAgent: think → plan → execute → reflect. Automatically queries current state, generates precise modification commands, and validates results')
    .requiredOption('--app <appId>', 'App ID to modify')
    .requiredOption('--input <text>', 'Natural language description of the change (e.g. "add a depression subscale" or "change the cover page to a dark blue gradient")')
    .action(async (opts) => {
      const cmd = `assess smart modify --app ${opts.app} --input "${opts.input}" --json`;
      const result = await execCommand(cmd);
      output(result);
    });

  // ── smart confirm ───────────────────────────────────

  smart
    .command('confirm')
    .description('Confirm and execute a medium/high risk plan previously returned by smart modify with planPreview=true. Pass the exact "plan" JSON unmodified. No web UI required')
    .requiredOption('--app <appId>', 'App ID (same as used for smart modify)')
    .requiredOption('--plan-json <json>', 'The exact "plan" field returned by smart modify (unmodified JSON)')
    .action(async (opts) => {
      const cmd = `assess smart confirm --app ${opts.app} --plan-json "${opts.planJson}" --json`;
      const result = await execCommand(cmd);
      output(result);
    });
}
