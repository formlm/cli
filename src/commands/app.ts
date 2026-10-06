import { Command } from 'commander';
import { execCommand } from '../exec.js';
import { output, guidance, localFail, isJsonMode } from '../output.js';
import { escapeArg } from '../utils.js';
import { shareTokenFromUrl } from '../summary.js';

/** Fill shareToken into an app-urls payload when the server didn't provide it. */
function fillToken(result: { code: number; message: string; data: any }): void {
  if (result.code !== 0 || !result.data || !isJsonMode()) return;
  try {
    const urls = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
    if (urls && typeof urls === 'object' && !urls.shareToken) {
      urls.shareToken = shareTokenFromUrl(urls.shareUrl);
      result.data = JSON.stringify(urls);
    }
  } catch { /* not a urls payload — leave untouched */ }
}

export function registerAppCommand(parent: Command): void {
  const app = parent.command('app').description('App management');

  app
    .command('list')
    .description('List apps (server default page = latest 20; use --all for full reconciliation, --with-urls to also get publish state + shareToken per app in one call)')
    .option('--all', 'Return all apps instead of the first page (equates --limit 500)')
    .option('--limit <n>', 'Page size (1-500, server default 20)')
    .option('--page <n>', 'Page number, 1-based (default 1)')
    .option('--with-urls', 'Enrich JSON output with published/shareType/sharePerm/shareDay/shareUrl/shareToken per app')
    .option('--name <keyword>', 'Filter by app name (server-side match)')
    .action(async (opts) => {
      let cmd = 'assess app list';
      if (opts.name) cmd += ` --name "${escapeArg(opts.name)}"`;
      if (opts.all) cmd += ' --all';
      if (opts.limit !== undefined) {
        const n = Number(opts.limit);
        if (!Number.isInteger(n) || n < 1 || n > 500) localFail(`Invalid --limit "${opts.limit}". Use 1-500.`);
        cmd += ` --size ${n}`;
      }
      if (opts.page !== undefined) cmd += ` --page ${opts.page}`;
      if (opts.withUrls) cmd += ' --with-urls';
      cmd += ' --json';
      const result = await execCommand(cmd);
      output(result);
    });

  app
    .command('create')
    .description('Create a new app')
    .requiredOption('--name <name>', 'App name')
    .option('--description <desc>', 'App description')
    .action(async (opts) => {
      const cmd = `assess app create --name "${escapeArg(opts.name)}"${opts.description ? ` --description "${escapeArg(opts.description)}"` : ''} --json`;
      const result = await execCommand(cmd);
      // Server returns the created AppEntity whose id field is `id` (smart plan uses `appId`) —
      // normalize to ALSO expose appId in the payload so scripts have one key to read.
      if (result.code === 0 && result.data) {
        try {
          const created = JSON.parse(result.data);
          const id = created.id || created.appId || '';
          if (id && !created.appId) {
            created.appId = id;
            result.data = JSON.stringify(created);
          }
        } catch {}
      }
      output(result);
      if (result.code === 0) {
        // Extract appId from result for tips
        let appId = '';
        try {
          const parsed = JSON.parse(result.data);
          appId = parsed.appId || parsed.id || '';
        } catch {}
        if (appId) {
          guidance('');
          guidance('💡 Next steps:');
          guidance(`   Get URLs:    formlm-cli app urls --app ${appId}`);
          guidance(`   Beautify:    formlm-cli connect style apply-all --app ${appId} --look "描述你的场景和视觉风格"`);
          guidance(`   Add fields:  formlm-cli field add --app ${appId} --id q1 --name "Question 1" --type radio`);
        }
      }
    });

  app
    .command('get')
    .description('Get app details')
    .requiredOption('--app <appId>', 'App ID')
    .action(async (opts) => {
      const result = await execCommand(`assess app use --app ${opts.app} --json`);
      output(result);
    });

  app
    .command('update')
    .description('Update an app')
    .requiredOption('--app <appId>', 'App ID')
    .option('--name <name>', 'New app name')
    .option('--description <desc>', 'New description')
    .option('--theme <theme>', 'App theme')
    .action(async (opts) => {
      let cmd = `assess app update --app ${opts.app}`;
      if (opts.name) cmd += ` --name "${escapeArg(opts.name)}"`;
      if (opts.description) cmd += ` --description "${escapeArg(opts.description)}"`;
      if (opts.theme) cmd += ` --theme ${opts.theme}`;
      cmd += ' --json';
      const result = await execCommand(cmd);
      output(result);
    });

  app
    .command('urls')
    .description('Get all app URLs (fill-in, editor, data management, Data API) plus published/shareType/shareToken summaries; all URLs are absolute https')
    .requiredOption('--app <appId>', 'App ID')
    .action(async (opts) => {
      const cmd = `assess app urls --app ${opts.app} --json`;
      const result = await execCommand(cmd);
      fillToken(result);
      output(result);
    });

  const deleteAction = async (opts: any) => {
    const result = await execCommand(`assess app remove --app ${opts.app} --json`);
    output(result);
  };

  app
    .command('delete')
    .description('Delete an app (irreversible). "app remove" is accepted as an alias.')
    .requiredOption('--app <appId>', 'App ID')
    .action(deleteAction);

  // README/agents historically used `app remove` — register it as an explicit alias
  // so the command surface matches the docs instead of falling through to top-level usage.
  app
    .command('remove')
    .description('Delete an app — alias of "app delete" (irreversible)')
    .requiredOption('--app <appId>', 'App ID')
    .action(deleteAction);
}
