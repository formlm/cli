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
  .description('The official CLI & MCP Server for FormLM — https://formlm.me\n\n  Quick start:\n    formlm-cli smart create --input "a mental health screening questionnaire"\n    formlm-cli snapshot --app <appId>\n    formlm-cli skill form\n    formlm-cli mcp  (start MCP server for any MCP client: Claude / Cursor / Codex CLI / Windsurf / etc.)')
  .version('0.2.0')
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
  .description('Start MCP Server (stdio mode) for any MCP-compatible AI platform (Claude / Cursor / Codex CLI / Windsurf / Cline / etc.). Exposes 9 tools + 6 resources.')
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

program.parse();
