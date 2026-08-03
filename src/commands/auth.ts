import { Command } from 'commander';
import { authLogin, authMe } from '../exec.js';
import { addProfile, removeProfile, getActiveProfile, getBaseUrl } from '../config.js';
import * as readline from 'node:readline';

/**
 * Read a password from stdin with masking.
 * - TTY: switches to raw mode so keystrokes are captured immediately, echoes '*'
 *   per char, supports Backspace and Ctrl+C. Prevents plaintext echo on screen.
 * - Non-TTY (piped input): falls back to plain readline (masking impossible).
 */
function askPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (stdin.isTTY) {
      process.stdout.write(prompt);
      stdin.setRawMode(true);
      stdin.resume();
      let password = '';
      const onData = (buf: Buffer) => {
        const chars = buf.toString();
        for (const ch of chars) {
          if (ch === '\r' || ch === '\n') {
            stdin.setRawMode(false);
            stdin.pause();
            stdin.removeListener('data', onData);
            process.stdout.write('\n');
            resolve(password);
            return;
          } else if (ch === '\u0003') { // Ctrl+C
            stdin.setRawMode(false);
            process.exit(1);
          } else if (ch === '\u0004') { // Ctrl+D (EOF)
            stdin.setRawMode(false);
            stdin.pause();
            stdin.removeListener('data', onData);
            process.stdout.write('\n');
            resolve(password);
            return;
          } else if (ch === '\u007f' || ch === '\b') { // Backspace / Ctrl+H
            if (password.length > 0) {
              password = password.slice(0, -1);
              process.stdout.write('\b \b');
            }
          } else if (ch >= ' ') { // printable chars only
            password += ch;
            process.stdout.write('*');
          }
        }
      };
      stdin.on('data', onData);
    } else {
      // Non-TTY: cannot mask piped input, fall back to plain readline
      const rl = readline.createInterface({ input: stdin, output: process.stdout });
      rl.question(prompt, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

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

      // Interactive input (email via readline, password via masked raw-mode reader)
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q: string): Promise<string> => new Promise(res => rl.question(q, res));

      const email = await ask('Email: ');
      rl.close();
      const password = await askPassword('Password: ');
      console.log();

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
