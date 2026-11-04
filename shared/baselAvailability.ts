import type { BaselCantonId } from './baselCantonDetail';

export type BaselRegisterCanton = 'BS' | 'BL';
export type BaselCompanyEvidenceState = 'source_supported_operating' | 'source_supported_contact' | 'campus_resident' | 'registry_only' | 'unresolved' | 'conflict';
export type BaselAvailabilityState = 'current_marketed' | 'future_marketed' | 'refurbishment_planned' | 'fully_let' | 'historical' | 'unresolved' | 'property_context';
export type BaselOriginalRow = Record<string, string>;
export interface BaselRegisterSource {
  id: string; title: string; publisher: string | null; url: string | null;
  publishedDate: string | null; observedAsOf: string | null; kind: 'incoming_csv' | 'reviewed_canton' | 'primary_offer' | 'owner_market_note' | 'user_supplied_report';
  primary: boolean; fileName: string | null; fileSha256: string | null; notes: string;
}
export interface BaselCompanyRecord {
  id: string; canton: BaselRegisterCanton; name: string; address: string;
  companyId: string | null; reviewedCantonRecordId: string | null;
  evidenceState: BaselCompanyEvidenceState; supportSourceIds: string[]; supportUrls: string[];
  evidenceExplanation: string; sourceRow: BaselOriginalRow;
  sourceFile: string; sourceFileSha256: string; sourceRowIndex: number;
  reviewedCantonId: BaselCantonId | null;
}
export interface BaselAvailabilityRecord {
  id: string; canton: BaselRegisterCanton; campus: string; building: string; floor: string | null;
  address: string; useType: string; areaM2: number | null; areaBasis: string;
  availabilityState: BaselAvailabilityState; availableFrom: string | null;
  observedAsOf: string | null; publishedDate: string | null;
  sourceIds: string[]; sourceUrls: string[]; overlapGroup: string | null;
  includeInTotal: boolean; exclusionReason: string | null; notes: string;
  originalRow: BaselOriginalRow | null;
  sourceFile: string | null; sourceFileSha256: string | null; sourceRowIndex: number | null;
  areaQualifier?: string | null; rawOverlapGroup?: string | null; demiseKey?: string | null;
  researchProject?: string; researchUnitIndex?: number | null;
}
export interface BaselCantonRegisterTotals {
  sourceCompanyRows: number; companyRecords: number;
  evidenceCounts: Record<BaselCompanyEvidenceState, number>;
  sourcePropertyRows: number; availabilityRecords: number;
  /** Measured non-overlapping current marketed offers, not vacancy or lab-only supply. */
  currentMarketedM2: number | null;
  futureMarketedM2: number | null;
  underRefurbishmentM2: number | null;
  confirmedVacancyM2: null;
  confirmedLaboratoryVacancyM2: null;
  denominatorScope: string;
  currentMarketedRecordIds: string[];
  futureMarketedRecordIds: string[];
  underRefurbishmentRecordIds: string[];
  subtotalLabels: { current: string; future: string; refurbishment: string };
  measuredCurrentMarketedOfferM2: number | null;
  measuredCurrentOfferRecords: number;
  measuredCurrentMarketedOfferByUseTypeM2: Record<string, number>;
  futureMarketedOfferByUseTypeM2: Record<string, number>;
  underRefurbishmentByUseTypeM2: Record<string, number>;
  futureMarketedRecords: number; refurbishmentPlannedRecords: number;
  excludedFromMeasuredTotalRecords: number;
  notes: string[];
}
export interface BaselAvailabilityRegister {
  format: 1; version: 'V1'; asOf: string;
  status: 'company_reconciliation_complete_availability_pending' | 'complete';
  availabilityRecords: BaselAvailabilityRecord[];
  companyRecords: BaselCompanyRecord[]; sources: BaselRegisterSource[];
  totals: Record<BaselRegisterCanton, BaselCantonRegisterTotals>;
  preservation: {
    masterSnapshotFile: string; masterSnapshotSha256: string; reviewedCompanionFile: string; reviewedCompanionSha256: string;
    masterCompanyIdCount: number; companyMasterWrites: 0; siteMasterWrites: 0;
    originalReviewedFactsModified: false; clientEditsModified: false;
    sourceFiles: { fileName: string; sha256: string; rowCount: number; recordClass: 'company' | 'property' }[];
  };
  forecast: {
    label: string; geography: string; sector: string; metric: string;
    annualLowerM2: number; annualUpperM2: number; horizon: string; sourceIds: string[];
    notes: string; cantonAbsorption: null; yearsSupply: null;
  };
}
