import { forwardRef, useImperativeHandle, useState } from 'react';
import type { BaselCantonDocument, CantonAerialAddressReference } from '@shared/baselCantonDetail';
import { CantonSourceCardDialog } from './CantonSourceCardDialog';

export type CantonSourceRecordHandle = { open: (reference: CantonAerialAddressReference) => void; close: () => void };
/** Keep modal-only interaction independent of the long, complete source page. */
export const CantonSourceRecordController = forwardRef<CantonSourceRecordHandle, {
  document: BaselCantonDocument;
  onCompany: (id: string) => void;
  onCanonical: (reference: CantonAerialAddressReference) => void;
}>(function CantonSourceRecordController({ document, onCompany, onCanonical }, ref) {
  const [selected, setSelected] = useState<CantonAerialAddressReference | null>(null);
  useImperativeHandle(ref, () => ({ open: setSelected, close: () => setSelected(null) }), []);
  return selected ? <CantonSourceCardDialog key={selected.id} reference={selected} document={document} close={() => setSelected(null)} onCompany={onCompany} onCanonical={onCanonical} /> : null;
});
