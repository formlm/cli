/**
 * Shared CLI utilities.
 *
 * escapeArg is the single source of truth for escaping user-supplied input
 * before it is embedded into a command string. Both the direct CLI
 * (commands/*.ts) and the MCP Server (mcp.ts) must use it to prevent
 * argument-boundary breakage when input contains quotes etc.
 */

// Server-side PipelineFilterCommand processes the command line through:
//   normalizeHtmlAttrQuotes → escapeInnerQuotesInOptionValues →
//   splitBySemicolon/splitByPipe (quote-aware) → tokenizeCommand
//
// PROTOCOL (verified in production against the chain above):
//   wrap values in DOUBLE quotes + rewrite inner double quotes to single quotes.
// Shell-style `"` escapes do NOT survive the preprocessing chain — for values
// containing HTML/SVG markup (style="...", <svg width="...">) they end up
// mis-paired and splitBySemicolon then treats CSS semicolons as command
// separators ("Unsupported system command - padding:24px"). Single quotes are
// kept as literals by tokenizeCommand and pair correctly in both splitters.
// The resulting single-quoted HTML/SVG attributes are semantically identical,
// and fastjson2 on the server parses single-quoted JSON strings for --plan.
// Newlines / tabs are normalized to spaces since CLI commands are single-line.
export function escapeArg(s: string): string {
  return s
    .replace(/"/g, "'")      // " → ' (must be first: inner double quotes break server-side parsing)
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
