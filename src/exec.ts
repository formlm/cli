import * as crypto from 'node:crypto';
import * as http from 'node:http';
import * as https from 'node:https';
import { getBaseUrl, getToken } from './config.js';

// Connection reuse within one process. A single CLI invocation barely notices, but the
// MCP server, `snapshot`/`doctor` (6-7 parallel queries) and in-process batch drivers
// (loop execCommand over dozens of apps) otherwise pay a TLS handshake per request.
// Responses are destroyed after reading, so no keep-alive socket holds the loop open.
const httpAgent = new http.Agent({ keepAlive: true, keepAliveMsecs: 1000, maxSockets: 16 });
const httpsAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 1000, maxSockets: 16 });
function agentFor(url: URL): http.Agent | https.Agent {
  return url.protocol === 'https:' ? httpsAgent : httpAgent;
}

export interface ExecResult {
  code: number;
  message: string;
  data: any;
}

/**
 * Compatibility guard for servers that predate the "picocli validation failure → code 400"
 * mapping: those builds return parameter errors as plain text in `data` while the envelope
 * still says code=0/"ok", so a script checking ok/code alone silently no-ops (measured in
 * the field: `expert config --enable …` reported success and wrote nothing).
 * Recognise the stderr signatures here and surface them as a real error.
 */
const PICOCLI_ERROR_RE = /^\s*(Unknown option|Unknown options|Missing required option|Missing required argument|Invalid value for option|Too many positions|was specified once|Command failed with exit code)/m;

export function demoteFalseSuccess(res: ExecResult): ExecResult {
  if (res.code !== 0) return res;
  const text = typeof res.data === 'string' ? res.data : null;
  if (text && PICOCLI_ERROR_RE.test(text)) {
    return { code: 400, message: text.trim().slice(0, 500), data: null };
  }
  return res;
}

/**
 * Read-only command registry for safe auto-retry.
 * Exact command paths (module + action, up to 3 tokens deep) whose server methods only
 * READ state — verified against the Java *Command classes, NOT inferred from names:
 *   form config / connect config = format documentation lookups (read)
 *   scale config / expert config = WRITE (excluded on purpose)
 *   scale keys|data groups contain add/update/remove → only their `list` leaf is read-only
 * Only these are retried on 408/429/5xx; everything else (writes) stays single-shot.
 */
const READ_ONLY_COMMAND_PATHS = new Set([
  'app list', 'app use', 'app current', 'app urls', 'app knowledge',
  'form query', 'form find', 'form types', 'form config',
  'scale query', 'scale find', 'scale keys list', 'scale data list',
  'connect query', 'connect find', 'connect types', 'connect config',
  'connect cover-page find', 'connect final-page find',
  'report query', 'report find', 'report widget list', 'report widget find',
  'report widget types', 'report widget config', 'report widget logic list',
  'expert query', 'expert find',
  'share query', 'share url',
]);

export function isReadOnlyCommand(cmd: string): boolean {
  const parts = cmd.trim().split(/\s+/);
  if (parts[0] !== 'assess' || parts.length < 3) return false;
  // Take the leading non-option tokens (module + action path, up to 4 deep for
  // report widget logic list), stop at the first flag
  const path: string[] = [];
  for (const t of parts.slice(1)) {
    if (t.startsWith('-')) break;
    path.push(t);
    if (path.length >= 4) break;
  }
  for (let n = path.length; n >= 2; n--) {
    if (READ_ONLY_COMMAND_PATHS.has(path.slice(0, n).join(' '))) return true;
  }
  if (path[0] === 'skill') return true; // assess skill <id> is a documentation read
  return false;
}

/**
 * POST /api/v1/mcp/exec
 * Send CLI command to server for execution.
 *
 * @param cmd         Full CLI command string (e.g. "assess form add --app xxx ...")
 * @param profileName Optional profile name override
 * @param timeoutMs   Request timeout in milliseconds.
 *                    Default: 60_000 (60s) for most commands.
 *                    Smart plan should use 120_000 (2min), smart execute 300_000 (5min).
 *                    Override globally with FORMLM_TIMEOUT_MS (useful for slow/congested servers).
 * @param retries     Max attempts for transient failures. Override with FORMLM_RETRIES.
 */
