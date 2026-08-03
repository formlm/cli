import { Command } from 'commander';
import { execCommand } from '../exec.js';
import { output } from '../output.js';

/**
 * Snapshot Command — Aggregated App State Query
 *
 * Fetches the current state of ALL 6 modules (form, scale, connect, report, expert, share)
 * in a single command, returning a unified JSON snapshot. This is the equivalent of
 * newapp.html's "reference data injection" step — it gives the AI agent full context
 * about the current app state before generating modification commands.
 *
 * By default, all modules use --json for consistent structured output.
 * Use --md to switch to markdown format (token-efficient for AI consumption).
 */
export function registerSnapshotCommand(parent: Command): void {
  parent
    .command('snapshot')
    .description('Get aggregated snapshot of ALL app modules (form + scale + connect + report + expert + share) — one call, full context')
    .requiredOption('--app <appId>', 'App ID')
    .option('--module <name>', 'Get only a specific module: form / scale / connect / report / expert / share (default: all)')
    .option('--md', 'Output all modules in Markdown format (token-efficient for AI, default: JSON)')
    .action(async (opts) => {
      const validModules = ['form', 'scale', 'connect', 'report', 'expert', 'share'];
      // Validate module name early — prevent silent empty snapshot
      if (opts.module && !validModules.includes(opts.module)) {
        console.error(`❌ Invalid module "${opts.module}". Valid: ${validModules.join(', ')}`);
        process.exit(1);
      }

      const modules = opts.module
        ? [opts.module]
        : validModules;

      const format = opts.md ? '--md' : '--json';

      const commands: Record<string, string> = {
        form: `assess form query --app ${opts.app} ${format}`,
        scale: `assess scale query --app ${opts.app} ${format}`,
        connect: `assess connect query --app ${opts.app} ${format}`,
        report: `assess report query --app ${opts.app} ${format}`,
        expert: `assess expert query --app ${opts.app} ${format}`,
        share: `assess share query --app ${opts.app} ${format}`,
      };

      // Execute requested modules in parallel
      const entries = modules.filter((m) => commands[m]);
      const results = await Promise.all(
        entries.map((m) => execCommand(commands[m]).then((r) => [m, r] as const))
      );

      const snapshot: Record<string, unknown> = { appId: opts.app };
      const errors: string[] = [];

      for (const [module, result] of results) {
        if (result.code === 0) {
          // In JSON mode, parse uniformly; in md mode, keep raw text
          if (!opts.md) {
            try { snapshot[module] = JSON.parse(result.data); }
            catch { snapshot[module] = result.data || result.message; }
          } else {
            snapshot[module] = result.data || result.message;
          }
        } else {
          snapshot[module] = null;
          errors.push(`${module}: ${result.message}`);
        }
      }

      if (errors.length > 0) {
        snapshot['_errors'] = errors;
      }

      console.log(JSON.stringify(snapshot, null, 2));
    });
}
