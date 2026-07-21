import { Command } from 'commander';
import { authLogin, authMe } from '../exec.js';
import { addProfile, removeProfile, getActiveProfile, getBaseUrl } from '../config.js';
import * as readline from 'node:readline';

export function registerAuthCommand(parent: Command): void {
  const auth = parent.command('auth').description('Authentication management');

  auth
    .command('login')
    .description('Log in to FormLM')
    .option('--token <token>', 'Log in directly with a token')
    .option('--url <url>', 'Server URL (defaults to FORMLM_BASE_URL env var or https://formlm.me)')
    .action(async (opts) => {
      // 优先级：--url 参数 > FORMLM_BASE_URL 环境变量 > 默认 https://formlm.me
      // 避免本地/自建服务器用户未显式传 --url 时被静默写入错误的 formlm.me
      const url = opts.url || getBaseUrl();
      if (opts.token) {
        // Use token directly
        addProfile({ name: 'default', url, token: opts.token, active: true });
        // Verify token
        const result = await authMe();
        if (result.code === 0) {
          console.log('✅ Login successful!');
          console.log(`   User: ${JSON.stringify(result.data)}`);
        } else {
          console.log(`⚠️  Token saved but verification failed: ${result.message}`);
        }
        return;
      }

      // Interactive input
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q: string): Promise<string> => new Promise(res => rl.question(q, res));

      const email = await ask('Email: ');
      const password = await ask('Password: ');
      rl.close();

      const result = await authLogin(email, password);
      if (result.code === 0 && result.data) {
        const token = typeof result.data === 'string' ? result.data : (result.data as any).token || '';
        addProfile({ name: 'default', url, token, active: true });
        console.log('✅ Login successful!');
      } else {
        console.log(`❌ Login failed: ${result.message}`);
      }
    });

  auth
    .command('status')
    .description('Show current login status')
    .action(async () => {
      const profile = getActiveProfile();
      if (!profile) {
        console.log('❌ Not logged in. Run: formlm-cli auth login');
        return;
      }
      console.log(`Profile: ${profile.name}`);
      console.log(`Server:  ${profile.url}`);
      const result = await authMe();
      if (result.code === 0) {
        console.log(`Status:  ✅ Logged in`);
        console.log(`User:    ${JSON.stringify(result.data)}`);
      } else {
        console.log(`Status:  ❌ Token invalid (${result.message})`);
      }
    });

  auth
    .command('logout')
    .description('Log out and clear local token')
    .action(() => {
      const profile = getActiveProfile();
      if (!profile) {
        console.log('Already logged out.');
        return;
      }
      removeProfile(profile.name);
      console.log('✅ Logged out.');
    });
}
