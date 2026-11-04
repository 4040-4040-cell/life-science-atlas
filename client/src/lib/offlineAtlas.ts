declare global {
  interface Window { __ATLAS_OFFLINE__?: boolean }
}
/** Only the packaged loopback server sets this flag; live service errors never do. */
export function isAtlasOffline(): boolean {
  return typeof window !== 'undefined' && window.__ATLAS_OFFLINE__ === true;
}
/** Local packaged media only, never a quiet external-network fallback. */
export function offlineAssetUrl(value?: string | null): string | undefined {
  if (!value || !/^\/(?:offline-assets|assets)\//.test(value) || value.includes('..') || /[\\\x00-\x1f]/.test(value)) return undefined;
  return value;
}
