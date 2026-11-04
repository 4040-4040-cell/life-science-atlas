#!/usr/bin/env python3
import copy
import importlib.util
import json
import unittest
from pathlib import Path

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('basel_register',HERE/'build-basel-register-v1.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class BaselRegisterTests(unittest.TestCase):
    def setUp(self):
        self.doc={'canton':'BS','cantonId':'basel-stadt'}
        self.cluster={'id':'klybeck-stucki','municipalities':['Basel']}
        self.row={'id':'fixture','name':'Example Therapeutics AG','address':'Hochbergerstrasse 60I, 4057 Basel, Switzerland','municipality':None,'facilityState':'current_evidence','addressKind':'verified_address','evidenceStatus':'current primary address','companyId':'existing-1','sourceIds':['reviewed-source'],'role':'Published company office, no laboratory or manufacturing allocation','metadata':{}}
        self.incoming={'company':'Example Therapeutics AG','street':'Hochbergerstrasse 60I','city':'Basel','zip':'4057','source_url':'https://bs.chregister.ch/example','verified':'Y','site_type':'R&D','modality':'Wet lab'}
    def reconcile(self,row=None,incoming=None,kind='companySites'):
        return m.reconcile(incoming or self.incoming,[(self.doc,self.cluster,row or self.row,kind)],{'reviewed-source':{'url':'https://example.org/contact'}},'source.csv','a'*64,1,'BS',{'existing-1'})
    def test_exact_name_different_number_does_not_verify(self):
        incoming={**self.incoming,'street':'Hochbergerstrasse 60C'}
        result=self.reconcile(incoming=incoming)
        self.assertNotIn(result['evidenceState'],['source_supported_operating','source_supported_contact'])
        self.assertIsNone(result['companyId'])
    def test_different_city_does_not_verify(self):
        result=self.reconcile(incoming={**self.incoming,'city':'Allschwil'})
        self.assertEqual(result['evidenceState'],'registry_only')
        self.assertIsNone(result['companyId'])
    def test_legal_address_not_lab_from_provider_y(self):
        result=self.reconcile()
        self.assertEqual(result['evidenceState'],'source_supported_contact')
        self.assertEqual(result['companyId'],'existing-1')
    def test_suffix_case_and_spacing(self):
        self.assertTrue(m.address_matches({**self.incoming,'street':'Hochbergerstr. 60 i'},self.row,self.cluster))
        self.assertFalse(m.address_matches({**self.incoming,'street':'Hochbergerstrasse 60'},self.row,self.cluster))
    def test_registry_only_is_not_verified(self):
        result=self.reconcile(incoming={**self.incoming,'company':'Unmatched name AG'})
        self.assertEqual(result['evidenceState'],'registry_only');self.assertIsNone(result['companyId'])
    def test_historical_roster_not_current_campus(self):
        row={**self.row,'facilityState':'historical','address':None,'addressKind':'campus_reference'}
        result=self.reconcile(row=row,kind='residentReferences')
        self.assertEqual(result['evidenceState'],'registry_only')
    def test_current_roster_is_not_numbered_address(self):
        row={**self.row,'address':None,'addressKind':'campus_reference'}
        result=self.reconcile(row=row,kind='residentReferences')
        self.assertEqual(result['evidenceState'],'campus_resident');self.assertIsNone(result['companyId'])
    def test_name_only_other_street_conflict(self):
        self.cluster={'id':'sbb-downtown','municipalities':['Basel']}
        result=self.reconcile(incoming={**self.incoming,'street':'Mattenstrasse 22'})
        self.assertEqual(result['evidenceState'],'conflict');self.assertIsNone(result['companyId'])
    def test_null_is_not_zero(self):
        totals=m.totals([],[])
        self.assertIsNone(totals['BS']['currentMarketedM2']);self.assertIsNone(totals['BL']['futureMarketedM2'])
    def register(self):
        register=json.loads(m.OUTPUT.read_text())
        # Fixture contributions are isolated from the live final offer selection.
        for record in register['availabilityRecords']: record['includeInTotal']=False
        return register
    def offer(self,r,index=0):
        offer=r['availabilityRecords'][index]
        if not any(s['id']=='fixture-primary-offer' for s in r['sources']):
            r['sources'].append(dict(id='fixture-primary-offer',title='Fixture primary offer',publisher='Fixture owner',url='https://example.org/offer',publishedDate=None,observedAsOf='2026-11-04',kind='primary_offer',primary=True,fileName=None,fileSha256=None,notes='Fixture only'))
        offer.update(areaM2=100,areaBasis='Reviewed measured offer',availabilityState='current_marketed',availableFrom='2026-01-01',observedAsOf='2026-11-04',includeInTotal=True,exclusionReason=None,overlapGroup='fixture-offer',sourceIds=['fixture-primary-offer'])
        return offer
    def test_overlap_rejected(self):
        r=self.register();self.offer(r);self.offer(r,1)
        with self.assertRaisesRegex(AssertionError,'Overlapping'):m.validate(r)
    def test_future_offer_cannot_count_current(self):
        r=self.register();self.offer(r)['availableFrom']='2027-01-01'
        with self.assertRaisesRegex(AssertionError,'Future offer'):m.validate(r)
    def test_refurbishment_not_current(self):
        r=self.register();self.offer(r)['availabilityState']='refurbishment_planned'
        totals=m.totals(r['companyRecords'],r['availabilityRecords'])
        self.assertIsNone(totals['BS']['currentMarketedM2']);self.assertEqual(totals['BS']['underRefurbishmentM2'],100)
    def test_excluded_aggregate_not_additive(self):
        r=self.register();a=self.offer(r)
        b=r['availabilityRecords'][1];b.update(areaM2=15400,includeInTotal=False,availabilityState='property_context',overlapGroup='fixture-offer')
        totals=m.totals(r['companyRecords'],r['availabilityRecords'])
        self.assertEqual(totals['BS']['currentMarketedM2'],100)
        self.assertEqual(totals['BS']['currentMarketedRecordIds'],[a['id']])
    def test_original_source_rows_exactly_preserved(self):
        r=self.register();m.validate(r)
        for entry in r['preservation']['sourceFiles']:
            import csv
            with (m.INPUT/entry['fileName']).open(newline='',encoding='utf-8-sig') as f:rows=list(csv.DictReader(f))
            records=r['companyRecords'] if entry['recordClass']=='company' else r['availabilityRecords']
            key='sourceRow' if entry['recordClass']=='company' else 'originalRow'
            preserved=[x for x in records if x['sourceFile']==entry['fileName'] and x[key] is not None]
            self.assertEqual(rows,[x[key] for x in sorted(preserved,key=lambda x:x['sourceRowIndex'])])
    def test_private_path_rejected(self):
        r=self.register();r['sources'][0]['fileName']='/home/ubuntu/research/raw.html'
        with self.assertRaisesRegex(AssertionError,'local/private path'):m.validate(r)

if __name__=='__main__':unittest.main(verbosity=2)
