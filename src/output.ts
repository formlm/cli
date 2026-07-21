import { ExecResult } from './exec.js';

/**
 * Unified output: format and print for terminal mode
 */
export function output(result: ExecResult): void {
  if (result.code === 0) {
    if (result.data) {
      // Try to parse and format as JSON
      try {
        const parsed = JSON.parse(result.data);
        console.log(JSON.stringify(parsed, null, 2));
      } catch {
        console.log(result.data);
      }
    }
  } else {
    console.error(`❌ [${result.code}] ${result.message}`);
    if (result.data) console.error(result.data);
    process.exit(1);
  }
}
