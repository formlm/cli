import { Command } from 'commander';
import { loadConfig, addProfile, setActiveProfile, removeProfile, getActiveProfile, getBaseUrl } from '../config.js';

export function registerProfileCommand(parent: Command): void {
  const profile = parent.command('profile').description('Multi-account profile management');

  profile
    .command('add')
    .description('Add a profile')
    .option('--name <name>', 'Profile name', 'default')
    .option('--url <url>', 'Server URL (defaults to FORMLM_BASE_URL env var or https://formlm.me)')
    .option('--token <token>', 'Auth token')
    .action((opts) => {
      if (!opts.token) {
        console.log('❌ --token is required. Get your token from FormLM website or run: formlm-cli auth login');
        return;
      }
      const url = opts.url || getBaseUrl();
      addProfile({ name: opts.name, url, token: opts.token });
      console.log(`✅ Profile "${opts.name}" added.`);
    });

  profile
    .command('list')
    .description('List all profiles')
    .action(() => {
      const config = loadConfig();
      if (config.profiles.length === 0) {
        console.log('No profiles. Run: formlm-cli auth login');
        return;
      }
      for (const p of config.profiles) {
        const active = p.active ? ' (active)' : '';
        const maskedToken = p.token ? p.token.substring(0, 8) + '...' : '(none)';
        console.log(`  ${p.name}${active}  ${p.url}  token: ${maskedToken}`);
      }
    });

  profile
    .command('use')
    .argument('<name>', 'Profile name')
    .description('Switch default profile')
    .action((name: string) => {
      if (setActiveProfile(name)) {
        console.log(`✅ Switched to profile "${name}".`);
      } else {
        console.log(`❌ Profile "${name}" not found.`);
      }
    });

  profile
    .command('remove')
    .argument('<name>', 'Profile name')
    .description('Remove a profile')
    .action((name: string) => {
      if (removeProfile(name)) {
        console.log(`✅ Profile "${name}" removed.`);
      } else {
        console.log(`❌ Profile "${name}" not found.`);
      }
    });
}