export async function execCommand(
  cmd: string,
  profileName?: string,
  timeoutMs: number = Number(process.env.FORMLM_TIMEOUT_MS) || 60_000,
  retries?: number,
): Promise<ExecResult> {
  // Retry policy:
  //  1) Pre-response transport errors (Request failed / Connection closed): the request was
  //     very likely NOT processed — safe to retry for ANY command.
  //  2) Server congestion statuses (408 timeout / 429 / 5xx): only retried for READ-ONLY
  //     commands, because a timed-out WRITE may already have been applied server-side.
  //  Exponential backoff with jitter; honours FORMLM_RETRIES (default 3).
  const envRetries = Number(process.env.FORMLM_RETRIES);
  const maxAttempts = Math.max(1, retries ?? (Number.isInteger(envRetries) && envRetries > 0 ? envRetries : 3));
  const readOnly = isReadOnlyCommand(cmd);
  let last: ExecResult = { code: 500, message: 'not attempted', data: null };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await execOnce(cmd, profileName, timeoutMs);
    if (last.code === 0) return last;
    const transport = /^(Request failed|Connection closed by server)/.test(last.message || '');
    const congested = last.code === 408 || last.code === 429 || last.code >= 500;
    const retryable = transport || (congested && readOnly);
    if (!retryable || attempt === maxAttempts) {
      if (congested && !readOnly && !transport) {
        last = { ...last, message: `${last.message} (write command — NOT auto-retried to avoid double execution; re-run manually if safe)` };
      }
      return last;
    }
    await new Promise(r => setTimeout(r, Math.min(4000, 400 * (2 ** (attempt - 1))) + Math.floor(Math.random() * 200)));
  }
  return last;
}

async function execOnce(
  cmd: string,
  profileName?: string,
  timeoutMs: number = 60_000,
): Promise<ExecResult> {
  const baseUrl = getBaseUrl();
  const token = getToken(profileName);

  if (!token) {
    return {
      code: 401,
      message: 'Not logged in. Run: formlm-cli auth login (no password? copy your Access Token from formlm.me → Workspace → Account Settings, then: formlm-cli auth login --token <your-token>)',
      data: null,
    };
  }

  const url = new URL('/api/v1/mcp/exec', baseUrl);
  const body = JSON.stringify({ cmd });

  return new Promise((resolve) => {
    // settled 标志防止 timeout / error / end / close 之间重复 resolve
    let settled = false;
    const settle = (r: ExecResult) => { if (!settled) { settled = true; resolve(r); } };

    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(url, {
      method: 'POST',
      agent: agentFor(url),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          settle(demoteFalseSuccess({
            code: parsed.code ?? 0,
            message: parsed.message ?? parsed.msg ?? 'ok',
            data: parsed.data ?? null,
          }));
        } catch {
          settle({ code: 500, message: `Invalid response: ${data.substring(0, 200)}`, data: null });
        }
        // 释放 keep-alive socket，避免事件循环挂起导致进程无法退出
        res.destroy();
      });
    });

    // Timeout handler: destroy socket and return timeout error
    req.on('timeout', () => {
      req.destroy();
      const isSmart = timeoutMs > 120_000;
      const hint = isSmart
        ? `Smart plan/execute may take up to 5min. ` +
          `If timeout persists: 1) simplify the description (fewer dimensions/questions), ` +
          `2) use formlm_snapshot to check partial results, ` +
          `3) use formlm_exec to complete remaining modules.`
        : `Try again or simplify the command.`;
      settle({
        code: 408,
        message: `Request timed out after ${Math.round(timeoutMs / 1000)}s. ${hint}`,
        data: null,
      });
    });

    // Error handler: 当 timeout 已 settle 则忽略后续 error（含 req.destroy() 产生的
    // ECONNRESET）；否则（代理层提前断连等）正常 settle 错误，防止 Promise 永远挂起。
    req.on('error', (err) => {
      if (settled) return;
      settle({ code: 500, message: `Request failed: ${err.message}`, data: null });
    });

    // Safety net: 连接被对端关闭且未触发 error（如 nginx 静默断连 FIN），
    // 防止 Promise 永不 resolve。
    req.on('close', () => {
      settle({ code: 500, message: 'Connection closed by server', data: null });
    });

    req.write(body);
    req.end();
  });
}

/**
 * POST /api/v1/mcp/auth/login
 */
