import { useQuery } from '@tanstack/react-query';
import type { RegionResponse } from '@shared/atlas';
import type { AddressEvidenceKind, BaselCantonCluster, BaselCantonCompanion, BaselCantonDocument, BaselCantonId, CantonOccupier } from '@shared/baselCantonDetail';
import { AtlasApiError, useAtlas } from './atlas';
import { isAtlasOffline } from './offlineAtlas';
declare global { interface Window { __ATLAS_CANTON_DOCUMENTS__?: BaselCantonCompanion; __ATLAS_CANTON_REGION__?: RegionResponse; } }

/** Call before the file-only entry deletes its snapshot global. No fetch or server. */
export function installBaselCantonOffline(companion: BaselCantonCompanion, region?: RegionResponse): void {
  if (!isAtlasOffline()) throw new Error('Canton companion is permitted only in explicit offline mode.');
  if (companion.format !== 1 || region && region.region.id !== 'basel') throw new Error('Invalid offline canton companion or region.');
  window.__ATLAS_CANTON_DOCUMENTS__ = companion;
  window.__ATLAS_CANTON_REGION__ = region;
}

export function useCantonDocument(cantonId: BaselCantonId, offlineData?: BaselCantonCompanion) {
  const offline = isAtlasOffline();
  return useQuery<BaselCantonDocument, AtlasApiError>({
    queryKey: ['atlas-canton-detail', cantonId, offline, offlineData?.sourceHash],
    queryFn: async ({ signal }) => {
      if (offline) {
        const companion = offlineData ?? window.__ATLAS_CANTON_DOCUMENTS__;
        const d = companion?.documents[cantonId];
        if (companion?.format !== 1 || !d || d.cantonId !== cantonId || d.sourceHash !== companion.sourceHash || d.version !== companion.version) throw new AtlasApiError(503, 'This offline package has no validated canton companion. No server or online fallback is attempted.');
        return d;
      }
      const response = await fetch(`/api/atlas/canton-detail/${encodeURIComponent(cantonId)}`, { signal, credentials: 'include', headers: { Accept: 'application/json' } });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new AtlasApiError(response.status, 'Persistent canton research is not ready. No bundled data is substituted.');
      return response.json() as Promise<BaselCantonDocument>;
    },
    staleTime: 60_000, retry: offline ? false : 1, refetchOnWindowFocus: false,
  });
}
export function useCantonAerialRegion() {
  const offline = isAtlasOffline();
  const live = useAtlas<RegionResponse>(offline ? null : '/regions/basel');
  const snapshot = offline && typeof window !== 'undefined' ? (window as unknown as { __ATLAS_BROWSER_SNAPSHOT__?: { regions?: RegionResponse[] } }).__ATLAS_BROWSER_SNAPSHOT__ : undefined;
  return { data: offline ? window.__ATLAS_CANTON_REGION__ ?? snapshot?.regions?.find(r => r.region.id === 'basel') : live.data, isLoading: !offline && live.isLoading, isError: !offline && live.isError, refetch: live.refetch };
}
export interface InventoryFilters { q: string; clusterId: string; addressKind: AddressEvidenceKind | 'all'; }
export interface CantonInventoryRow { cluster: BaselCantonCluster; occupier: CantonOccupier; }
/** Every source record stays accessible; no eight-row summary cap. */
export function cantonInventory(clusters: BaselCantonCluster[], filters: InventoryFilters): CantonInventoryRow[] {
  const query = filters.q.trim().toLocaleLowerCase();
  return clusters.flatMap(cluster => [...cluster.companySites, ...(cluster.residentReferences ?? []), ...(cluster.excludedOrUnresolvedLeads ?? [])].map(occupier => ({ cluster, occupier }))).filter(({ cluster, occupier }) =>
    (!filters.clusterId || cluster.id === filters.clusterId) &&
    (filters.addressKind === 'all' || occupier.addressKind === filters.addressKind) &&
    (!query || [cluster.name, ...cluster.municipalities, occupier.name, occupier.address, occupier.location, occupier.role, occupier.parent, ...(occupier.buildingReferences ?? [])].some(v => v?.toLocaleLowerCase().includes(query)))
  ).sort((a, b) => a.occupier.name.localeCompare(b.occupier.name) || a.occupier.id.localeCompare(b.occupier.id));
}
export const ADDRESS_LABELS: Record<AddressEvidenceKind, string> = { verified_address: 'Verified company address', campus_reference: 'Campus / residency reference', unresolved_lead: 'Unresolved address lead' };
export const STATE_LABELS = { current_evidence: 'Current source evidence', planned: 'Planned / construction', historical: 'Historical source only', unresolved: 'Current status unresolved' };
