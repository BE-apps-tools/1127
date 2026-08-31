/* Asset-portal KPI import engine — the browser-side port of build/kpi_reports.py.
   Loaded by admin.html (the KPI builder parses and publishes reports) and by
   kpis.html (which reads a parsed bundle handed over for preview). It touches no
   DOM and holds no page state, so the same code runs in the browser and in the
   node suites under worker/tests/.

   The header-alias spec below is generated: it is copied verbatim out of
   build/kpi_reports.py by scripts/sync_kpi_spec.py and pinned by
   build/tests/test_kpi_spec_parity.py. Edit the Python, then rerun the script —
   never edit the block by hand. The Action build and this port must extract
   identical records from the same file, or a preview shows numbers the publish
   would not produce.

   Everything is exposed as globalThis.KPI at the bottom; nothing else is global.
*/
/* KPI-REPORT-SPEC-START */
const KPI_SPEC = {"downStatuses":["DN","DS"],"excludeFromAvailability":["MS","LG"],"headerScan":12,"kinds":[{"fields":{"billingType":{"aliases":["Billing Type"],"type":"str"},"getComponent":{"aliases":["GET"],"type":"num"},"hourlyBillingRate":{"aliases":["Hourly Billing Rate","Hourly Rate","Rate Per Hour"],"type":"num"},"monthlyBillingRate":{"aliases":["Monthly Billing Rate","Monthly Rate","Monthly Charge"],"type":"num"},"monthlyNonHourlyOwnership":{"aliases":["Monthly Non-Hourly Ownership","Monthly Non Hourly Ownership"],"type":"num"},"monthlyOwnership":{"aliases":["Monthly Ownership"],"type":"num"},"oilComponent":{"aliases":["Oil / Grease","Oil/Grease","Oil & Grease"],"type":"num"},"ownershipComponent":{"aliases":["Ownership Component","Ownership"],"type":"num"},"pmComponent":{"aliases":["Preventative Maintenance","Preventive Maintenance","PM"],"type":"num"},"projectNumber":{"aliases":["Project Number","Project","Job Number"],"type":"str"},"rateBegin":{"aliases":["Begin Date","Effective From"],"type":"date"},"rateEnd":{"aliases":["End Date","Effective To"],"type":"date"},"rateGroup":{"aliases":["Rate Group"],"type":"str"},"rateGroupDesc":{"aliases":["Rate Group Description","Rate Description"],"type":"str"},"repairComponent":{"aliases":["Corrective Repair","Repair"],"type":"num"},"tiresComponent":{"aliases":["Tires / U.C.","Tires / UC","Tires","Tires/U.C."],"type":"num"}},"hints":["rate","rates","equipment rates","charge","billing"],"kind":"rates","label":"Equipment rates (charge-out)","mode":"record","signals":["monthlyBillingRate","monthlyOwnership","rateGroup","monthlyNonHourlyOwnership","hourlyBillingRate"]},{"fields":{"acquiredDate":{"aliases":["Acquired Date","Acquisition Date","Start Date"],"type":"date"},"bareRentalRate":{"aliases":["Bare Rental Rate","Bare Rate"],"type":"num"},"billedThroughDate":{"aliases":["Billed Through Date","Billed Through","Anniversary Date","Next Billing Date"],"type":"date"},"billingType":{"aliases":["Billing Type"],"type":"str"},"contractDays":{"aliases":["Contract Days","Billing Cycle Days","Cycle Days"],"type":"int"},"eqStatus":{"aliases":["EQ St","EQ Status","Equipment Status"],"type":"str"},"hourlyRate":{"aliases":["Total Hourly Rate","Hourly Rental Rate"],"type":"num"},"monthlyNonHourlyRate":{"aliases":["Monthly Non-Hourly Rate","Monthly Non Hourly Rate"],"type":"num"},"po":{"aliases":["PO#","PO #","PO Number","Purchase Order"],"type":"str"},"totalNonHourlyRate":{"aliases":["Total Non-Hourly Rate","Total Non Hourly Rate","Total Monthly Rate"],"type":"num"},"vendor":{"aliases":["Vendor","Supplier","Rental Vendor","Lessor"],"type":"str"}},"hints":["anniversary","rental","rent","contract","vendor"],"kind":"rental","label":"Rental contracts (anniversary)","mode":"record","signals":["billedThroughDate","totalNonHourlyRate","bareRentalRate","monthlyNonHourlyRate","vendor","contractDays"]},{"asOfField":"date","backfillField":{"aliases":["Transfer Status","Status of Transfer"],"values":["Newly Acquired"]},"eventDateField":"date","eventStatusField":"status","fields":{"date":{"aliases":["Effective Date","Transfer Date","Date"],"type":"date"},"from":{"aliases":["Project Transferred From","Transferred From","From Project"],"type":"str"},"prev":{"aliases":["Previous Status","Prior Status","From Status"],"type":"str"},"remark":{"aliases":["Request Remark","Remark","Comment","Reason"],"type":"str"},"status":{"aliases":["Current Status","New Status","To Status"],"type":"str"}},"hints":["transfer","status","history","movement"],"kind":"transfers","label":"Transfer / status history","mode":"events","signals":["status","prev","date","from"],"unitFields":{"eqClass":{"aliases":["Major Equipment Class","Equipment Class","Class"],"type":"str"},"transferTrade":{"aliases":["Current Trade"],"type":"str"}}},{"asOfField":"date","fields":{"amount":{"aliases":["Actual Cost Amount","Cost Amount","Amount","Actual Cost"],"type":"num"},"caseNumber":{"aliases":["Incident Case Number","Case Number","Incident Number"],"type":"str"},"damageArea":{"aliases":["Damage Area Code","Damage Area"],"type":"str"},"date":{"aliases":["G/L Date","GL Date","Transaction Date","Posting Date"],"type":"date"},"doc":{"aliases":["Document Number","Document #","Doc Number"],"type":"str"},"docType":{"aliases":["Document Type","Doc Type"],"type":"str"},"payee":{"aliases":["Journal Entry Explanation","Payee","Paid To"],"type":"str"},"po":{"aliases":["PO #","PO#","PO Number"],"type":"str"},"remark":{"aliases":["Remark","Description of Work","Explanation"],"type":"str"}},"hints":["damage","expense","expenses","repair","incident"],"kind":"damage","label":"Damage expenses","lineAmountField":"amount","lineDateField":"date","lineDocField":"doc","mode":"ledger","signals":["amount","date","doc","damageArea","caseNumber"]},{"asOfField":"meterDate","fields":{"engineHours":{"aliases":["Engine Hours","Total Hours","Total Engine Hours","Run Hours"],"type":"num"},"idleHours":{"aliases":["Idle Hours","Idling Hours","Idle Time","Idle"],"type":"num"},"meterDate":{"aliases":["Meter Date","Reading Date","Meter Reading Date","As Of","As Of Date"],"type":"date"},"meterHours":{"aliases":["Hour Meter","Hour Meter Reading","Meter Reading","Current Meter Reading","Current Hours","Hours"],"type":"num"},"periodHours":{"aliases":["Period Hours","Hours This Period","Monthly Hours","Hours Used","Hours (Period)","Reported Hours"],"type":"num"},"targetHours":{"aliases":["Target Hours","Utilization Target","Target Utilization"],"type":"num"},"workHours":{"aliases":["Working Hours","Work Hours","Productive Hours","Operating Hours"],"type":"num"}},"hints":["utilization","utilisation","hour meter","hourmeter","zero hours","telematics","hours"],"kind":"utilization","label":"Utilization / hour meter","mode":"record","signals":["meterHours","engineHours","idleHours","workHours","periodHours"]}],"maxYear":2099,"serialAliases":["Serial Number","Serial #","Serial","Serial No","VIN"],"siteAliases":["Project Number","Project Transferred To","Location","Branch/Plant","Project","Job Number"],"staleAlertDays":3,"staleWarnDays":1,"statusLabels":{"AC":"Available but Consigned","AV":"Available","DN":"Down","DS":"Down - In Shop","LG":"Legal Hold","MS":"Missing/stolen","NR":"Not Ready","WK":"Working"},"unitAliases":["Unit Number","Unit #","Unit","Unit No","Unit Nbr","Equipment Number","Equipment #","Equipment","Equip Number","Equip #","Asset Number","Asset #"],"workingStatuses":["WK"]};
/* KPI-REPORT-SPEC-END */
const KPI_KINDS = KPI_SPEC.kinds.map(k => k.kind);
const kindSpec = k => KPI_SPEC.kinds.find(x => x.kind === k);

