/**
 * Shared compact app-state projection used by `snapshot --summary` (CLI) and the
 * `formlm_snapshot` MCP tool. Batch audits only need a handful of counts/flags, and
 * deriving them here keeps callers from parsing full module payloads (form fields,
 * widget layoutData, share blobs) themselves.
 *
 * Counting ground rules (matching the server data model):
 *  - questionCount: form fields with type==='scale' (name/cover fields excluded)
 *  - dimCount/dimNames: scale entries
 *  - reportPages: report pages (id+name only)
 *  - share.day >= 3650000 is the server's "permanent" sentinel → forever=true
 */

export function asArray(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (v && Array.isArray(v.list)) return v.list;
  if (v && Array.isArray(v.fields)) return v.fields;
  return [];
}

export function shareTokenFromUrl(u: string | undefined | null): string {
  if (!u) return '';
  const m = /\/s\/([A-Za-z0-9_-]+)/.exec(u);
  return m ? m[1] : '';
}

export const FOREVER_SENTINEL = 3650000;

export function buildSummary(appId: string, appName: string, mods: Record<string, any>): any {
  const formFields = asArray(mods.form);
  const scaleFields = formFields.filter((f: any) => f?.type === 'scale');
  const dims = asArray(mods.scale);
  const dimNames = dims.map((d: any) => d?.name ?? d?.id ?? '').filter(Boolean);
  // Server json shapes (verified in the Java *Command.query branches):
  //   form → array of fields; scale → array of dimensions; report → array of pages;
  //   connect → object {pages, styled}; expert → object (or the literal "无数据"); share → {form:{...}}
  const pages = asArray(mods.report);
  const shareForm = mods.share && typeof mods.share === 'object' && !Array.isArray(mods.share)
    ? (mods.share.form ?? mods.share) : null;
  const expertObj = mods.expert && typeof mods.expert === 'object' && !Array.isArray(mods.expert) ? mods.expert : null;
  const connectObj = mods.connect && typeof mods.connect === 'object' && !Array.isArray(mods.connect) ? mods.connect : null;

  return {
    appId,
    appName: appName || null,
    fieldCount: formFields.length,
    questionCount: scaleFields.length,
    dimCount: dims.length,
    dimNames,
    reportPageCount: pages.length,
    reportPages: pages.map((p: any) => ({ id: p?.id ?? null, name: p?.name ?? null })),
    styled: connectObj ? (connectObj.styled ?? null) : null,
    expertEnabled: expertObj ? Boolean(expertObj.enable) : false,
    expertHasContent: expertObj ? Boolean(expertObj.name || expertObj.kbText || expertObj.prompt) : false,
    share: shareForm ? {
      type: shareForm.type ?? null,
      perm: shareForm.perm ?? null,
      day: shareForm.day ?? null,
      forever: Number(shareForm.day ?? 0) >= FOREVER_SENTINEL,
      shareUrl: shareForm.shareUrl ?? null,
      shareToken: shareTokenFromUrl(shareForm.shareUrl),
    } : null,
  };
}