export async function authLogin(email: string, password: string): Promise<ExecResult> {
  const baseUrl = getBaseUrl();
  const url = new URL('/api/v1/mcp/auth/login', baseUrl);
  const md5Password = crypto.createHash('md5').update(password).digest('hex');
  const body = JSON.stringify({ email, password: md5Password });

  return new Promise((resolve) => {
    let settled = false;
    const settle = (r: ExecResult) => { if (!settled) { settled = true; resolve(r); } };

    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(url, {
      method: 'POST',
      agent: agentFor(url),
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 30_000, // 30s — auth should be fast; prevent indefinite hang
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          settle({
            code: parsed.code ?? 0,
            message: parsed.message ?? parsed.msg ?? 'ok',
            data: parsed.data ?? null,
          });
        } catch {
          settle({ code: 500, message: `Invalid response: ${data.substring(0, 200)}`, data: null });
        }
        // 释放 keep-alive socket，避免事件循环挂起
        res.destroy();
      });
    });

    req.on('timeout', () => {
      req.destroy();
      settle({ code: 408, message: 'Auth request timed out after 30s', data: null });
    });

    req.on('error', (err) => {
      if (settled) return;
      settle({ code: 500, message: `Request failed: ${err.message}`, data: null });
    });

    req.on('close', () => {
      settle({ code: 500, message: 'Connection closed by server', data: null });
    });

    req.write(body);
    req.end();
  });
}

/**
 * GET /api/v1/code/captcha/{account}
 * 拉取图片验证码（GIF），供邮箱验证码登录流程展示给用户识别。
 * 图片存服务端 60s 有效，一次性消费。
 */
export async function fetchCaptchaImage(account: string): Promise<{ ok: boolean; image?: Buffer; message: string }> {
  const baseUrl = getBaseUrl();
  const url = new URL('/api/v1/code/captcha/' + encodeURIComponent(account), baseUrl);

  return new Promise((resolve) => {
    let settled = false;
    const settle = (r: { ok: boolean; image?: Buffer; message: string }) => { if (!settled) { settled = true; resolve(r); } };

    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(url, {
      method: 'GET',
      agent: agentFor(url),
      timeout: 15_000,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => { chunks.push(chunk); });
      res.on('end', () => {
        const image = Buffer.concat(chunks);
        const contentType = String(res.headers['content-type'] || '');
        if (res.statusCode === 200 && contentType.startsWith('image/')) {
          settle({ ok: true, image, message: 'ok' });
        } else {
          settle({ ok: false, message: `Unexpected response (${res.statusCode} ${contentType})` });
        }
        // 释放 keep-alive socket，避免事件循环挂起
        res.destroy();
      });
    });

    req.on('timeout', () => {
      req.destroy();
      settle({ ok: false, message: 'Captcha request timed out after 15s' });
    });

    req.on('error', (err) => {
      if (settled) return;
      settle({ ok: false, message: `Request failed: ${err.message}` });
    });

    req.on('close', () => {
      settle({ ok: false, message: 'Connection closed by server' });
    });

    req.end();
  });
}

/**
 * POST /api/v1/code/email
 * 发送邮箱验证码（需先通过图片验证码）。服务端限制：同邮箱 60s 冷却、
 * 每分钟 5 次/邮箱、每分钟 10 次/IP；验证码 5 分钟内有效。
 */
export async function authSendEmailCode(email: string, captcha: string): Promise<ExecResult> {
  const baseUrl = getBaseUrl();
  const url = new URL('/api/v1/code/email', baseUrl);
  const body = JSON.stringify({ account: email, captcha, lang: 'en' });

  return new Promise((resolve) => {
    let settled = false;
    const settle = (r: ExecResult) => { if (!settled) { settled = true; resolve(r); } };

    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(url, {
      method: 'POST',
      agent: agentFor(url),
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 30_000, // 邮件发送可能秒级耗时，留足余量
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          settle({
            code: parsed.code ?? 0,
            message: parsed.message ?? parsed.msg ?? 'ok',
            data: parsed.data ?? null,
          });
        } catch {
          settle({ code: 500, message: `Invalid response: ${data.substring(0, 200)}`, data: null });
        }
        // 释放 keep-alive socket，避免事件循环挂起
        res.destroy();
      });
    });

    req.on('timeout', () => {
      req.destroy();
      settle({ code: 408, message: 'Send code request timed out after 30s', data: null });
    });

    req.on('error', (err) => {
      if (settled) return;
      settle({ code: 500, message: `Request failed: ${err.message}`, data: null });
    });

    req.on('close', () => {
      settle({ code: 500, message: 'Connection closed by server', data: null });
    });

    req.write(body);
    req.end();
  });
}

/**
 * POST /api/v1/mcp/auth/login
 * 邮箱验证码登录（无密码账号主路径）。验证码 5 分钟内有效，输错不作废可重试
 * （连续 5 次失败账号锁 30 分钟，见服务端 McpV1Api）。
 */
