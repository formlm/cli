import * as crypto from 'node:crypto';
import * as http from 'node:http';
import * as https from 'node:https';
import { getBaseUrl, getToken } from './config.js';

export interface ExecResult {
  code: number;
  message: string;
  data: any;
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
 */
export async function execCommand(
  cmd: string,
  profileName?: string,
  timeoutMs: number = 60_000,
): Promise<ExecResult> {
  const baseUrl = getBaseUrl();
  const token = getToken(profileName);

  if (!token) {
    return { code: 401, message: 'Not logged in. Run: formlm-cli auth login', data: null };
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
          settle({
            code: parsed.code ?? 0,
            message: parsed.message ?? parsed.msg ?? 'ok',
            data: parsed.data ?? null,
          });
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
