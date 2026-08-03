import { Command } from 'commander';
import { registerAuthCommand } from './commands/auth.js';
import { registerProfileCommand } from './commands/profile.js';
import { registerAppCommand } from './commands/app.js';
import { registerFieldCommand } from './commands/field.js';
import { registerShareCommand } from './commands/share.js';
import { registerConnectCommand } from './commands/connect.js';
import { registerScaleCommand } from './commands/scale.js';
import { registerReportCommand } from './commands/report.js';
import { registerExpertCommand } from './commands/expert.js';
import { registerSmartCommand } from './commands/smart.js';
import { registerSnapshotCommand } from './commands/snapshot.js';
import { registerSkillCommand } from './commands/skill.js';
import { VERSION } from './version.js';

const program = new Command();

program
  .name('formlm-cli')
  .description('The official CLI & MCP Server for FormLM — https://formlm.me\n\n  Quick start:\n    formlm-cli smart plan --input "a mental health screening questionnaire"\n    formlm-cli snapshot --app <appId>\n    formlm-cli skill form\n    formlm-cli mcp  (start MCP server for any MCP client: Claude / Cursor / Codex CLI / Windsurf / etc.)')
  .version(VERSION)
  .option('--profile <name>', 'Profile to use (overrides default)');

// ── Custom error handling (MUST be set BEFORE subcommand registration) ──────
// Commander subcommands copy the parent's _exitCallback at creation time
// (copyInheritedSettings in lib/command.js), so exitOverride MUST be installed
// before any program.command() call. Otherwise subcommand errors bypass this
// handler and hit the default process.exit, losing the friendly ❌ + Usage view.
// We also suppress Commander's default `error:` output (via outputError) since
// this handler owns the full error presentation, avoiding duplicate lines.
program.configureOutput({
  outputError: () => { /* suppressed: exitOverride owns error presentation */ },
});
program.exitOverride((err: any) => {
  const msg = String(err.message || '').replace(/^error:\s*/, '');
  // Normal exits (help/version display) — exit cleanly with Commander's code.
  if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
    process.exit(err.exitCode ?? 0);
  }
  // Input-mistake errors — show friendly message + usage hint, then exit 1.
  const inputMistakeCodes = [
    'commander.missingArgument',
    'commander.missingRequiredArgument',
    'commander.missingMandatoryOptionValue', // requiredOption omitted (e.g. --input)
    'commander.optionMissingArgument',
    'commander.unknownOption',
    'commander.unknownCommand',
    'commander.invalidArgument',             // bad .choices() value (e.g. --plan-type)
    'commander.conflictingOption',
  ];
  console.error();
  console.error(`❌ ${msg}`);
  const cmd = err.command || program;
  if (inputMistakeCodes.includes(err.code) && cmd && cmd.helpInformation) {
    console.error();
    console.error('💡 Usage:');
    const help = cmd.helpInformation();
    const lines = help.split('\n').filter((l: string) => l.trim());
    const usageLines = lines.slice(0, Math.min(lines.length, 8));
    console.error(usageLines.join('\n'));
  }
  process.exit(err.exitCode ?? 1);
});

// ── Register command groups ────────────────────────────────────
// Order: high-level (smart) → query (snapshot/skill) → modules → auth/profile

registerSmartCommand(program);
registerSnapshotCommand(program);
registerSkillCommand(program);
registerAppCommand(program);
registerFieldCommand(program);
registerScaleCommand(program);
registerConnectCommand(program);
registerReportCommand(program);
registerExpertCommand(program);
registerShareCommand(program);
registerAuthCommand(program);
registerProfileCommand(program);

// ── mcp subcommand: start MCP Server ───────────────────────────
program
  .command('mcp')
  .description('Start MCP Server (stdio mode) for any MCP-compatible AI platform (Claude / Cursor / Codex CLI / Windsurf / Cline / etc.). Exposes 6 tools + 6 resources.')
  .action(async () => {
    const { startMcpServer } = await import('./mcp.js');
    await startMcpServer();
  });

// ── Inject --profile global option into config module ─────────
import { setRuntimeProfile } from './config.js';
program.hook('preAction', () => {
  const opts = program.opts();
  if (opts.profile) {
    setRuntimeProfile(opts.profile);
  }
});

// parseAsync ensures all async action handlers complete before exiting.
// For regular commands: resolves after action completes → process.exit(0).
// For MCP server mode: never resolves (server keeps running) → process stays alive.
program.parseAsync().then(() => {
  process.exit(0);
}).catch(() => {
  // exitOverride already handles commander errors via process.exit(1).
  // This catches any other unexpected errors.
  process.exit(1);
});
