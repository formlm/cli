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
import { registerDoctorCommand } from './commands/doctor.js';
import { registerSkillCommand } from './commands/skill.js';
import { VERSION } from './version.js';

// ── Global `--json` tolerance ────────────────────────────────────
// Accept `--json` at ANY position (before or after the subcommand) without every
// subcommand having to declare it. Commander would otherwise throw
// "unknown option '--json'" on subcommands that don't define it. We strip the
// token from argv before parsing and translate it into machine-output mode
// (FORMLM_JSON → the stable {ok,code,message,data} envelope in output.ts).
// Values are matched as whole argv tokens only, so `--plan <json>` is unaffected.
if (process.argv.includes('--json')) {
  process.env.FORMLM_JSON = process.env.FORMLM_JSON || '1';
  process.argv = process.argv.filter(a => a !== '--json');
}

const program = new Command();

program
  .name('formlm-cli')
  .description('The official CLI & MCP Server for FormLM — https://formlm.me\n\n  Quick start:\n    formlm-cli smart plan --input "a mental health screening questionnaire" --save-plan plan.json\n    formlm-cli smart execute --app <appId> --module form [--plan-file plan.json]\n    formlm-cli smart generate --input "a mental health screening questionnaire" --publish --doctor   (one-shot wrapper)\n    formlm-cli snapshot --app <appId> --summary\n    formlm-cli doctor --app <appId> --expect-lang en\n    formlm-cli share publish --app <appId> --access visitor   (anonymous; --access all needs login)\n    formlm-cli skill form\n    formlm-cli mcp  (start MCP server for any MCP client: Claude / Cursor / Codex CLI / Windsurf / etc.)\n\n  Steps: smart plan → smart execute per module. \"smart generate\" wraps both in one call.')
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
  // FORMLM_NO_EXIT=1: never kill the host process on a per-command input mistake —
  // emit a parseable envelope (JSON mode) or a friendly error, then throw so the
  // bottom-level catch swallows it. Batch drivers keep running.
  if (process.env.FORMLM_NO_EXIT === '1') {
    if (process.env.FORMLM_JSON === '1') {
      console.log(JSON.stringify({ ok: false, code: 400, message: msg, data: null }));
    } else {
      console.error();
      console.error(`❌ ${msg}`);
      const owning = err.commanderCommand || err.command || program;
      const cmd = owning && typeof owning.helpInformation === 'function' ? owning : program;
      if (inputMistakeCodes.includes(err.code) && cmd && cmd.helpInformation) {
        console.error();
        console.error('💡 Usage:');
        const lines = cmd.helpInformation().split('\n').filter((l: string) => l.trim());
        console.error(lines.slice(0, Math.min(lines.length, 12)).join('\n'));
      }
    }
    throw err;
  }
  // Resolve the command the error actually belongs to. Commander attaches the owning
  // command on `commanderCommand` (e.g. `field add` for a missing required option);
  // the legacy `command` property is often the root program, which used to print the
  // whole top-level help instead of the subcommand usage (noisy, slow to act on).
  console.error();
  console.error(`❌ ${msg}`);
  const owning = err.commanderCommand || err.command || program;
  const cmd = owning && typeof owning.helpInformation === 'function' ? owning : program;
  if (inputMistakeCodes.includes(err.code) && cmd && cmd.helpInformation) {
    console.error();
    console.error('💡 Usage:');
    const help = cmd.helpInformation();
    const lines = help.split('\n').filter((l: string) => l.trim());
    const usageLines = lines.slice(0, Math.min(lines.length, 12));
    console.error(usageLines.join('\n'));
  }
  process.exit(err.exitCode ?? 1);
});

// ── Register command groups ────────────────────────────────────
// Order: high-level (smart) → query (snapshot/doctor/skill) → modules → auth/profile

registerSmartCommand(program);
registerSnapshotCommand(program);
registerDoctorCommand(program);
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
// FORMLM_NO_EXIT=1 (batch/library mode) suppresses BOTH forced exits, so a single
// failing command cannot kill the host loop — matching output.ts semantics.
program.parseAsync().then(() => {
  if (process.env.FORMLM_NO_EXIT === '1') return;
  process.exit(0);
}).catch((err: any) => {
  // exitOverride already handles commander errors via process.exit(1).
  // This catches any other unexpected errors (e.g. localFail throwing under NO_EXIT).
  if (process.env.FORMLM_NO_EXIT === '1') {
    // Envelope already printed by output()/localFail() in JSON mode; log detail for humans.
    if (err && err.message && process.env.FORMLM_JSON !== '1') console.error(`❌ ${err.message}`);
    return;
  }
  process.exit(1);
});