/* ---------- day math (UTC integers, so no timezone drift) ---------- */
const TODAY = new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
function dnum(iso){ const t=Date.parse(String(iso).slice(0,10)+"T00:00:00Z"); return isNaN(t)?null:Math.round(t/86400000); }
function dstr(dn){ return new Date(dn*86400000).toISOString().slice(0,10); }
const TODAY_DN = dnum(TODAY);

/* ============================================================
   Browser import — port of build/kpi_reports.py (spec-driven, so only
   the coercion + detection code lives here; the header maps come from
   KPI_SPEC above).
   ============================================================ */
function kpiDecodeXml(s){ return String(s).replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#39;/g,"'"); }
function kpiColIndex(ref){ const m=/^([A-Z]+)/.exec(ref); let n=0; for(const ch of m[1]) n=n*26+(ch.charCodeAt(0)-64); return n-1; }
function kpiNormHeader(s){ return String(s==null?"":s).replace(/\s+/g," ").trim(); }
/* Coercion — mirrors kpi_reports.coerce_num/coerce_int/coerce_date. The shared
   case table in build/tests/fixtures/kpi_coerce_cases.json asserts both ports. */
function kpiNum(v){
  let s=String(v==null?"":v).trim();
  if(!s) return null;
  const neg=s.startsWith("(")&&s.endsWith(")");
  if(neg) s=s.slice(1,-1);
  s=s.replace(/[$,\s]/g,"").replace(/%+$/,"");
  if(!s||!/^-?\d*\.?\d+$/.test(s)) return null;
  const n=parseFloat(s);
  if(n===0) return 0;
  return neg?-n:n;
}
function kpiInt(v){ const n=kpiNum(v); return n==null?null:Math.trunc(n); }
/* A date past maxYear is a data error, not a date — JDE ships a 2169
   "billed through" as a no-end sentinel, and showing it as a real renewal would
   park a bogus row at the top of every renewal filter. Mirrors
   kpi_reports._guard_year. */
function kpiGuardYear(iso){
  const max=(KPI_SPEC && KPI_SPEC.maxYear) || 2099;
  return (iso && +iso.slice(0,4) > max) ? "" : iso;
}
function kpiDate(v){
  const s=String(v==null?"":v).trim();
  if(!s) return "";
  const iso=/^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if(iso){ const d=new Date(Date.UTC(+iso[1],+iso[2]-1,+iso[3]));
    return (d.getUTCFullYear()===+iso[1] && d.getUTCMonth()===+iso[2]-1 && d.getUTCDate()===+iso[3])
      ? kpiGuardYear(d.toISOString().slice(0,10)) : ""; }
  const us=/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if(us){ let yr=+us[3]; if(yr<100) yr+=2000;
    const d=new Date(Date.UTC(yr,+us[1]-1,+us[2]));
    return (d.getUTCFullYear()===yr && d.getUTCMonth()===+us[1]-1 && d.getUTCDate()===+us[2])
      ? kpiGuardYear(d.toISOString().slice(0,10)) : ""; }
  if(/^\d+(\.\d+)?$/.test(s)){
    const n=Math.trunc(parseFloat(s)); if(n<=0) return "";
    const d=new Date(Date.UTC(1899,11,30)+n*86400000);
    return isNaN(d)?"":kpiGuardYear(d.toISOString().slice(0,10));
  }
  return "";
}
const KPI_COERCE={ num:kpiNum, int:kpiInt, date:kpiDate, str:v=>String(v==null?"":v).trim() };

function kpiReadXlsx(buf){
  const dv=new DataView(buf), u8=new Uint8Array(buf), dec=new TextDecoder();
  let eocd=-1;
  for(let i=buf.byteLength-22;i>=0;i--){ if(dv.getUint32(i,true)===0x06054b50){ eocd=i; break; } }
  if(eocd<0) throw new Error("Not a valid .xlsx (no zip end record)");
  const cdOff=dv.getUint32(eocd+16,true), cdCount=dv.getUint16(eocd+10,true);
  const entries={}; let p=cdOff;
  for(let n=0;n<cdCount;n++){
    if(dv.getUint32(p,true)!==0x02014b50) break;
    const method=dv.getUint16(p+10,true), compSize=dv.getUint32(p+20,true);
    const nameLen=dv.getUint16(p+28,true), extraLen=dv.getUint16(p+30,true), cmtLen=dv.getUint16(p+32,true);
    const localOff=dv.getUint32(p+42,true);
    const name=dec.decode(u8.subarray(p+46,p+46+nameLen));
    entries[name]={method,compSize,localOff}; p+=46+nameLen+extraLen+cmtLen;
  }
  async function get(name){
    const e=entries[name]; if(!e) return null;
    const lNameLen=dv.getUint16(e.localOff+26,true), lExtraLen=dv.getUint16(e.localOff+28,true);
    const start=e.localOff+30+lNameLen+lExtraLen;
    const comp=u8.subarray(start,start+e.compSize);
    if(e.method===0) return dec.decode(comp);
    if(e.method===8){
      if(typeof DecompressionStream==="undefined") throw new Error("This browser can't read .xlsx (no DecompressionStream) — use Chrome/Edge or recent Safari.");
      const ab=await new Response(new Blob([comp]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer();
      return dec.decode(new Uint8Array(ab));
    }
    throw new Error("Unsupported compression in .xlsx (method "+e.method+")");
  }
  return { get };
}
function kpiParseShared(xml){
  if(!xml) return []; const out=[];
  for(const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)){
    let t=""; for(const tm of m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) t+=tm[1];
    out.push(kpiDecodeXml(t));
  }
  return out;
}
function kpiSheetRows(xml, shared){
  const rows=[];
  // Rows may be self-closing (<row r="3"/>) or explicitly empty (<row …></row>).
  for(const rm of String(xml||"").matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)){
    const inner=rm[2]||"";
    const cells={}; let maxc=-1;
    for(const cm of inner.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
      const attrs=cm[1]||"", body=cm[2]||"";
      // Attribute order varies by writer: Excel emits r first, the real JDE
      // export emits s, t, THEN r — so read them by name, never by position.
      const ref=kpiAttr("<c"+attrs+">", "r");
      if(!ref) continue;                       // no coordinate: same as the Python reader
      const ci=kpiColIndex(ref);
      if(ci>maxc) maxc=ci;
      const ty=kpiAttr("<c"+attrs+">", "t");
      let val="";
      if(ty==="inlineStr"){
        // Rich text splits one value across several runs — "Project" + "Number"
        // in these headers — so concatenate every <t>, as the Python reader does.
        for(const tm of body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) val+=kpiDecodeXml(tm[1]);
      } else {
        const vm=/<v[^>]*>([\s\S]*?)<\/v>/.exec(body);
        if(vm) val = ty==="s" ? (shared[parseInt(vm[1],10)]||"") : kpiDecodeXml(vm[1]);
      }
      cells[ci]=val;
    }
    const arr=[]; for(let i=0;i<=maxc;i++) arr.push(cells[i]!==undefined?cells[i]:"");
    rows.push(arr);
  }
  return rows;
}
/* Read one attribute out of a single XML tag. Attribute ORDER in OOXML is
   arbitrary — the real JDE exports write Relationship as Type, Target, Id, while
   Excel writes Id, Type, Target — so never match a pair of attributes with one
   positional regex. (The Python side uses a real XML parser and was immune;
   worker/tests/kpi_xlsx.test.mjs pins this port against both orders.) */
function kpiAttr(tag, name){
  const m=new RegExp("\\s" + name.replace(":", "\\:") + '="([^"]*)"').exec(tag);
  return m ? m[1] : "";
}
function kpiRelMap(xml){
  const map={};
  for(const m of String(xml||"").matchAll(/<Relationship\b[^>]*>/g)){
    const id=kpiAttr(m[0], "Id"), target=kpiAttr(m[0], "Target");
    if(id) map[id]=target;
  }
  return map;
}
/* The r:id of the workbook's FIRST sheet. */
function kpiSheetRelId(xml){
  const m=/<sheet\s[^>]*>/.exec(String(xml||""));
  return m ? kpiAttr(m[0], "r:id") : "";
}
async function kpiFirstSheetRows(file){
  const zip=kpiReadXlsx(await file.arrayBuffer());
  const wb=await zip.get("xl/workbook.xml");
  const rels=await zip.get("xl/_rels/workbook.xml.rels");
  const shared=kpiParseShared(await zip.get("xl/sharedStrings.xml"));
  const relId=kpiSheetRelId(wb);
  if(!relId) throw new Error("No sheet found in workbook");
  let t=kpiRelMap(rels)[relId]||"";
  if(!t) throw new Error("Could not resolve the first sheet ("+relId+") in the workbook");
  if(t.startsWith("/")) t=t.slice(1);
  if(!t.startsWith("xl/")) t="xl/"+t;
  const sheet=await zip.get(t);
  if(sheet==null) throw new Error("Sheet part not found in the .xlsx: "+t);
  return kpiSheetRows(sheet, shared);
}
function kpiFind(norm, aliases){
  for(const a of aliases){ const i=norm.indexOf(kpiNormHeader(a).toLowerCase()); if(i>=0) return i; }
  return null;
}
function kpiMapHeaders(header, kind){
  const ks=kindSpec(kind);
  const norm=header.map(h=>kpiNormHeader(h).toLowerCase());
  const cols={}, unitCols={};
  Object.keys(ks.fields).forEach(t=>{ const i=kpiFind(norm, ks.fields[t].aliases); if(i!=null) cols[t]=i; });
  Object.keys(ks.unitFields||{}).forEach(t=>{ const i=kpiFind(norm, ks.unitFields[t].aliases); if(i!=null) unitCols[t]=i; });
  return { unit:kpiFind(norm, KPI_SPEC.unitAliases), serial:kpiFind(norm, KPI_SPEC.serialAliases),
    site:kpiFind(norm, KPI_SPEC.siteAliases), cols, unitCols,
    backfill: ks.backfillField ? kpiFind(norm, ks.backfillField.aliases) : null };
}
/* These exports carry a report title (and sometimes the project name) above the
   header row, so find it by scoring the first rows on alias matches. Mirrors
   kpi_reports.find_header. */
function kpiFindHeader(rows){
  const wanted=[KPI_SPEC.unitAliases, KPI_SPEC.serialAliases];
  KPI_SPEC.kinds.forEach(ks=>{
    Object.keys(ks.fields).forEach(t=>wanted.push(ks.fields[t].aliases));
    Object.keys(ks.unitFields||{}).forEach(t=>wanted.push(ks.unitFields[t].aliases));
  });
  let best=0, bestScore=0;
  rows.slice(0, KPI_SPEC.headerScan).forEach((row,i)=>{
    const norm=row.map(h=>kpiNormHeader(h).toLowerCase());
    if(!norm.some(Boolean)) return;
    const score=wanted.filter(a=>kpiFind(norm,a)!=null).length;
    if(score>bestScore){ best=i; bestScore=score; }
  });
  return best;
}
function kpiDetectKind(header, filename){
  const base=String(filename||"").toLowerCase();
  let best=null, bestScore=0;
  KPI_SPEC.kinds.forEach(ks=>{
    const m=kpiMapHeaders(header, ks.kind);
    if(m.unit==null && m.serial==null) return;
    const hits=ks.signals.filter(s=>s in m.cols).length;
    if(!hits) return;
    const score=hits*10+(ks.hints.some(h=>base.includes(h))?3:0);
    if(score>bestScore){ best=ks.kind; bestScore=score; }
  });
  return best;
}
/* Mirrors kpi_reports.report_site: a project code in the title rows, else the
   most common value of the report's own site column. */
function kpiReportSite(rows, hi, siteCol){
  for(let i=0;i<hi;i++){
    for(const cell of rows[i]||[]){
      const m=/\b(\d{9,13})\b/.exec(String(cell||""));
      if(m) return m[1];
    }
  }
  if(siteCol==null) return "";
  const counts={};
  for(let r=hi+1;r<rows.length;r++){
    const v=String((rows[r]||[])[siteCol]||"").trim();
    if(/^\d{9,13}$/.test(v)) counts[v]=(counts[v]||0)+1;
  }
  const keys=Object.keys(counts);
  return keys.length ? keys.reduce((a,b)=>counts[b]>counts[a]?b:a) : "";
}
/* Mirrors kpi_reports._timeline — see there for why the initial-load blocks and
   same-day duplicates are collapsed. */
function kpiTimeline(events){
  const byDate={};
  events.forEach(e=>{ const d=e.date||""; if(d){ (byDate[d]=byDate[d]||[]).push(e); } });
  return Object.keys(byDate).sort().map(d=>{
    const group=byDate[d];
    const snaps=group.filter(e=>e._backfill);
    if(group.length>1 && snaps.length===group.length) return { date:d, status:"", arrival:true };
    const pool=group.filter(e=>!e._backfill);
    const keep=(pool.length?pool:group)[ (pool.length?pool:group).length-1 ];
    const ev={ date:d, status:keep.status||"" };
    ["prev","from","remark"].forEach(k=>{ if(keep[k]) ev[k]=keep[k]; });
    if(keep._backfill) ev.arrival=true;
    return ev;
  });
}
function kpiExtract(rows, kind, filename){
  if(!rows.length) throw new Error("Sheet is empty");
  const hi=kpiFindHeader(rows);
  const header=rows[hi].map(kpiNormHeader);
  const m=kpiMapHeaders(header, kind);
  if(m.unit==null && m.serial==null) throw new Error("No unit or serial column found. Headers: "+header.filter(Boolean).join(", ").slice(0,200));
  const targets=Object.keys(m.cols);
  if(!targets.length) throw new Error("No recognised "+kind+" columns. Headers: "+header.filter(Boolean).join(", ").slice(0,200));
  const ks=kindSpec(kind);
  const eventsMode = ks.mode==="events";
  const ledgerMode = ks.mode==="ledger";
  const bfValues = new Set(((ks.backfillField||{}).values)||[]);
  const asOfField = ks.asOfField||"";
  const units={}; const dates=[]; let rowCount=0;
  for(let r=hi+1;r<rows.length;r++){
    const arr=rows[r];
    const at=i=>(i!=null&&i<arr.length)?arr[i]:"";
    const unit=String(at(m.unit)||"").trim(), serial=String(at(m.serial)||"").trim();
    const key=unit||(serial?("SN:"+serial):"");
    if(!key) continue;
    const rec={};
    targets.forEach(t=>{
      const val=KPI_COERCE[ks.fields[t].type](at(m.cols[t]));
      if(val==null||val==="") return;
      rec[t]=val;
      if(t===asOfField) dates.push(val);
    });
    if(!Object.keys(rec).length) continue;
    rowCount++;
    const blk=units[key]||(units[key]={});
    if(serial && !blk.serial) blk.serial=serial;
    Object.keys(m.unitCols).forEach(t=>{
      const val=KPI_COERCE[ks.unitFields[t].type](at(m.unitCols[t]));
      if(val) blk[t]=val;                                  // newest row wins
    });
    if(eventsMode){
      if(!rec[ks.eventDateField]) continue;                // an undated row is not an event
      rec._backfill = m.backfill!=null && bfValues.has(String(at(m.backfill)||"").trim());
      (blk._events=blk._events||[]).push(rec);
    } else if(ledgerMode){
      // A charge line needs a date and an amount; every aggregate is derived by
      // the page from these lines, so nothing is pre-summed here.
      if(!rec[ks.lineDateField] || rec[ks.lineAmountField]==null) continue;
      (blk.items=blk.items||[]).push(rec);
    } else {
      Object.assign(blk, rec);
    }
  }
  if(eventsMode){
    let total=0;
    Object.keys(units).forEach(key=>{
      const tl=kpiTimeline(units[key]._events||[]);
      delete units[key]._events;
      if(!tl.length){ delete units[key]; return; }
      units[key].events=tl; total+=tl.length;
    });
    rowCount=total;
  } else if(ledgerMode){
    let total=0;
    Object.keys(units).forEach(key=>{
      const items=units[key].items||[];
      if(!items.length){ delete units[key]; return; }
      items.sort((a,b)=> a[ks.lineDateField] < b[ks.lineDateField] ? -1
        : (a[ks.lineDateField] > b[ks.lineDateField] ? 1 : 0));   // oldest first
      total+=items.length;
    });
    rowCount=total;                                    // charge lines kept, not rows read
  }
  // "As of" is when the data was true: only a backward-looking field counts.
  const past=dates.filter(d=>d<=TODAY).sort();
  return { units, report:{ kind, label:ks.label, file:String(filename||""), rows:rowCount,
    units:Object.keys(units).length, asOf:past.length?past[past.length-1]:"",
    site:kpiReportSite(rows, hi, m.site), columns:targets.slice().sort() } };
}

/* Mirrors build/kpi_reports.merge and the Worker's /kpis merge: the families in
   `extracted` replace their block on every unit and leave the others untouched.
   A preview that merged differently from the server would show numbers the
   publish wouldn't produce, so worker/tests/kpi_merge.test.mjs pins the two
   together. */
function kpiMerge(bundle, extracted){
  const src=(bundle&&bundle.units)||{};
  const units={};
  Object.keys(src).forEach(k=>{ units[k]=Object.assign({}, src[k]); });
  let reports=(((bundle&&bundle.reports)||[]).filter(r=>r&&typeof r==="object")).slice();
  extracted.forEach(ex=>{
    const kind=ex.report.kind;
    Object.keys(units).forEach(k=>{ const b=Object.assign({}, units[k]); delete b[kind]; units[k]=b; });
    Object.keys(ex.units).forEach(key=>{
      const blk=Object.assign({}, units[key]||{});
      const rec=Object.assign({}, ex.units[key]);
      const serial=rec.serial; delete rec.serial;
      if(serial && !blk.serial) blk.serial=serial;
      blk[kind]=rec;
      units[key]=blk;
    });
    reports=reports.filter(r=>r.kind!==kind).concat([ex.report]);
  });
  Object.keys(units).forEach(k=>{ if(!KPI_KINDS.some(kk=>units[k][kk])) delete units[k]; });
  reports.sort((a,b)=>KPI_KINDS.indexOf(a.kind)-KPI_KINDS.indexOf(b.kind));
  return { builtAt:(bundle&&bundle.builtAt)||"", reports, units };
}

/* Human labels for the report fields — used by the builder to say which columns
   it matched, and by the KPI page's detail panel and CSV. Display only. */
const FIELD_LABELS = {
  monthlyBillingRate:"Monthly billing rate", monthlyOwnership:"Monthly ownership",
  monthlyNonHourlyOwnership:"Monthly non-hourly ownership", hourlyBillingRate:"Hourly billing rate",
  billingType:"Billing type", rateGroup:"Rate group", rateGroupDesc:"Rate group description",
  ownershipComponent:"Ownership / hr", pmComponent:"PM / hr", repairComponent:"Corrective repair / hr",
  tiresComponent:"Tires & U.C. / hr", oilComponent:"Oil & grease / hr", getComponent:"GET / hr",
  rateBegin:"Rate begins", rateEnd:"Rate ends", projectNumber:"Project",
  vendor:"Vendor", po:"PO #", acquiredDate:"On rent since", billedThroughDate:"Billed through",
  contractDays:"Billing cycle (days)", hourlyRate:"Hourly rental rate",
  monthlyNonHourlyRate:"Monthly non-hourly rate", bareRentalRate:"Bare rental rate",
  totalNonHourlyRate:"Total monthly rate", eqStatus:"Status on report", location:"Location",
  date:"Effective date", status:"Status", prev:"Previous status", from:"Transferred from",
  remark:"Remark", eqClass:"Equipment class", transferTrade:"Trade on transfer",
  amount:"Amount", doc:"Document #", docType:"Document type", payee:"Payee",
  damageArea:"Damage area", caseNumber:"Incident case #",
  meterHours:"Hour meter", meterDate:"Meter date", engineHours:"Engine hours",
  idleHours:"Idle hours", workHours:"Working hours", periodHours:"Period hours",
  targetHours:"Target hours",
};

/* ---------- the public surface ----------
   One namespace so a page can alias what it needs without shadowing anything.
   globalThis rather than window so the node suites can load this file as-is
   instead of slicing functions out of a page by string offset. */
const KPI_CORE = {
  SPEC: KPI_SPEC, KINDS: KPI_KINDS, kindSpec,
  TODAY, TODAY_DN, dnum, dstr,
  decodeXml: kpiDecodeXml, colIndex: kpiColIndex, normHeader: kpiNormHeader,
  num: kpiNum, int: kpiInt, date: kpiDate, guardYear: kpiGuardYear, COERCE: KPI_COERCE,
  readXlsx: kpiReadXlsx, parseShared: kpiParseShared, sheetRows: kpiSheetRows,
  attr: kpiAttr, relMap: kpiRelMap, sheetRelId: kpiSheetRelId, firstSheetRows: kpiFirstSheetRows,
  find: kpiFind, mapHeaders: kpiMapHeaders, findHeader: kpiFindHeader,
  detectKind: kpiDetectKind, reportSite: kpiReportSite, timeline: kpiTimeline,
  extract: kpiExtract, merge: kpiMerge,
  FIELD_LABELS,
};
globalThis.KPI = KPI_CORE;
