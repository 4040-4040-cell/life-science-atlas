declare global {
  interface Window { __ATLAS_OFFLINE__?: boolean }
}
/** Explicit package mode only; live service errors never enable offline mode. */
export function isAtlasOffline(): boolean {
  return typeof window !== 'undefined' && window.__ATLAS_OFFLINE__ === true;
}
/** Local packaged media only, never a quiet external-network fallback.
 * Relative file-package URLs are allowed ONLY in explicit offline mode.
 * Rooted paths retain compatibility with the earlier loopback Node edition. */
export function offlineAssetUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  const relative = value.startsWith('./offline-assets/');
  if (relative && !isAtlasOffline()) return undefined;
  const prefix = relative ? './offline-assets/' : value.startsWith('/offline-assets/') ? '/offline-assets/' : value.startsWith('/assets/') ? '/assets/' : undefined;
  if (!prefix || !/^[A-Za-z0-9._%/-]+$/.test(value.slice(prefix.length))) return undefined;
  try {
    const suffix = value.slice(prefix.length);
    const decoded = decodeURIComponent(suffix);
    // Reject encoded delimiters/double encoding and all traversal segments.
    if (/[\\\x00-\x20\x7f%?#]/.test(decoded) || /%2f|%5c/i.test(suffix)) return undefined;
    if (decoded.split('/').some(segment => !segment || segment === '.' || segment === '..')) return undefined;
    return value;
  } catch { return undefined; }
}
