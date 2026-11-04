import { createOfflineApi, OfflineApiError, type OfflineSnapshot } from '../server/offline-api';

declare global {
  interface Window { __ATLAS_BROWSER_SNAPSHOT__?: OfflineSnapshot; }
}

/** Only the atlas API is synthesized. Other fetches retain native browser behavior;
 * the document's connect-src policy prevents accidental remote/local data fetches. */
export function installOfflineBrowserApi(snapshot: OfflineSnapshot): void {
  const api = createOfflineApi(snapshot);
  const originalFetch = window.fetch.bind(window);
  const base = new URL(window.location.href);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : undefined;
    const raw = request?.url ?? String(input);
    let parsed: URL;
    try { parsed = new URL(raw, base); } catch { return originalFetch(input, init); }
    const local = parsed.protocol === base.protocol && parsed.host === base.host;
    const atlas = parsed.pathname === '/api/atlas' || parsed.pathname.startsWith('/api/atlas/');
    if (!local || !atlas) return originalFetch(input, init);
    const signal = init && 'signal' in init ? init.signal : request?.signal;
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    return new Promise<Response>((resolve, reject) => {
      const abort = () => reject(signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener('abort', abort, { once: true });
      queueMicrotask(() => {
        try {
          if (signal?.aborted) { abort(); return; }
          const headers = new Headers({ 'Cache-Control': 'no-store' });
          let body: string;
          let status = 200;
          if (method !== 'GET' && method !== 'HEAD') {
            status = 405;
            headers.set('Allow', 'GET, HEAD');
            headers.set('Content-Type', 'application/json');
            body = JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED', message: 'This retained snapshot is read-only.' } });
          } else {
            try {
              const result = api.handle(parsed.pathname.slice('/api/atlas'.length), parsed.searchParams);
              headers.set('Content-Type', result.type);
              if (result.download) headers.set('Content-Disposition', `attachment; filename="${result.download}"`);
              body = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
            } catch (error) {
              status = error instanceof OfflineApiError ? error.status : error instanceof URIError ? 400 : 500;
              headers.set('Content-Type', 'application/json');
              body = JSON.stringify({ error: { code: error instanceof OfflineApiError ? error.code : status === 400 ? 'INVALID_ID' : 'OFFLINE_ERROR', message: error instanceof OfflineApiError ? error.message : status === 400 ? 'Invalid record ID.' : 'The retained snapshot could not process this request.' } });
            }
          }
          const response = new Response(method === 'HEAD' ? null : body, { status, headers });
          // Native fetch exposes the resolved URL; Response() otherwise leaves it empty.
          Object.defineProperty(response, 'url', { value: parsed.href });
          resolve(response);
        } catch (error) { reject(error); }
        finally { signal?.removeEventListener('abort', abort); }
      });
    });
  };
}
