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

/**
 * Canonicalize a possibly-relative FormLM URL into an absolute https URL,
 * so it is safe to drop into an <iframe src> or a cross-origin link.
 * - already absolute http:// → upgraded to https:// (production host is https)
 * - relative (/s/xxx) → prefixed with the configured base origin
 * Backward-compatible helper; callers keep using shareUrl for legacy output.
 */
export function absHttpsUrl(baseUrl: string, u: string | undefined | null): string {
  if (!u) return '';
  let origin = (baseUrl || 'https://formlm.me').trim().replace(/\/+$/, '');
  try { const p = new URL(origin); origin = p.origin; } catch { /* keep as-is */ }
  if (/^https:\/\//i.test(u)) return u;
  if (/^http:\/\//i.test(u)) {
    try { const p = new URL(u); return 'https://' + p.host + p.pathname + p.search + p.hash; }
    catch { return u.replace(/^http:\/\//i, 'https://'); }
  }
  return origin + (u.startsWith('/') ? u : '/' + u);
}
