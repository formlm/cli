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

const program = new Command();

program
  .name('formlm-cli')
  .description('The official CLI & MCP Server for FormLM — https://formlm.me\n\n  Quick start:\n    formlm-cli smart generate --input "a mental health screening questionnaire"\n    formlm-cli snapshot --app <appId>\n    formlm-cli skill form\n    formlm-cli mcp  (start MCP server for any MCP client: Claude / Cursor / Codex CLI / Windsurf / etc.)')
  .version('0.2.1')
  .option('--profile <name>', 'Profile to use (overrides default)');

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

// ── Custom error handling: enhance missing-option errors with usage tips ───
// Commander's default error message for missing options is:
//   error: required option '--name <name>' not specified
// We intercept it to add a usage example.
program.exitOverride((err: any) => {
  // commander errors have code property; only intercept option-missing errors
  if (err.code === 'commander.missingArgument' || err.code === 'commander.missingRequiredArgument' || err.code === 'commander.unknownOption') {
    console.error();
    console.error(`❌ ${err.message}`);
    // Find the command that caused the error to show its help
    const cmd = err.command || program;
    if (cmd && cmd.helpInformation) {
      console.error();
      console.error('💡 Usage:');
      // Show only the first few lines of help (usage + options)
      const help = cmd.helpInformation();
      const lines = help.split('\n').filter((l: string) => l.trim());
      const usageLines = lines.slice(0, Math.min(lines.length, 8));
      console.error(usageLines.join('\n'));
    }
    process.exit(1);
  }
  // For other errors, re-throw
  throw err;
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
