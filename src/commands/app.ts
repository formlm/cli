import { Command } from 'commander';
import { execCommand } from '../exec.js';
import { output } from '../output.js';

export function registerAppCommand(parent: Command): void {
  const app = parent.command('app').description('App management');

  app
    .command('list')
    .description('List all apps')
    .action(async () => {
      const result = await execCommand('assess app list --json');
      output(result);
    });

  app
    .command('create')
    .description('Create a new app')
    .requiredOption('--name <name>', 'App name')
    .option('--description <desc>', 'App description')
    .action(async (opts) => {
      const cmd = `assess app create --name "${opts.name}"${opts.description ? ` --description "${opts.description}"` : ''} --json`;
      const result = await execCommand(cmd);
      output(result);
      if (result.code === 0) {
        // Extract appId from result for tips
        let appId = '';
        try { appId = JSON.parse(result.data).id || ''; } catch {}
        if (appId) {
          console.log('');
          console.log('💡 Next steps:');
          console.log(`   Get URLs:    formlm-cli app urls --app ${appId}`);
          console.log(`   Beautify:    formlm-cli connect style apply-all --app ${appId} --look "描述你的场景和视觉风格"`);
          console.log(`   Add fields:  formlm-cli field add --app ${appId} --id q1 --name "Question 1" --type radio`);
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
      if (opts.name) cmd += ` --name "${opts.name}"`;
      if (opts.description) cmd += ` --description "${opts.description}"`;
      if (opts.theme) cmd += ` --theme ${opts.theme}`;
      cmd += ' --json';
      const result = await execCommand(cmd);
      output(result);
    });

  app
    .command('urls')
    .description('Get all app URLs (fill-in, editor, data management)')
    .requiredOption('--app <appId>', 'App ID')
    .action(async (opts) => {
      const cmd = `assess app urls --app ${opts.app} --json`;
      const result = await execCommand(cmd);
      output(result);
    });

  app
    .command('delete')
    .description('Delete an app')
    .requiredOption('--app <appId>', 'App ID')
    .action(async (opts) => {
      const result = await execCommand(`assess app remove --app ${opts.app} --json`);
      output(result);
    });
}
