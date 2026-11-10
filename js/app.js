
(()=>{
'use strict';
const $=id=>document.getElementById(id);

// کلید ذخیره‌سازی تنظیمات نسخه 2.6.2؛ تنظیمات نسخه‌های قبلی نیز بازیابی می‌شوند.
const SETTINGS_STORAGE_KEY='nursingPerformanceSettings_v2_6_2:'+location.pathname;
const PREV_SETTINGS_KEYS=[
  'nursingPerformanceSettings_v2_6_1:'+location.pathname,
  'nursingPerformanceSettings_v2_6:'+location.pathname,
  'nursingPerformanceSettings_v2_5_3:'+location.pathname,
  'nursingPerformanceSettings_v2_5_1:'+location.pathname,
  'nursingPerformanceSettings_v2_5:'+location.pathname
];

const scoreDefaults=[
 {name:'تریاژ سطح 1',score:11},
 {name:'تریاژ سطح 2',score:8},
 {name:'تریاژ سطح 3',score:3.5},
 {name:'تریاژ سطح 4',score:1.5},
 {name:'تعداد بیمار تریاژ شده',score:0.3},
 {name:'گروه مراقبتی 1',score:1.7},
 {name:'گروه مراقبتی 2',score:2.3},
 {name:'گروه مراقبتی 3',score:3},
 {name:'گروه مراقبتی 4',score:3.7},
 {name:'گروه مراقبتی 5',score:6.5},
 {name:'گروه مراقبتی 6',score:13},
 {name:'تعداد اعزام و انتقال به ازاء هر يك ساعت',score:4.8},
 {name:'خدمات درمانگاهي سرپايي درمانگاه و آماده سازي داروي شيمي درماني بستري و سرپايي',score:1},
 {name:'تعداد جلسات شيمي درماني سرپايي و بستري',score:3},
 {name:'سركولار',score:0.1},
 {name:'اسكراب',score:0.1},
 {name:'تعداد قطع يا وصل همودياليز (جداگانه) و دياليز صفاقي',score:2},
 {name:'ريكاوري / آماده سازي',score:1.5},
 {name:'هوشبر',score:0.1},
 {name:'تعداد خدمات سرپايي انواع پانسمان سوختگي،زخمهاي بستر،پاي ديابتي،ROP تزريق ماده فارماكولوژِك،اسكوپي خارح از اتاق عمل ،درمان اكسيژن پرفشار',score:2},
 {name:'پرستار مراقب نوزاد(سزارين)',score:1.5},
 {name:'تعداد اعزام و انتقال به ازاء هر يك ساعت اضافه',score:2.4},
 {name:'تعداد بيمار در اتاق عمل اورژانس /سرپايي',score:1.5}
];
const shiftDefaults=[{name:'صبح',factor:1},{name:'عصر',factor:1},{name:'شب',factor:1}];

// تنظیمات نقش‌های غیرمستقیم با سقف مجاز ضریب حضور
const indirectRoleConfig=[
  {id:'head_nurse', label:'سرپرستار / ماما مسئول', factor:1.3, maxAtt:1.25},
  {id:'assistant_head', label:'جانشین سرپرستار / استاف / مسئول شیفت', factor:1.1, maxAtt:1.25},
  {id:'nurse_aid', label:'کمک‌پرستار / کمک‌بهیار', factor:0.45, maxAtt:2.0}
];
const hospitalIndirectRoleConfig=[
  {id:'metron', label:'مترون', factor:1.9, maxAtt:1.25},
  {id:'supervisor', label:'سوپروایزرها', factor:1.6, maxAtt:1.25},
  {id:'follow_nurse', label:'پرستار پیگیر ، کنترل عفونت، و آموزش', factor:0.85, maxAtt:1.25},
  {id:'behyar_injection', label:'بهیاران و پرستاران واحد تزریقات', factor:0.65, maxAtt:1.25}
];

function normalizeShiftSettings(items){
  return items.map(x=>({name:String(x.name??''),factor:(norm(x.name)===norm('عصر')||norm(x.name)===norm('شب'))?1:(x.factor===null?null:num(x.factor))}))
}

function validSettings(v){
  return !!v&&Array.isArray(v.scores)&&Array.isArray(v.shifts)&&v.scores.every(x=>x&&typeof x.name==='string'&&(x.score===null||Number.isFinite(Number(x.score))))&&v.shifts.every(x=>x&&typeof x.name==='string'&&(x.factor===null||Number.isFinite(Number(x.factor))))
}

function readEmbeddedSettings(){
  try{
    const el=$('embeddedSettings');
    const v=JSON.parse(el?.textContent||'{}');
    return validSettings(v)?v:null;
  }catch(e){return null}
}

function loadSavedSettings(){
  let v=null;
  try{
    v=JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)||'null');
    if(!validSettings(v)){
      for(const oldKey of PREV_SETTINGS_KEYS){
        const oldVal=JSON.parse(localStorage.getItem(oldKey)||'null');
        if(validSettings(oldVal)){
          v=oldVal;
          break;
        }
      }
    }
  }catch(e){}
  if(!validSettings(v))v=readEmbeddedSettings();
  if(!v)return {scores:scoreDefaults,shifts:shiftDefaults,enableFinancial:false,rialFactor:0,defaultQuality:1.0,attendanceFactors:{},nightBonusOffDepts:[]};
  return {
    ...v,
    enableFinancial:typeof v.enableFinancial==='boolean'?v.enableFinancial:false,
    rialFactor:Number(v.rialFactor)||0,
    defaultQuality:Number(v.defaultQuality)||1.0,
    attendanceFactors:v.attendanceFactors||{},
    nightBonusOffDepts:Array.isArray(v.nightBonusOffDepts)?v.nightBonusOffDepts.map(String):[]
  };
}

let selectedFiles=[],allRows=[],fileIssues=[],hasCalculated=false;
const excludedNurses=new Set();
let isAllDepartments=true;
const selectedDepartments=new Set();
const nurseQualityScores=new Map();
const roleAttendanceMap=new Map();

function num(v){
  if(typeof v==='number') return v;
  let s=String(v??'').trim().replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/٬/g,'').replace(/,/g,'').replace(/٫/g,'.').replace(/\s/g,'');
  if(!s) return null;
  let n=Number(s);
  return Number.isFinite(n)?n:null;
}

