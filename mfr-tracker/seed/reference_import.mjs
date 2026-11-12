import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs'; import crypto from 'node:crypto';
// REFERENCE ONLY. Executable statement of the seed import rules in docs/BUILD_CONTRACT.md section 9.
// Proves that db/migrations/0001_init.sql accepts the seed and that the totals equal seed/seed_stats.json.
// The real importer is scripts/seed.ts (Task 5); it must leave the database in the same state.
// Run: node seed/reference_import.mjs   (needs @electric-sql/pglite installed)
import { fileURLToPath } from 'node:url';
const kit = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const db = new PGlite({ parsers: { 1082: v => v } });
await db.exec(fs.readFileSync(kit+'/db/migrations/0001_init.sql','utf8'));
const master=JSON.parse(fs.readFileSync(kit+'/seed/master.json','utf8'));
const seed=JSON.parse(fs.readFileSync(kit+'/seed/seed.json','utf8'));
const q=(s,p)=>db.query(s,p).then(r=>r.rows);
const partId={}, personId={}, crewId={};
for (const p of master.parts){ const [r]=await q(`insert into parts(part_number,description_official,field_name,uom,each_per_box,each_per_pallet,needs_review,notes) values($1,$2,$3,$4,$5,$6,$7,$8) returning id`,[p.part_number,p.description_official,p.field_name,p.uom,p.each_per_box,p.each_per_pallet,p.needs_review,p.notes]); partId[p.part_number]=r.id; }
for (const a of master.part_aliases) await q(`insert into part_aliases(alias,part_id) values($1,$2)`,[a.alias,partId[a.part_number]]);
for (const p of master.people){ const [r]=await q(`insert into people(full_name) values($1) returning id`,[p.full_name]); personId[p.full_name]=r.id; }
let so=0;
for (const c of master.crews){ const [r]=await q(`insert into crews(code,name,default_requester_id,checks,sort_order) values($1,$2,$3,$4,$5) returning id`,[c.code,c.name,personId[c.default_requester]??null,JSON.stringify(c.checks),so++]); crewId[c.code]=r.id; let i=0; for(const pn of c.parts) await q(`insert into crew_parts(crew_id,part_id,sort_order) values($1,$2,$3)`,[r.id,partId[pn],i++]); }
// batches
const batchId={};
for (const f of [...new Set(seed.pages.map(p=>p.scan_file))]) { const [r]=await q(`insert into scan_batches(filename,page_count,source) values($1,$2,'seed') returning id`,[f,seed.pages.filter(p=>p.scan_file===f).length]); batchId[f]=r.id; }
const fingerprint=(crew,pb,date,lines)=>crypto.createHash('sha256').update([crew,pb.toUpperCase(),date,lines.map(l=>`${l.part_number??('?'+(l.part_number_raw??''))}:${l.qty_each??('?'+(l.qty_raw??''))}`).sort().join(',')].join('|')).digest('hex');
const pageId={}, reqOfPage={};
for (const p of seed.pages){
  const [pg]=await q(`insert into scan_pages(batch_id,page_number,page_key,image_path,image_sha256,rotation_applied,status,extraction,extraction_model,extracted_at) values($1,$2,$3,$4,$5,0,$6,$7,'manual-transcription',now()) returning id`,
    [batchId[p.scan_file],p.page_number,p.page_key,'seed/'+p.page_key+'.jpg',crypto.createHash('sha256').update(fs.readFileSync(kit+'/seed/'+p.image)).digest('hex'), p.duplicate_of?'duplicate':'posted', p.form?JSON.stringify({form:p.form,lines:p.lines}):null]);
  pageId[p.page_key]=pg.id;
}
for (const p of seed.pages){
  if (p.duplicate_of){ await q(`update scan_pages set duplicate_of_page_id=$1 where id=$2`,[pageId[p.duplicate_of],pageId[p.page_key]]); continue; }
  const f=p.form;
  const [{n}]=await q(`select nextval('req_number_seq')::int as n`);
  const [r]=await q(`insert into requisitions(req_number,status,source,crew_id,requester_id,requester_name_raw,pb_location,pb_location_raw,pb_number,request_date,approval_signature_present,notes,flags,confidence,fingerprint,scan_page_id)
     values($1,'posted','seed',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
     ['MFR-'+String(n).padStart(6,'0'),crewId[f.crew_code],f.requester?personId[f.requester]:null,f.requester,f.pb_location,f.pb_location_raw,f.pb_number,f.request_date,f.approval_signature_present,f.notes,f.flags,f.confidence,fingerprint(f.crew_code,f.pb_location,f.request_date,p.lines),pageId[p.page_key]]);
  await q(`update scan_pages set requisition_id=$1 where id=$2`,[r.id,pageId[p.page_key]]);
  for (const l of p.lines) await q(`insert into requisition_lines(requisition_id,line_no,part_id,part_number_raw,description_raw,is_write_in,qty_raw,qty_requested,pack_qty,pack_unit,unit_word,date_required,sis_initialed,qty_issued,confidence,flags,note)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
     [r.id,l.line_no,l.part_number?partId[l.part_number]:null,l.part_number_raw,l.description_raw,l.is_write_in,l.qty_raw,l.qty_each,l.pack_qty,l.pack_unit,l.unit_word,l.date_required,l.sis_initialed,l.sis_initialed?(l.qty_each??0):0,l.confidence,l.flags,l.note]);
}
for (const p of seed.pages) if (p.duplicate_of) await q(`update scan_pages set requisition_id=(select requisition_id from scan_pages where id=$1) where id=$2`,[pageId[p.duplicate_of],pageId[p.page_key]]);
const st=JSON.parse(fs.readFileSync(kit+'/seed/seed_stats.json','utf8'));
const one=async s=>(await q(s))[0];
const got={
 pages:(await one(`select count(*)::int n from scan_pages`)).n,
 dup:(await one(`select count(*)::int n from scan_pages where status='duplicate'`)).n,
 reqs:(await one(`select count(*)::int n from requisitions`)).n,
 lines:(await one(`select count(*)::int n from requisition_lines`)).n,
 issued:(await one(`select sum(qty_issued)::int n from v_tracker_lines`)).n,
 requested:(await one(`select sum(qty_requested)::int n from v_tracker_lines`)).n,
 pending:(await one(`select count(*)::int n from v_tracker_lines where issue_status='pending'`)).n,
 cells:(await one(`select count(*)::int n from v_pb_part_matrix where pb_number is not null`)).n,
 repeats:(await one(`select count(*)::int n from v_pb_part_matrix where pb_number is not null and requisition_count>1`)).n,
 first:(await one(`select req_number, request_date, pb_location from requisitions order by id limit 1`)),
 last:(await one(`select req_number from requisitions order by id desc limit 1`)).req_number,
 dateType: typeof (await one(`select request_date from requisitions limit 1`)).request_date,
 fpDistinct:(await one(`select count(distinct fingerprint)::int n from requisitions`)).n,
};
console.log(got);
console.log('expected', st.pages, st.duplicate_pages, st.requisitions, st.lines, st.grand_qty_issued, st.grand_qty_requested, st.lines_not_initialed, st.pb_part_cells, st.pb_part_cells_with_repeat);
const byPart=await q(`select part_number, sum(qty_issued)::int i from v_tracker_lines where part_number is not null group by 1 order by 1`);
let ok=true; for(const r of byPart){ if(st.totals_by_part[r.part_number].qty_issued!==r.i){ok=false;console.log('MISMATCH',r);} } console.log('by-part issued totals match:',ok);
// constraint check: issue rule must reject bad rows
try{ await q(`update requisition_lines set qty_issued=1 where sis_initialed=false and id=(select min(id) from requisition_lines where sis_initialed=false)`); console.log('ERROR: issue rule not enforced'); }catch(e){ console.log('issue rule enforced:', e.message.slice(0,60)); }
