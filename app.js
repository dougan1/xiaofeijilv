(function(){
'use strict';
const KEY='planner_app_v2';
const todayISO=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const fmt=n=>Number(n||0).toFixed(2);
const parseDate=s=>new Date(s+'T00:00:00');
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const addDays=(s,n)=>{const d=parseDate(s);d.setDate(d.getDate()+n);return iso(d)};
const diffDays=(a,b)=>Math.floor((parseDate(b)-parseDate(a))/86400000)+1;
const money=n=>'¥'+fmt(n);
const defaultState=()=>({
 tab:'消费',periodStart:todayISO(),periodEnd:addDays(todayISO(),29),budget:5000,cycleBudgets:{},consumeStart:'',consumeEnd:'',scheduleStart:'',scheduleEnd:'',
 categories:['购物','加油','停车','买菜','餐饮','交通','生活'],records:[],selectedDate:'',expectedAllocations:{},
 schedule:{mode:'normal',startDate:todayISO(),cycle:['白班','夜班','休','白班','夜班','休','休','休'],dayStart:'08:00',dayEnd:'20:00',nightStart:'20:00',nightEnd:'08:00',overrides:{},locks:{},calendarLocked:false,selectedDate:''},
 tools:[{id:'baidu',name:'百度',url:'https://www.baidu.com',icon:'🔎'}]
});
let state=(()=>{try{return Object.assign(defaultState(),JSON.parse(localStorage.getItem(KEY)||'{}'))}catch(e){return defaultState()}})();
state.schedule=Object.assign(defaultState().schedule,state.schedule||{});state.schedule.overrides=state.schedule.overrides&&typeof state.schedule.overrides==='object'?state.schedule.overrides:{};state.schedule.calendarLocked=state.schedule.calendarLocked===true;state.schedule.selectedDate=state.schedule.selectedDate||'';
state.cloud=Object.assign({binId:'6ac3ab79ffd5d160534f4cc5',accessKey:'$2a$10$ef1OKmYSovwETwPIThsBouQdqVGAN.ldYlML6Wi5sDYfa46feUv/.',autoSync:true,autoPull:true,status:'未连接',lastSync:'',dirty:false,initialized:false},state.cloud||{});
// Force the newly created Bin ID so an older localStorage value cannot reconnect to the previous Bin.
state.cloud.binId='6ac3ab79ffd5d160534f4cc5';
state.cloud.accessKey='$2a$10$ef1OKmYSovwETwPIThsBouQdqVGAN.ldYlML6Wi5sDYfa46feUv/.';
state.cloud.autoSync=true;
state.cloud.autoPull=true;
const APP_VERSION='V64';
const oldDefaultCategories=['餐饮','交通','购物','娱乐','生活','其他'];
if(!Array.isArray(state.categories)||!state.categories.length||state.categories.length===oldDefaultCategories.length&&state.categories.every(x=>oldDefaultCategories.includes(x)))state.categories=defaultState().categories;
state.records=Array.isArray(state.records)?state.records:[];state.tools=Array.isArray(state.tools)?state.tools:[];state.cycleBudgets=state.cycleBudgets&&typeof state.cycleBudgets==='object'?state.cycleBudgets:{};state.expectedAllocations=state.expectedAllocations&&typeof state.expectedAllocations==='object'?state.expectedAllocations:{};if(state.expectedAllocationsVersion!==2){state.expectedAllocations={};state.expectedAllocationsVersion=2;}state.consumeStart=state.consumeStart||state.periodStart;state.consumeEnd=state.consumeEnd||state.periodEnd;state.scheduleStart=state.scheduleStart||state.periodStart;state.scheduleEnd=state.scheduleEnd||state.periodEnd;
const cycleKey=(s,e)=>`${s}_${e}`;
if(state.cycleBudgets[cycleKey(state.periodStart,state.periodEnd)]==null) state.cycleBudgets[cycleKey(state.periodStart,state.periodEnd)]=Number(state.budget||0);
state.budget=Number(state.cycleBudgets[cycleKey(state.consumeStart,state.consumeEnd)]??state.budget??0);
const activeStart=()=>state.tab==='排班'?state.scheduleStart:state.consumeStart;
const activeEnd=()=>state.tab==='排班'?state.scheduleEnd:state.consumeEnd;
const activeKey=()=>cycleKey(activeStart(),activeEnd());
function setActiveCycle(s,e){if(state.tab==='排班'){state.scheduleStart=s;state.scheduleEnd=e;state.schedule.selectedDate=''}else{state.consumeStart=s;state.consumeEnd=e;state.budget=Number(state.cycleBudgets[cycleKey(s,e)]??state.budget??0)}state.selectedDate='';save()}
function shiftCycle(delta){const len=Math.max(1,diffDays(activeStart(),activeEnd()));const s=addDays(activeStart(),delta*len);setActiveCycle(s,addDays(s,len-1));render()}
function cycleBudget(){return Number(state.cycleBudgets[cycleKey(state.consumeStart,state.consumeEnd)]??state.budget??0)}
function allocationKey(){return cycleKey(state.consumeStart,state.consumeEnd)}
function getAlloc(){
  const k=allocationKey();
  if(!state.expectedAllocations[k]||typeof state.expectedAllocations[k]!=='object'||Array.isArray(state.expectedAllocations[k])) state.expectedAllocations[k]={};
  return state.expectedAllocations[k];
}

function buildLockedAllocations(existing={}){
  const ds=periodDates();
  const alloc={};
  if(!ds.length)return alloc;
  const today=todayISO();
  let remaining=cycleBudget();

  // 只从“用户设置的消费周期起始日”开始逐天结算。
  // 历史/当天的预计值一旦形成就锁定；未来日期统一按当天结算后的剩余预算分摊。
  let lastPastIndex=-1;
  for(let i=0;i<ds.length;i++){
    const d=ds[i];
    if(d>today)break;
    if(existing[d]!=null && Number.isFinite(Number(existing[d]))){
      alloc[d]=Number(existing[d]);
    }else{
      const daysLeft=ds.length-i;
      alloc[d]=daysLeft>0?Math.max(0,remaining)/daysLeft:0;
    }
    remaining-=spent(d);
    lastPastIndex=i;
  }

  // 如果今天还没进入本周期，则整个周期按起始日平均；进入周期后只计算今天之后。
  if(lastPastIndex<0){
    const v=ds.length>0?Math.max(0,remaining)/ds.length:0;
    ds.forEach(d=>alloc[d]=v);
  }else{
    const futureCount=ds.length-lastPastIndex-1;
    const v=futureCount>0?Math.max(0,remaining)/futureCount:0;
    for(let i=lastPastIndex+1;i<ds.length;i++)alloc[ds[i]]=v;
  }
  return alloc;
}

function initAllocations(){
  const k=allocationKey();
  const old=getAlloc();
  const rebuilt=buildLockedAllocations(old);
  state.expectedAllocations[k]=rebuilt;
}

function recalcAllocationsFromCycle(){
  const k=allocationKey();
  state.expectedAllocations[k]=buildLockedAllocations({});
}

function recalcAfterConsumption(changedDate){
  const ds=periodDates();
  if(!ds.length)return;
  const k=allocationKey();
  const old=getAlloc();
  const today=todayISO();
  const next={};

  // 已经发生过的日期（包含今天）的预计金额全部锁定；没有旧值的日期按“周期起始日开始逐天平均”补齐。
  let remaining=cycleBudget();
  let lastPastIndex=-1;
  for(let i=0;i<ds.length;i++){
    const d=ds[i];
    if(d>today)break;
    const daysLeft=ds.length-i;
    next[d]=old[d]!=null && Number.isFinite(Number(old[d]))?Number(old[d]):(daysLeft>0?Math.max(0,remaining)/daysLeft:0);
    remaining-=spent(d);
    lastPastIndex=i;
  }

  if(lastPastIndex<0){
    const v=ds.length?Math.max(0,remaining)/ds.length:0;
    ds.forEach(d=>next[d]=v);
  }else{
    const futureCount=ds.length-lastPastIndex-1;
    const v=futureCount>0?Math.max(0,remaining)/futureCount:0;
    for(let i=lastPastIndex+1;i<ds.length;i++)next[ds[i]]=v;
  }
  state.expectedAllocations[k]=next;
}

function expectedForDate(d){
  if(!d)return null;
  const ds=periodDates();
  if(!ds.includes(d))return null;
  initAllocations();
  const alloc=getAlloc();
  return alloc[d]==null?null:Number(alloc[d]);
}
function currentExpected(){return expectedForDate(todayISO())}
function expectedForDisplayDate(d){return expectedForDate(d)}

let cloudPushTimer=null;let cloudBusy=false;
const rawLocalSave=()=>localStorage.setItem(KEY,JSON.stringify(state));
function cloudPayload(){return {schemaVersion:1,appVersion:APP_VERSION,updatedAt:new Date().toISOString(),data:{periodStart:state.periodStart,periodEnd:state.periodEnd,budget:state.budget,cycleBudgets:state.cycleBudgets,categories:state.categories,records:state.records,expectedAllocations:state.expectedAllocations,expectedAllocationsVersion:state.expectedAllocationsVersion,consumeStart:state.consumeStart,consumeEnd:state.consumeEnd,scheduleStart:state.scheduleStart,scheduleEnd:state.scheduleEnd,schedule:state.schedule,tools:state.tools}}}
function cloudHeaders(){return {'Content-Type':'application/json','X-Access-Key':state.cloud.accessKey}}
async function cloudRead(){const id=String(state.cloud?.binId||'').trim();const key=String(state.cloud?.accessKey||'').trim();if(!id||!key)throw new Error('请填写 Bin ID 和 Access Key');const r=await fetch(`https://api.jsonbin.io/v3/b/${encodeURIComponent(id)}/latest`,{headers:{'X-Access-Key':key}});if(!r.ok)throw new Error(`读取失败 HTTP ${r.status}`);return r.json()}
async function cloudPush(){const id=String(state.cloud?.binId||'').trim();const key=String(state.cloud?.accessKey||'').trim();if(!id||!key)return false;const payload=cloudPayload();const r=await fetch(`https://api.jsonbin.io/v3/b/${encodeURIComponent(id)}`,{method:'PUT',headers:cloudHeaders(),body:JSON.stringify(payload)});if(!r.ok)throw new Error(`上传失败 HTTP ${r.status}`);state.cloud.lastSync=new Date().toLocaleString('zh-CN',{hour12:false});state.cloud.status='已连接';state.cloud.dirty=false;state.cloud.initialized=true;rawLocalSave();return true}
async function cloudCreateBin(){const key=String(state.cloud?.accessKey||'').trim();if(!key)throw new Error('请先填写 Access Key');const payload=cloudPayload();const r=await fetch('https://api.jsonbin.io/v3/b',{method:'POST',headers:{'Content-Type':'application/json','X-Access-Key':key,'X-Bin-Private':'true','X-Bin-Name':'消费记录H5'},body:JSON.stringify(payload)});let out=null;try{out=await r.json()}catch(e){}if(!r.ok)throw new Error(out?.message||`创建数据库失败 HTTP ${r.status}`);const newId=String(out?.metadata?.id||out?.metadata?.record||'').trim();if(!newId)throw new Error('创建成功但没有返回新的 Bin ID');state.cloud.binId=newId;state.cloud.status='已连接';state.cloud.lastSync=new Date().toLocaleString('zh-CN',{hour12:false});state.cloud.initialized=true;state.cloud.dirty=false;rawLocalSave();return newId;}
function hasLocalUserData(){const d=defaultState();const localRecords=Array.isArray(state.records)&&state.records.length>0;const localTools=Array.isArray(state.tools)&&state.tools.length>0;const localOverrides=state.schedule?.overrides&&Object.keys(state.schedule.overrides).length>0;const customCats=JSON.stringify(state.categories)!==JSON.stringify(d.categories);const changedBudget=Number(state.budget||0)!==Number(d.budget||0);const changedPeriod=state.periodStart!==d.periodStart||state.periodEnd!==d.periodEnd||state.consumeStart!==d.periodStart||state.consumeEnd!==d.periodEnd;const cycleKeys=state.cycleBudgets&&Object.keys(state.cycleBudgets).length>1;return !!(localRecords||localTools||localOverrides||customCats||changedBudget||changedPeriod||cycleKeys)}
function hasCloudUserData(d){if(!d||typeof d!=='object')return false;const base=defaultState();const records=Array.isArray(d.records)&&d.records.length>0;const tools=Array.isArray(d.tools)&&d.tools.length>0;const overrides=d.schedule?.overrides&&Object.keys(d.schedule.overrides).length>0;const cats=JSON.stringify(d.categories||base.categories)!==JSON.stringify(base.categories);const budget=Number(d.budget??base.budget)!==Number(base.budget);const hasPeriod=Boolean(d.periodStart&&d.periodEnd);const hasConsumePeriod=Boolean(d.consumeStart&&d.consumeEnd);const period=hasPeriod&&(d.periodStart!==base.periodStart||d.periodEnd!==base.periodEnd)||hasConsumePeriod&&(d.consumeStart!==base.periodStart||d.consumeEnd!==base.periodEnd);return !!(records||tools||overrides||cats||budget||period)}
function scheduleCloudPush(){
  if(!state.cloud?.autoSync||cloudBusy)return;
  clearTimeout(cloudPushTimer);
  cloudPushTimer=setTimeout(async()=>{
    cloudBusy=true;
    try{await cloudPush()}
    catch(e){state.cloud.status='同步失败';rawLocalSave()}
    finally{
      cloudBusy=false;
      if(state.cloud?.dirty&&state.cloud?.autoSync)setTimeout(()=>scheduleCloudPush(),180);
    }
  },700);
}
async function cloudPull(reRender=true,quiet=false){
  if(cloudBusy)return false;
  cloudBusy=true;state.cloud.status='连接中';rawLocalSave();
  try{
    const res=await cloudRead();const payload=res?.record??res;const d=payload?.data;
    if(!d)throw new Error('云端数据格式不正确');
    Object.assign(state,d);
    state.cloud=Object.assign(state.cloud||{},{binId:'6ac3ab79ffd5d160534f4cc5',accessKey:'$2a$10$ef1OKmYSovwETwPIThsBouQdqVGAN.ldYlML6Wi5sDYfa46feUv/.',autoSync:true,autoPull:true,status:'已连接',lastSync:new Date().toLocaleString('zh-CN',{hour12:false}),dirty:false,initialized:true});
    rawLocalSave();if(reRender)render();return true;
  }catch(e){state.cloud.status='连接失败';rawLocalSave();if(!quiet&&reRender)alert(e.message||'云端连接失败');return false}
  finally{cloudBusy=false;if(state.cloud?.dirty&&state.cloud?.autoSync)setTimeout(()=>scheduleCloudPush(),180)}
}
async function cloudAutoConnect(){
  if(!state.cloud?.autoPull||!state.cloud?.binId||!state.cloud?.accessKey||cloudBusy)return;
  cloudBusy=true;state.cloud.status='自动连接中';rawLocalSave();render();
  try{
    const res=await cloudRead();const payload=res?.record??res;const d=payload?.data;
    if(!d)throw new Error('云端数据格式不正确');
    // 新 Bin 还是空模板且本机已经有数据：优先保留本机并首次上传，避免自动登录把本机数据覆盖掉。
    if(!hasCloudUserData(d)&&hasLocalUserData()){
      state.cloud.status='首次同步';rawLocalSave();cloudBusy=false;
      await cloudPush();
      render();
    }else{
      Object.assign(state,d);
      state.cloud=Object.assign(state.cloud||{},{binId:'6ac3ab79ffd5d160534f4cc5',accessKey:'$2a$10$ef1OKmYSovwETwPIThsBouQdqVGAN.ldYlML6Wi5sDYfa46feUv/.',autoSync:true,autoPull:true,status:'已连接',lastSync:new Date().toLocaleString('zh-CN',{hour12:false}),dirty:false,initialized:true});
      rawLocalSave();render();
    }
  }catch(e){state.cloud.status='离线 · 使用本机数据';rawLocalSave();render()}
  finally{if(cloudBusy)cloudBusy=false;if(state.cloud?.dirty&&state.cloud?.autoSync)setTimeout(()=>scheduleCloudPush(),180)}
}
async function cloudTest(showAlert=true){if(cloudBusy)return;cloudBusy=true;state.cloud.status='连接中';try{await cloudRead();state.cloud.status='已连接';state.cloud.lastSync=new Date().toLocaleString('zh-CN',{hour12:false});rawLocalSave();if(showAlert)alert('数据库连接成功');return true}catch(e){state.cloud.status='连接失败';rawLocalSave();if(showAlert)alert(e.message||'连接失败');return false}finally{cloudBusy=false;render()}}
function cloudModal(){const c=state.cloud||{};const m=modal('云端数据库',`<div class="cloud-status-card"><span>连接状态</span><b id="cloudStatus">${escapeHtml(c.status||'自动连接')}</b></div><div class="cloud-auto-card"><b>自动登录</b><small>打开应用后自动读取云端；有修改会自动同步</small></div><label>Bin ID<input id="cloudBinId" value="${escapeHtml(c.binId||'')}" placeholder="JSONBin Bin ID"></label><label>Access Key<input id="cloudAccessKey" value="${escapeHtml(c.accessKey||'')}" placeholder="JSONBin Access Key"></label><label class="cloud-switch"><span><b>自动同步</b><small>新增、删除、修改数据后自动上传</small></span><input id="cloudAuto" type="checkbox" ${c.autoSync!==false?'checked':''}></label><p class="tip">使用 JSONBin v3 的 X-Access-Key。连接信息已保存，不需要每次重新填写。</p>`,`<button class="secondary" id="cloudTestBtn">测试连接</button><button class="secondary" id="cloudPullBtn">立即读取</button><button class="primary" id="cloudSaveBtn">保存连接</button>`);m.querySelector('#cloudTestBtn').onclick=async()=>{state.cloud.binId=m.querySelector('#cloudBinId').value.trim();state.cloud.accessKey=m.querySelector('#cloudAccessKey').value.trim();state.cloud.autoSync=m.querySelector('#cloudAuto').checked;state.cloud.autoPull=true;rawLocalSave();await cloudTest(true);m.remove()};m.querySelector('#cloudPullBtn').onclick=async()=>{state.cloud.binId=m.querySelector('#cloudBinId').value.trim();state.cloud.accessKey=m.querySelector('#cloudAccessKey').value.trim();state.cloud.autoSync=m.querySelector('#cloudAuto').checked;state.cloud.autoPull=true;rawLocalSave();m.remove();await cloudPull(true,false)};m.querySelector('#cloudSaveBtn').onclick=async()=>{state.cloud.binId=m.querySelector('#cloudBinId').value.trim();state.cloud.accessKey=m.querySelector('#cloudAccessKey').value.trim();state.cloud.autoSync=m.querySelector('#cloudAuto').checked;state.cloud.autoPull=true;state.cloud.status='自动连接已开启';rawLocalSave();m.remove();render();await cloudAutoConnect()}}
const save=()=>{if(state.cloud)state.cloud.dirty=true;rawLocalSave();scheduleCloudPush();};
function periodDates(){let a=parseDate(activeStart()),e=parseDate(activeEnd()),out=[];if(isNaN(a)||isNaN(e)||a>e)return out;for(let d=new Date(a);d<=e;d.setDate(d.getDate()+1))out.push(iso(d));return out}
function weekday(d){return parseDate(d).getDay();}
function monthLabel(d){const x=parseDate(d);return `${x.getFullYear()}年${x.getMonth()+1}月`}
function spent(d){return state.records.filter(r=>r.date===d).reduce((s,r)=>s+Number(r.amount||0),0)}
function totalSpent(){return state.records.reduce((s,r)=>s+Number(r.amount||0),0)}
function periodSpent(){const ds=new Set(periodDates());return state.records.filter(r=>ds.has(r.date)).reduce((s,r)=>s+Number(r.amount||0),0)}
function remaining(){return cycleBudget()-periodSpent()}
function futureDays(){return periodDates().filter(d=>d>=todayISO()).length||1}
function dailyEstimate(){return expectedForDisplayDate(state.selectedDate||todayISO())}
function escapeHtml(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function dateText(d){const x=parseDate(d);return `${x.getMonth()+1}/${x.getDate()}`}
function daysGrid(){
 const ds=periodDates();if(!ds.length)return '<div class="empty">请先设置有效消费周期</div>';
 initAllocations();
 const alloc=getAlloc();
 let html='';
 for(const d of ds){
  const amount=spent(d),expected=alloc[d]==null?null:Number(alloc[d]),hasSpend=amount>0,sel=state.selectedDate===d?' selected':'',today=d===todayISO()?' today':'',pastZero=d<todayISO()&&!hasSpend;
  const over=expected!=null&&amount>expected+0.005;
  const status=over?' over':(hasSpend?' spent':(pastZero?' past-zero':' no-spend'));
  const face=hasSpend?(over?'😣':'😊'):'🥺';
  html+=`<button class="day expense-day${status}${sel}${today}" data-date="${d}"><div class="day-top"><b>${dateText(d)}</b></div><div class="day-face">${face}</div><strong class="day-actual">${money(amount)}</strong></button>`;
 }
 return html;
}

function cycleNav(label){return `<div class="cycle-nav"><button class="cycle-arrow" data-cycle="-1" aria-label="上一周期">‹</button><div><b>${monthLabel(activeStart())} · ${label}</b></div><button class="cycle-arrow" data-cycle="1" aria-label="下一周期">›</button></div>`}

function categoryIcon(c){return ({'购物':'🛍️','加油':'⛽','停车':'🅿️','买菜':'🥬','餐饮':'🍜','交通':'🚌','生活':'🏠','娱乐':'🎮','其他':'🏷️'})[c]||'🏷️'}
function recordList(){const currentSet=new Set(periodDates());const rs=state.selectedDate?state.records.filter(r=>r.date===state.selectedDate):state.records.filter(r=>currentSet.has(r.date)).slice().sort((a,b)=>b.date.localeCompare(a.date));if(!rs.length)return '<div class="empty">暂无消费记录</div>';return rs.map(r=>{const cat=r.category||'其他',icon=categoryIcon(cat);return `<article class="record" data-id="${r.id}"><div class="record-icon">${icon}</div><div class="record-main"><b>${escapeHtml(r.name||'未命名消费')}</b><div class="record-meta"><span>${escapeHtml(r.date)}</span><span>${escapeHtml(cat)}</span></div></div><strong class="record-amount">${money(r.amount)}</strong><button class="trash" data-delete-expense="${r.id}" aria-label="删除消费">🗑️</button></article>`}).join('')}

function shiftFor(date){if(state.schedule.overrides&&state.schedule.overrides[date])return state.schedule.overrides[date];if(state.schedule.mode==='normal')return [1,2,3,4,5].includes(weekday(date))?'白班':'休';const n=diffDays(state.schedule.startDate,date);const idx=((n-1)%state.schedule.cycle.length+state.schedule.cycle.length)%state.schedule.cycle.length;return state.schedule.cycle[idx]||'休'}
function shiftCalendar(){const ds=periodDates();if(!ds.length)return '';const today=todayISO();let html=Array((weekday(ds[0])+6)%7).fill('<span class="blank"></span>').join('');for(const d of ds){const sh=shiftFor(d),shortSh=sh==='白班'?'白':sh==='夜班'?'夜':sh,todayClass=d===today?' today':'',selected=state.schedule.selectedDate===d?' selected':'';html+=`<button class="day shift ${sh==='休'?'rest':''}${todayClass}${selected}" data-shift-date="${d}"><div class="day-top"><b>${dateText(d)}</b></div><span>${shortSh}</span></button>`}return html}

function currentShift(){return shiftFor(todayISO())}
function timeProgress(){const sh=currentShift(),now=new Date();if(sh==='休')return 0;const [aH,aM]=(sh==='白班'?state.schedule.dayStart:state.schedule.nightStart).split(':').map(Number);const [bH,bM]=(sh==='白班'?state.schedule.dayEnd:state.schedule.nightEnd).split(':').map(Number);const start=aH*60+aM,endRaw=bH*60+bM,cur=now.getHours()*60+now.getMinutes();if(endRaw>start)return cur<start?0:Math.max(0,Math.min(100,((cur-start)/(endRaw-start))*100));if(cur>=start)return Math.max(0,Math.min(100,((cur-start)/((endRaw+1440)-start))*100));if(cur<endRaw)return Math.max(0,Math.min(100,((cur+1440-start)/((endRaw+1440)-start))*100));return 0}
function isAfterShiftEnd(sh,dateObj=new Date()){if(sh==='休')return false;const end=(sh==='白班'?state.schedule.dayEnd:state.schedule.nightEnd)||'00:00';const [h,m]=end.split(':').map(Number);const cur=dateObj.getHours()*60+dateObj.getMinutes();const endMin=h*60+m;if(sh==='夜班' && state.schedule.nightEnd<state.schedule.nightStart) return cur>=endMin && cur<1440 && cur>=0 && cur< h*60+60*24;return cur>=endMin;}
function nav(){return `<nav>${[['消费','⌂'],['排班','▦'],['工具','⌘'],['设置','⚙']].map(([x,ic])=>`<button class="${state.tab===x?'on':''}" data-tab="${x}"><i>${ic}</i><span>${x}</span></button>`).join('')}</nav>`}
function header(title,action=''){return `<header><div><h1>${title}</h1><p>${title==='消费'?'记录每一笔，让预算更清楚':title==='排班'?'今天上什么班，一眼就知道':title==='工具'?'常用网址，一点即达':'像手机系统设置一样简单'}</p></div>${action}</header>`}
function renderTools(){return `<main class="page-main tools-page"><div class="page-topbar"><div><h2 class="tools-title">工具</h2><small>常用网址，一点即达</small></div><button class="text-btn" id="addTool">＋ 添加</button></div><section class="card"><div class="tools-grid">${state.tools.length?state.tools.map(t=>`<button class="tool-card" data-tool="${escapeHtml(t.id)}"><span>${escapeHtml(t.icon||'🔗')}</span><b>${escapeHtml(t.name||'未命名工具')}</b><small>${escapeHtml(t.url||'')}</small></button>`).join(''):'<div class="empty">暂无工具，点击右上角添加</div>'}</div><div class="hint">长按工具可删除</div></section></main>`}
function categoryModal(){const m=modal('消费分类',`<div class="category-list">${state.categories.map(c=>`<div class="category-row"><span>${escapeHtml(categoryIcon(c))} ${escapeHtml(c)}</span><button data-del-cat="${escapeHtml(c)}">删除</button></div>`).join('')}</div><div class="add-line"><input id="newCat" placeholder="新增分类"><button id="addCatBtn">添加</button></div>`);m.querySelectorAll('[data-del-cat]').forEach(b=>b.onclick=()=>{if(state.categories.length<=1)return;state.categories=state.categories.filter(x=>x!==b.dataset.delCat);save();categoryModalReplace(m)});m.querySelector('#addCatBtn').onclick=()=>{const v=m.querySelector('#newCat').value.trim();if(v&&!state.categories.includes(v)){state.categories.push(v);save();categoryModalReplace(m)}}}
function categoryModalReplace(oldModal){oldModal.remove();categoryModal()}
function render(){let body='';if(state.tab==='消费')body=renderConsume();else if(state.tab==='排班')body=renderSchedule();else if(state.tab==='工具')body=renderTools();else if(state.tab==='设置')body=renderSettings();else body=renderConsume();document.getElementById('app').innerHTML=body+nav();bind()}
function renderConsume(){const rem=remaining(),pct=cycleBudget()?Math.max(0,Math.min(100,rem/cycleBudget()*100)):0;const displayDate=state.selectedDate||todayISO(),displayActual=spent(displayDate),displayExpected=expectedForDisplayDate(displayDate),displayOver=displayExpected!=null&&displayActual>displayExpected+0.005;const barClass=pct>50?'green':pct>20?'yellow':'red';return `<main class="page-main"><div class="page-topbar"><div class="page-period">${activeStart()} 至 ${activeEnd()}</div><button class="top-setting" id="consumeSettings">⚙</button></div>
<section class="hero-card"><div class="hero-top"><div><small>本周期剩余金额</small><strong>${money(rem)}</strong></div></div><div class="budget-bar ${barClass}"><i style="width:${pct}%"></i></div><div class="hero-foot"><span>本周期 ${periodDates().length} 天</span><span>剩余 ${fmt(pct)}%</span></div></section>
<div class="stats"><button class="stat-card" id="periodBudgetCard"><small>周期可使用</small><b>${money(cycleBudget())}</b><span>点击修改金额</span></button><button class="stat-card daily-card"><small>每日消费 · ${dateText(displayDate)}</small><div class="daily-values"><div><em>预计</em><b>${displayExpected==null?'—':money(displayExpected)}</b></div><div class="daily-divider"></div><div class="${displayOver?'danger-text':''}"><em>实际</em><b>${money(displayActual)}</b></div></div></button><button class="stat-card"><small>实际消费</small><b>${money(periodSpent())}</b><span>${state.records.filter(r=>periodDates().includes(r.date)).length} 笔记录</span></button></div>
<section class="card calendar-card"><div class="section-head">${cycleNav('消费周期')}</div><div class="calendar">${daysGrid()}</div></section>
<section class="card"><div class="section-head"><div><h2>${state.selectedDate?dateText(state.selectedDate)+' 消费明细':'消费明细'}</h2><small>${state.selectedDate?'当前仅显示当天':'当前周期记录按日期倒序'}</small></div></div>${recordList()}</section><button class="fab" id="addExpense">＋</button></main>`}

function renderSchedule(){const viewDate=state.schedule.selectedDate&&periodDates().includes(state.schedule.selectedDate)?state.schedule.selectedDate:todayISO();const afterWork=viewDate===todayISO()&&shiftFor(viewDate)!=='休'&&isAfterShiftEnd(shiftFor(viewDate));const sh=shiftFor(viewDate),p=viewDate===todayISO()?(afterWork?100:timeProgress()):0,shiftClass=afterWork?'shift-off':sh==='白班'?'shift-day':sh==='夜班'?'shift-night':'shift-rest',shortSh=afterWork?'下班':sh==='白班'?'白':sh==='夜班'?'夜':'休';const progressHtml=(sh==='休'||afterWork)?'':`<div class="shift-progress"><div class="progress"><i style="width:${p}%"></i></div><div class="progress-foot ${viewDate===todayISO()?'':'only-pct'}">${viewDate===todayISO()?'<span>当前进度</span>':''}<b>${Math.round(p)}%</b></div></div>`;return `<main class="page-main"><div class="page-topbar"><div class="page-period">${activeStart()} 至 ${activeEnd()}</div><button class="top-setting" id="scheduleSettings">⚙</button></div><section class="shift-hero ${shiftClass}"><div class="shift-world" aria-hidden="true"><div class="world-sky"></div><div class="world-sun"></div><div class="world-moon"></div><div class="world-stars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="world-meteors"><i></i><i></i><i></i></div><div class="world-cloud cloud-a"></div><div class="world-cloud cloud-b"></div><div class="world-birds"><i></i><i></i></div><div class="world-z">Z<span>Z</span><b>Z</b></div><div class="world-offwork" aria-hidden="true">
<div class="offwork-scenery">
  <div class="offwork-sky-shape sky-cloud-1"></div><div class="offwork-sky-shape sky-cloud-2"></div>
  <div class="offwork-horizon horizon-a"><i></i><i></i><i></i><i></i><i></i><i></i></div>
  <div class="offwork-horizon horizon-b"><i></i><i></i><i></i><i></i><i></i><i></i></div>
  <div class="offwork-road"><span></span><span></span><span></span><span></span><span></span><span></span></div>
</div>
<div class="offwork-car" role="img" aria-label="下班小汽车动画">
  <svg viewBox="0 0 180 86" class="offwork-car-svg" aria-hidden="true">
    <g class="car-exhaust" aria-hidden="true">
      <circle class="exhaust-puff puff-a" cx="14" cy="60" r="2.2"/>
      <circle class="exhaust-puff puff-b" cx="11" cy="63" r="1.7"/>
      <circle class="exhaust-puff puff-c" cx="14" cy="66" r="1.4"/>
    </g>
    <g class="car-body">
      <path d="M25 54h130c7 0 11 4 11 10v4H14v-4c0-6 4-10 11-10Z"/>
      <path d="M45 54 58 34c2-3 5-5 9-5h44c4 0 7 2 10 5l14 20Z"/>
      <path class="car-window" d="M64 34h42c3 0 5 1 7 4l9 13H55l7-13c1-2 2-4 2-4Z"/>
      <path class="car-line" d="M82 34v17M117 39l5 11"/>
      <rect class="car-light" x="151" y="55" width="7" height="5" rx="2"/>
      <rect class="car-light rear" x="22" y="55" width="7" height="5" rx="2"/>
      <rect class="car-bumper" x="9" y="64" width="10" height="5" rx="2"/>
      <rect class="car-bumper" x="158" y="64" width="10" height="5" rx="2"/>
    </g>
    <g class="car-wheel wheel-a"><circle cx="46" cy="70" r="14"/><circle class="wheel-hub" cx="46" cy="70" r="4"/><g class="wheel-spokes"><path d="M46 56v28M32 70h28M36 60l20 20M56 60 36 80"/></g></g>
    <g class="car-wheel wheel-b"><circle cx="137" cy="70" r="14"/><circle class="wheel-hub" cx="137" cy="70" r="4"/><g class="wheel-spokes"><path d="M137 56v28M123 70h28M127 60l20 20M147 60l-20 20"/></g></g>
  </svg>
  <div class="car-exhaust-html" aria-hidden="true"><i class="exhaust-html-puff puff-1"></i><i class="exhaust-html-puff puff-2"></i><i class="exhaust-html-puff puff-3"></i></div>
</div>
</div></div><strong>${shortSh}</strong>${sh==='休'?'<p>今天不用上班，好好休息</p>':afterWork?'<p>收工啦，今天辛苦了</p>':''}${progressHtml}</section><section class="card"><div class="section-head">${cycleNav('排班周期')}</div><div class="schedule-calendar-box"><div class="week">${['一','二','三','四','五','六','日'].map(x=>`<i>${x}</i>`).join('')}</div><div class="calendar">${shiftCalendar()}</div><button class="schedule-lock ${state.schedule.calendarLocked?'on':''}" id="scheduleCalendarLock" aria-label="${state.schedule.calendarLocked?'解锁日期表':'锁定日期表'}">${state.schedule.calendarLocked?'🔒':'🔓'}</button></div><div class="legend"><span>${state.schedule.calendarLocked?'🔒日期表已锁定，点击日期查看动画':'🔓点击日期修改班次'}</span></div></section></main>`}
function renderSettings(){return `<main class="page-main settings-page"><div class="page-topbar"><div class="page-period">应用设置</div></div><section class="setting-group"><div class="group-title">常用设置</div><button class="setting-item" id="openCategorySetting"><span class="setting-icon">🏷</span><div><b>消费分类</b><small>${state.categories.length} 个分类，可自定义</small></div><em>›</em></button><button class="setting-item" id="openScheduleSetting"><span class="setting-icon">🗓</span><div><b>排班设置</b><small>${state.schedule.mode==='normal'?'正常模式':'倒班模式'} · ${state.schedule.startDate}</small></div><em>›</em></button><button class="setting-item" id="openCloudSetting"><span class="setting-icon">☁️</span><div><b>云端数据库</b><small>${escapeHtml(state.cloud?.status||'未连接')} · ${state.cloud?.autoSync===false?'手动同步':'自动同步'}</small></div><em>›</em></button></section><section class="setting-group"><div class="group-title">应用信息</div><div class="setting-item version-item"><span class="setting-icon">ℹ️</span><div><b>版本号</b><small>${APP_VERSION}</small></div><em></em></div></section><section class="setting-group"><div class="group-title">数据</div><button class="setting-item" id="openReset"><span class="setting-icon">♻️</span><div><b class="danger-text">恢复默认数据</b><small>清除本机消费、排班和工具记录</small></div><em>›</em></button></section><div class="settings-tip">周期、金额等高频设置已保留在对应页面右上角，避免重复。</div></main>`}
function consumeSettingsModal(){const m=modal('消费设置',`<button class="setting-item" id="mPeriod"><span class="setting-icon">📅</span><div><b>消费周期</b><small>${state.consumeStart} 至 ${state.consumeEnd}</small></div><em>›</em></button><button class="setting-item" id="mBudget"><span class="setting-icon">💰</span><div><b>周期可使用</b><small>${money(cycleBudget())}</small></div><em>›</em></button><button class="setting-item" id="mCategory"><span class="setting-icon">🏷</span><div><b>消费分类</b><small>${state.categories.length} 个分类</small></div><em>›</em></button>`);m.querySelector('#mPeriod').onclick=()=>{m.remove();periodModal()};m.querySelector('#mBudget').onclick=()=>{m.remove();budgetModal()};m.querySelector('#mCategory').onclick=()=>{m.remove();categoryModal()}}
function modal(title,content,buttons=''){const el=document.createElement('div');el.className='modal-mask';el.innerHTML=`<div class="modal"><div class="modal-head"><h3>${title}</h3><button class="close" data-close>×</button></div><div class="modal-body">${content}</div>${buttons?`<div class="modal-actions">${buttons}</div>`:''}</div>`;document.body.appendChild(el);el.addEventListener('click',e=>{if(e.target.matches('.modal-mask,[data-close]'))el.remove()});return el}
function budgetModal(){const activeBudget=cycleBudget();const max=Math.max(10000,Math.ceil(Number(activeBudget||0)/5000)*5000);const nodes=[];for(let x=0;x<=max;x+=1000)nodes.push(`<button class="budget-node" data-money="${x}"><i></i><span>${x>=1000?x/1000+'k':x}</span></button>`);const m=modal('周期可使用',`<div class="budget-current" id="budgetValue">${money(activeBudget)}</div><div class="budget-track-wrap"><input id="budgetRange" class="range" type="range" min="0" max="${max}" step="1" value="${activeBudget}"><div class="budget-nodes">${nodes.join('')}</div></div><label class="precise-money">精确金额<input id="budgetNumber" type="number" min="0" step="0.01" value="${activeBudget}"></label>`,`<button class="secondary" data-close>取消</button><button class="primary" id="saveBudget">保存</button>`);const range=m.querySelector('#budgetRange'),num=m.querySelector('#budgetNumber'),val=m.querySelector('#budgetValue');const sync=v=>{v=Math.max(0,Number(v)||0);range.value=Math.min(max,v);num.value=v;val.textContent=money(v)};range.oninput=()=>sync(range.value);num.oninput=()=>sync(num.value);m.querySelectorAll('[data-money]').forEach(b=>b.onclick=()=>sync(b.dataset.money));m.querySelector('#saveBudget').onclick=()=>{state.budget=Number(num.value)||0;state.cycleBudgets[activeKey()]=state.budget;if(state.tab==='消费'){recalcAllocationsFromCycle()}save();m.remove();render()}}

function periodModal(){const m=modal('消费周期',`<div class="date-range-card"><label>开始日期<input id="mStart" type="date" value="${state.periodStart}"></label><div class="date-arrow">→</div><label>结束日期<input id="mEnd" type="date" value="${state.periodEnd}"></label></div><div class="quick-period"><button data-days="7">7天</button><button data-days="15">15天</button><button data-days="30">30天</button><button data-days="31">31天</button></div><p class="tip">日期可以直接点手机系统日期选择器，也可以一键选择常用周期。</p>`,`<button class="secondary" data-close>取消</button><button class="primary" id="savePeriod">保存</button>`);m.querySelectorAll('[data-days]').forEach(b=>b.onclick=()=>{const s=m.querySelector('#mStart').value||todayISO();m.querySelector('#mEnd').value=addDays(s,Number(b.dataset.days)-1)});m.querySelector('#savePeriod').onclick=()=>{const s=m.querySelector('#mStart').value,e=m.querySelector('#mEnd').value;if(!s||!e||s>e)return alert('结束日期不能早于开始日期');state.periodStart=s;state.periodEnd=e;const k=cycleKey(s,e);if(state.cycleBudgets[k]==null)state.cycleBudgets[k]=Number(state.budget||0);state.consumeStart=s;state.consumeEnd=e;state.budget=Number(state.cycleBudgets[k]||0);state.selectedDate='';save();m.remove();render()}}
function playExpenseAddEffect(recordId, amount, fromRemaining, toRemaining, done){
  const fab=document.getElementById('addExpense');
  const target=document.querySelector('.hero-card strong');
  if(!fab||!target){done?.();return 0}

  const fr=fab.getBoundingClientRect();
  const tr=target.getBoundingClientRect();
  const sx=fr.left+fr.width*.5;
  const sy=fr.top+fr.height*.5;
  const tx=tr.left+tr.width*.5;
  const ty=tr.top+tr.height*.5;

  const stage=document.createElement('div');
  stage.className='expense-paper-fx';
  stage.innerHTML=`
    <div class="plane-trail" aria-hidden="true"></div>
    <div class="plane-amount">-¥${fmt(amount)}</div>
    <div class="paper-plane paper-plane-v59" aria-hidden="true">
      <svg viewBox="0 0 92 60" role="presentation">
        <path d="M4 30 86 4 53 54 38 34 4 30Z" fill="currentColor"/>
        <path d="M38 34 86 4" fill="none" stroke="rgba(255,255,255,.82)" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M38 34 53 54" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="2" stroke-linecap="round"/>
        <path d="M38 34 22 27" fill="none" stroke="rgba(255,255,255,.42)" stroke-width="1.7" stroke-linecap="round"/>
      </svg>
    </div>
    <span class="paper-star ps1">✦</span><span class="paper-star ps2">✦</span><span class="paper-star ps3">·</span>
    <div class="balance-impact-ring" aria-hidden="true"></div>`;
  document.body.appendChild(stage);

  const plane=stage.querySelector('.paper-plane');
  const amountTag=stage.querySelector('.plane-amount');
  const trail=stage.querySelector('.plane-trail');
  const ring=stage.querySelector('.balance-impact-ring');
  const stars=[...stage.querySelectorAll('.paper-star')];
  const place=(el,x,y)=>{el.style.left=`${x}px`;el.style.top=`${y}px`};
  place(plane,sx,sy); place(amountTag,sx-3,sy-34); place(trail,sx,sy);
  stars.forEach((el,i)=>place(el,sx,sy));
  place(ring,tx,ty);

  const dx=tx-sx,dy=ty-sy;
  const c1={x:dx*.28,y:dy*.12-34};
  const c2={x:dx*.76,y:dy*.76-22};

  plane.animate([
    {transform:'translate(-50%,-50%) translate3d(0,0,0) rotate(-12deg) scale(.78)',opacity:0},
    {transform:'translate(-50%,-50%) translate3d(0,0,0) rotate(-10deg) scale(.88)',opacity:1,offset:.13},
    {transform:`translate(-50%,-50%) translate3d(${c1.x}px,${c1.y}px,0) rotate(-7deg) scale(.98)`,opacity:1,offset:.36},
    {transform:`translate(-50%,-50%) translate3d(${c2.x}px,${c2.y}px,0) rotate(-3deg) scale(1)`,opacity:1,offset:.78},
    {transform:`translate(-50%,-50%) translate3d(${dx}px,${dy}px,0) rotate(0deg) scale(.82)`,opacity:1,offset:.92},
    {transform:`translate(-50%,-50%) translate3d(${dx+2}px,${dy}px,0) rotate(2deg) scale(.78)`,opacity:0}
  ],{duration:2050,easing:'cubic-bezier(.18,.74,.16,1)',fill:'forwards'});

  amountTag.animate([
    {transform:'translate(-50%,-50%) translate3d(0,0,0) scale(.72)',opacity:0},
    {transform:'translate(-50%,-50%) translate3d(0,-1px,0) scale(1)',opacity:1,offset:.18},
    {transform:`translate(-50%,-50%) translate3d(${c1.x-2}px,${c1.y-8}px,0) scale(1)`,opacity:.95,offset:.4},
    {transform:`translate(-50%,-50%) translate3d(${c2.x}px,${c2.y-7}px,0) scale(.94)`,opacity:.9,offset:.78},
    {transform:`translate(-50%,-50%) translate3d(${dx-2}px,${dy-7}px,0) scale(.72)`,opacity:0}
  ],{duration:2050,easing:'cubic-bezier(.18,.74,.16,1)',fill:'forwards'});

  trail.animate([
    {transform:'translate(-50%,-50%) scaleX(.1)',opacity:0},
    {transform:'translate(-50%,-50%) scaleX(.55)',opacity:.2,offset:.2},
    {transform:'translate(-50%,-50%) scaleX(.9)',opacity:.12,offset:.58},
    {transform:'translate(-50%,-50%) scaleX(1)',opacity:0}
  ],{duration:1350,easing:'ease-out',fill:'forwards'});

  const starMoves=[[-28,-26],[28,-18],[24,22]];
  stars.forEach((el,i)=>{
    const [sdx,sdy]=starMoves[i];
    el.animate([
      {transform:'translate(-50%,-50%) scale(.45)',opacity:0},
      {transform:'translate(-50%,-50%) scale(1)',opacity:.7,offset:.35},
      {transform:`translate(calc(-50% + ${sdx}px),calc(-50% + ${sdy}px)) scale(.4)`,opacity:0}
    ],{duration:900,delay:450+i*120,easing:'ease-out',fill:'forwards'});
  });

  setTimeout(()=>{
    // 纸飞机“撞”上余额数字：先收缩，再轻弹，并扩散一圈冲击波。
    ring.animate([
      {transform:'translate(-50%,-50%) scale(.25)',opacity:0},
      {transform:'translate(-50%,-50%) scale(.75)',opacity:.45,offset:.22},
      {transform:'translate(-50%,-50%) scale(1.35)',opacity:.16,offset:.62},
      {transform:'translate(-50%,-50%) scale(1.8)',opacity:0}
    ],{duration:520,easing:'cubic-bezier(.18,.72,.2,1)',fill:'forwards'});

    target.animate([
      {transform:'scale(1) translateY(0)',filter:'blur(0)'},
      {transform:'scale(1.055) translateY(-2px)',filter:'blur(.1px)',offset:.2},
      {transform:'scale(.985) translateY(1px)',filter:'blur(.2px)',offset:.45},
      {transform:'scale(1.025) translateY(0)',filter:'blur(0)',offset:.68},
      {transform:'scale(1)',filter:'blur(0)'}
    ],{duration:560,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});

    const start=Number(fromRemaining||0), end=Number(toRemaining||0), begin=performance.now();
    const duration=700;
    const ease=t=>1-Math.pow(1-t,3);
    const tick=now=>{
      const t=Math.min(1,(now-begin)/duration);
      const value=start+(end-start)*ease(t);
      target.textContent=money(value);
      if(t<1) requestAnimationFrame(tick); else target.textContent=money(end);
    };
    requestAnimationFrame(tick);
  },1960);

  setTimeout(()=>{stage.remove();done?.();},2780);
  return 2780;
}
function expenseModal(id=null){
  const old=id?state.records.find(r=>r.id===id):null;
  const r=old||{date:state.selectedDate||todayISO(),name:'',amount:'',category:state.categories[0]||'其他'};
  const m=modal(id?'编辑消费':'添加消费',`<label>消费物品名称 <span class="optional">可不填</span><input id="eName" value="${escapeHtml(r.name)}" placeholder="例如：午餐、加油、买菜"></label><div class="expense-grid expense-main-row"><label>金额<input id="eAmount" type="number" min="0" step="0.01" value="${r.amount}" placeholder="请输入金额"></label><label>分类<select id="eCat">${state.categories.map(c=>`<option ${c===r.category?'selected':''}>${escapeHtml(c)}</option>`).join('')}</select></label></div><label class="expense-date-row">日期<input id="eDate" type="date" value="${r.date}"></label>`,`<button class="secondary" data-close>取消</button>${id?'<button class="danger" id="deleteExpense">删除</button>':''}<button class="primary" id="saveExpense">保存</button>`);
  const num=m.querySelector('#eAmount');
  if(id)m.querySelector('#deleteExpense').onclick=()=>{if(confirm('确定删除这笔消费？')){state.records=state.records.filter(x=>x.id!==id);save();m.remove();render()}};
  m.querySelector('#saveExpense').onclick=()=>{
    const amount=Number(num.value),date=m.querySelector('#eDate').value;
    if(!date||!Number.isFinite(amount)||amount<0)return alert('请填写正确的日期和金额');
    const obj={id:id||Date.now().toString(),name:m.querySelector('#eName').value.trim(),amount,category:m.querySelector('#eCat').value,date};
    initAllocations();
    if(id){
      const oldDate=old.date;
      Object.assign(old,obj);
      recalcAfterConsumption(oldDate);
      if(date!==oldDate)recalcAfterConsumption(date);
      save();m.remove();render();
      return;
    }
    const beforeRemaining=remaining();
    state.records.push(obj);
    recalcAfterConsumption(date);
    save();
    const afterRemaining=remaining();
    m.remove();
    requestAnimationFrame(()=>playExpenseAddEffect(obj.id,amount,beforeRemaining,afterRemaining,()=>{ render(); }));
  };
}
function scheduleModal(){const s=state.schedule;const cycleButtons=['白班','夜班','休'];const m=modal('排班设置',`<div class="mode-switch"><button data-mode="normal" class="${s.mode==='normal'?'on':''}">正常模式</button><button data-mode="shift" class="${s.mode==='shift'?'on':''}">倒班模式</button></div><div id="normalBox" class="${s.mode==='normal'?'':'hide'}"><div class="info-box">周一至周五默认白班，周六、周日默认休息。日历里点某一天即可单独修改。</div></div><div id="shiftBox" class="${s.mode==='shift'?'':'hide'}"><label>排班开始日期<input id="sStart" type="date" value="${s.startDate}"></label><div class="cycle-title">快速选择循环</div><div class="cycle-presets"><button data-cycle="白班 夜班 休 白班 夜班 休 休 休">四班两倒</button><button data-cycle="白班 夜班 休">三天循环</button><button data-cycle="白班 夜班 休 休">两班两休</button></div><label>当前循环<input id="sCycle" value="${escapeHtml(s.cycle.join(' '))}"></label><p class="tip">需要特殊排班时，再修改这一行即可，班次之间用空格隔开。</p></div><div class="time-card"><div class="time-title">上下班时间</div><div class="form-grid"><label>白班开始<input id="dayStart" type="time" value="${s.dayStart}"></label><label>白班结束<input id="dayEnd" type="time" value="${s.dayEnd}"></label><label>夜班开始<input id="nightStart" type="time" value="${s.nightStart}"></label><label>夜班结束<input id="nightEnd" type="time" value="${s.nightEnd}"></label></div></div>`,`<button class="secondary" data-close>取消</button><button class="primary" id="saveSchedule">保存</button>`);m.dataset.mode=s.mode;m.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{m.dataset.mode=b.dataset.mode;m.querySelectorAll('[data-mode]').forEach(x=>x.classList.remove('on'));b.classList.add('on');m.querySelector('#normalBox').classList.toggle('hide',b.dataset.mode!=='normal');m.querySelector('#shiftBox').classList.toggle('hide',b.dataset.mode!=='shift')});m.querySelectorAll('[data-cycle]').forEach(b=>b.onclick=()=>m.querySelector('#sCycle').value=b.dataset.cycle);m.querySelector('#saveSchedule').onclick=()=>{s.mode=m.dataset.mode;s.startDate=m.querySelector('#sStart')?.value||s.startDate;s.cycle=(m.querySelector('#sCycle')?.value||'').trim().split(/\s+/).filter(Boolean);if(!s.cycle.length)s.cycle=['白班','夜班','休'];s.dayStart=m.querySelector('#dayStart').value;s.dayEnd=m.querySelector('#dayEnd').value;s.nightStart=m.querySelector('#nightStart').value;s.nightEnd=m.querySelector('#nightEnd').value;save();m.remove();render()}}
function addToolModal(){const m=modal('添加工具',`<div class="tool-icon-picks"><button data-icon="🔎">🔎</button><button data-icon="💰">💰</button><button data-icon="📊">📊</button><button data-icon="🔗">🔗</button><button data-icon="🧰">🧰</button></div><label>名称<input id="tName" placeholder="例如：币安、邮箱、公司系统"></label><label>网址<input id="tUrl" placeholder="https://"></label>`,`<button class="secondary" data-close>取消</button><button class="primary" id="saveTool">添加</button>`);let icon='🔗';m.querySelectorAll('[data-icon]').forEach(b=>b.onclick=()=>{icon=b.dataset.icon;m.querySelectorAll('[data-icon]').forEach(x=>x.classList.remove('on'));b.classList.add('on')});m.querySelector('#saveTool').onclick=()=>{let u=m.querySelector('#tUrl').value.trim();if(!u)return alert('请输入网址');if(!/^https?:\/\//i.test(u))u='https://'+u;state.tools.push({id:Date.now().toString(),name:m.querySelector('#tName').value.trim()||'未命名工具',url:u,icon});save();m.remove();render()}}
function editShift(date){const current=shiftFor(date),options=['白班','夜班','休','早班','中班','晚班'];const m=modal(dateText(date)+' 班次',`<div class="shift-options">${options.map(x=>`<button class="${x===current?'on':''}" data-pick="${x}">${x}</button>`).join('')}</div><button class="clear-override" id="autoShift">恢复自动排班</button>`);m.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{state.schedule.overrides[date]=b.dataset.pick;save();m.remove();render()});m.querySelector('#autoShift').onclick=()=>{delete state.schedule.overrides[date];save();m.remove();render()}}
function bind(){
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;state.selectedDate='';save();render()});
 document.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>{state.selectedDate=state.selectedDate===b.dataset.date?'':b.dataset.date;render()});document.querySelectorAll('[data-cycle]').forEach(b=>b.onclick=()=>shiftCycle(Number(b.dataset.cycle)));
  document.getElementById('addExpense')?.addEventListener('click',()=>expenseModal());document.getElementById('consumeSettings')?.addEventListener('click',consumeSettingsModal);
 document.getElementById('periodBudgetCard')?.addEventListener('click',budgetModal);
 document.querySelectorAll('[data-delete-expense]').forEach(b=>b.onclick=()=>{const id=b.dataset.deleteExpense;const old=state.records.find(x=>x.id===id);if(!old)return;const row=b.closest('.record');row?.classList.add('expense-delete-out');state.records=state.records.filter(x=>x.id!==id);recalcAfterConsumption(old.date);save();setTimeout(render,220)});
 document.getElementById('scheduleSettings')?.addEventListener('click',scheduleModal);
 document.getElementById('scheduleCalendarLock')?.addEventListener('click',()=>{state.schedule.calendarLocked=!state.schedule.calendarLocked;save();render()});document.querySelectorAll('[data-shift-date]').forEach(b=>b.onclick=()=>{const d=b.dataset.shiftDate;state.schedule.selectedDate=d;save();if(state.schedule.calendarLocked)render();else editShift(d)});
 document.getElementById('addTool')?.addEventListener('click',addToolModal);
 document.querySelectorAll('[data-tool]').forEach(b=>{let timer;b.onclick=()=>{const t=state.tools.find(x=>x.id===b.dataset.tool);if(t)window.open(t.url,'_blank')};b.oncontextmenu=e=>{e.preventDefault();const t=state.tools.find(x=>x.id===b.dataset.tool);if(t&&confirm(`删除“${t.name}”？`)){state.tools=state.tools.filter(x=>x.id!==t.id);save();render()}};b.ontouchstart=()=>{timer=setTimeout(()=>{const t=state.tools.find(x=>x.id===b.dataset.tool);if(t&&confirm(`删除“${t.name}”？`)){state.tools=state.tools.filter(x=>x.id!==t.id);save();render()}},650)};b.ontouchend=()=>clearTimeout(timer)});
 document.getElementById('openCategorySetting')?.addEventListener('click',categoryModal);document.getElementById('openScheduleSetting')?.addEventListener('click',scheduleModal);document.getElementById('openCloudSetting')?.addEventListener('click',cloudModal);
 document.getElementById('openReset')?.addEventListener('click',()=>{if(confirm('确定恢复默认数据？这会清除当前本机测试记录。')){state=defaultState();save();render()}});
}
render();
setTimeout(()=>{if(state.cloud?.binId&&state.cloud?.accessKey){cloudAutoConnect();}},300);
})();
