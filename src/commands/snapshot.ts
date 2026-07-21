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
 * For each module, the query uses --md (markdown) format for token efficiency.
 */
export function registerSnapshotCommand(parent: Command): void {
  parent
    .command('snapshot')
    .description('Get aggregated snapshot of ALL app modules (form + scale + connect + report + expert + share) — one call, full context')
    .requiredOption('--app <appId>', 'App ID')
    .option('--module <name>', 'Get only a specific module: form / scale / connect / report / expert / share (default: all)')
    .action(async (opts) => {
      const modules = opts.module
        ? [opts.module]
        : ['form', 'scale', 'connect', 'report', 'expert', 'share'];

      const commands: Record<string, string> = {
        form: `assess form query --app ${opts.app} --json`,
        scale: `assess scale query --app ${opts.app} --md`,
        connect: `assess connect query --app ${opts.app} --md`,
        report: `assess report query --app ${opts.app} --md`,
        expert: `assess expert query --app ${opts.app} --md`,
        share: `assess share query --app ${opts.app} --json`,
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
          // Try to parse as JSON for structured modules, keep raw text for md modules
          if (module === 'form' || module === 'share') {
            try {
              snapshot[module] = JSON.parse(result.data);
            } catch {
              snapshot[module] = result.data || result.message;
            }
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
