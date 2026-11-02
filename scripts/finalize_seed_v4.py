#!/usr/bin/env python3
import gzip,hashlib,json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1];SOURCE=pathlib.Path('/home/ubuntu/life-science-atlas/output/improved_V6/company-cards_V6.json');seed=json.load(open(ROOT/'data/atlas-seed_V3.json'));cards=json.load(open(SOURCE));profiles={p['id']:p for p in seed['companies']};added=0;fixed=0
for card in cards:
 p=profiles[card['card_id']];facts={f['key']:f for f in p['facts']};programs=card.get('clinical',{}).get('programs',[])
 for i,program in enumerate(programs):
  key='trial_'+str(i)
  if key in facts or not program.get('nct_ids'):continue
  notes='Stage: '+str(program.get('stage') or 'unknown')+'; active/relevant: '+str(program.get('is_active_or_relevant'))+'. '+str(program.get('notes') or '')
  p['facts'].append({'key':key,'label':'Retained trial registry / '+str(program.get('stage') or 'stage undisclosed').replace('_',' '),'value':', '.join(program['nct_ids']),'unit':None,'scope':'Companywide active sponsor program, not local lab activity','asOf':None,'periodStart':None,'status':program.get('evidence_status','reported'),'sourceIds':program.get('source_ids',[]),'notes':notes,'section':'Retained clinical programs'});added+=1
 for i,funding in enumerate(card['companywide_facts']['financials'].get('funding_events',[])):
  key='funding_'+str(i);f=facts.get(key);amount=funding.get('amount') or funding.get('amount_raised')
  if f and isinstance(amount,dict):
   oldscope=f['scope'];f['scope']=amount.get('scope') or oldscope;f['status']=amount.get('status') or f['status'];f['notes']='Financing type: '+str(funding.get('event_type') or 'not specified')+'. '+str(funding.get('notes') or amount.get('notes') or '')+' Companywide dated financing; not current cash, locally allocated capital or a committed space requirement.'
   if f['scope']!=oldscope:fixed+=1
 # Ensure the final public-source register still resolves every restored clinical fact.
 known={s['id'] for s in p['sources']}
 for f in p['facts']:
  for sid in f['sourceIds']:
   if sid not in known:raise AssertionError('Missing retained source '+sid)
 original={n for program in programs for n in program.get('nct_ids',[])};retained={n.strip() for f in p['facts'] if f['key'].startswith('trial_') for n in str(f['value']).split(',') if n.strip()};assert original<=retained,(p['name'],original-retained)
seed['version']='atlas-web-v4-20261102';seed['sourceHashes']['complete_clinical_and_funding_source']=hashlib.sha256(SOURCE.read_bytes()).hexdigest();out=ROOT/'data/atlas-seed_V4.json';assert not out.exists();out.write_text(json.dumps(seed,indent=2,ensure_ascii=False)+'\n')
with gzip.open(ROOT/'data/atlas-seed_V4.json.gz','wb',compresslevel=9) as f:f.write(out.read_bytes())
report={'version':seed['version'],'added_retained_program_facts':added,'corrected_financing_scopes':fixed,'preserved_all_original_retained_trial_ids':True,'profile_and_site_identities_unchanged':True};(ROOT/'data/evidence-corrections_V4.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
