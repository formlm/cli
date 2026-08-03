/**
 * Shared CLI utilities.
 *
 * escapeArg is the single source of truth for escaping user-supplied input
 * before it is embedded into a command string. Both the direct CLI
 * (commands/smart.ts) and the MCP Server (mcp.ts) must use it to prevent
 * argument-boundary breakage when input contains double quotes etc.
 */

// tokenizeCommand (server-side PipelineFilterCommand) supports \" as an escaped
// double-quote inside a quoted arg. Backslashes must be escaped first.
// Newlines / tabs are normalized to spaces since CLI commands are single-line.
export function escapeArg(s: string): string {
  return s
    .replace(/\\/g, '\\\\')   // \ → \\  (must be first)
    .replace(/"/g, '\\"')      // " → \"
    .replace(/\r?\n|\r/g, ' ') // newlines → space
    .replace(/\t/g, ' ')       // tabs → space
    .trim();
}

/**
 * Normalize commander optional boolean flags to true/false/undefined.
 * --flag        → true
 * --flag=false  → false (string)
 * --flag=true   → true  (string)
 * not passed    → undefined
 */
export function normBool(v: unknown): boolean | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'boolean') return v;
  return v === 'true' || v === '1';
}
