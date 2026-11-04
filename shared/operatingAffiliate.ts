import type { CompanyProfile } from './atlas';
export const retainedAffiliateWitnesses: Record<string, { sourceId: string; url: string; label: string }> = {
  gco_4770f3a112b9769fac17: { sourceId: 'v6:presence:t3-basel:t3_parent_portfolio', url: 'https://www.boehringer-ingelheim-venture.com/portfolio/t3-pharmaceuticals', label: 'Operating affiliate of Boehringer Ingelheim' },
  gco_7a1b3460a09f20347048: { sourceId: 'v6:presence:nbe-allschwil:nbe_parent_opening_20250403', url: 'https://www.boehringer-ingelheim.com/science-innovation/human-health-innovation/new-nbe-therapeutics-antibody-drug-conjugate-rd-center', label: 'Operating affiliate of Boehringer Ingelheim' },
};
/** Read-only display projection; raw baseline kind, listing, sites and cash stay intact. */
export function operatingAffiliateLabel(profile: CompanyProfile): string | null {
  const witness=retainedAffiliateWitnesses[profile.id];
  if (!witness || profile.parent !== 'Boehringer Ingelheim' || profile.listing !== 'subsidiary' || profile.kind !== 'baseline_company' || profile.evidence !== 'baseline' || !profile.sources.some(s=>s.id===witness.sourceId && s.url===witness.url && s.visibility==='public')) return null;
  return witness.label;
}
