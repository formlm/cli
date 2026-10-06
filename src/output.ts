import { ExecResult } from './exec.js';

/**
 * Unified output: format and print for terminal mode.
 *
 * Script/agent-friendly switches (opt-in, default behaviour unchanged):
 *  - FORMLM_NO_EXIT=1 : do NOT process.exit() on error; caller keeps running
 *                        (essential for batch loops / library use / MCP).
 *  - FORMLM_JSON=1     : emit a stable one-line JSON envelope
 *                        {ok, code, message, data} instead of pretty text,
 *                        so callers can parse success/fields programmatically.
 */
export function output(result: ExecResult): void {
  const noExit = process.env.FORMLM_NO_EXIT === '1';
  const jsonMode = process.env.FORMLM_JSON === '1';

  if (result.code === 0) {
    if (jsonMode) {
      // 纯机读保证：JSON 模式下 stdout 只允许出现信封行，
      // 人读引导文案请用 guidance() 输出（会改走 stderr），否则调用方要逐行扫描才能定位信封。
      console.log(JSON.stringify({ ok: true, code: 0, message: result.message || 'ok', data: tryParse(result.data) }));
    } else if (result.data) {
      try {
        const parsed = JSON.parse(result.data);
        console.log(JSON.stringify(parsed, null, 2));
      } catch {
        console.log(result.data);
      }
    }
  } else {
    if (jsonMode) {
      console.log(JSON.stringify({ ok: false, code: result.code, message: result.message, data: tryParse(result.data) }));
    } else {
      console.error(`❌ [${result.code}] ${result.message}`);
      if (result.data) console.error(result.data);
    }
    if (!noExit) process.exit(1);
  }
}

/** True when machine-readable envelope mode (FORMLM_JSON=1 or global --json) is active. */
export function isJsonMode(): boolean {
  return process.env.FORMLM_JSON === '1';
}

/**
 * Human guidance line (💡 next steps / URL echoes).
 * In JSON mode it goes to STDERR so stdout stays a pure one-line envelope;
 * in human mode it prints normally to stdout.
 */
export function guidance(text: string): void {
  if (isJsonMode()) console.error(text);
  else console.log(text);
}

/**
 * Local validation failure: friendly message + exit(1),
 * but honours FORMLM_NO_EXIT (throw instead of process.exit) so batch
 * drivers can catch and continue — same contract as output().
 * Emits an {ok:false} envelope on stdout in JSON mode for parseability.
 */
export function localFail(message: string, code = 400): never {
  if (isJsonMode()) {
    console.log(JSON.stringify({ ok: false, code, message, data: null }));
  } else {
    console.error(`❌ ${message}`);
  }
  if (process.env.FORMLM_NO_EXIT === '1') {
    throw new Error(message);
  }
  process.exit(1);
}

function tryParse(s: any): any {
  if (typeof s !== 'string' || !s) return s ?? null;
  try { return JSON.parse(s); } catch { return s; }
}
