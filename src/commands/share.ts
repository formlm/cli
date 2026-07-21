import { Command } from 'commander';
import { execCommand } from '../exec.js';
import { output } from '../output.js';

export function registerShareCommand(parent: Command): void {
  const share = parent.command('share').description('Share & publish management — set command is naturally idempotent (safe to re-run)');

  share
    .command('publish')
    .description('Publish the form for public access (each respondent can submit once; unlimited respondents; stays open until unpublished)')
    .requiredOption('--app <appId>', 'App ID')
    .action(async (opts) => {
      const cmd = `assess share set --app ${opts.app} --form-type all --form-perm 1 --form-day 3650000 --json`;
      const result = await execCommand(cmd);
      output(result);
    });

  share
    .command('unpublish')
    .description('Unpublish the app')
    .requiredOption('--app <appId>', 'App ID')
    .action(async (opts) => {
      const cmd = `assess share set --app ${opts.app} --form-type no --json`;
      const result = await execCommand(cmd);
      output(result);
    });

  share
    .command('query')
    .description('Query publish status')
    .requiredOption('--app <appId>', 'App ID')
    .action(async (opts) => {
      const cmd = `assess share query --app ${opts.app} --json`;
      const result = await execCommand(cmd);
      output(result);
    });

  share
    .command('url')
    .description('Get the form fill-in URL')
    .requiredOption('--app <appId>', 'App ID')
    .action(async (opts) => {
      const cmd = `assess share url --app ${opts.app}`;
      const result = await execCommand(cmd);
      output(result);
    });
}