export async function authLoginCode(email: string, code: string): Promise<ExecResult> {
  const baseUrl = getBaseUrl();
  const url = new URL('/api/v1/mcp/auth/login', baseUrl);
  const body = JSON.stringify({ email, code });

  return new Promise((resolve) => {
    let settled = false;
    const settle = (r: ExecResult) => { if (!settled) { settled = true; resolve(r); } };

    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(url, {
      method: 'POST',
      agent: agentFor(url),
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 30_000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          settle({
            code: parsed.code ?? 0,
            message: parsed.message ?? parsed.msg ?? 'ok',
            data: parsed.data ?? null,
          });
        } catch {
          settle({ code: 500, message: `Invalid response: ${data.substring(0, 200)}`, data: null });
        }
        // 释放 keep-alive socket，避免事件循环挂起
        res.destroy();
      });
    });

    req.on('timeout', () => {
      req.destroy();
      settle({ code: 408, message: 'Login request timed out after 30s', data: null });
    });

    req.on('error', (err) => {
      if (settled) return;
      settle({ code: 500, message: `Request failed: ${err.message}`, data: null });
    });

    req.on('close', () => {
      settle({ code: 500, message: 'Connection closed by server', data: null });
    });

    req.write(body);
    req.end();
  });
}

/**
 * Lightweight reachability probe for a public URL (used by `share verify` / `doctor`).
 * Returns only the HTTP status + whether the shell answers — NOTE a 200 on the share page
 * does NOT by itself prove anonymous access (the SPA shell answers 200 even behind the
 * login gate), so callers must combine this with the authoritative share type/perm/day.
 */
export interface ProbeResult {
  ok: boolean;
  status: number;
  message: string;
}

export function probeUrl(url: string, timeoutMs: number = 15_000): Promise<ProbeResult> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (r: ProbeResult) => { if (!settled) { settled = true; resolve(r); } };
    let target: URL;
    try { target = new URL(url); } catch { return settle({ ok: false, status: 0, message: `Invalid URL: ${url}` }); }
    const mod = target.protocol === 'https:' ? https : http;
    const req = mod.get(target, { timeout: timeoutMs }, (res) => {
      const status = res.statusCode ?? 0;
      // Drain a small prefix so the socket can finish cleanly, then destroy it
      res.setEncoding('utf-8');
      res.on('data', () => { /* ignore body */ });
      res.on('end', () => {
        settle({ ok: status >= 200 && status < 400, status, message: `HTTP ${status}` });
        res.destroy();
      });
    });
    req.on('timeout', () => { req.destroy(); settle({ ok: false, status: 0, message: `Probe timed out after ${Math.round(timeoutMs / 1000)}s` }); });
    req.on('error', (err) => { if (!settled) settle({ ok: false, status: 0, message: `Request failed: ${err.message}` }); });
    // Safety net: peer closed without a response and no error event fired
    req.on('close', () => { settle({ ok: false, status: 0, message: 'Connection closed by server' }); });
  });
}

/**
 * GET /api/v1/mcp/auth/me
 */
export async function authMe(profileName?: string): Promise<ExecResult> {
  const baseUrl = getBaseUrl();
  const token = getToken(profileName);

  if (!token) {
    return { code: 401, message: 'Not logged in', data: null };
  }

  const url = new URL('/api/v1/mcp/auth/me', baseUrl);

  return new Promise((resolve) => {
    let settled = false;
    const settle = (r: ExecResult) => { if (!settled) { settled = true; resolve(r); } };

    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(url, {
      method: 'GET',
      agent: agentFor(url),
      headers: {
        'Authorization': token,
      },
      timeout: 15_000, // 15s — token check should be fast; prevent indefinite hang
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          settle({
            code: parsed.code ?? 0,
            message: parsed.message ?? parsed.msg ?? 'ok',
            data: parsed.data ?? null,
          });
        } catch {
          settle({ code: 500, message: `Invalid response: ${data.substring(0, 200)}`, data: null });
        }
        // 释放 keep-alive socket，避免事件循环挂起
        res.destroy();
      });
    });

    req.on('timeout', () => {
      req.destroy();
      settle({ code: 408, message: 'Auth check timed out after 15s', data: null });
    });

    req.on('error', (err) => {
      if (settled) return;
      settle({ code: 500, message: `Request failed: ${err.message}`, data: null });
    });

    req.on('close', () => {
      settle({ code: 500, message: 'Connection closed by server', data: null });
    });

    req.end();
  });
}
