import { Command } from 'commander';
import { authLogin, authMe, authSendEmailCode, authLoginCode, fetchCaptchaImage } from '../exec.js';
import { addProfile, removeProfile, getActiveProfile, getBaseUrl, CONFIG_DIR } from '../config.js';
import { isJsonMode } from '../output.js';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

const EMAIL_REG = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Best-effort JSON parse for envelope payloads (never throws). */
function tryParseData(s: string): any {
  try { return JSON.parse(s); } catch { return s; }
}

/**
 * 用系统默认看图工具打开文件（macOS open / Windows start / Linux xdg-open）。
 * 打开失败不致命 —— 会同时打印文件路径供手动打开。
 */
function openFile(file: string): void {
  try {
    const cmd = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'cmd'
      : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', file] : [file];
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.unref();
  } catch {
    // ignore — 用户可按打印出的路径手动打开
  }
}

/**
 * 邮箱验证码登录流程（全程在终端完成，无需密码、无需跳网页）：
 *   ① 拉取图片验证码 → 保存并尝试自动打开 → 用户输入图中 4 位数字（60s 有效）
 *   ② 提交图片码触发服务端发送邮箱验证码（同邮箱 60s 冷却）
 *   ③ 用户输入邮箱收到的 6 位验证码（5 分钟有效）→ 登录
 */
