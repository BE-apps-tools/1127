/* xlsx-export.js — dependency-free .xlsx writer shared by every portal page.
   Builds a styled workbook entirely in the browser (nothing is uploaded):
   Blattner-branded header, banded rows, frozen header, filters, number/date
   formats, sized columns, print setup, and an optional Overview sheet with
   breakdowns + data bars.

   BACXlsx.download({
     filename:"assets_X_2026-01-01.xlsx",
     title:"Equipment Tracking", subtitle:"Site · filters",   // shown on every sheet
     info:[["Site","Avon Yard"],["Filters","Trade: Electrical"]],
     overview:{ title:"Overview", breakdowns:[{title:"By status", rows:[["WK - Working",120],…]}] },  // optional
     sheets:[{ name:"Assets", freezeCols:2,
       columns:[{header:"Unit", key:"unit", type:"text", width:14}, {header:"Cost", get:r=>r.x, type:"money"}],
       rows:[…] }]
   })
   Column types: text | int | num | money | pct | date (ISO yyyy-mm-dd or Date). */
(function(root){
"use strict";

/* ---------- helpers ---------- */
const enc = new TextEncoder();
function xmlEsc(s){
  return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g,"")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function colName(i){ let s=""; for(i++; i>0; i=Math.floor((i-1)/26)) s=String.fromCharCode(65+(i-1)%26)+s; return s; }
function safeSheetName(n, used){
  let s=String(n||"Sheet").replace(/[\[\]:*?\/\\]/g," ").replace(/^'+|'+$/g,"").trim().slice(0,31)||"Sheet";
  let base=s, k=2;
  while(used.has(s.toLowerCase())){ const suf=" ("+(k++)+")"; s=base.slice(0,31-suf.length)+suf; }
  used.add(s.toLowerCase()); return s;
}
/* ISO date / Date -> Excel serial (1900 system, UTC so no DST drift). */
function dateSerial(v){
  if(v==null||v==="") return null;
  let ms;
  if(v instanceof Date) ms=Date.UTC(v.getFullYear(),v.getMonth(),v.getDate());
  else { const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(v)); if(!m) return null; ms=Date.UTC(+m[1],+m[2]-1,+m[3]); }
  if(isNaN(ms)) return null;
  return Math.round(ms/86400000)+25569;
}

/* ---------- styles (Blattner palette; Arial only) ---------- */
const C = { blue:"FF02568A", sky:"FF2DA2DB", ice:"FFB9E5FB", gray:"FFF2F2F2", line:"FFBCBCBC", mute:"FF76777B", ink:"FF333333", white:"FFFFFFFF" };
const X = { def:0, title:1, subtitle:2, label:3, info:4, head:5, section:6,
            text:7, int:8, num:9, money:10, pct:11, date:12, sumHead:13, sumNum:14, sumPct:15 };
const TYPE_STYLE = { text:X.text, int:X.int, num:X.num, money:X.money, pct:X.pct, date:X.date };

function stylesXml(){
  const font=(sz,color,bold)=>'<font>'+(bold?'<b/>':'')+'<sz val="'+sz+'"/><color rgb="'+color+'"/><name val="Arial"/><family val="2"/></font>';
  const fonts=[font(10,C.ink),font(10,C.white,1),font(16,C.blue,1),font(10,C.mute),font(10,C.ink,1),font(11,C.blue,1)];
  const fill=rgb=>'<fill><patternFill patternType="solid"><fgColor rgb="'+rgb+'"/><bgColor indexed="64"/></patternFill></fill>';
  const fills=['<fill><patternFill patternType="none"/></fill>','<fill><patternFill patternType="gray125"/></fill>',fill(C.blue),fill(C.ice),fill(C.gray)];
  const side=(n,c)=>n?'<'+'$'+' style="'+n+'"><color rgb="'+c+'"/></'+'$'+'>':'<'+'$'+'/>';
  const border=(l,r,t,b)=>'<border>'+[["left",l],["right",r],["top",t],["bottom",b]].map(([k,v])=>side(v&&v[0],v&&v[1]).replace(/\$/g,k)).join("")+'<diagonal/></border>';
  const thin=["thin",C.line];
  const borders=['<border><left/><right/><top/><bottom/><diagonal/></border>',
    border(thin,thin,thin,thin), border(null,null,null,["medium",C.sky]), border(null,null,null,["thin",C.sky])];
  const xf=(num,font,fillId,bd,al)=>'<xf numFmtId="'+num+'" fontId="'+font+'" fillId="'+fillId+'" borderId="'+bd+'" xfId="0"'+
    (num?' applyNumberFormat="1"':'')+' applyFont="1"'+(fillId?' applyFill="1"':'')+(bd?' applyBorder="1"':'')+
    (al?' applyAlignment="1"><alignment '+al+'/></xf>':'/>');
  const v='vertical="center"';
  const xfs=[
    xf(0,0,0,0),                                              // 0 default
    xf(0,2,0,0,v),                                            // 1 title
    xf(0,3,0,0,v),                                            // 2 subtitle
    xf(0,4,4,1,v+' horizontal="left"'),                       // 3 info label
    xf(0,0,0,1,v+' horizontal="left" wrapText="1"'),          // 4 info value
    xf(0,1,2,2,v+' horizontal="center" wrapText="1"'),        // 5 table header
    xf(0,5,0,3,v),                                            // 6 section header
    xf(0,0,0,1,v+' horizontal="left"'),                       // 7 text
    xf(3,0,0,1,v+' horizontal="right"'),                      // 8 int   #,##0
    xf(4,0,0,1,v+' horizontal="right"'),                      // 9 num   #,##0.00
    xf(164,0,0,1,v+' horizontal="right"'),                    // 10 money
    xf(165,0,0,1,v+' horizontal="right"'),                    // 11 pct
    xf(166,0,0,1,v+' horizontal="center"'),                   // 12 date
    xf(0,4,3,1,v+' horizontal="left"'),                       // 13 summary head
    xf(3,0,0,1,v+' horizontal="right"'),                      // 14 summary count
    xf(165,0,0,1,v+' horizontal="right"')                     // 15 summary share
  ];
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
    '<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0"/><numFmt numFmtId="165" formatCode="0.0&quot;%&quot;"/><numFmt numFmtId="166" formatCode="yyyy\\-mm\\-dd"/></numFmts>'+
    '<fonts count="'+fonts.length+'">'+fonts.join("")+'</fonts><fills count="'+fills.length+'">'+fills.join("")+'</fills>'+
    '<borders count="'+borders.length+'">'+borders.join("")+'</borders>'+
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+
    '<cellXfs count="'+xfs.length+'">'+xfs.join("")+'</cellXfs>'+
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'+
    '<dxfs count="1"><dxf><fill><patternFill><bgColor rgb="'+C.gray+'"/></patternFill></fill></dxf></dxfs></styleSheet>';
}

/* ---------- cells / sheets ---------- */
function cell(ref, v, style, type){
  if(v==null||v==="") return '<c r="'+ref+'" s="'+style+'"/>';
  if(type==="date"){ const n=dateSerial(v); if(n!=null) return '<c r="'+ref+'" s="'+style+'"><v>'+n+'</v></c>'; }
  else if(type==="int"||type==="num"||type==="money"||type==="pct"){
    const n=typeof v==="number"?v:(String(v).trim()===""?NaN:Number(String(v).replace(/[$,%\s]/g,"")));
    if(isFinite(n)) return '<c r="'+ref+'" s="'+style+'"><v>'+n+'</v></c>';
    if(v==null||v==="") return '<c r="'+ref+'" s="'+style+'"/>';
  }
  if(typeof v==="number"&&isFinite(v)) return '<c r="'+ref+'" s="'+style+'"><v>'+v+'</v></c>';
  const s=String(v).slice(0,32000);
  return '<c r="'+ref+'" s="'+style+'" t="inlineStr"><is><t xml:space="preserve">'+xmlEsc(s)+'</t></is></c>';
}
function rowXml(r, cells, ht){ return '<row r="'+r+'"'+(ht?' ht="'+ht+'" customHeight="1"':'')+'>'+cells.join("")+'</row>'; }

function widthFor(col, rows, get){
  if(col.width) return col.width;
  let w=String(col.header).length*1.15+3;
  const n=Math.min(rows.length,500);
  for(let i=0;i<n;i++){
    const v=get(rows[i]); if(v==null) continue;
    let len = typeof v==="number" ? String(Math.round(v)).length+4 : String(v).length;
    if(col.type==="date") len=11;
    if(len+2>w) w=len+2;
  }
  return Math.max(9,Math.min(col.maxWidth||55,Math.ceil(w)));
}

const SHEET_NS='xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const PAGE='<pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>'+
  '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>'+
  '<headerFooter><oddFooter>&amp;L&amp;A&amp;RPage &amp;P of &amp;N</oddFooter></headerFooter>';

/* Banner shared by both sheet kinds: title (r1), subtitle (r2). Returns {xml, next}. */
function banner(opt, ncols){
  const merge=ncols>1?'<mergeCell ref="A1:'+colName(ncols-1)+'1"/><mergeCell ref="A2:'+colName(ncols-1)+'2"/>':'';
  return { merge, rows: rowXml(1,[cell("A1",opt.title||"Export",X.title)],28)+rowXml(2,[cell("A2",opt.subtitle||"",X.subtitle)],18) };
}

function dataSheet(sh, opt){
  const cols=sh.columns, ncols=cols.length;
  const getters=cols.map(c=> typeof c.get==="function" ? c.get : (r=>r==null?null:r[c.key]));
  const b=banner(opt,ncols);
  let rows=b.rows, r=3;
  const HEAD=4, FIRST=5, last=Math.max(FIRST, HEAD+sh.rows.length);
  rows+=rowXml(HEAD,cols.map((c,i)=>cell(colName(i)+HEAD,c.header,X.head)),30);
  const styles=cols.map(c=>TYPE_STYLE[c.type]||X.text);
  sh.rows.forEach((row,ri)=>{
    const rn=FIRST+ri, cs=new Array(ncols);
    for(let i=0;i<ncols;i++) cs[i]=cell(colName(i)+rn,getters[i](row),styles[i],cols[i].type);
    rows+=rowXml(rn,cs);
  });
  const lastCol=colName(ncols-1);
  const freezeCols=Math.min(sh.freezeCols||0,ncols-1);
  const pane='<pane '+(freezeCols?'xSplit="'+freezeCols+'" ':'')+'ySplit="'+HEAD+'" topLeftCell="'+colName(freezeCols)+FIRST+'" activePane="'+(freezeCols?'bottomRight':'bottomLeft')+'" state="frozen"/>'+
    (freezeCols?'<selection pane="topRight"/><selection pane="bottomLeft"/><selection pane="bottomRight" activeCell="'+colName(freezeCols)+FIRST+'" sqref="'+colName(freezeCols)+FIRST+'"/>':'<selection pane="bottomLeft" activeCell="A'+FIRST+'" sqref="A'+FIRST+'"/>');
  const colsXml='<cols>'+cols.map((c,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+widthFor(c,sh.rows,getters[i])+'" customWidth="1"/>').join("")+'</cols>';
  const xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet '+SHEET_NS+'>'+
    '<sheetPr><tabColor rgb="'+C.blue+'"/><pageSetUpPr fitToPage="1"/></sheetPr>'+
    '<dimension ref="A1:'+lastCol+last+'"/>'+
    '<sheetViews><sheetView workbookViewId="0" showGridLines="0">'+pane+'</sheetView></sheetViews>'+
    '<sheetFormatPr defaultRowHeight="16"/>'+colsXml+'<sheetData>'+rows+'</sheetData>'+
    '<autoFilter ref="A'+HEAD+':'+lastCol+last+'"/>'+
    (b.merge?'<mergeCells count="2">'+b.merge+'</mergeCells>':'')+
    '<conditionalFormatting sqref="A'+FIRST+':'+lastCol+last+'"><cfRule type="expression" dxfId="0" priority="1"><formula>MOD(ROW(),2)=0</formula></cfRule></conditionalFormatting>'+
    PAGE+'</worksheet>';
  return { xml, filterRef:"A"+HEAD+":"+lastCol+last, titleRows:"$"+HEAD+":$"+HEAD };
}

function overviewSheet(ov, opt){
  const ncols=3, b=banner(opt,ncols);
  let rows=b.rows, r=4;
  const merges=b.merge?[b.merge]:[], bars=[];
  const info=(opt.info||[]).filter(p=>p&&p[1]!=null&&p[1]!=="");
  info.forEach(([k,v])=>{
    rows+=rowXml(r,[cell("A"+r,k,X.label),cell("B"+r,v,X.info),cell("C"+r,"",X.info)]);
    merges.push('<mergeCell ref="B'+r+':C'+r+'"/>'); r++;
  });
  (ov.breakdowns||[]).forEach(bd=>{
    if(!bd.rows||!bd.rows.length) return;
    r++;
    rows+=rowXml(r,[cell("A"+r,bd.title,X.section),cell("B"+r,"",X.section),cell("C"+r,"",X.section)],20); r++;
    rows+=rowXml(r,[cell("A"+r,bd.labelHeader||"Category",X.sumHead),cell("B"+r,bd.valueHeader||"Count",X.sumHead),cell("C"+r,"Share",X.sumHead)]); r++;
    const first=r, total=bd.rows.reduce((s,x)=>s+(Number(x[1])||0),0);
    bd.rows.forEach(x=>{
      rows+=rowXml(r,[cell("A"+r,x[0]===""||x[0]==null?"(blank)":x[0],X.text),cell("B"+r,x[1],X.sumNum,"int"),
        cell("C"+r,total?(Number(x[1])||0)/total*100:0,X.sumPct,"pct")]); r++;
    });
    bars.push("B"+first+":B"+(r-1));
  });
  const cf=bars.map((sq,i)=>'<conditionalFormatting sqref="'+sq+'"><cfRule type="dataBar" priority="'+(i+1)+'"><dataBar><cfvo type="num" val="0"/><cfvo type="max"/><color rgb="'+C.sky+'"/></dataBar></cfRule></conditionalFormatting>').join("");
  const xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet '+SHEET_NS+'>'+
    '<sheetPr><tabColor rgb="'+C.sky+'"/><pageSetUpPr fitToPage="1"/></sheetPr>'+
    '<dimension ref="A1:C'+r+'"/><sheetViews><sheetView workbookViewId="0" showGridLines="0" tabSelected="1"/></sheetViews>'+
    '<sheetFormatPr defaultRowHeight="16"/><cols><col min="1" max="1" width="38" customWidth="1"/><col min="2" max="2" width="22" customWidth="1"/><col min="3" max="3" width="12" customWidth="1"/></cols>'+
    '<sheetData>'+rows+'</sheetData><mergeCells count="'+merges.length+'">'+merges.join("")+'</mergeCells>'+cf+PAGE+'</worksheet>';
  return { xml };
}

/* ---------- zip (stored/deflate) ---------- */
let CRC_T=null;
function crc32(u8){
  if(!CRC_T){ CRC_T=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; CRC_T[n]=c>>>0; } }
  let c=0xFFFFFFFF; for(let i=0;i<u8.length;i++) c=CRC_T[(c^u8[i])&255]^(c>>>8);
  return (c^0xFFFFFFFF)>>>0;
}
async function deflateRaw(u8){
  if(typeof CompressionStream==="undefined") return null;
  try{ return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer()); }
  catch(e){ return null; }
}
async function zip(files){
  const parts=[], central=[]; let off=0;
  const now=new Date(), dt=((now.getFullYear()-1980)<<9|(now.getMonth()+1)<<5|now.getDate())&0xFFFF, tm=(now.getHours()<<11|now.getMinutes()<<5|now.getSeconds()>>1)&0xFFFF;
  for(const f of files){
    const name=enc.encode(f.name), data=typeof f.data==="string"?enc.encode(f.data):f.data, crc=crc32(data);
    let body=data, method=0;
    if(data.length>512){ const d=await deflateRaw(data); if(d&&d.length<data.length){ body=d; method=8; } }
    const lh=new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true); lh.setUint16(4,20,true); lh.setUint16(6,0x0800,true); lh.setUint16(8,method,true);
    lh.setUint16(10,tm,true); lh.setUint16(12,dt,true); lh.setUint32(14,crc,true);
    lh.setUint32(18,body.length,true); lh.setUint32(22,data.length,true); lh.setUint16(26,name.length,true); lh.setUint16(28,0,true);
    parts.push(new Uint8Array(lh.buffer),name,body);
    const ch=new DataView(new ArrayBuffer(46));
    ch.setUint32(0,0x02014b50,true); ch.setUint16(4,20,true); ch.setUint16(6,20,true); ch.setUint16(8,0x0800,true); ch.setUint16(10,method,true);
    ch.setUint16(12,tm,true); ch.setUint16(14,dt,true); ch.setUint32(16,crc,true); ch.setUint32(20,body.length,true); ch.setUint32(24,data.length,true);
    ch.setUint16(28,name.length,true); ch.setUint32(42,off,true);
    central.push(new Uint8Array(ch.buffer),name);
    off+=30+name.length+body.length;
  }
  const csize=central.reduce((s,p)=>s+p.length,0);
  const end=new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true); end.setUint16(8,files.length,true); end.setUint16(10,files.length,true);
  end.setUint32(12,csize,true); end.setUint32(16,off,true);
  return new Blob(parts.concat(central,[new Uint8Array(end.buffer)]),{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}

/* ---------- workbook ---------- */
async function build(opt){
  const used=new Set(), sheets=[];
  const bannerInfo=opt;
  if(opt.overview) sheets.push({ name:safeSheetName(opt.overview.title||"Overview",used), ...overviewSheet(opt.overview,bannerInfo), overview:true });
  (opt.sheets||[]).forEach(sh=>{ sheets.push({ name:safeSheetName(sh.name,used), ...dataSheet(sh,bannerInfo) }); });
  if(!sheets.length) throw new Error("Nothing to export");
  const q=n=>"'"+n.replace(/'/g,"''")+"'";
  const names=sheets.map((s,i)=> s.filterRef?
    '<definedName name="_xlnm._FilterDatabase" localSheetId="'+i+'" hidden="1">'+xmlEsc(q(s.name))+'!'+s.filterRef.replace(/([A-Z]+)(\d+)/g,'$$$1$$$2')+'</definedName>'+
    '<definedName name="_xlnm.Print_Titles" localSheetId="'+i+'">'+xmlEsc(q(s.name))+'!'+s.titleRows+'</definedName>':"").join("");
  const NS_R="http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const files=[
    {name:"[Content_Types].xml", data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'+
      sheets.map((s,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("")+'</Types>'},
    {name:"_rels/.rels", data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="'+NS_R+'/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'},
    {name:"docProps/core.xml", data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>'+xmlEsc(opt.title||"Export")+'</dc:title><dc:creator>Blattner Site Inventory Portal</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">'+new Date().toISOString().replace(/\.\d+Z$/,"Z")+'</dcterms:created></cp:coreProperties>'},
    {name:"xl/workbook.xml", data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="'+NS_R+'"><bookViews><workbookView activeTab="0"/></bookViews><sheets>'+
      sheets.map((s,i)=>'<sheet name="'+xmlEsc(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join("")+'</sheets>'+(names?'<definedNames>'+names+'</definedNames>':'')+'</workbook>'},
    {name:"xl/_rels/workbook.xml.rels", data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
      sheets.map((s,i)=>'<Relationship Id="rId'+(i+1)+'" Type="'+NS_R+'/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join("")+
      '<Relationship Id="rId'+(sheets.length+1)+'" Type="'+NS_R+'/styles" Target="styles.xml"/></Relationships>'},
    {name:"xl/styles.xml", data:stylesXml()}
  ];
  sheets.forEach((s,i)=>files.push({name:"xl/worksheets/sheet"+(i+1)+".xml", data:s.xml}));
  return zip(files);
}

async function download(opt){
  const blob=await build(opt);
  if(typeof document==="undefined") return blob;
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob); a.download=opt.filename||"export.xlsx";
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1000);
  return blob;
}

/* Count rows by a label getter, biggest first — feeds Overview breakdowns. */
function tally(rows, get){
  const m=new Map(); rows.forEach(r=>{ const k=String(get(r)==null?"":get(r)); m.set(k,(m.get(k)||0)+1); });
  return [...m.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
}

const api={ build, download, tally, _dateSerial:dateSerial, _crc32:crc32 };
if(typeof module!=="undefined"&&module.exports) module.exports=api; else root.BACXlsx=api;
})(typeof window!=="undefined"?window:globalThis);
