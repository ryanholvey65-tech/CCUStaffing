import { TEMPLATE, GOOGLE_SCOPE } from './config.js';

const $ = id => document.getElementById(id);
const state = { rows: [], token: '', tokenClient: null, file: null, lastOutputUrl: '' };
const els = Object.fromEntries(['clientId','sheetUrl','saveSetup','connectGoogle','authStatus','pdfFile','fileName','readPdf','loadDemo','progressBox','progressText','progressPct','progress','dateFilter','generateDate','writeMode','rows','summary','addRow','fillSheet','openSheet','writeStatus','log','dropzone'].map(id=>[id,$(id)]));

window.addEventListener('DOMContentLoaded', init);
function init(){
  els.clientId.value=localStorage.getItem('cicuClientId')||'';
  els.sheetUrl.value=localStorage.getItem('cicuSheetUrl')||'';
  els.pdfFile.addEventListener('change', e=>setFile(e.target.files?.[0]));
  ['dragenter','dragover'].forEach(t=>els.dropzone.addEventListener(t,e=>{e.preventDefault();els.dropzone.classList.add('drag')}));
  ['dragleave','drop'].forEach(t=>els.dropzone.addEventListener(t,e=>{e.preventDefault();els.dropzone.classList.remove('drag')}));
  els.dropzone.addEventListener('drop',e=>setFile(e.dataTransfer.files?.[0]));
  els.saveSetup.onclick=saveSetup; els.connectGoogle.onclick=connectGoogle; els.readPdf.onclick=readPdf;
  els.loadDemo.onclick=loadDemo; els.dateFilter.onchange=render; els.generateDate.onchange=updateButtons;
  els.addRow.onclick=()=>{state.rows.push(blankRow());refreshDates();render()};
  els.fillSheet.onclick=buildFilledSheet; els.openSheet.onclick=()=>openSheet();
  updateButtons();
}
function saveSetup(){localStorage.setItem('cicuClientId',els.clientId.value.trim());localStorage.setItem('cicuSheetUrl',els.sheetUrl.value.trim());setAuth('Setup saved.',true)}
function setFile(file){if(!file)return;if(file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf'))return alert('Please choose a PDF.');state.file=file;els.fileName.textContent=file.name;els.readPdf.disabled=false}
function setAuth(text,good=false,bad=false){els.authStatus.textContent=text;els.authStatus.className='status'+(good?' good':'')+(bad?' bad':'')}
function connectGoogle(){
  const clientId=els.clientId.value.trim(); if(!clientId)return setAuth('Enter the OAuth Client ID first.',false,true);
  localStorage.setItem('cicuClientId',clientId); localStorage.setItem('cicuSheetUrl',els.sheetUrl.value.trim());
  if(!window.google?.accounts?.oauth2)return setAuth('Google sign-in is still loading. Try again.',false,true);
  state.tokenClient=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:GOOGLE_SCOPE,callback:r=>{if(r.error)return setAuth(r.error,false,true);state.token=r.access_token;setAuth('Google Sheets connected',true);updateButtons()}});
  state.tokenClient.requestAccessToken({prompt:state.token?'':'consent'});
}
function progress(text,pct){els.progressBox.classList.remove('hidden');els.progressText.textContent=text;els.progressPct.textContent=`${Math.round(pct)}%`;els.progress.value=pct}
async function readPdf(){
  if(!state.file)return; els.readPdf.disabled=true; state.rows=[]; render();
  try{
    progress('Loading PDF…',2);
    const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
    const pdf=await pdfjs.getDocument({data:await state.file.arrayBuffer()}).promise;
    const worker=await Tesseract.createWorker('eng',1,{logger:m=>{if(m.status==='recognizing text') progress(`Reading page ${state._page||1} of ${pdf.numPages}…`,((state._page-1)+(m.progress||0))/pdf.numPages*94+4)}});
    const all=[];
    for(let p=1;p<=pdf.numPages;p++){
      state._page=p; const page=await pdf.getPage(p); const viewport=page.getViewport({scale:1.55});
      const canvas=document.createElement('canvas'); canvas.width=viewport.width; canvas.height=viewport.height;
      await page.render({canvasContext:canvas.getContext('2d',{willReadFrequently:true}),viewport}).promise;
      const result=await worker.recognize(canvas); all.push({page:p,width:canvas.width,height:canvas.height,data:result.data});
    }
    await worker.terminate(); progress('Organizing staffing entries…',98);
    state.rows=parseOcrPages(all); refreshDates(); render(); progress(`Complete — ${state.rows.length} entries found`,100);
  }catch(err){console.error(err);alert(`Could not read the PDF: ${err.message}`);progress('Failed',0)}finally{els.readPdf.disabled=false}
}
function parseOcrPages(pages){
  const out=[];
  for(const page of pages){
    const words=(page.data.words||[]).filter(w=>w.text?.trim() && Number(w.confidence??w.conf)>20).map(w=>({text:w.text.trim(),conf:Number((w.confidence ?? w.conf) || 0),x0:w.bbox.x0,y0:w.bbox.y0,x1:w.bbox.x1,y1:w.bbox.y1,cx:(w.bbox.x0+w.bbox.x1)/2,cy:(w.bbox.y0+w.bbox.y1)/2}));
    const dates=findDateColumns(words,page.width); if(!dates.length)continue;
    const lines=groupLines(words);
    const left=lines.filter(l=>l.x0<page.width*.20 && l.y>page.height*.20);
    for(const col of dates){
      const cellLines=lines.filter(l=>l.cx>=col.x0&&l.cx<col.x1&&l.y>col.headerY+12);
      for(let i=0;i<cellLines.length;i++){
        const time=normalizeTime(cellLines[i].text); if(!time)continue;
        const y=cellLines[i].y; const context=cellLines.slice(Math.max(0,i-3),i).map(l=>l.text).filter(validNameLine);
        if(!context.length)continue;
        let name=context.slice(-2).join(' ').replace(/\s+/g,' ').trim(); name=cleanName(name); if(!name||name.length<4)continue;
        const meta=nearestSection(left,y);
        const role=normalizeRole(meta.job,name); const span=normalizeSpan(meta.span,time);
        if(!['RN','CHUC','ANM','NurseExt'].includes(role))continue;
        const conf=Math.max(.35,Math.min(.99,(cellLines[i].conf+context.length*8)/100));
        out.push({id:crypto.randomUUID(),use:role==='RN'||role==='CHUC',date:col.date,name,role,span,time,confidence:conf,page:page.page,sourceOrder:out.length});
      }
    }
  }
  return dedupe(out);
}
function groupLines(words){
  const sorted=[...words].sort((a,b)=>a.cy-b.cy||a.x0-b.x0), lines=[];
  for(const w of sorted){let line=lines.findLast?.(l=>Math.abs(l.y-w.cy)<11) || [...lines].reverse().find(l=>Math.abs(l.y-w.cy)<11);if(!line){line={items:[],y:w.cy};lines.push(line)}line.items.push(w);line.y=(line.y*(line.items.length-1)+w.cy)/line.items.length}
  return lines.map(l=>{l.items.sort((a,b)=>a.x0-b.x0);return{text:l.items.map(x=>x.text).join(' ').replace(/\s+/g,' ').trim(),conf:l.items.reduce((s,x)=>s+x.conf,0)/l.items.length,x0:l.items[0].x0,x1:l.items.at(-1).x1,cx:(l.items[0].x0+l.items.at(-1).x1)/2,y:l.y}}).sort((a,b)=>a.y-b.y);
}
function findDateColumns(words,width){
  const dayWords=words.filter(w=>/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/i.test(w.text)); const cols=[];
  for(const d of dayWords){const nearby=words.filter(w=>Math.abs(w.cy-d.cy)<18&&w.cx>d.cx&&w.cx<d.cx+150);const text=[d.text,...nearby.sort((a,b)=>a.x0-b.x0).map(w=>w.text)].join(' ');const m=text.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/i);if(m){let y=+m[4];if(y<100)y+=2000;cols.push({cx:d.cx,date:`${y}-${String(+m[2]).padStart(2,'0')}-${String(+m[3]).padStart(2,'0')}`,headerY:d.cy})}}
  cols.sort((a,b)=>a.cx-b.cx); return cols.map((c,i)=>({...c,x0:i?((cols[i-1].cx+c.cx)/2):width*.18,x1:i<cols.length-1?((c.cx+cols[i+1].cx)/2):width*.97}));
}
function nearestSection(left,y){
  const before=left.filter(l=>l.y<=y+8).slice(-12);let span='',job='';for(let i=before.length-1;i>=0;i--){const t=before[i].text.toUpperCase().replace(/\s/g,'');if(!span&&/(0700-1500|1500-1900|1900-2300|2300-0700)/.test(t))span=t.match(/(0700-1500|1500-1900|1900-2300|2300-0700)/)[1];const raw=before[i].text.toUpperCase();if(!job&&/\b(RN|HUC|CHUC|ANM|NURSEEXT)\b/.test(raw))job=raw.match(/\b(RN|HUC|CHUC|ANM|NURSEEXT)\b/)[1];if(span&&job)break}return{span,job};
}
function normalizeTime(text){const m=text.replace(/[Oo]/g,'0').match(/(\d{1,2})\s*[:.]?\s*(\d{2})\s*[-–—]\s*(\d{1,2})\s*[:.]?\s*(\d{2})/);if(!m)return'';return`${m[1].padStart(2,'0')}:${m[2]}-${m[3].padStart(2,'0')}:${m[4]}`}
function validNameLine(t){const u=t.toUpperCase();return /[A-Z]{2}/.test(u)&&!/(CCU|ICU|EDUCATION|VARIANCE|PLANNED|PAGE|LOCATION|NURSEEXT|\d{1,2}:\d{2})/.test(u)&&u.length<45}
function cleanName(t){return t.toUpperCase().replace(/[^A-Z,.' -]/g,' ').replace(/\b(X|FT|RN|ICURN|CCURN)\b/g,' ').replace(/\s+/g,' ').trim().replace(/^[-, ]+|[-, ]+$/g,'')}
function normalizeRole(job,name){if(job==='HUC'||job==='CHUC')return'CHUC';if(job==='ANM')return'ANM';if(job==='NURSEEXT'||/CREEDON/.test(name))return'NurseExt';return'RN'}
function normalizeSpan(span,time){if(span)return span;const start=+(time||'').slice(0,2);if(start===7)return'0700-1500';if(start===15)return'1500-1900';if(start===19)return'1900-2300';if(start===23)return'2300-0700';return'0700-1500'}
function dedupe(rows){const seen=new Set();return rows.filter(r=>{const k=[r.date,normalize(r.name),r.role,r.span].join('|');if(seen.has(k))return false;seen.add(k);return true})}
function normalize(v=''){return String(v).toUpperCase().replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim()}
function blankRow(){return{id:crypto.randomUUID(),use:true,date:els.generateDate.value||'',name:'',role:'RN',span:'0700-1500',time:'',confidence:1,sourceOrder:state.rows.length}}
function loadDemo(){state.rows=[['2026-07-20','CZARNOTA, JORDAN M','RN','0700-1500','07:00-19:30'],['2026-07-20','GARZA, GABRIELLE E','RN','0700-1500','07:00-19:30'],['2026-07-20','MCGEE, IVANA M','CHUC','0700-1500','07:00-19:30'],['2026-07-20','BAMARD, SARAH E','RN','1900-2300','19:00-07:30']].map((x,i)=>({id:crypto.randomUUID(),use:true,date:x[0],name:x[1],role:x[2],span:x[3],time:x[4],confidence:.97,sourceOrder:i}));refreshDates();render()}
function refreshDates(){const dates=[...new Set(state.rows.map(r=>r.date).filter(Boolean))].sort();for(const select of [els.dateFilter,els.generateDate]){const prior=select.value;select.innerHTML=`<option value="">${select===els.dateFilter?'All dates':'Select a date'}</option>`+dates.map(d=>`<option value="${d}">${displayDate(d)}</option>`).join('');if(dates.includes(prior))select.value=prior;else if(select===els.generateDate&&dates.length)select.value=dates[0]}updateButtons()}
function render(){const filter=els.dateFilter.value;const rows=state.rows.filter(r=>!filter||r.date===filter);els.summary.textContent=state.rows.length?`${state.rows.length} total entries · ${state.rows.filter(r=>r.use).length} selected · ${new Set(state.rows.map(r=>r.date)).size} dates`:'No staffing entries yet.';if(!rows.length){els.rows.innerHTML='<tr><td colspan="8" class="empty">No entries for this view.</td></tr>';return}els.rows.innerHTML=rows.map(r=>`<tr class="${r.confidence<.78?'low':''}" data-id="${r.id}"><td><input data-k="use" type="checkbox" ${r.use?'checked':''}></td><td><input data-k="date" type="date" value="${esc(r.date)}"></td><td><input data-k="name" value="${esc(r.name)}"></td><td><select data-k="role">${['RN','CHUC','ANM','NurseExt','OTHER'].map(x=>`<option ${x===r.role?'selected':''}>${x}</option>`).join('')}</select></td><td><select data-k="span">${Object.keys(TEMPLATE.spans).map(x=>`<option ${x===r.span?'selected':''}>${x}</option>`).join('')}</select></td><td><input data-k="time" value="${esc(r.time)}"></td><td>${Math.round((r.confidence||0)*100)}%</td><td><button class="icon-button" data-delete>Delete</button></td></tr>`).join('');els.rows.querySelectorAll('[data-k]').forEach(el=>el.addEventListener('change',e=>{const row=state.rows.find(x=>x.id===e.target.closest('tr').dataset.id);row[e.target.dataset.k]=e.target.type==='checkbox'?e.target.checked:e.target.value;refreshDates();render()}));els.rows.querySelectorAll('[data-delete]').forEach(el=>el.onclick=e=>{state.rows=state.rows.filter(x=>x.id!==e.target.closest('tr').dataset.id);refreshDates();render()});updateButtons()}
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function displayDate(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return v;const [y,m,d]=v.split('-');return`${+m}/${+d}/${y}`}
function spreadsheetId(){const v=els.sheetUrl.value.trim();return v.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1]||(/^[\w-]{20,}$/.test(v)?v:'')}
function openSheet(){const id=state.lastOutputUrl.match(/\/d\/([\w-]+)/)?.[1]||spreadsheetId();if(id)window.open(`https://docs.google.com/spreadsheets/d/${id}/edit`,'_blank');else alert('Enter the Google Sheets template URL first.')}
function updateButtons(){els.fillSheet.disabled=!(state.token&&spreadsheetId()&&els.generateDate.value&&state.rows.some(r=>r.use&&r.date===els.generateDate.value))}

async function googleJson(url,options={}){
  const res=await fetch(url,{...options,headers:{Authorization:`Bearer ${state.token}`,'Content-Type':'application/json',...(options.headers||{})}});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data.error?.message||`Google API error ${res.status}`);
  return data;
}
function sheetsUrl(id,path=''){return `https://sheets.googleapis.com/v4/spreadsheets/${id}${path}`}
async function sheetsApi(id,path='',options={}){return googleJson(sheetsUrl(id,path),options)}

async function createTemplateCopy(sourceId,date){
  const sourceMeta=await sheetsApi(sourceId,'?fields=sheets.properties(sheetId,title)');
  const needed=[...new Set(Object.values(TEMPLATE.spans).map(x=>x.sheet))];
  const byTitle=new Map((sourceMeta.sheets||[]).map(s=>[s.properties?.title,s.properties]));
  const missing=needed.filter(title=>!byTitle.has(title));
  if(missing.length)throw new Error(`Template is missing required tab(s): ${missing.join(', ')}`);

  const title=`CICU Daily Assignment - ${date}`;
  const created=await googleJson('https://sheets.googleapis.com/v4/spreadsheets',{method:'POST',body:JSON.stringify({properties:{title}})});
  const destId=created.spreadsheetId;
  const defaultSheetId=created.sheets?.[0]?.properties?.sheetId;
  if(!destId)throw new Error('Google did not return a new spreadsheet ID.');

  const copied=[];
  for(const sheetName of needed){
    const sourceSheet=byTitle.get(sheetName);
    const copy=await sheetsApi(sourceId,`/sheets/${sourceSheet.sheetId}:copyTo`,{method:'POST',body:JSON.stringify({destinationSpreadsheetId:destId})});
    copied.push({sheetId:copy.sheetId,title:sheetName});
  }

  const requests=copied.map(s=>({updateSheetProperties:{properties:{sheetId:s.sheetId,title:s.title},fields:'title'}}));
  if(defaultSheetId!=null)requests.push({deleteSheet:{sheetId:defaultSheetId}});
  if(requests.length)await sheetsApi(destId,':batchUpdate',{method:'POST',body:JSON.stringify({requests})});
  return destId;
}

async function writeScheduleToSpreadsheet(targetId,date,selected){
  const clearRanges=[],writes=[],logs=[];
  for(const [span,cfg] of Object.entries(TEMPLATE.spans)){
    const group=selected.filter(r=>r.span===span).sort((a,b)=>(a.sourceOrder??0)-(b.sourceOrder??0));
    const nurses=group.filter(r=>r.role==='RN').map(r=>aliasName(r.name));
    const chuc=group.find(r=>r.role==='CHUC');
    clearRanges.push(`'${cfg.sheet}'!${cfg.rnRange}`);
    if(cfg.chucCell)clearRanges.push(`'${cfg.sheet}'!${cfg.chucCell}`);
    const capacity=rangeCapacity(cfg.rnRange);
    if(nurses.length>capacity)logs.push(`${span}: ${nurses.length-capacity} RN(s) exceeded available slots.`);
    if(nurses.length)writes.push({range:`'${cfg.sheet}'!${cfg.rnRange}`,majorDimension:'ROWS',values:nurses.slice(0,capacity).map(x=>[x])});
    if(chuc&&cfg.chucCell)writes.push({range:`'${cfg.sheet}'!${cfg.chucCell}`,values:[[aliasName(chuc.name)]]});
    writes.push({range:`'${cfg.sheet}'!${cfg.dateCell}`,values:[[displayDate(date)]]});
  }
  if(clearRanges.length)await sheetsApi(targetId,'/values:batchClear',{method:'POST',body:JSON.stringify({ranges:clearRanges})});
  await sheetsApi(targetId,'/values:batchUpdate',{method:'POST',body:JSON.stringify({valueInputOption:'USER_ENTERED',data:writes})});
  return logs;
}

async function buildFilledSheet(){
  const date=els.generateDate.value;
  const sourceId=spreadsheetId();
  const selected=state.rows.filter(r=>r.use&&r.date===date&&(r.role==='RN'||r.role==='CHUC'));
  if(!selected.length)return;
  els.fillSheet.disabled=true;
  els.writeStatus.textContent='Building filled sheet…';
  els.writeStatus.className='status';
  els.log.classList.add('hidden');
  state.lastOutputUrl='';
  try{
    localStorage.setItem('cicuSheetUrl',els.sheetUrl.value.trim());
    const targetId=await createTemplateCopy(sourceId,date);
    const logs=await writeScheduleToSpreadsheet(targetId,date,selected);
    const url=`https://docs.google.com/spreadsheets/d/${targetId}/edit`;
    state.lastOutputUrl=url;
    els.writeStatus.textContent='Filled sheet ready';
    els.writeStatus.className='status good';
    const warningText=logs.length?`<div>${logs.map(esc).join('<br>')}</div>`:'';
    els.log.innerHTML=`<strong>Finished.</strong> Created a new filled workbook for ${esc(displayDate(date))}.<br><br><a href="${url}" target="_blank" rel="noopener">Open filled schedule</a>${warningText}`;
    els.log.classList.remove('hidden');
  }catch(err){
    console.error(err);
    els.writeStatus.textContent='Build failed';
    els.writeStatus.className='status bad';
    els.log.textContent=err.message+'\n\nIf access expired, reconnect Google Sheets and try again.';
    els.log.classList.remove('hidden');
  }finally{updateButtons()}
}
function rangeCapacity(a1){const [a,b]=a1.split(':').map(x=>+x.match(/\d+/)[0]);return Math.abs(b-a)+1}
function aliasName(name){const n=normalize(name);return TEMPLATE.aliases[n]||name.trim()}