async function loginByEmailCode(url: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> => new Promise(res => rl.question(q, res));

  const email = (await ask('Email: ')).trim();
  if (!EMAIL_REG.test(email)) {
    rl.close();
    console.log('❌ Invalid email address.');
    return;
  }

  // Step 1/3 — 图片验证码（服务端的人机验证门槛，Agent/脚本无法自动通过）
  console.log('\nStep 1/3 — Fetching captcha image...');
  const cap = await fetchCaptchaImage(email);
  if (!cap.ok || !cap.image) {
    rl.close();
    console.log(`❌ Failed to fetch captcha: ${cap.message}`);
    return;
  }
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    const captchaFile = path.join(CONFIG_DIR, 'captcha.gif');
    fs.writeFileSync(captchaFile, cap.image);
    openFile(captchaFile);
    console.log(`   Captcha saved to: ${captchaFile} (opening it — or open manually)`);
  } catch {
    // 写盘/打开失败不阻断：提示用户重试
    rl.close();
    console.log('❌ Failed to save captcha image. Please try again.');
    return;
  }
  const captcha = (await ask('Enter the 4 digits shown in the image: ')).trim();
  rl.close();

  // Step 2/3 — 发送邮箱验证码
  console.log(`\nStep 2/3 — Sending verification code to ${email} ...`);
  const send = await authSendEmailCode(email, captcha);
  if (send.code !== 200) {
    if (send.code === 403) {
      console.log('❌ Wrong captcha. Run `formlm-cli auth login` and try again.');
    } else if (send.code === 429) {
      console.log('❌ Rate limited — wait a minute and try again.');
      console.log('   (Server limits: 1 send per email per 60s, 10 sends per IP per minute.)');
    } else {
      console.log(`❌ Failed to send code: ${send.message}`);
    }
    return;
  }
  console.log('✅ Verification code sent. Check your inbox (and spam folder).');
  console.log('   The code is 6 digits, valid 5 minutes.');

  // Step 3/3 — 输入邮箱验证码并登录
  const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask2 = (q: string): Promise<string> => new Promise(res => rl2.question(q, res));
  const emailCode = (await ask2('Enter the 6-digit code from the email (valid 5 min): ')).trim();
  rl2.close();

  const result = await authLoginCode(email, emailCode);
  if (result.code === 0 && result.data) {
    const token = typeof result.data === 'string' ? result.data : (result.data as any).token || '';
    addProfile({ name: 'default', url, token, active: true });
    console.log('✅ Login successful!');
  } else if (result.code === 403) {
    console.log('❌ Invalid or expired verification code. Codes expire after 5 minutes.');
    console.log('   Double-check the digits and retry, or run `formlm-cli auth login` for a fresh code');
    console.log('   (same email is rate-limited to 1 send per 60s).');
  } else if (result.code === 429) {
    console.log('❌ Too many attempts — wait a minute and try again.');
    console.log('   (5 failed code attempts lock the account for 30 minutes.)');
  } else {
    console.log(`❌ Login failed: ${result.message}`);
  }
}

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
    .option('--token-stdin', 'Read the token from stdin (avoids leaking a secret into shell history / process list)')
    .option('--url <url>', 'Server URL (defaults to FORMLM_BASE_URL env var or https://formlm.me)')
    .action(async (opts) => {
      // 优先级：--url 参数 > FORMLM_BASE_URL 环境变量 > 默认 https://formlm.me
      // 避免本地/自建服务器用户未显式传 --url 时被静默写入错误的 formlm.me
      const url = opts.url || getBaseUrl();
      // token 来源优先级：--token-stdin > --token > FORMLM_TOKEN 环境变量
      let token: string = opts.token || '';
      if (opts.tokenStdin) {
        token = fs.readFileSync(0, 'utf-8').trim();
      } else if (!token && process.env.FORMLM_TOKEN) {
        token = process.env.FORMLM_TOKEN.trim();
      }
      if (token) {
        // Use token directly
        addProfile({ name: 'default', url, token, active: true });
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

      // 交互式登录 —— 三种方式：Access Token（首选）> 邮箱验证码 > 邮箱密码
      // 多数账号经邮箱验证码或 Google 注册，没有密码：方式 1/2 覆盖全部账号
      console.log('Select login method:');
      console.log('  1) Access Token  (recommended — copy from formlm.me → Workspace → Account Settings)');
      console.log('  2) Email verification code  (no password needed — done entirely in this terminal)');
      console.log('  3) Email + password  (only if your account has set a password)');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q: string): Promise<string> => new Promise(res => rl.question(q, res));
      const choice = (await ask('Choice [1-3]: ')).trim();
      rl.close();

      if (choice === '2') {
        await loginByEmailCode(url);
        return;
      }

      if (choice === '1') {
        // Access Token 方式：与 --token 参数同链路
        const rlTok = readline.createInterface({ input: process.stdin, output: process.stdout });
        const askTok = (q: string): Promise<string> => new Promise(res => rlTok.question(q, res));
        const token = (await askTok('Paste your Access Token: ')).trim();
        rlTok.close();
        if (!token) {
          console.log('❌ Token is empty. Get it from formlm.me → Workspace → Account Settings → Access Token.');
          return;
        }
        addProfile({ name: 'default', url, token, active: true });
        const result = await authMe();
        if (result.code === 0) {
          console.log('✅ Login successful!');
          console.log(`   User: ${JSON.stringify(result.data)}`);
        } else {
          console.log(`⚠️  Token saved but verification failed: ${result.message}`);
        }
        return;
      }

      // 方式 3：邮箱 + 密码（仅限已设密码账号）
      console.log('Note: accounts registered via email verification code or Google have NO password.');
      console.log('      If login fails, use method 1 (Access Token) or 2 (email verification code).');
      const rl3 = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ask3 = (q: string): Promise<string> => new Promise(res => rl3.question(q, res));

      const email = await ask3('Email: ');
      rl3.close();
      const password = await askPassword('Password: ');
      console.log();

      const result = await authLogin(email, password);
      if (result.code === 0 && result.data) {
        const token = typeof result.data === 'string' ? result.data : (result.data as any).token || '';
        addProfile({ name: 'default', url, token, active: true });
        console.log('✅ Login successful!');
      } else {
        console.log(`❌ Login failed: ${result.message}`);
        console.log('Hint: if your account was registered via email verification code or Google, it has no password.');
        console.log('      Use method 1 (Access Token) or method 2 (email verification code) instead.');
      }
    });

  auth
    .command('status')
    .description('Show current login status (honours --json / FORMLM_JSON: emits the standard {ok,code,message,data} envelope)')
    .action(async () => {
      const profile = getActiveProfile();
      // Machine mode: single-line envelope on stdout only — same contract as every other command
      if (isJsonMode()) {
        if (!profile) {
          console.log(JSON.stringify({ ok: false, code: 401, message: 'Not logged in. Run: formlm-cli auth login', data: null }));
          return;
        }
        const r = await authMe();
        console.log(JSON.stringify({
          ok: r.code === 0,
          code: r.code,
          message: r.code === 0 ? 'ok' : `Token invalid: ${r.message}`,
          data: { profile: profile.name, server: profile.url, loggedIn: r.code === 0, user: r.code === 0 ? (typeof r.data === 'string' ? tryParseData(r.data) : r.data) : null },
        }));
        return;
      }
      if (!profile) {
        console.log('❌ Not logged in. Run: formlm-cli auth login');
        console.log('   No password? Copy your Access Token from formlm.me → Workspace →');
        console.log('   Account Settings, then run: formlm-cli auth login --token <your-token>');
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
        console.log(`Note:    Tokens expire after 7 days. Copy a fresh Access Token from formlm.me →`);
        console.log(`         Workspace → Account Settings → Access Token, then run:`);
        console.log(`         formlm-cli auth login --token <your-token>`);
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