function norm(s){
  return String(s??'').normalize('NFC').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[\u200c\u200e\u200f\u00a0]/g,' ').replace(/[\s\u0640]+/g,' ').trim().toLowerCase();
}
function normHeader(s){return norm(s).replace(/[\s\/:\\\-_.،,؛;()[\]]/g,'');}
function pathDecode(s){try{return decodeURIComponent(s)}catch(e){return s}}
function normPath(s){let q=pathDecode(String(s||'')).replace(/\\/g,'/');let parts=[];for(const p of q.split('/')){if(!p||p==='.')continue;if(p==='..')parts.pop();else parts.push(p)}return parts.join('/').toLowerCase();}
function relWithoutRoot(f){let p=f.webkitRelativePath||f.name;let a=p.replace(/\\/g,'/').split('/');return a.length>1?a.slice(1).join('/'):a[0];}
function fileMap(files){let m=new Map();for(const f of files){m.set(normPath(relWithoutRoot(f)),f);m.set(normPath(f.name),f)}return m;}
function isCandidateDataFile(f){return /\.(xls|xml|xlsx|csv)$/i.test(f.name)&&!/^~\$/.test(f.name)}
function getWorkbookDisplayName(txt,f){let m=txt.match(/c_rgszSh\s*\[\s*1\s*\]\s*=\s*["']([^"']+)/i);if(m){return m[1].replace(/\u00a0/g,' ').trim()}return f.name.replace(/\.(xls|xml|xlsx|csv)$/i,'')}
function hrefsFromXls(txt){let out=[],re=/href\s*=\s*["']([^"']+?\.htm(?:l)?(?:\?[^"']*)?)["']/gi,m;while((m=re.exec(txt))!==null){let h=m[1].split('?')[0];if(!out.includes(h))out.push(h)}return out;}
function hrefToKey(h,workbookRel){let raw=String(h||'').split(/[?#]/)[0].replace(/\\/g,'/');if(/^https?:\/\//i.test(raw)){try{let u=new URL(raw);raw=u.pathname;let seg=raw.split('/').filter(Boolean);let ix=seg.findIndex(x=>/_files$/i.test(pathDecode(x)));if(ix>=0)return normPath(seg.slice(ix).join('/'));raw=seg.slice(-2).join('/')}catch(e){}}
let decoded=pathDecode(raw);if(decoded.startsWith('/')){let z=decoded.split('/');let i=z.findIndex(p=>/_files$/i.test(p));if(i>=0)return normPath(z.slice(i).join('/'));decoded=z.slice(-2).join('/')}
if(decoded.includes('../')){const parent=workbookRel.split('/').slice(0,-1).join('/');return normPath(parent+'/'+decoded)}
return normPath(decoded.replace(/^\.\//,''));}

function parseCell(c){
  if(c===null||c===undefined) return '';
  let text='';
  if(typeof c==='object'&&('textContent' in c)){
    text=c.textContent||'';
  }else{
    text=String(c);
  }
  return text.replace(/\u00a0/g,' ').replace(/[\r\n\t]+/g,' ').trim();
}

function parse2DArray(rows, sourceSheet=''){
  for(let ri=0;ri<rows.length;ri++){
    const rawRow=rows[ri]||[];
    const cells=rawRow.map(parseCell);
    const hn=cells.map(normHeader);
    
    let idxAmount=hn.findIndex(x=>x.includes('مقداردقیقه')||x==='مقدار'||x.includes('تعداد'));
    let idxGroup=hn.findIndex(x=>x.includes('گروهعملکرد'));
    let idxTitle=hn.findIndex(x=>x.includes('عنوانعملکرد')||x.includes('شرحعملکرد'));
    let idxShift=hn.findIndex(x=>x==='شیفت'||x.includes('نوعشیفت'));
    let idxDepartment=hn.findIndex(x=>x==='بخش'||x.includes('بخشواحد')||x.includes('نامبخش'));
    let idxNurse=hn.findIndex(x=>x==='پرسنل'||x.includes('نامپرسنل')||x.includes('پرستار'));
    let idxRow=hn.findIndex(x=>x==='ردیف'||x==='شمارهردیف');

    let effectiveGroupCol = idxGroup>=0 ? idxGroup : idxTitle;

    if(idxAmount>=0 && effectiveGroupCol>=0){
      let result=[];
      for(let r=ri+1;r<rows.length;r++){
        let rawVals=rows[r];
        if(!rawVals||!rawVals.length)continue;
        let vals=rawVals.map(parseCell);
        
        const amountText=vals[idxAmount]??'';
        
        let group='';
        if(idxGroup>=0 && vals[idxGroup]!==undefined && vals[idxGroup]!==''){
          group=vals[idxGroup];
        }else if(idxTitle>=0 && vals[idxTitle]!==undefined && vals[idxTitle]!==''){
          group=vals[idxTitle];
        }

        const shift=idxShift>=0?vals[idxShift]:'صبح';
        const rawNurse=idxNurse>=0?vals[idxNurse]:'';
        const department=idxDepartment>=0?vals[idxDepartment]:'';
        
        if(!group&&!shift&&!amountText)continue;
        if(normHeader(group).includes('گروهعملکرد')||normHeader(shift)==='شیفت')continue;
        
        let amount=num(amountText);
        if(!group&&!shift)continue;
        
        const rowNumber = (idxRow>=0 && vals[idxRow]!==undefined && vals[idxRow]!=='')
          ? vals[idxRow]
          : String(r+1);

        result.push({
          amount,
          group,
          shift:shift||'صبح',
          department,
          sourceRow:rowNumber,
          rawNurse,
          sourceSheet
        });
      }
      if(result.length) return result;
    }
  }
  return null;
}

function readTableFromHtml(html){
  const doc=new DOMParser().parseFromString(html,'text/html');
  let tables=[...doc.querySelectorAll('table')];
  for(const table of tables){
    let trs=[...table.querySelectorAll('tr')].filter(tr=>tr.querySelectorAll(':scope > td, :scope > th').length>0);
    let cellsByRow=trs.map(tr=>[...tr.children].filter(c=>['TD','TH'].includes(c.tagName)).map(c=>parseCell(c)));
    const res=parse2DArray(cellsByRow, doc.title||'HTML');
    if(res) return res;
  }
  return null;
}

function readTableFromCsv(csvText){
  const lines=[];
  let row=[], field='', inQuotes=false;
  for(let i=0;i<csvText.length;i++){
    const c=csvText[i], next=csvText[i+1];
    if(inQuotes){
      if(c==='"' && next==='"'){field+='"';i++;}
      else if(c==='"'){inQuotes=false;}
      else{field+=c;}
    }else{
      if(c==='"'){inQuotes=true;}
      else if(c===','||c===';'||c==='\t'){row.push(field);field='';}
      else if(c==='\r'){if(next==='\n')i++;lines.push(row);row=[];field='';}
      else if(c==='\n'){lines.push(row);row=[];field='';}
      else{field+=c;}
    }
  }
  if(field||row.length){row.push(field);lines.push(row);}
  return parse2DArray(lines, 'CSV');
}

function readTableFromXml(xmlText){
  try{
    const parser=new DOMParser();
    const doc=parser.parseFromString(xmlText,'application/xml');
    if(doc.querySelector('parsererror'))return null;
    const root=doc.documentElement;
    if(!root)return null;
    let rows=[...root.children];
    if(!rows.length)return null;
    let firstRow=rows[0];
    let colTags=[...firstRow.children];
    let headerMap={};
    let isHeaderRow=false;
    for(const el of colTags){
      const val=normHeader(parseCell(el));
      if(val.includes('مقدار')||val.includes('گروهعملکرد')||val==='شیفت'||val.includes('نوعشیفت')){
        isHeaderRow=true;
        break;
      }
    }
    let startIndex=0;
    if(isHeaderRow){
      for(const el of colTags){
        const val=normHeader(parseCell(el));
        const tag=el.tagName;
        if(val.includes('مقداردقیقه')||val==='مقدار'||val.includes('تعداد')) headerMap.amount=tag;
        else if(val.includes('گروهعملکرد')) headerMap.group=tag;
        else if(val.includes('عنوانعملکرد')||val.includes('شرحعملکرد')) headerMap.title=tag;
        else if(val==='شیفت'||val.includes('نوعشیفت')) headerMap.shift=tag;
        else if(val==='بخش'||val.includes('بخشواحد')||val.includes('نامبخش')) headerMap.department=tag;
        else if(val==='پرسنل'||val.includes('نامپرسنل')||val.includes('پرستار')) headerMap.nurse=tag;
        else if(val==='ردیف'||val==='شمارهردیف') headerMap.row=tag;
      }
      startIndex=1;
    }else{
      for(const el of colTags){
        const tag=el.tagName;
        const normTag=normHeader(tag);
        if(normTag.includes('مقداردقیقه')||normTag==='مقدار'||normTag.includes('تعداد')) headerMap.amount=tag;
        else if(normTag.includes('گروهعملکرد')) headerMap.group=tag;
        else if(normTag.includes('عنوانعملکرد')||normTag.includes('شرحعملکرد')) headerMap.title=tag;
        else if(normTag==='شیفت'||normTag.includes('نوعشیفت')) headerMap.shift=tag;
        else if(normTag==='بخش'||normTag.includes('بخشواحد')||normTag.includes('نامبخش')) headerMap.department=tag;
        else if(normTag==='پرسنل'||normTag.includes('نامپرسنل')||normTag.includes('پرستار')) headerMap.nurse=tag;
        else if(normTag==='ردیف'||normTag==='شمارهردیف') headerMap.row=tag;
      }
    }
    if(!headerMap.amount||(!headerMap.group&&!headerMap.title)) return null;
    let result=[];
    for(let i=startIndex;i<rows.length;i++){
      const rowEl=rows[i];
      const getVal=(tag)=>{
        if(!tag)return '';
        const child=rowEl.getElementsByTagName(tag)[0];
        return child?parseCell(child):'';
      };
      const amountText=getVal(headerMap.amount);
      let group=getVal(headerMap.group);
      if(!group&&headerMap.title) group=getVal(headerMap.title);

      const shift=headerMap.shift?getVal(headerMap.shift):'صبح';
      const department=getVal(headerMap.department);
      const rawNurse=getVal(headerMap.nurse);
      const rowVal=getVal(headerMap.row);

      if(!group&&!shift&&!amountText)continue;
      let amount=num(amountText);
      if(!group&&!shift)continue;
      result.push({
        amount,
        group,
        shift:shift||'صبح',
        department,
        sourceRow:rowVal?rowVal:String(i+1),
        rawNurse,
        sourceSheet:'XML'
      });
    }
    return result.length?result:null;
  }catch(e){
    return null;
  }
}

function renderEditableRows(tableId,arr,keyField,valField){
  const body=$(tableId).querySelector('tbody');body.innerHTML='';
  arr.forEach((x,i)=>{
    const tr=document.createElement('tr');
    const td1=document.createElement('td');
    const input1=document.createElement('input');input1.type='text';input1.className='score-name';input1.value=x[keyField];input1.setAttribute('aria-label','نام');
    input1.addEventListener('input',()=>{x[keyField]=input1.value;persistSettings()});
    td1.appendChild(input1);
    const td2=document.createElement('td');
    const input2=document.createElement('input');input2.type='number';input2.step='any';input2.value=x[valField];input2.setAttribute('aria-label','مقدار');
    input2.addEventListener('input',()=>{x[valField]=num(input2.value);persistSettings()});
    td2.appendChild(input2);
    const td3=document.createElement('td');
    const b=document.createElement('button');b.className='danger';b.type='button';b.textContent='حذف';
    b.addEventListener('click',()=>{arr.splice(i,1);renderSettings();persistSettings()});
    td3.appendChild(b);
    tr.append(td1,td2,td3);
    body.appendChild(tr);
  });
}

const savedSettings=loadSavedSettings();
let scores=savedSettings.scores.map(x=>({name:String(x.name??''),score:x.score===null?null:num(x.score)})),shifts=normalizeShiftSettings(savedSettings.shifts);
let enableFinancial=savedSettings.enableFinancial;
let rialFactor=savedSettings.rialFactor;
let defaultQuality=savedSettings.defaultQuality;
// بخش‌هایی که ضریب ۱٫۵ شیفت شب برای گروه‌های مراقبتی در آن‌ها اعمال نمی‌شود (کلید = نام نرمال‌شده بخش)
const nightBonusOffDepts=new Map();
for(const d of (savedSettings.nightBonusOffDepts||[])){const t=String(d).trim();if(t)nightBonusOffDepts.set(norm(t),t)}
function deptLabel(d){return String(d||'').trim()||'بدون بخش'}
function isNightBonusEnabled(dept){return !nightBonusOffDepts.has(norm(deptLabel(dept)))}

if(savedSettings.attendanceFactors){
  for(const [k,v] of Object.entries(savedSettings.attendanceFactors)){
    roleAttendanceMap.set(k,Number(v)||1.0);
  }
}

function persistSettings(){
  let saved=false;
  try{
    const attObj=Object.fromEntries(roleAttendanceMap);
    localStorage.setItem(SETTINGS_STORAGE_KEY,JSON.stringify({
      scores,
      shifts,
      enableFinancial,
      rialFactor,
      defaultQuality,
      attendanceFactors:attObj,
      nightBonusOffDepts:[...nightBonusOffDepts.values()]
    }));
    saved=true;
  }catch(e){}
  const status=$('settingsStatus');
  if(status)status.textContent=saved?'تنظیمات در حافظه مرورگر ذخیره شد.':'ذخیره مرورگر در دسترس نیست.';
}

function renderSettings(){renderEditableRows('scoresTable',scores,'name','score');renderEditableRows('shiftsTable',shifts,'name','factor')}
renderSettings();
renderIndirect();
renderNightDeptSettings();
persistSettings();

$('enableFinancial').checked=enableFinancial;
$('rialFactorInput').value=rialFactor?rialFactor.toLocaleString('en-US'):'';
$('defaultQualityInput').value=defaultQuality;
$('financialInputs').style.display=enableFinancial?'flex':'none';

$('enableFinancial').addEventListener('change',()=>{
  enableFinancial=$('enableFinancial').checked;
  $('financialInputs').style.display=enableFinancial?'flex':'none';
  persistSettings();
  renderReports();
});

$('rialFactorInput').addEventListener('input',()=>{
  rialFactor=num($('rialFactorInput').value)||0;
  persistSettings();
  renderReports();
});

$('defaultQualityInput').addEventListener('input',()=>{
  defaultQuality=num($('defaultQualityInput').value)||1.0;
  persistSettings();
  renderReports();
});

const settingsDialog=$('settingsDialog');
const nurseModal=$('nurseModal');
const deptModal=$('deptModal');
const warningsModal=$('warningsModal');

$('openSettings').addEventListener('click',()=>{if(typeof settingsDialog.showModal==='function')settingsDialog.showModal();else settingsDialog.setAttribute('open','open')});
$('closeSettings').addEventListener('click',()=>{if(typeof settingsDialog.close==='function')settingsDialog.close();else settingsDialog.removeAttribute('open')});
settingsDialog.addEventListener('click',e=>{if(e.target===settingsDialog&&typeof settingsDialog.close==='function')settingsDialog.close()});

$('closeNurseModal').addEventListener('click',()=>{if(typeof nurseModal.close==='function')nurseModal.close();else nurseModal.removeAttribute('open')});
$('closeNurseModalBottom').addEventListener('click',()=>{if(typeof nurseModal.close==='function')nurseModal.close();else nurseModal.removeAttribute('open')});
nurseModal.addEventListener('click',e=>{if(e.target===nurseModal&&typeof nurseModal.close==='function')nurseModal.close()});

$('closeDeptModal').addEventListener('click',()=>{if(typeof deptModal.close==='function')deptModal.close();else deptModal.removeAttribute('open')});
$('closeDeptModalBottom').addEventListener('click',()=>{if(typeof deptModal.close==='function')deptModal.close();else deptModal.removeAttribute('open')});
deptModal.addEventListener('click',e=>{if(e.target===deptModal&&typeof deptModal.close==='function')deptModal.close()});

$('closeWarningsModal').addEventListener('click',()=>{if(typeof warningsModal.close==='function')warningsModal.close();else warningsModal.removeAttribute('open')});
$('closeWarningsModalBottom').addEventListener('click',()=>{if(typeof warningsModal.close==='function')warningsModal.close();else warningsModal.removeAttribute('open')});
warningsModal.addEventListener('click',e=>{if(e.target===warningsModal&&typeof warningsModal.close==='function')warningsModal.close()});

function openNurseDetailModal(nurseName){
  const rows=allRows.filter(r=>r.nurse===nurseName);
  $('nurseModalTitle').textContent=`جزئیات عملکرد: ${nurseName}`;
  const totalScore=rows.reduce((sum,r)=>sum+(r.points??0),0);
  const totalRecords=rows.length;
  
  let subtitle=`تعداد کل رکوردها: ${totalRecords} | امتیاز کمی کل: ${fmt(totalScore)}`;
  if(enableFinancial&&rialFactor>0){
    const q=nurseQualityScores.get(nurseName)??defaultQuality;
    const money=Math.round(totalScore*q*rialFactor);
    subtitle+=` | ضریب کیفی: ${q} | کارکرد ناخالص: ${money.toLocaleString('en-US')} ریال`;
  }
  $('nurseModalSubtitle').textContent=subtitle;
  
  const map=new Map();
  for(const r of rows){
    const key=[r.department,r.group,r.shift].join('||');
    if(!map.has(key))map.set(key,{department:r.department,group:r.group,shift:r.shift,amount:0,score:r.score,factor:r.factor,points:0,count:0});
    const x=map.get(key);
    if(r.amount!==null)x.amount+=r.amount;
    x.count++;
    if(r.points!==null)x.points+=r.points;
  }
  const tb=$('nurseModalTable').querySelector('tbody');
  tb.innerHTML='';
  for(const x of map.values()){
    const tr=document.createElement('tr');
    [x.department||'—',x.group||'—',x.shift||'—',fmt(x.amount),fmt(x.score),fmt(x.factor),fmt(x.points),x.count].forEach(v=>makeCell(tr,v));
    tb.appendChild(tr);
  }
  const warnings=rows.filter(r=>r.status!=='OK').length;
  $('nurseModalFooterNote').textContent=warnings?`توجه: ${warnings} رکورد دارای وضعیت بررسی در اطلاعات این پرسنل وجود دارد.`:'تمامی رکوردهای این پرسنل دارای محاسبه معتبر هستند.';
  if(typeof nurseModal.showModal==='function')nurseModal.showModal();
  else nurseModal.setAttribute('open','open');
}

function openDeptDetailModal(deptData){
  $('deptModalTitle').textContent=`ریز عملکرد گروه‌ها در بخش: ${deptData.department}`;
  $('deptModalSubtitle').textContent=`مجموع مقدار: ${fmt(deptData.amount)} | امتیاز کل: ${fmt(deptData.points)} | تعداد رکورد: ${deptData.count.toLocaleString('en-US')}`;
  const tb=$('deptModalTable').querySelector('tbody');
  tb.innerHTML='';
  const sortedGroups=[...deptData.groups.values()].sort((a,b)=>a.group.localeCompare(b.group,'fa'));
  for(const g of sortedGroups){
    const tr=document.createElement('tr');
    [g.group,fmt(g.amount),fmt(g.score),fmt(g.points),g.count.toLocaleString('en-US'),g.warnings?`${g.warnings} مورد`:'—'].forEach(v=>makeCell(tr,v));
    tb.appendChild(tr);
  }
  if(typeof deptModal.showModal==='function')deptModal.showModal();
  else deptModal.setAttribute('open','open');
}

function openWarningsModal(warningsList){
  $('warningsModalContent').textContent=warningsList.join('\n');
  if(typeof warningsModal.showModal==='function')warningsModal.showModal();
  else warningsModal.setAttribute('open','open');
}

$('chooseFolder').addEventListener('click',()=>$('folderInput').click());
$('chooseFiles').addEventListener('click',()=>$('fileInput').click());

function handleSelectedFiles(files){
  selectedFiles=[...files];
  const books=selectedFiles.filter(isCandidateDataFile);
  const attached=selectedFiles.filter(f=>/\.htm(l)?$/i.test(f.name)).length;
  let msg=`فایل‌های انتخاب‌شده: ${selectedFiles.length}\nفایل‌های عملکرد (XLSX / XLS / XML / CSV): ${books.length}\nفایل‌های جانبی: ${attached}`;
  let cls='status';
  if(!books.length){
    msg+='\nدر انتخاب فعلی فایل داده با پسوند ‎.xlsx‎، ‎.xls‎، ‎.xml‎ یا ‎.csv‎ پیدا نشد.';
    cls+=' warn';
  }else{
    msg+='\nاکنون روی «خواندن فایل‌ها و محاسبه امتیاز» کلیک کنید.';
    cls+=' ok';
  }
  $('folderStatus').className=cls;
  $('folderStatus').textContent=msg;
  $('calculate').disabled=!books.length;
}

$('folderInput').addEventListener('change',e=>{if(e.target.files&&e.target.files.length){$('fileInput').value='';handleSelectedFiles(e.target.files);}});
$('fileInput').addEventListener('change',e=>{if(e.target.files&&e.target.files.length){$('folderInput').value='';handleSelectedFiles(e.target.files);}});

$('addGroup').addEventListener('click',()=>{scores.push({name:'گروه جدید',score:0});renderSettings();persistSettings()});$('addShift').addEventListener('click',()=>{shifts.push({name:'شیفت جدید',factor:1});renderSettings();persistSettings()});

async function processFolder(){
  fileIssues=[];allRows=[];excludedNurses.clear();
  selectedDepartments.clear();
  const files=selectedFiles;const map=fileMap(files);const books=files.filter(isCandidateDataFile);let totalBooks=0,emptyBooks=0;
  for(let bi=0;bi<books.length;bi++){
    const f=books[bi];$('folderStatus').textContent=`در حال خواندن فایل ${bi+1} از ${books.length}: ${f.name}`;
    const workbookRel=relWithoutRoot(f);
    let displayName=f.name.replace(/\.(xlsx|xls|xml|csv)$/i,'');
    let parsed=null,usedSheet='';

    if(/\.xlsx$/i.test(f.name)){
      try{
        const buf=await f.arrayBuffer();
        if(typeof XLSX!=='undefined'){
          const wb=XLSX.read(buf,{type:'array'});
          for(const sname of wb.SheetNames){
            const s=wb.Sheets[sname];
            const arr=XLSX.utils.sheet_to_json(s,{header:1,defval:''});
            const res=parse2DArray(arr,sname);
            if(res&&res.length){
              parsed=res;
              usedSheet=sname;
              break;
            }
          }
        }else{
          fileIssues.push(`برای پردازش فایل‌های XLSX کتابخانه SheetJS مورد نیاز است.`);
        }
      }catch(err){
        fileIssues.push(`خطا در پردازش فایل اکسل ${f.name}: ${err.message}`);
      }
    }
    else if(/\.csv$/i.test(f.name)){
      try{
        const txt=await f.text();
        const res=readTableFromCsv(txt);
        if(res&&res.length){
          parsed=res;
          usedSheet='CSV';
        }
      }catch(err){
        fileIssues.push(`خطا در خواندن فایل CSV ${f.name}: ${err.message}`);
      }
    }
    else{
      let content='';
      try{content=await f.text()}catch(e){fileIssues.push(`خواندن فایل ${f.name} ناموفق بود: ${e.message}`);continue}
      displayName=getWorkbookDisplayName(content,f);

      if(/\.xml$/i.test(f.name)||content.trim().startsWith('<?xml')||content.includes('<DocumentElement>')){
        parsed=readTableFromXml(content);
        if(parsed&&parsed.length) usedSheet='XML';
      }

      if(!parsed){
        let refs=hrefsFromXls(content);let candidates=[];
        for(const h of refs){
          const key=hrefToKey(h,workbookRel);let cf=map.get(key);
          if(!cf){const tail=key.split('/').slice(-2).join('/');cf=map.get(normPath(tail))||files.find(x=>normPath(relWithoutRoot(x)).endsWith(tail))}
          if(cf&&/\.htm(l)?$/i.test(cf.name)&&!candidates.includes(cf))candidates.push(cf)
        }
        if(!candidates.length){const stem=f.name.replace(/\.xls$/i,'');const prefix=normPath(stem+'_files/');candidates=files.filter(x=>/\.htm(l)?$/i.test(x.name)&&normPath(relWithoutRoot(x)).includes(prefix))}
        for(const cf of candidates){try{const t=await cf.text();const rows=readTableFromHtml(t);if(rows&&rows.length){parsed=rows;usedSheet=cf.name;break}}catch(e){}}
        if(!parsed){const fallback=readTableFromHtml(content);if(fallback&&fallback.length){parsed=fallback;usedSheet=f.name}}
      }
    }

    if(!parsed){emptyBooks++;fileIssues.push(`برای «${displayName}» جدول حاوی ستون‌های مقدار و گروه عملکرد یافت نشد.`);continue}
    totalBooks++;let found=0;
    for(const r of parsed){
      const row={
        nurse:String(r.rawNurse||displayName).trim(),
        amount:r.amount,
        group:String(r.group||'').trim(),
        shift:String(r.shift||'صبح').trim(),
        department:String(r.department||'').trim(),
        sourceFile:f.name,
        sourceSheet:usedSheet,
        sourceRow:r.sourceRow
      };
      applyRowCalculation(row);allRows.push(row);found++
    }
    if(!found)fileIssues.push(`فایل «${displayName}» خوانده شد اما رکورد عملکردی نداشت.`)
  }

  const uniqueDepts=getUniqueDepartments();
  if(uniqueDepts.length===1){
    isAllDepartments=false;
    selectedDepartments.add(uniqueDepts[0]);
  }else{
    isAllDepartments=true;
  }

  renderDeptCapsules();
  renderNightDeptSettings();
  renderReports();
  $('results').hidden=false;
  let summary=`پردازش با موفقیت تمام شد.\nفایل‌های دارای داده: ${totalBooks}\nفایل‌های خالی/ناخوانا: ${emptyBooks}\nرکوردهای استخراج‌شده: ${allRows.length}`;
  if(fileIssues.length)summary+=`\nموارد قابل بررسی: ${fileIssues.length}`;
  $('folderStatus').className='status '+(allRows.length?'ok':'err');
  $('folderStatus').textContent=summary;
}

$('calculate').addEventListener('click',async()=>{if(!selectedFiles.length)return;$('calculate').disabled=true;try{await processFolder()}catch(e){$('folderStatus').className='status err';$('folderStatus').textContent='خطا هنگام پردازش: '+e.message}finally{$('calculate').disabled=false}});

function fmt(n){if(n===null||n===undefined||!Number.isFinite(n))return '—';return n.toLocaleString('en-US',{maximumFractionDigits:4})}
function careGroupNumber(group){const m=norm(group).match(/گروه\s*مراقبتی\s*([0-9۰-۹٠-٩]+)/);return m?num(m[1]):null}

function getShiftFactor(group,shift,dept){
  const sh=norm(shift), g=careGroupNumber(group);
  if(sh===norm('عصر')){
    return g!==null&&g>=1&&g<=3?0.8:1;
  }
  if(sh===norm('شب')){
    return (g!==null&&g>=1&&g<=8&&isNightBonusEnabled(dept))?1.5:1;
  }
  const obj=shifts.find(x=>norm(x.name)===sh);
  return obj&&num(obj.factor)!==null?num(obj.factor):1;
}

function applyRowCalculation(row){
  const scoreObj=scores.find(x=>norm(x.name)===norm(row.group));
  row.score=scoreObj&&num(scoreObj.score)!==null?num(scoreObj.score):null;
  row.factor=getShiftFactor(row.group,row.shift,row.department);
  row.points=(row.amount!==null&&row.score!==null&&row.factor!==null)?row.amount*row.score*row.factor:null;
  const problems=[];
  if(row.amount===null)problems.push('مقدار نامعتبر');
  if(row.score===null)problems.push('گروه تعریف‌نشده: '+(row.group||'خالی'));
  if(row.factor===null)problems.push('شیفت تعریف‌نشده: '+(row.shift||'خالی'));
  row.status=problems.length?problems.join('؛ '):'OK';
}

function renderNightDeptSettings(){
  const body=$('nightDeptTable')?.querySelector('tbody');
  if(!body)return;
  body.innerHTML='';
  const names=new Map();
  for(const r of allRows){const l=deptLabel(r.department);names.set(norm(l),l)}
  for(const [k,v] of nightBonusOffDepts)if(!names.has(k))names.set(k,v);
  const list=[...names.values()].sort((a,b)=>a.localeCompare(b,'fa'));
  $('nightDeptEmpty').style.display=list.length?'none':'';
  for(const name of list){
    const tr=document.createElement('tr');
    const td1=document.createElement('td');td1.textContent=name;
    const td2=document.createElement('td');td2.className='exclude-col';
    const cb=document.createElement('input');cb.type='checkbox';cb.checked=isNightBonusEnabled(name);
    cb.setAttribute('aria-label','اعمال ضریب ۱٫۵ شب برای '+name);
    cb.addEventListener('change',()=>{
      if(cb.checked)nightBonusOffDepts.delete(norm(name));else nightBonusOffDepts.set(norm(name),name);
      persistSettings();
      if(allRows.length){allRows.forEach(applyRowCalculation);renderReports()}
    });
    td2.appendChild(cb);tr.append(td1,td2);body.appendChild(tr);
  }
}

function getUniqueDepartments(){
  const set=new Set();
  for(const r of allRows){
    const d=String(r.department||'').trim()||'بدون بخش';
    set.add(d);
  }
  return [...set].sort((a,b)=>a.localeCompare(b,'fa'));
}

function renderDeptCapsules(){
  const wrap=$('deptCapsules');
  wrap.innerHTML='';
  const depts=getUniqueDepartments();
  if(!depts.length)return;
  
  const allBtn=document.createElement('div');
  allBtn.className='dept-capsule'+(isAllDepartments?' active':'');
  allBtn.textContent='همه بخش‌ها (کل بیمارستان)';
  allBtn.title='مشاهده آمار جامع و محاسبه غیرمستقیم بیمارستانی (مترون/سوپروایزر)';
  allBtn.addEventListener('click',()=>{
    isAllDepartments=true;
    selectedDepartments.clear();
    updateCapsulesActiveState();
    renderReports();
  });
  wrap.appendChild(allBtn);

  depts.forEach(d=>{
    const b=document.createElement('div');
    b.className='dept-capsule'+((!isAllDepartments&&selectedDepartments.has(d))?' active':'');
    b.textContent=d;
    b.addEventListener('click',()=>{
      if(isAllDepartments){
        isAllDepartments=false;
        selectedDepartments.clear();
        selectedDepartments.add(d);
      }else{
        if(selectedDepartments.has(d)){
          selectedDepartments.delete(d);
          if(selectedDepartments.size===0){
            isAllDepartments=true;
          }
        }else{
          selectedDepartments.add(d);
        }
      }
      updateCapsulesActiveState();
      renderReports();
    });
    wrap.appendChild(b);
  });
}

function updateCapsulesActiveState(){
  const depts=getUniqueDepartments();
  const wrap=$('deptCapsules');
  const capsules=[...wrap.querySelectorAll('.dept-capsule')];
  if(!capsules.length)return;
  capsules[0].classList.toggle('active',isAllDepartments);
  depts.forEach((d,idx)=>{
    if(capsules[idx+1]){
      capsules[idx+1].classList.toggle('active',!isAllDepartments&&selectedDepartments.has(d));
    }
  });
}

function getEffectiveRows(){
  if(isAllDepartments) return allRows;
  return allRows.filter(r=>{
    const d=String(r.department||'').trim()||'بدون بخش';
    return selectedDepartments.has(d);
  });
}

function aggregate(rows){
  const out=new Map();
  for(const r of rows){
    if(!out.has(r.nurse))out.set(r.nurse,{nurse:r.nurse,records:0,rows:0,morning:0,evening:0,night:0,total:0,warnings:0});
    const o=out.get(r.nurse);o.rows++;
    if(r.status!=='OK')o.warnings++;
    if(r.points!==null){
      o.records++;o.total+=r.points;
      const sh=norm(r.shift);
      if(sh===norm('صبح'))o.morning+=r.points;
      else if(sh===norm('عصر'))o.evening+=r.points;
      else if(sh===norm('شب'))o.night+=r.points;
    }
  }
  return [...out.values()].sort((a,b)=>a.nurse.localeCompare(b.nurse,'fa'))
}

function median(values){const a=values.filter(v=>Number.isFinite(v)&&v!==0).sort((x,y)=>x-y);if(!a.length)return 0;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}

function calculateMedianFromRows(targetRows){
  const totals=new Map();
  for(const r of targetRows){
    if(r.points===null||!Number.isFinite(r.points))continue;
    totals.set(r.nurse,(totals.get(r.nurse)||0)+r.points);
  }
  const values=[...totals.entries()].filter(([name])=>!excludedNurses.has(name)).map(([,total])=>total);
  const nonzero=values.filter(v=>Number.isFinite(v)&&v!==0);
  return nonzero.length?median(nonzero):null;
}

function appendStatRow(body,label,value,isHtml=false,rowClass=''){
  const tr=document.createElement('tr');
  if(rowClass) tr.className=rowClass;
  const a=document.createElement('td');a.textContent=label;
  const b=document.createElement('td');
  if(isHtml&&typeof value==='object') b.appendChild(value);
  else b.textContent=value;
  tr.append(a,b);body.appendChild(tr);
}

function getWarningsList(selected,currentRows){
  const warnings=[];
  if(selected==='__ALL__'){
    for(const issue of fileIssues)warnings.push(issue);
    for(const r of currentRows.filter(x=>x.status!=='OK'))warnings.push(`${r.nurse} | ردیف ${r.sourceRow} | ${r.department||'بدون بخش'} | ${r.group||'بدون گروه'} | ${r.shift||'بدون شیفت'} | ${r.status}`);
  }else{
    for(const r of currentRows.filter(x=>x.nurse===selected&&x.status!=='OK'))warnings.push(`${r.nurse} | ردیف ${r.sourceRow} | ${r.department||'بدون بخش'} | ${r.group||'بدون گروه'} | ${r.shift||'بدون شیفت'} | ${r.status}`);
  }
  return warnings;
}

function renderStats(summaries,currentRows,selected,selectedRows){
  const body=$('statsTable').querySelector('tbody');
  body.innerHTML='';
  if(selected==='__ALL__'){
    const activeSummaries=summaries.filter(x=>!excludedNurses.has(x.nurse));
    const activeRows=currentRows.filter(r=>!excludedNurses.has(r.nurse));
    const excludedCount=excludedNurses.size;

    const activeMed=calculateMedianFromRows(currentRows);
    const activeDirectTotal=activeRows.reduce((sum,r)=>sum+(r.points??0),0);
    const nonzeroCount=activeSummaries.filter(x=>Number.isFinite(x.total)&&x.total!==0).length;

    appendStatRow(body,'بخش‌های تحت نمایش',isAllDepartments?'همه بخش‌های بیمارستان (کل مرکز)':`بخش‌های گزارش: ${[...selectedDepartments].join('، ')}`);
    appendStatRow(body,'تعداد پرسنل فعال (لحاظ‌شده در آمار)',activeSummaries.length.toLocaleString('en-US')+(excludedCount?` (${excludedCount} نفر حذف‌شده)`:''));
    appendStatRow(body,'تعداد رکوردهای عملکرد پرسنل فعال',activeRows.length.toLocaleString('en-US'));
    appendStatRow(body,'مجموع امتیاز مستقیم پرسنل فعال',fmt(activeDirectTotal));
    appendStatRow(body,'میانه امتیاز مستقیم پرسنل فعال (بدون صفر)',activeMed===null?'—':fmt(activeMed));
    appendStatRow(body,'تعداد افراد غیرصفر لحاظ‌شده در میانه',nonzeroCount.toLocaleString('en-US'));

    if(enableFinancial&&rialFactor>0){
      let totalMoney=0;
      for(const s of activeSummaries){
        const q=nurseQualityScores.get(s.nurse)??defaultQuality;
        totalMoney+=Math.round(s.total*q*rialFactor);
      }
      appendStatRow(body,'مجموع کارکرد ناخالص ریالی پرسنل فعال (ریال)',totalMoney.toLocaleString('en-US')+' ریال');
    }
  }else{
    const x=summaries.find(z=>z.nurse===selected);
    const isExc=excludedNurses.has(selected);
    const score=x?.total??0;
    appendStatRow(body,'نام پرسنل',selected+(isExc?' (حذف‌شده از محاسبات و میانه)':''));
    appendStatRow(body,'تعداد رکوردهای عملکرد فرد',selectedRows.length.toLocaleString('en-US'));
    appendStatRow(body,'امتیاز کل فرد',fmt(score));
    appendStatRow(body,'امتیاز شیفت صبح',fmt(x?.morning??0));
    appendStatRow(body,'امتیاز شیفت عصر',fmt(x?.evening??0));
    appendStatRow(body,'امتیاز شیفت شب',fmt(x?.night??0));

    if(enableFinancial&&rialFactor>0){
      const q=nurseQualityScores.get(selected)??defaultQuality;
      const money=Math.round(score*q*rialFactor);
      appendStatRow(body,'ضریب کیفی فرد',q.toString());
      appendStatRow(body,'مبلغ کارکرد ناخالص ریالی',money.toLocaleString('en-US')+' ریال');
    }
  }

  const warnings=getWarningsList(selected,currentRows);
  if(warnings.length>0){
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='warning-link-btn';
    btn.textContent=`${warnings.length.toLocaleString('en-US')} مورد (کلیک جهت مشاهده ریز خطاها)`;
    btn.title='نمایش جزئیات رکوردهای نیازمند بررسی';
    btn.addEventListener('click',()=>openWarningsModal(warnings));
    appendStatRow(body,'موارد نیازمند بررسی / هشدارها',btn,true,'warning-stat-row stat-review-row');
  }else{
    const span=document.createElement('span');
    span.className='good';
    span.textContent='۰ (بدون خطا و تأیید کامل)';
    appendStatRow(body,'موارد نیازمند بررسی / هشدارها',span,true,'stat-review-row');
  }
}

function makeCell(tr,value,cls=''){const td=document.createElement('td');td.textContent=value;if(cls)td.className=cls;tr.appendChild(td);return td;}

function renderIndirect(){
  const body=$('indirectTable').querySelector('tbody');
  body.innerHTML='';
  
  let deptMed=null;
  if(!isAllDepartments){
    const effRows=getEffectiveRows();
    deptMed=calculateMedianFromRows(effRows);
    $('indirectChip').textContent=`بر اساس میانه واحدهای انتخابی (${[...selectedDepartments].join('، ')})`;
  }else{
    $('indirectChip').textContent='در حالت کل بیمارستان، لطفاً جهت محاسبه کارکرد سرپرستار/بخش، واحد مورد نظر را انتخاب کنید';
  }

  for(const role of indirectRoleConfig){
    const tr=document.createElement('tr');
    makeCell(tr,role.label);
    makeCell(tr,role.factor.toString());
    
    const tdAtt=document.createElement('td');
    const attInput=document.createElement('input');
    attInput.type='number';
    attInput.step='0.05';
    attInput.min='0';
    attInput.max=role.maxAtt.toString();
    attInput.className='attendance-input';
    const curAtt=roleAttendanceMap.get(role.id)??1.0;
    attInput.value=curAtt;
    attInput.title=`بازه مجاز ضریب حضور: ۰ تا ${role.maxAtt}`;
    tdAtt.appendChild(attInput);
    tr.appendChild(tdAtt);

    const tdPts=document.createElement('td');
    const tdMoney=document.createElement('td');
    tdMoney.className='fin-col money-cell';
    tdMoney.style.display=enableFinancial?'':'none';

    function updateRoleScores(attVal){
      if(isAllDepartments){
        tdPts.textContent='-';
        tdMoney.textContent='-';
      }else{
        const pts=deptMed===null?null:deptMed*role.factor*attVal;
        tdPts.textContent=pts===null?'—':fmt(pts);
        if(enableFinancial){
          tdMoney.textContent=(pts===null||!rialFactor)?'—':Math.round(pts*defaultQuality*rialFactor).toLocaleString('en-US')+' ریال';
        }
      }
    }

    updateRoleScores(curAtt);

    attInput.addEventListener('input',()=>{
      let val=num(attInput.value);
      if(val===null) val=1.0;
      if(val>role.maxAtt) val=role.maxAtt;
      if(val<0) val=0;
      roleAttendanceMap.set(role.id,val);
      updateRoleScores(val);
      persistSettings();
    });

    tr.appendChild(tdPts);
    tr.appendChild(tdMoney);
    body.appendChild(tr);
  }

  const hospSection=$('hospitalIndirectSection');
  if(hospSection){
    hospSection.style.display=isAllDepartments?'block':'none';
  }

  const hospBody=$('hospitalIndirectTable').querySelector('tbody');
  hospBody.innerHTML='';
  const totalHospitalMedian=calculateMedianFromRows(allRows);

  for(const role of hospitalIndirectRoleConfig){
    const tr=document.createElement('tr');
    makeCell(tr,role.label);
    makeCell(tr,role.factor.toString());
    
    const tdAtt=document.createElement('td');
    const attInput=document.createElement('input');
    attInput.type='number';
    attInput.step='0.05';
    attInput.min='0';
    attInput.max=role.maxAtt.toString();
    attInput.className='attendance-input';
    const curAtt=roleAttendanceMap.get(role.id)??1.0;
    attInput.value=curAtt;
    attInput.title=`بازه مجاز ضریب حضور: ۰ تا ${role.maxAtt}`;
    tdAtt.appendChild(attInput);
    tr.appendChild(tdAtt);

    const tdPts=document.createElement('td');
    const tdMoney=document.createElement('td');
    tdMoney.className='fin-col money-cell';
    tdMoney.style.display=enableFinancial?'':'none';

    function updateHospRoleScores(attVal){
      const pts=totalHospitalMedian===null?null:totalHospitalMedian*role.factor*attVal;
      tdPts.textContent=pts===null?'—':fmt(pts);
      if(enableFinancial){
        tdMoney.textContent=(pts===null||!rialFactor)?'—':Math.round(pts*defaultQuality*rialFactor).toLocaleString('en-US')+' ریال';
      }
    }

    updateHospRoleScores(curAtt);

    attInput.addEventListener('input',()=>{
      let val=num(attInput.value);
      if(val===null) val=1.0;
      if(val>role.maxAtt) val=role.maxAtt;
      if(val<0) val=0;
      roleAttendanceMap.set(role.id,val);
      updateHospRoleScores(val);
      persistSettings();
    });

    tr.appendChild(tdPts);
    tr.appendChild(tdMoney);
    hospBody.appendChild(tr);
  }
}

function configureSummaryNameColumn(){
  const table=$('summaryTable');
  const wrap=table?.closest('.tablewrap');
  if(!table||!wrap)return;

  if(!wrap.dataset.summaryNameScrollBound){
    wrap.addEventListener('scroll',()=>{
      const isMobile=window.matchMedia('screen and (max-width: 640px)').matches;
      const hasMoved=Math.abs(wrap.scrollLeft)>3;
      wrap.classList.toggle('summary-name-compact',isMobile&&hasMoved);
    },{passive:true});
    window.addEventListener('resize',()=>{
      if(!window.matchMedia('screen and (max-width: 640px)').matches){
        wrap.classList.remove('summary-name-compact');
        wrap.style.removeProperty('--summary-name-expanded-width');
        wrap.style.removeProperty('--summary-name-compact-width');
      }else{
        measureSummaryNameWidths();
      }
    },{passive:true});
    wrap.dataset.summaryNameScrollBound='true';
  }

  function measureSummaryNameWidths(){
    if(!window.matchMedia('screen and (max-width: 640px)').matches){
      wrap.classList.remove('summary-name-compact');
      wrap.style.removeProperty('--summary-name-expanded-width');
      wrap.style.removeProperty('--summary-name-compact-width');
      return;
    }

    const fullNames=[...table.querySelectorAll('tbody .nurse-name-full')];
    const surnames=[...table.querySelectorAll('tbody .nurse-name-surname')];
    if(!fullNames.length){
      wrap.classList.remove('summary-name-compact');
      wrap.style.setProperty('--summary-name-expanded-width','126px');
      wrap.style.setProperty('--summary-name-compact-width','82px');
      return;
    }

    const canvas=document.createElement('canvas');
    const ctx=canvas.getContext('2d');
    const sampleButton=table.querySelector('tbody .nurse-link-btn');
    const buttonStyle=sampleButton?getComputedStyle(sampleButton):null;
    if(ctx&&buttonStyle)ctx.font=buttonStyle.font;
    const fullWidth=Math.max(...fullNames.map(el=>ctx?ctx.measureText(el.textContent).width:el.getBoundingClientRect().width));
    if(ctx)ctx.font='700 10px "Shabnam",Tahoma,sans-serif';
    const surnameWidth=Math.max(...surnames.map(el=>ctx?ctx.measureText(el.textContent).width:el.getBoundingClientRect().width));

    // The expanded column follows the longest complete name. The compact
    // state follows the longest surname, with safe minimums for the header.
    const expanded=Math.ceil(Math.max(112,fullWidth+24));
    const compact=Math.ceil(Math.max(82,Math.min(132,surnameWidth+22)));
    wrap.style.setProperty('--summary-name-expanded-width',expanded+'px');
    wrap.style.setProperty('--summary-name-compact-width',compact+'px');

    const hasMoved=Math.abs(wrap.scrollLeft)>3;
    wrap.classList.toggle('summary-name-compact',hasMoved);
  }

  // Run after the newly-rendered rows have entered layout.
  requestAnimationFrame(measureSummaryNameWidths);
}

function renderReports(){
  $('results').classList.toggle('financial-active',enableFinancial);
  const currentRows=getEffectiveRows();
  const summaries=aggregate(currentRows);
  
  const deptHeaderText=isAllDepartments?'بخش‌های گزارش: همه بخش‌های بیمارستان (کل مرکز)':`بخش‌های گزارش: ${[...selectedDepartments].join('، ')}`;
  $('printDeptHeader').textContent=deptHeaderText;

  document.querySelectorAll('.fin-col').forEach(el=>{
    el.style.display=enableFinancial?'':'none';
  });

  const sel=$('nurseSelect'),previous=sel.value;
  sel.innerHTML='<option value="__ALL__">همه پرستاران این بخش(ها) ـ خلاصه</option>';
  for(const x of summaries){
    const opt=document.createElement('option');
    opt.value=x.nurse;
    opt.textContent=x.nurse;
    sel.appendChild(opt);
  }
  if([...sel.options].some(o=>o.value===previous))sel.value=previous;
  else sel.value='__ALL__';
  
  const selected=sel.value;
  const selectedRows=selected==='__ALL__'?currentRows:currentRows.filter(r=>r.nurse===selected);
  const baseShown=selected==='__ALL__'?summaries:summaries.filter(x=>x.nurse===selected);
  const sortMode=$('summarySort').value;
  const shown=[...baseShown].sort((a,b)=>{
    if(sortMode==='scoreAsc')return a.total-b.total||a.nurse.localeCompare(b.nurse,'fa');
    if(sortMode==='scoreDesc')return b.total-a.total||a.nurse.localeCompare(b.nurse,'fa');
    return a.nurse.localeCompare(b.nurse,'fa');
  });

  $('summaryTitle').textContent=selected==='__ALL__'?'خلاصه امتیاز پرستاران':'خلاصه امتیاز '+selected;
  const tb=$('summaryTable').querySelector('tbody');
  tb.innerHTML='';
  for(const x of shown){
    const tr=document.createElement('tr');
    const isExcluded=excludedNurses.has(x.nurse);
    if(isExcluded) tr.className='row-excluded';
    
    const tdNurse=document.createElement('td');
    const nurseBtn=document.createElement('button');
    nurseBtn.type='button';
    nurseBtn.className='nurse-link-btn';
    nurseBtn.setAttribute('aria-label',x.nurse);
    const fullNameSpan=document.createElement('span');
    fullNameSpan.className='nurse-name-full';
    fullNameSpan.textContent=x.nurse;
    const surnameSpan=document.createElement('span');
    surnameSpan.className='nurse-name-surname';
    surnameSpan.textContent=String(x.nurse).trim().split(/\s*[-–—]\s*/)[0]||x.nurse;
    nurseBtn.append(fullNameSpan,surnameSpan);
    nurseBtn.title='مشاهده جزئیات عملکرد '+x.nurse+' در پنجره پاپ‌آپ';
    nurseBtn.addEventListener('click',()=>openNurseDetailModal(x.nurse));
    tdNurse.appendChild(nurseBtn);
    tr.appendChild(tdNurse);
    
    [x.rows,fmt(x.morning),fmt(x.evening),fmt(x.night),fmt(x.total)].forEach(v=>makeCell(tr,v));

    if(enableFinancial){
      const tdQ=document.createElement('td');
      tdQ.className='fin-col';
      const qInput=document.createElement('input');
      qInput.type='number';
      qInput.step='0.05';
      qInput.min='0';
      qInput.max='2';
      qInput.className='quality-input';
      const currentQ=nurseQualityScores.get(x.nurse)??defaultQuality;
      qInput.value=currentQ;
      qInput.setAttribute('aria-label',`ضریب کیفی ${x.nurse}`);
      
      const tdMoney=document.createElement('td');
      tdMoney.className='fin-col money-cell';
      const calcMoney=q=>rialFactor?Math.round(x.total*q*rialFactor).toLocaleString('en-US'):'—';
      tdMoney.textContent=calcMoney(currentQ);

      qInput.addEventListener('input',()=>{
        const newQ=num(qInput.value)||defaultQuality;
        nurseQualityScores.set(x.nurse,newQ);
        tdMoney.textContent=calcMoney(newQ);
      });
      qInput.addEventListener('change',()=>{
        renderStats(summaries,currentRows,selected,selectedRows);
      });

      tdQ.appendChild(qInput);
      tr.appendChild(tdQ);
      tr.appendChild(tdMoney);
    }

    makeCell(tr,isExcluded?'حذف‌شده از محاسبات':(x.warnings?`${x.warnings} مورد بررسی`:'تأیید'),(isExcluded?'bad':(x.warnings?'bad':'good'))+' status-col');

    const excludeTd=makeCell(tr,'','exclude-col');
    excludeTd.style.textAlign='center';
    const checkbox=document.createElement('input');
    checkbox.type='checkbox';
    checkbox.checked=isExcluded;
    checkbox.setAttribute('aria-label',`حذف ${x.nurse} از محاسبات کلی`);
    checkbox.title=`با انتخاب این گزینه، امتیازات و رکوردهای ${x.nurse} از کلیه محاسبات، مبالغ کل و میانه کسر می‌شود`;
    checkbox.addEventListener('change',()=>{
      if(checkbox.checked)excludedNurses.add(x.nurse);
      else excludedNurses.delete(x.nurse);
      renderReports();
    });
    excludeTd.appendChild(checkbox);
    tb.appendChild(tr);
  }
  $('summaryEmpty').hidden=shown.length>0;
  configureSummaryNameColumn();

  renderStats(summaries,currentRows,selected,selectedRows);
  renderDetail(currentRows,selected);
  renderIndirect();
}

function renderDetail(currentRows,selected){
  const rows=selected==='__ALL__'?currentRows:currentRows.filter(r=>r.nurse===selected);
  $('groupSummaryTitle').textContent=selected==='__ALL__'?'آمار بخش‌ها / واحدها':'آمار واحدها ـ '+selected;
  const groupBody=$('groupSummaryTable').querySelector('tbody');
  groupBody.innerHTML='';
  
  const deptMap=new Map();
  for(const r of rows){
    const department=r.department||'بدون بخش';
    if(!deptMap.has(department)){
      deptMap.set(department,{
        department,
        amount:0,
        points:0,
        count:0,
        warnings:0,
        groups:new Map()
      });
    }
    const d=deptMap.get(department);
    if(r.amount!==null) d.amount+=r.amount;
    if(r.points!==null) d.points+=r.points;
    d.count++;
    if(r.status!=='OK') d.warnings++;

    const gKey=norm(r.group||'بدون گروه');
    if(!d.groups.has(gKey)){
      d.groups.set(gKey,{
        group:r.group||'بدون گروه',
        amount:0,
        score:r.score,
        points:0,
        count:0,
        warnings:0
      });
    }
    const g=d.groups.get(gKey);
    if(r.amount!==null) g.amount+=r.amount;
    if(r.points!==null) g.points+=r.points;
    g.count++;
    if(r.status!=='OK') g.warnings++;
  }

  const sortedDepts=[...deptMap.values()].sort((a,b)=>a.department.localeCompare(b.department,'fa'));
  for(const d of sortedDepts){
    const tr=document.createElement('tr');
    
    const tdDept=document.createElement('td');
    const deptBtn=document.createElement('button');
    deptBtn.type='button';
    deptBtn.className='nurse-link-btn';
    deptBtn.textContent=d.department;
    deptBtn.title='مشاهده ریز عملکرد گروه‌ها در این بخش';
    deptBtn.addEventListener('click',()=>openDeptDetailModal(d));
    tdDept.appendChild(deptBtn);
    tr.appendChild(tdDept);

    [fmt(d.amount),fmt(d.points),d.count.toLocaleString('en-US'),d.warnings?`${d.warnings} مورد`:'—'].forEach(v=>makeCell(tr,v));
    groupBody.appendChild(tr);
  }
  $('groupSummaryEmpty').hidden=sortedDepts.length>0;

  $('detailTitle').textContent=selected==='__ALL__'?'جزئیات گروه و شیفت پرسنل':'جزئیات گروه و شیفت '+selected;
  const body=$('detailTable').querySelector('tbody');
  body.innerHTML='';
  const map=new Map();
  for(const r of rows){
    const key=[r.nurse,r.department,r.group,r.shift].join('||');
    if(!map.has(key))map.set(key,{nurse:r.nurse,department:r.department,group:r.group,shift:r.shift,amount:0,score:r.score,factor:r.factor,points:0,count:0});
    const x=map.get(key);
    if(r.amount!==null)x.amount+=r.amount;
    x.count++;
    if(r.points!==null)x.points+=r.points;
  }
  for(const x of map.values()){
    const tr=document.createElement('tr');
    if(excludedNurses.has(x.nurse))tr.className='print-skip';
    [x.nurse||'—',x.department||'—',x.group||'—',x.shift||'—',fmt(x.amount),fmt(x.score),fmt(x.factor),fmt(x.points),x.count].forEach(v=>makeCell(tr,v));
    body.appendChild(tr);
  }
  $('detailEmpty').hidden=map.size>0;
  $('detailEmpty').textContent=map.size?'':'برای این گزارش جزئیاتی ثبت نشده است.';
}

$('nurseSelect').addEventListener('change',renderReports);
$('summarySort').addEventListener('change',renderReports);
$('clearExclusions').addEventListener('click',()=>{excludedNurses.clear();renderReports()});

/* ===== انتخاب جدول‌ها برای چاپ / خروجی PDF (نسخه 2.6.2) ===== */
const PRINT_TABLES=[
  {key:'stats',label:'آمار توصیفی عملکرد',section:'statsSection',allOnly:false,def:true},
  {key:'summary',label:'خلاصه امتیاز هر پرستار',section:'summarySection',allOnly:false,def:true},
  {key:'groups',label:'آمار بخش‌ها / واحدها',section:'groupSection',allOnly:false,def:true},
  {key:'detail',label:'جزئیات گروه و شیفت',section:'detailSection',allOnly:false,def:false},
  {key:'indirect',label:'امتیاز کارکنان با عملکرد غیرمستقیم بخش',section:'deptIndirectSection',allOnly:false,def:true},
  {key:'hospital',label:'امتیاز مشاغل با عملکرد غیرمستقیم بیمارستانی (کل مرکز)',section:'hospitalIndirectSection',allOnly:true,def:true}
];
const printDialog=$('printDialog');
let printSelection=null; // انتخاب قبلی کاربر در همین نشست

function isPrintTableAvailable(t){
  const el=$(t.section);
  if(!el)return false;
  if(t.key==='hospital')return el.style.display!=='none';
  return true;
}
function currentPrintChecks(){
  return [...document.querySelectorAll('#printTableList input[type=checkbox]')];
}
function updatePrintDialogState(){
  const boxes=currentPrintChecks().filter(b=>!b.disabled);
  const n=boxes.filter(b=>b.checked).length;
  $('printSelCount').textContent=n?`${n} جدول از ${boxes.length} جدول انتخاب شده است`:'هیچ جدولی انتخاب نشده است';
  $('printConfirm').disabled=n===0;
}
function buildPrintDialog(){
  const single=$('nurseSelect').value!=='__ALL__';
  const list=$('printTableList');
  list.innerHTML='';
  for(const t of PRINT_TABLES){
    const available=isPrintTableAvailable(t);
    const lbl=document.createElement('label');
    lbl.className='print-opt'+(available?'':' disabled');
    const cb=document.createElement('input');
    cb.type='checkbox';cb.value=t.key;cb.disabled=!available;
    let checked=printSelection?printSelection.has(t.key):t.def;
    // در حالت نمایش یک پرستار، جدول‌های کلی به‌صورت پیش‌فرض انتخاب نمی‌شوند.
    if(!printSelection&&single&&['stats','indirect','hospital'].includes(t.key))checked=false;
    cb.checked=available&&checked;
    cb.addEventListener('change',updatePrintDialogState);
    const span=document.createElement('span');
    span.textContent=t.label;
    lbl.appendChild(cb);lbl.appendChild(span);
    if(!available){
      const note=document.createElement('small');
      note.textContent=t.key==='hospital'?'(فقط در حالت «همه بخش‌ها» در دسترس است)':'(در دسترس نیست)';
      lbl.appendChild(note);
    }
    list.appendChild(lbl);
  }
  $('printDialogNote').textContent=(single?'گزارش فعلی برای پرستار انتخاب‌شده است؛ جدول‌های خلاصه و جزئیات فقط شامل همان فرد خواهند بود. ':'')+'اندازه و جهت کاغذ را در پنجره چاپ مرورگر انتخاب کنید؛ جدول‌ها خودکار با آن متناسب می‌شوند.';
  updatePrintDialogState();
}
function openPrintDialog(){
  if(!allRows.length)return;
  renderReports();
  buildPrintDialog();
  if(typeof printDialog.showModal==='function')printDialog.showModal();else printDialog.setAttribute('open','open');
}
function closePrintDialog(){
  if(typeof printDialog.close==='function')printDialog.close();else printDialog.removeAttribute('open');
}
function clearPrintSelectionClasses(){
  const r=$('results');
  for(const t of PRINT_TABLES){
    r.classList.remove('pp-hide-'+t.key);
  }
  r.classList.remove('pp-show-detail');
}
function applyPrintSelection(selected){
  const r=$('results');
  clearPrintSelectionClasses();
  for(const t of PRINT_TABLES){
    if(!selected.has(t.key))r.classList.add('pp-hide-'+t.key);
  }
  if(selected.has('detail'))r.classList.add('pp-show-detail');
}

$('printReport').addEventListener('click',openPrintDialog);
$('closePrintDialog').addEventListener('click',closePrintDialog);
$('printCancel').addEventListener('click',closePrintDialog);
printDialog.addEventListener('click',e=>{if(e.target===printDialog)closePrintDialog()});
$('printSelectAll').addEventListener('click',()=>{currentPrintChecks().forEach(b=>{if(!b.disabled)b.checked=true});updatePrintDialogState()});
$('printSelectNone').addEventListener('click',()=>{currentPrintChecks().forEach(b=>{b.checked=false});updatePrintDialogState()});
$('printConfirm').addEventListener('click',()=>{
  const selected=new Set(currentPrintChecks().filter(b=>b.checked&&!b.disabled).map(b=>b.value));
  if(!selected.size)return;
  printSelection=new Set(selected);
  closePrintDialog();
  applyPrintSelection(selected);
  // کمی تأخیر تا بسته‌شدن پنجره و اعمال کلاس‌ها پیش از باز شدن پنجره چاپ انجام شود.
  setTimeout(()=>window.print(),120);
});
window.addEventListener('afterprint',clearPrintSelectionClasses);

function csvEscape(v){return '"'+String(v??'').replace(/"/g,'""')+'"'}
function downloadCsv(filename,rows){const csv='\ufeff'+rows.map(r=>r.map(csvEscape).join(',')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}

$('exportSummary').addEventListener('click',()=>{
  const ss=aggregate(getEffectiveRows());
  const header=['نام پرستار','تعداد رکورد','امتیاز صبح','امتیاز عصر','امتیاز شب','امتیاز کل'];
  if(enableFinancial){
    header.push('ضریب کیفی','مبلغ کارکرد ناخالص (ریال)');
  }
  header.push('وضعیت حذف از محاسبات','موارد نیازمند بررسی');
  
  const rows=ss.map(s=>{
    const isExc=excludedNurses.has(s.nurse);
    const row=[s.nurse,s.rows,s.morning,s.evening,s.night,s.total];
    if(enableFinancial){
      const q=nurseQualityScores.get(s.nurse)??defaultQuality;
      const m=rialFactor?Math.round(s.total*q*rialFactor):0;
      row.push(q,m);
    }
    row.push(isExc?'حذف از محاسبات':'فعال');
    row.push(s.warnings);
    return row;
  });

  downloadCsv('گزارش_امتیاز_و_تعرفه_پرستاران.csv',[header,...rows]);
});

$('exportDetail').addEventListener('click',()=>{
  const selected=$('nurseSelect').value;
  let rows=getEffectiveRows();
  if(selected!=='__ALL__')rows=rows.filter(r=>r.nurse===selected);
  const header=['نام پرستار','بخش','گروه عملکرد','شیفت','مجموع مقدار','امتیاز گروه','ضریب شیفت','امتیاز محاسبه‌شده','تعداد رکورد','وضعیت'];
  const map=new Map();
  for(const r of rows){
    const key=[r.nurse,r.department,r.group,r.shift].join('||');
    if(!map.has(key))map.set(key,{nurse:r.nurse,department:r.department,group:r.group,shift:r.shift,amount:0,score:r.score,factor:r.factor,points:0,count:0,status:[]});
    const x=map.get(key);
    if(r.amount!==null)x.amount+=r.amount;
    if(r.points!==null)x.points+=r.points;
    x.count++;
    if(r.status!=='OK')x.status.push(r.status);
  }
  downloadCsv('جزئیات_امتیاز_گروه_و_شیفت.csv',[header,...[...map.values()].map(x=>[x.nurse,x.department,x.group,x.shift,x.amount,x.score,x.factor,x.points,x.count,[...new Set(x.status)].join('؛ ')||'OK'])]);
});

$('reset').addEventListener('click',()=>{
  selectedFiles=[];
  allRows=[];
  fileIssues=[];
  excludedNurses.clear();
  nurseQualityScores.clear();
  isAllDepartments=true;
  selectedDepartments.clear();
  hasCalculated=false;
  renderIndirect();
  $('summarySort').value='nameAsc';
  $('folderInput').value='';
  $('fileInput').value='';
  $('folderStatus').className='status';
  $('folderStatus').textContent='هنوز پوشه یا فایلی انتخاب نشده است.';
  $('calculate').disabled=true;
  $('results').hidden=true;
  $('deptCapsules').innerHTML='';
});
})();
