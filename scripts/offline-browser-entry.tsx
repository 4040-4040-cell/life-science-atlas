import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { Router } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import App from '../client/src/App';
import '../client/src/index.css';
import { installOfflineBrowserApi } from './offline-browser-data';
import { installBaselCantonOffline } from '../client/src/lib/baselCantonDetail';

window.__ATLAS_OFFLINE__ = true;
const snapshot = window.__ATLAS_BROWSER_SNAPSHOT__;
if (!snapshot) throw new Error('The embedded atlas snapshot is missing. Extract the entire package again.');
installOfflineBrowserApi(snapshot);
if (window.__ATLAS_CANTON_DOCUMENTS__) installBaselCantonOffline(window.__ATLAS_CANTON_DOCUMENTS__, snapshot.regions.find(region => region.region.id === 'basel'));
delete window.__ATLAS_BROWSER_SNAPSHOT__;

// Existing matrix exports are ordinary API anchors in the hosted app. A file
// document cannot navigate to an API; synthesize the same CSV as a Blob download.
document.addEventListener('click', async event => {
  const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a');
  if (!anchor) return;
  const href = anchor.getAttribute('href') || '';
  if (href === '#main-content') {
    event.preventDefault();
    document.getElementById('main-content')?.scrollIntoView();
    return;
  }
  if (href.startsWith('#') && !href.startsWith('#/')) {
    const target = document.getElementById(href.slice(1));
    if (target) { event.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); return; }
  }
  if (!href.startsWith('/api/atlas/export.csv?')) return;
  event.preventDefault();
  try {
    const response = await window.fetch(href);
    if (!response.ok) throw new Error(`CSV export rejected (${response.status}).`);
    const url = URL.createObjectURL(await response.blob());
    const download = document.createElement('a');
    download.href = url; download.download = 'life-science-atlas.csv';
    document.body.append(download); download.click(); download.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'The CSV export could not be created.');
  }
}, true);

// wouter 3.7 builds its navigation event with new URL(..., location.origin).
// file:// has the opaque origin "null". Retain its official subscription/hrefs
// hook and only adapt the navigator to a valid file-relative hash URL.
const fileSafeHashLocation: typeof useHashLocation = options => {
  const [location] = useHashLocation(options);
  return [location, (to, { replace = false, state = null } = {}) => {
    const oldURL = window.location.href;
    const next = new URL(window.location.href);
    const [route, search] = to.replace(/^#?\/?/, '').split('?');
    next.hash = '/' + route;
    next.search = search ? '?' + search : '';
    window.history[replace ? 'replaceState' : 'pushState'](state, '', next.href);
    window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: next.href }));
  }];
};
Object.assign(fileSafeHashLocation, { hrefs: (href: string) => '#' + href });
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <Router hook={fileSafeHashLocation}><App /></Router>
  </QueryClientProvider>
);
