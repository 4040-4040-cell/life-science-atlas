import type { Fact } from "@shared/atlas";

/** Display rule only. A 12-month warning does not re-underwrite a reporting entity. */
export function cashObservationWarning(fact: Fact | null | undefined, today = new Date().toISOString().slice(0, 10)): string | null {
  if (!fact || fact.value == null || fact.value === "" || !/cash/i.test(fact.label) || /flow|burn|runway/i.test(fact.label)) return null;
  if (!fact.asOf || !/^\d{4}-\d{2}-\d{2}/.test(fact.asOf)) return "As-of date unconfirmed; not a current balance.";
  const observed = Date.parse(fact.asOf.slice(0, 10));
  const now = Date.parse(today);
  if (!Number.isFinite(observed) || !Number.isFinite(now)) return "As-of date unconfirmed; not a current balance.";
  if (observed > now) return "Future-dated observation; verify before use.";
  return now - observed > 365 * 24 * 60 * 60 * 1000 ? "Historical balance, more than 12 months old. Verify the latest filing." : null;
}
