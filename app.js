const KEY='h5_expense_v1';
const BIN_ID='6ab77ec0ac6210605af7112f';
const API_KEY='$2a$10$ozdu69gADpIovC9V66K7Rexv4XituqB0/j6RBkZiTLOFrOsm2TQOi';
const API_URL='https://api.jsonbin.io/v3/b/'+BIN_ID;
const API_HEADERS={'Content-Type':'application/json','X-Master-Key':API_KEY};
let root={accounts:{},adminPassword:'admin123',users:{}};
let data={expenses:[],categories:["餐饮","交通","购物","娱乐","生活","其他"],messages:[]};
let currentUser=null;
let selectedOffset=0;
let dayCount=+localStorage.getItem(KEY+'_days')||31;
let selectedDate=null;
let calendarStart=null;
function pad(n){return String(n).padStart(2,'0')}
function fmtDate(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function money(n){return '¥'+Number(n||0).toFixed(2)}
const DEFAULT_ICONS={餐饮:'🍜',交通:'🚇',购物:'🛍️',娱乐:'🎮',生活:'🏠',其他:'💳'};
function cycleStart(date=new Date()){
  const d=new Date(date); d.setHours(0,0,0,0);
  if(d.getDate()>=25) return new Date(d.getFullYear(),d.getMonth(),25);
  return new Date(d.getFullYear(),d.getMonth()-1,25);
}
function getCycle(offset=0){
  // 自定义周期
  if(data.cycleStartDate && data.cycleDays>0){
    const s0=new Date(data.cycleStartDate+'T00:00:00');
    s0.setDate(s0.getDate()+offset*data.cycleDays);
    const e=new Date(s0);
    e.setDate(e.getDate()+data.cycleDays-1);
    let arr=[], cur=new Date(s0);
    while(cur<=e){arr.push(new Date(cur));cur.setDate(cur.getDate()+1)}
    return {s:s0,e,arr};
  }
  // 默认：25号至次月25号
  const s0=cycleStart();
  const s=new Date(s0.getFullYear(),s0.getMonth()+offset,25);
  const e=new Date(s.getFullYear(),s.getMonth()+1,25);
  let arr=[], cur=new Date(s);
  while(cur<=e){arr.push(new Date(cur));cur.setDate(cur.getDate()+1)}
  return {s,e,arr};
}
function save(){
  if(currentUser) root.users[currentUser]=data;
  localStorage.setItem(KEY+'_user',currentUser||'');
  localStorage.setItem(KEY,JSON.stringify(data));
  localStorage.setItem(KEY+'_days',dayCount);
  localStorage.setItem('h5_root',JSON.stringify(root));
  try{
    const ctl=new AbortController();
    const timer=setTimeout(()=>ctl.abort(),6000);
    fetch(API_URL,{method:'PUT',headers:API_HEADERS,body:JSON.stringify(root),signal:ctl.signal}).finally(()=>clearTimeout(timer)).catch(()=>{});
  }catch(e){}
}
async function loadCloud(){
  // 先用本地缓存的 root 兜底（防止云端超时/失败导致账号密码"消失"）
  try{
    const cached=localStorage.getItem('h5_root');
    if(cached) root=JSON.parse(cached);
  }catch(e){}
  try{
    const ctl=new AbortController();
    const timer=setTimeout(()=>ctl.abort(),8000);
    const r=await fetch(API_URL,{headers:{'X-Master-Key':API_KEY},signal:ctl.signal});
    clearTimeout(timer);
    if(!r.ok) return false;
    const j=await r.json();
    const remote=j.record||j;
    if(!remote) return false;
    // 兼容旧数据：如果 remote 直接有 expenses，迁移到 admin 用户
    if(Array.isArray(remote.expenses)){
      root={accounts:remote.accounts||{},adminPassword:remote.adminPassword||'admin123',users:remote.users||{}};
      if(!root.users['admin']) root.users['admin']=remote;
    } else {
      root=remote;
    }
    if(!root.accounts) root.accounts={};
    if(!root.users) root.users={};
    if(!root.adminPassword) root.adminPassword='admin123';
    // 云端加载成功 → 更新本地缓存
    localStorage.setItem('h5_root',JSON.stringify(root));
    return true;
  }catch(e){}
  return false;
}
function loadUser(name){
  currentUser=name;
  let u=root.users[name];
  if(!u){u={expenses:[],categories:["餐饮","交通","购物","娱乐","生活","其他"],messages:[]};root.users[name]=u;}
  // 本地数据保护：如果云端该用户没有消费记录，但本地 localStorage 有记录，合并进来避免丢失
  try{
    const local=JSON.parse(localStorage.getItem(KEY)||'null');
    if(local && typeof local==='object' && (!Array.isArray(u.expenses)||!u.expenses.length) && Array.isArray(local.expenses)&&local.expenses.length){
      u.expenses=local.expenses;
      if(local.monthBudget!==undefined) u.monthBudget=local.monthBudget;
      if(local.cycleStartDate) u.cycleStartDate=local.cycleStartDate;
      if(local.cycleDays) u.cycleDays=local.cycleDays;
      if(local.shiftPattern) u.shiftPattern=local.shiftPattern;
      if(local.shiftColors) u.shiftColors=local.shiftColors;
      if(Array.isArray(local.messages)&&local.messages.length) u.messages=local.messages;
      save();
      toast('已恢复本地记录');
    }
  }catch(e){}
  data=u;
  if(!Array.isArray(data.categories)||!data.categories.length) data.categories=["餐饮","交通","购物","娱乐","生活","其他"];
  if(!Array.isArray(data.messages)) data.messages=[];
  if(!Array.isArray(data.expenses)) data.expenses=[];
  localStorage.setItem(KEY,JSON.stringify(data));
}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),1400)}
function switchTab(t){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('show'));
  document.getElementById('page-'+t).classList.add('show');
  document.querySelectorAll('.tabbar button').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));
  document.getElementById('fabAdd').style.display=(t==='home')?'flex':'none';
  if(t==='tools'){loadMessages()}
  if(t==='shift'){
    initShift();
    if(!data.shiftStartDate && !localStorage.getItem('onb_shift_'+currentUser)){
      localStorage.setItem('onb_shift_'+currentUser,'1');
      setTimeout(()=>toast('👆 点右上角 ⚙️ 设置排班起始日'),800);
    }
  }
  if(t==='home'){
    if(!data.monthBudget && !localStorage.getItem('onb_home_'+currentUser)){
      localStorage.setItem('onb_home_'+currentUser,'1');
      setTimeout(()=>{toast('👆 点右上角 ⚙️ 设置预算和周期');openHomeSettings();},600);
    }
  }
}
function openHomeSettings(){
  document.getElementById('monthBudget').value=data.monthBudget||'';
  document.getElementById('cycleStartDate').value=data.cycleStartDate||'';
  document.getElementById('cycleDays').value=data.cycleDays||'';
  renderCats();
  document.getElementById('homeSettingsModal').classList.add('show');
}
function saveHomeSettings(){
  data.monthBudget=parseFloat(document.getElementById('monthBudget').value)||0;
  const sd=document.getElementById('cycleStartDate').value;
  const cd=parseInt(document.getElementById('cycleDays').value)||0;
  if(sd && cd>0){data.cycleStartDate=sd;data.cycleDays=cd}
  else {delete data.cycleStartDate;delete data.cycleDays}
  selectedOffset=0;
  save();closeHomeSettings();toast('设置已保存');
}
function closeHomeSettings(){
  document.getElementById('homeSettingsModal').classList.remove('show');
  render();
}
function toggleGroup(el){el.parentElement.classList.toggle('open')}
function shiftCycle(d){selectedOffset+=d;calendarStart=null;render()}
function resetCal(){selectedOffset=0;calendarStart=null;selectedDate=null;render()}
function setDays(n){dayCount=n;calendarStart=null;save();render()}
function shiftCal(dir){
  if(!calendarStart) calendarStart=new Date(getCycle(selectedOffset).s);
  calendarStart.setDate(calendarStart.getDate()+dir*dayCount);
  render();
}
function saveSettings(){
  const v=parseFloat(document.getElementById('monthBudget').value)||0;
  data.monthBudget=v;save();closeHomeSettings();toast('预算已保存');
}
function barColor(pct){return pct>=50?'#22b573':(pct>=30?'#f7b500':'#f05d5e')}
function tick(){
  const n=new Date();
  document.getElementById('clock').textContent=`${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
}
setInterval(tick,1000);tick();
function render(){
  const activeTab=document.querySelector('.tabbar button.on')?.dataset?.tab||'home';
  document.getElementById('fabAdd').style.display=(activeTab==='home')?'flex':'none';
  const c=getCycle(selectedOffset);
  document.getElementById('cycleText').textContent=`${fmtDate(c.s)} 至 ${fmtDate(c.e)}`+(selectedOffset===0?'（本周期）':'');
  document.getElementById('cycleText').classList.toggle('today',selectedOffset===0);
  const monthBudget=+data.monthBudget||0;
  const cycleDays=c.arr.length;
  const baseDaily=cycleDays?monthBudget/cycleDays:0;
  const inCycleSet=new Set(c.arr.map(fmtDate));
  const spent=data.expenses.filter(x=>inCycleSet.has(x.date)).reduce((a,x)=>a+(+x.amount||0),0);
  // 动态每日预算：到今天为止已花金额固定，剩余预算÷从选中日到周期结束的天数
  const todayKey=fmtDate(new Date());
  const spentUntilToday=c.arr.filter(d=>fmtDate(d)<=todayKey).reduce((a,d)=>{
    return a+data.expenses.filter(x=>x.date===fmtDate(d)).reduce((b,x)=>b+(+x.amount||0),0);
  },0);
  const expectedAt=(key)=>{
    const idx=c.arr.findIndex(d=>fmtDate(d)===key);
    if(idx<0) return baseDaily;
    const leftDays=cycleDays-idx;
    const leftBudget=Math.max(0,monthBudget-spentUntilToday);
    return leftDays>0?leftBudget/leftDays:0;
  };
  const remain=monthBudget-spent, pct=monthBudget?Math.max(0,Math.min(100,remain/monthBudget*100)):0;
  document.getElementById('budget').textContent=money(monthBudget);
  document.getElementById('spent').textContent=money(spent);
  document.getElementById('remain').textContent=money(remain);
  document.getElementById('remainPercent').textContent=Math.round(pct)+'%';
  const bar=document.getElementById('bar');
  bar.style.width=pct+'%';bar.style.background=barColor(pct);
  const today=new Date(); today.setHours(0,0,0,0);
  let passedRatio;
  if(today<=c.s) passedRatio=0;
  else if(today>=c.e) passedRatio=1;
  else passedRatio=(today-c.s)/86400000/cycleDays;
  document.getElementById('timeBar').style.width=(passedRatio*100)+'%';
  document.getElementById('timeTxt').textContent=`第 ${Math.max(1,Math.round(passedRatio*cycleDays))}/${cycleDays} 天`;
  const focusKey=selectedDate||todayKey;
  const focusSpent=data.expenses.filter(x=>x.date===focusKey).reduce((a,x)=>a+(+x.amount||0),0);
  document.getElementById('actualLab').textContent=selectedDate?focusKey.slice(5):'当日';
  const focusExpected=expectedAt(focusKey);
  const expectEl=document.getElementById('expectNum');
  expectEl.textContent=money(focusExpected);
  expectEl.classList.toggle('red', focusExpected>0 && focusSpent>focusExpected);
  setActualImmediate(money(focusSpent));
  document.querySelectorAll('#daypick button').forEach(b=>b.classList.toggle('on',+b.dataset.n===dayCount));
  renderDays(c, expectedAt);
  renderRecords(c);
}
function toggleRecords(){
  document.getElementById('recordsBody').classList.toggle('collapsed');
  document.getElementById('recordsHead').classList.toggle('folded');
}
const DEFAULT_SHIFT_PATTERN=['白','夜','休','白','夜','休','休','休'];
const DEFAULT_SHIFT_COLORS={'白':'#2F80ED','夜':'#6C5CE7','休':'#00B894'};
let shiftCalCursor=new Date();
let pickDateKey=null;
function shiftPattern(){return Array.isArray(data.shiftPattern)&&data.shiftPattern.length?data.shiftPattern:DEFAULT_SHIFT_PATTERN}
function shiftColors(){return Object.assign({},DEFAULT_SHIFT_COLORS,data.shiftColors||{})}
function allShiftLabels(){
  const s=new Set(shiftPattern());
  (data.shiftOverrides?Object.values(data.shiftOverrides):[]).forEach(x=>s.add(x));
  Object.keys(shiftColors()).forEach(x=>s.add(x));
  return Array.from(s);
}
function getShiftOf(dateKey){
  if(data.useQuickMode){
    if(data.shiftOverrides&&data.shiftOverrides[dateKey]) return data.shiftOverrides[dateKey];
    return data.quickDefault||null;
  }
  if(quickModeOn) return null;
  if(!data.shiftStart) return null;
  const sp=data.shiftStart.split('-').map(Number);
  const s=new Date(sp[0],sp[1]-1,sp[2]);
  const dp=dateKey.split('-').map(Number);
  const d=new Date(dp[0],dp[1]-1,dp[2]);
  const diff=Math.round((d-s)/86400000);
  if(diff<0) return null;
  const p=shiftPattern();
  return p[diff%p.length];
}
function initShift(){
  if(!data.shiftStart){
    data.shiftStart=fmtDate(new Date());
    save();
  }
  shiftCalCursor=new Date();
  renderShiftCal();
  updateTodayShift();
  if(document.getElementById('todayShiftStatus').textContent.indexOf('已下班')>=0){
    fireConfetti();
  }
  clearInterval(initShift._t);
  initShift._t=setInterval(updateTodayShift,1000);
}
function fireConfetti(){
  const box=document.getElementById('confettiBox');
  if(!box) return;
  if(fireConfetti._playing){
    clearTimeout(fireConfetti._pending);
    fireConfetti._pending=setTimeout(fireConfetti,4200);
    return;
  }
  fireConfetti._playing=true;
  box.innerHTML='';
  const colors=['#f05d5e','#f7b500','#22b573','#5b67f1','#fd79a8','#00b894','#fdcb6e','#e17055','#6c5ce7','#0984e3'];
  const shapes=['rect','rect','circle','circle','triangle','long'];
  let maxTime=0;
  for(let i=0;i<22;i++){
    const c=document.createElement('div');
    const shape=shapes[Math.floor(Math.random()*shapes.length)];
    c.className='confetti '+shape;
    c.style.left=(5+Math.random()*90)+'%';
    const col=colors[Math.floor(Math.random()*colors.length)];
    if(shape==='triangle'){
      c.style.setProperty('--c',col);
    } else {
      c.style.background=col;
      c.style.width=(6+Math.random()*5)+'px';
      c.style.height=(9+Math.random()*8)+'px';
    }
    const delay=Math.random()*0.4;
    const dur=2+Math.random()*0.8;
    c.style.animationDelay=delay+'s';
    c.style.animationDuration=dur+'s';
    c.style.setProperty('--dx',(Math.random()*70-35)+'px');
    box.appendChild(c);
    maxTime=Math.max(maxTime,delay+dur);
  }
  setTimeout(()=>{box.innerHTML='';fireConfetti._playing=false},(maxTime+0.3)*1000);
}
function shiftHours(){return +data.shiftHours||8}
function shiftStartMin(){
  const t=data.shiftStartTime||'08:00';
  const [h,m]=t.split(':').map(Number);
  return h*60+m;
}
function updateTodayShift(){
  const now=new Date();
  const key=fmtDate(now);
  let shift=getShiftOf(key);
  // 跨天夜班：如果今天凌晨还在昨天夜班上，优先显示昨天的夜班
  const yKey=fmtDate(new Date(now-86400000));
  const yShift=getShiftOf(yKey);
  const startMin=shiftStartMin();
  const durMin=shiftHours()*60;
  const nowMin=now.getHours()*60+now.getMinutes()+now.getSeconds()/60;
  // 昨天夜班的结束时间（昨天开始+12h+时长）
  const yNightStart=(startMin+12*60)%1440;
  const yNightEnd=yNightStart+durMin; // 可能>1440
  if(yShift==='夜' && nowMin < (yNightEnd-1440)){
    shift='夜';
    // 夜班从今天凌晨0点开始算进度
    const sMin=0, eMin=yNightEnd-1440;
    renderShiftBar(shift, sMin, eMin, nowMin, now);
    return;
  }
  const nameEl=document.getElementById('todayShiftName');
  const colors=shiftColors();
  const col=colors[shift]||'#8b919d';
  nameEl.textContent=shift||'未排';
  nameEl.style.color=col;
  document.getElementById('todayShiftDot').style.background=col;
  const card=document.getElementById('todayShiftCard');
  const bar=document.getElementById('todayShiftBar');
  const pctEl=document.getElementById('todayShiftPct');
  const statusEl=document.getElementById('todayShiftStatus');
  const startEl=document.getElementById('todayShiftStart');
  const endEl=document.getElementById('todayShiftEnd');
  if(!shift||shift==='休'){
    card.style.background='#f0f2f5';
    bar.style.width='0%';pctEl.textContent='--';
    statusEl.textContent='休息';
    statusEl.style.color='var(--muted)';statusEl.style.background='#e2e5ec';
    startEl.textContent='--';endEl.textContent='--';
    return;
  }
  card.style.background='var(--card)';
  let sMin=startMin;
  if(shift==='夜'){
    sMin=(sMin+12*60)%1440;
  }
  const eMin=sMin+durMin;
  renderShiftBar(shift, sMin, eMin, nowMin, now, {startEl,endEl,statusEl,pctEl,bar,card});
}
function renderShiftBar(shift, sMin, eMin, nowMin, now, els){
  if(!els){
    els={
      bar:document.getElementById('todayShiftBar'),
      pctEl:document.getElementById('todayShiftPct'),
      statusEl:document.getElementById('todayShiftStatus'),
      startEl:document.getElementById('todayShiftStart'),
      endEl:document.getElementById('todayShiftEnd'),
      card:document.getElementById('todayShiftCard')
    };
  }
  const {bar,pctEl,statusEl,startEl,endEl,card}=els;
  const fmtCDiff=diffSec=>{
    const h=Math.floor(diffSec/3600), m=Math.floor(diffSec%3600/60), s=diffSec%60;
    return h+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  };
  let pct=0, status='', barColor='#8b919d', countdown='';
  if(nowMin<sMin){
    pct=nowMin/sMin*100;
    status='已下班'; barColor='#22b573';
    countdown='距上班 '+fmtCDiff(Math.floor((sMin-nowMin)*60));
  } else if(nowMin>=eMin && eMin<=1440){
    const remain=1440-eMin, totalNext=remain+sMin;
    pct=(nowMin-eMin)/totalNext*100;
    status='已下班'; barColor='#22b573';
    countdown='距上班 '+fmtCDiff(Math.floor((sMin+1440-nowMin)*60));
  } else if(eMin>1440 && nowMin < eMin-1440){
    pct=nowMin/(eMin-1440)*100;
    status='上班中'; barColor='#f05d5e';
    countdown='距下班 '+fmtCDiff(Math.floor((eMin-1440-nowMin)*60));
  } else {
    const total=eMin>1440?1440-sMin:eMin-sMin;
    pct=(nowMin-sMin)/total*100;
    status='上班中'; barColor='#f05d5e';
    countdown='距下班 '+fmtCDiff(Math.floor((eMin-nowMin)*60));
  }
  bar.style.width=Math.max(0,Math.min(100,pct))+'%';
  bar.style.background=barColor;
  pctEl.textContent=countdown;
  if(status==='已下班' && updateTodayShift._last!=='已下班'){
    fireConfetti();
  }
  statusEl.textContent=status;
  statusEl.style.background=barColor;
  statusEl.style.color='#fff';
  updateTodayShift._last=status;
  const fmt=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
  let sTxt=fmt(sMin), eTxt=eMin<=1440?fmt(eMin):fmt(eMin-1440);
  if(eMin>1440 && nowMin>=sMin){ eTxt=fmt(eMin-1440)+' 次日'; }
  startEl.textContent=sTxt;
  endEl.textContent=eTxt;
}
function renderShiftCal(){
  const y=shiftCalCursor.getFullYear(), m=shiftCalCursor.getMonth();
  document.getElementById('shiftMonthTitle').textContent=`${y}年${m+1}月`;
  const first=new Date(y,m,1);
  const daysInMonth=new Date(y,m+1,0).getDate();
  const grid=document.getElementById('shiftDaysGrid');
  grid.innerHTML='';
  const weeks=['一','二','三','四','五','六','日'];
  weeks.forEach((w,i)=>{
    const h=document.createElement('div');
    const weekend=(i>=5);
    h.style.cssText='text-align:center;font-size:11px;padding:2px 0';
    if(weekend){
      h.innerHTML='<span style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:50%;background:#e2e5ec;color:var(--muted)">'+w+'</span>';
    } else {
      h.style.color='var(--muted)';
      h.textContent=w;
    }
    grid.appendChild(h);
  });
  const todayKey=fmtDate(new Date());
  // getDay(): 0=日,1=一,...6=六. We want Monday first: offset = (getDay()+6)%7
  const startOffset=(first.getDay()+6)%7;
  for(let i=0;i<startOffset;i++){
    const ph=document.createElement('div');ph.style.visibility='hidden';grid.appendChild(ph);
  }
  const colors=shiftColors();
  for(let d=1;d<=daysInMonth;d++){
    const dt=new Date(y,m,d);
    const key=fmtDate(dt);
    const shift=getShiftOf(key);
    const el=document.createElement('div');
    el.className='day';
    if(key===todayKey) el.style.boxShadow='0 0 0 2px var(--primary) inset';
    const dow=dt.getDay();
    const isWeekend=(dow===0||dow===6);
    if(shift){
      const col=colors[shift]||'#8b919d';
      el.style.background=col+'30';
      el.style.borderColor=col+'66';
      el.innerHTML=`<strong>${d}</strong><small style="color:${col}">${shift}</small>`;
    } else {
      el.style.background='#f7f8fa';
      el.innerHTML=`<strong>${d}</strong><small>--</small>`;
    }
    el.onclick=()=>{
      if(quickModeOn && paintLabel){
        if(!data.shiftOverrides) data.shiftOverrides={};
        data.shiftOverrides[key]=paintLabel;
        save();renderShiftCal();
        toast(key+' → '+paintLabel);
      } else if(quickModeOn){
        toast('先点下面的按钮选要标什么');
      } else openShiftPick(key);
    };
    grid.appendChild(el);
  }
  updateTodayShift();
}
let quickModeOn=false;
let paintLabel=null;
function saveQuickTime(){
  data.shiftHours=+document.getElementById('quickShiftHours').value;
  data.shiftStartTime=document.getElementById('quickShiftStart').value;
  save();renderShiftCal();
}
function toggleQuickMode(){
  const on=!quickModeOn;
  quickModeOn=on;
  if(on){data.useQuickMode=true;save();}
  document.getElementById('btnQuickToggle').style.background=on?'var(--primary)':'#f8f9fc';
  document.getElementById('btnQuickToggle').style.color=on?'#fff':'var(--text)';
  document.getElementById('btnQuickToggle').style.borderColor=on?'var(--primary)':'var(--line)';
  // 互斥：关闭循环
  document.getElementById('cycleInputBox').style.display='none';
  document.getElementById('btnCycleToggle').style.background='#f8f9fc';
  document.getElementById('btnCycleToggle').style.color='var(--text)';
  document.getElementById('btnCycleToggle').style.borderColor='var(--line)';
  document.getElementById('quickBar').style.display=on?'flex':'none';
  paintLabel=null;
  if(on){renderQuickBar();toast('选假模式已打开：点下面按钮再点日期');}
  renderShiftCal();
}
function clearCyclePattern(){
  data.shiftStart=null;data.shiftPattern=null;
  document.getElementById('shiftPatternInput').value='';
  save();renderShiftCal();toast('已清除循环规则');
}
function saveCyclePattern(){
  const v=document.getElementById('shiftPatternInput').value;
  const pat=v.split(/[,，]/).map(s=>s.trim()).filter(Boolean);
  const sd=document.getElementById('shiftStartDate').value;
  data.shiftStart=sd||data.shiftStart;
  data.shiftHours=+document.getElementById('shiftHours').value;
  data.shiftStartTime=document.getElementById('shiftStartTime').value;
  if(!pat.length){toast('请输入循环规则');return}
  data.shiftPattern=pat;
  data.useQuickMode=false;
  save();renderShiftCal();
  document.getElementById('cycleInputBox').style.display='none';
  document.getElementById('btnCycleToggle').style.background='#fff';
  document.getElementById('btnCycleToggle').style.color='var(--text)';
  document.getElementById('btnCycleToggle').style.borderColor='var(--line)';
  toast('已保存循环规则');
}
function toggleCycleInput(){
  const box=document.getElementById('cycleInputBox');
  const on=box.style.display!=='block';
  box.style.display=on?'block':'none';
  document.getElementById('btnCycleToggle').style.background=on?'var(--primary)':'#f8f9fc';
  document.getElementById('btnCycleToggle').style.color=on?'#fff':'var(--text)';
  document.getElementById('btnCycleToggle').style.borderColor=on?'var(--primary)':'var(--line)';
  // 互斥：关闭选假
  if(on){
    quickModeOn=false;
    data.useQuickMode=false;
    save();
    document.getElementById('btnQuickToggle').style.background='#f8f9fc';
    document.getElementById('btnQuickToggle').style.color='var(--text)';
    document.getElementById('btnQuickToggle').style.borderColor='var(--line)';
    document.getElementById('quickBar').style.display='none';
  }
  renderShiftCal();
}
function quickPaint(label){
  if(label==='白'||label==='夜'){
    data.quickDefault=label;save();
    document.querySelectorAll('#quickBar button[data-default]').forEach(b=>{
      b.style.outline=(b.dataset.default===label)?'3px solid var(--primary)':'3px solid transparent';
      b.style.outlineOffset='2px';
    });
    toast('默认班次已设为：'+label);
    return;
  }
  paintLabel=label;
  document.querySelectorAll('#quickBar button[data-paint]').forEach(b=>{
    if(b.dataset.paint===label){
      b.style.outline='3px solid var(--primary)';
      b.style.outlineOffset='2px';
    } else {
      b.style.outline='3px solid transparent';
    }
  });
  toast('涂抹模式：点日期标 '+label);
}
function quickSave(){
  quickModeOn=false;
  paintLabel=null;
  data.useQuickMode=true;
  document.getElementById('quickBar').style.display='none';
  document.getElementById('btnQuickToggle').style.background='#f8f9fc';
  document.getElementById('btnQuickToggle').style.color='var(--text)';
  document.getElementById('btnQuickToggle').style.borderColor='var(--line)';
  save();renderShiftCal();
  toast('已保存排班');
}
function quickAdd(){
  const bar=document.getElementById('quickBar');
  const old=document.getElementById('quickAddInput');
  if(old){old.focus();return}
  const input=document.createElement('input');
  input.id='quickAddInput';
  input.placeholder='输入班次名，如年假';
  input.style.cssText='flex:0 0 140px;padding:10px 12px;border:1px solid var(--primary);border-radius:10px;outline:none;font-size:14px';
  const confirm=document.createElement('button');
  confirm.textContent='加';
  confirm.style.cssText='flex:0 0 auto;padding:10px 14px;border:0;background:var(--primary);color:#fff;border-radius:10px;font-weight:700';
  confirm.onclick=()=>{
    const n=input.value.trim();
    if(!n){toast('请输入名称');return}
    if(!data.quickLabels) data.quickLabels=[];
    if(!data.quickLabels.includes(n)){
      data.quickLabels.push(n);
      const colors=shiftColors();
      if(!colors[n]) colors[n]='#5b67f1';
      data.shiftColors=colors;
      save();
    }
    renderQuickBar();
    toast('已添加 '+n);
  };
  input.onkeydown=e=>{if(e.key==='Enter')confirm.click()};
  const addBtn=document.querySelector('#quickBar button:last-of-type');
  const row2=document.querySelector('#quickBar div:nth-child(2) > div');
  if(row2){row2.insertBefore(input,row2.lastChild);row2.insertBefore(confirm,row2.lastChild);}
  else{bar.appendChild(input);bar.appendChild(confirm);}
  input.focus();
}
function renderQuickBar(){
  const bar=document.getElementById('quickBar');
  bar.innerHTML='';
  bar.style.cssText='display:flex;flex-direction:column;gap:10px;margin:0 16px 8px;padding:14px;background:#fff;border-radius:14px;box-shadow:0 2px 8px rgba(0,0,0,.04)';
  const colors=shiftColors();
  // 时间
  const timeRow=document.createElement('div');
  timeRow.className='row';
  timeRow.innerHTML=`
    <div class="field" style="margin:0"><label>时长</label><select id="quickShiftHours"><option value="8">8 小时</option><option value="12">12 小时</option></select></div>
    <div class="field" style="margin:0"><label>开始</label><input id="quickShiftStart" type="time"></div>
  `;
  bar.appendChild(timeRow);
  setTimeout(()=>{
    document.getElementById('quickShiftHours').value=data.shiftHours||8;
    document.getElementById('quickShiftStart').value=data.shiftStartTime||'08:00';
    document.getElementById('quickShiftHours').onchange=saveQuickTime;
    document.getElementById('quickShiftStart').onchange=saveQuickTime;
  },0);
  // 默认班次
  const s1=document.createElement('div');
  s1.innerHTML='<div style="font-size:12px;color:var(--muted);margin-bottom:6px">默认班次</div>';
  const r1=document.createElement('div');
  r1.style.cssText='display:flex;gap:10px';
  ['白','夜'].forEach(label=>{
    const b=document.createElement('button');
    b.textContent=label;
    b.dataset.default=label;
    b.style.cssText=`flex:1;padding:10px 0;border:0;border-radius:10px;font-weight:700;color:#fff;background:${colors[label]||'#8b919d'};font-size:14px;outline:3px solid transparent;outline-offset:2px`;
    b.onclick=()=>quickPaint(label);
    r1.appendChild(b);
  });
  s1.appendChild(r1);
  bar.appendChild(s1);
  // 标记日期
  const s2=document.createElement('div');
  s2.innerHTML='<div style="font-size:12px;color:var(--muted);margin-bottom:6px">标记日期</div>';
  const r2=document.createElement('div');
  r2.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center';
  const rest=document.createElement('button');
  rest.textContent='休';
  rest.dataset.paint='休';
  rest.style.cssText='padding:12px 18px;border:0;border-radius:10px;font-weight:700;color:#fff;background:#8b919d;outline:3px solid transparent;outline-offset:2px;font-size:15px';
  rest.onclick=()=>quickPaint('休');
  r2.appendChild(rest);
  (data.quickLabels||[]).forEach(l=>{
    const c=colors[l]||'#5b67f1';
    const wrap=document.createElement('div');
    wrap.style.cssText='position:relative';
    const b=document.createElement('button');
    b.textContent=l;
    b.dataset.paint=l;
    b.style.cssText=`padding:12px 18px;border:0;border-radius:10px;font-weight:700;color:#fff;background:${c};outline:3px solid transparent;outline-offset:2px;font-size:15px`;
    b.onclick=()=>quickPaint(l);
    wrap.appendChild(b);
    const del=document.createElement('span');
    del.textContent='×';
    del.style.cssText='position:absolute;top:-6px;right:-6px;width:20px;height:20px;background:#f05d5e;color:#fff;border-radius:50%;font-size:13px;line-height:20px;text-align:center;font-weight:700';
    del.onclick=e=>{e.stopPropagation();data.quickLabels=data.quickLabels.filter(x=>x!==l);save();renderQuickBar();toast('已删除 '+l);};
    wrap.appendChild(del);
    r2.appendChild(wrap);
  });
  const add=document.createElement('button');
  add.style.cssText='width:44px;height:44px;border:1px dashed var(--primary);background:#eef0ff;color:var(--primary);border-radius:10px;font-size:20px';
  add.textContent='+';
  add.onclick=quickAdd;
  r2.appendChild(add);
  s2.appendChild(r2);
  bar.appendChild(s2);
  // 底部按钮
  const br=document.createElement('div');
  br.style.cssText='display:flex;gap:8px';
  const save=document.createElement('button');
  save.textContent='保存';
  save.style.cssText='flex:1;border:0;background:var(--green);color:#fff;border-radius:12px;padding:14px;font-weight:700;font-size:16px';
  save.onclick=quickSave;
  br.appendChild(save);
  const clearBtn=document.createElement('button');
  clearBtn.textContent='清除';
  clearBtn.style.cssText='flex:1;border:1px solid var(--red);background:#fdecec;color:var(--red);border-radius:12px;padding:14px;font-weight:700;font-size:16px';
  clearBtn.onclick=()=>{
    data.shiftOverrides={};data.quickDefault=null;data.useQuickMode=true;
    save();renderShiftCal();toast('已清除');
  };
  br.appendChild(clearBtn);
  bar.appendChild(br);
  if(data.quickDefault){
    document.querySelectorAll('#quickBar button[data-default]').forEach(b=>{
      b.style.outline=(b.dataset.default===data.quickDefault)?'3px solid var(--primary)':'3px solid transparent';
    });
  }
}
function clearShiftOverrides(){
  data.shiftOverrides={};
  data.shiftStart=null;
  data.shiftPattern=null;
  data.quickLabels=[];
  save();renderShiftCal();toast('已清除全部排班标记');
}
function shiftCalMonth(d){
  shiftCalCursor.setMonth(shiftCalCursor.getMonth()+d);
  renderShiftCal();
}
function openShiftPick(dateKey){
  pickDateKey=dateKey;
  document.getElementById('shiftPickTitle').textContent=dateKey+' 班次';
  renderShiftPickBtns();
  document.getElementById('shiftPickModal').classList.add('show');
}
function shiftBtnHtml(l,c){
  const deletable=!['白','夜','休'].includes(l);
  return `<div class="shift-btn-wrap" data-label="${l}" style="position:relative">
    <button class="shift-btn" data-label="${l}" style="width:100%;padding:18px 0 13px;border:0;border-radius:12px;font-weight:700;color:#fff;background:${c};position:relative">${l}</button>
    ${deletable?`<span class="shift-del" data-label="${l}" style="position:absolute;top:4px;right:6px;font-size:15px;line-height:1;color:rgba(255,255,255,.85);cursor:pointer">×</span>`:''}
  </div>`;
}
function renderShiftPickBtns(){
  const colors=shiftColors();
  const labels=allShiftLabels();
  const box=document.getElementById('shiftPickBtns');
  box.innerHTML=labels.map(l=>{
    const c=colors[l]||'#8b919d';
    return shiftBtnHtml(l,c);
  }).join('');
  box.querySelectorAll('.shift-btn').forEach(b=>{
    b.onclick=()=>confirmShift(b.dataset.label);
  });
  box.querySelectorAll('.shift-del').forEach(s=>{
    s.onclick=(e)=>{e.stopPropagation();delShiftLabelFromPick(s.dataset.label,e)};
  });
}
function delShiftLabelFromPick(l, ev){
  if(ev) ev.stopPropagation();
  if(['白','夜','休'].includes(l)){toast('默认班次不可删除');return}
  const btn=ev&&ev.target;
  if(btn.dataset.arm!=='1'){
    btn.dataset.arm='1';
    btn.textContent='✓';
    btn.style.color='#fff';
    setTimeout(()=>{
      btn.dataset.arm='0';
      btn.textContent='×';
      btn.style.color='rgba(255,255,255,.85)';
    },2000);
    return;
  }
  if(data.shiftColors) delete data.shiftColors[l];
  if(data.shiftOverrides) Object.keys(data.shiftOverrides).forEach(k=>{if(data.shiftOverrides[k]===l) delete data.shiftOverrides[k]});
  if(Array.isArray(data.shiftPattern)) data.shiftPattern=data.shiftPattern.filter(x=>x!==l);
  save();renderShiftPickBtns();renderShiftCal();toast('已删除 '+l);
}
function addShiftLabel(){
  const nameEl=document.getElementById('newShiftName');
  const colorEl=document.getElementById('newShiftColor');
  const n=(nameEl.value||'').trim();
  if(!n){alert('请输入班次名');return}
  const colors=shiftColors();
  colors[n]=colorEl.value;
  data.shiftColors=colors;
  save();
  nameEl.value='';
  renderShiftPickBtns();
  toast('已添加 '+n);
}
function confirmShift(label){
  if(!pickDateKey) return;
  data.shiftOverrides=data.shiftOverrides||{};
  data.shiftOverrides[pickDateKey]=label;
  save();renderShiftCal();closeShiftPick();toast('已设置为'+label);
}
function clearShiftDay(){
  if(!pickDateKey) return;
  if(data.shiftOverrides) delete data.shiftOverrides[pickDateKey];
  save();renderShiftCal();closeShiftPick();toast('已恢复循环默认');
}
function closeShiftPick(){document.getElementById('shiftPickModal').classList.remove('show')}
function openShiftSettings(){
  document.getElementById('shiftStartDate').value=data.shiftStart||fmtDate(new Date());
  document.getElementById('shiftPatternInput').value=shiftPattern().join(',');
  document.getElementById('shiftHours').value=data.shiftHours||8;
  document.getElementById('shiftStartTime').value=data.shiftStartTime||'08:00';
  renderShiftColorList();
  document.getElementById('shiftSettingsModal').classList.add('show');
}
function closeShiftSettings(){document.getElementById('shiftSettingsModal').classList.remove('show')}
function renderShiftColorList(){
  const labels=allShiftLabels();
  const colors=shiftColors();
  document.getElementById('shiftColorList').innerHTML=labels.map((l,i)=>{
    const canDel=!['白','夜','休'].includes(l);
    return `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0">
      <span style="flex:1;font-size:14px">${l}${canDel?'':' <small style="color:var(--muted)">(默认)</small>'}</span>
      <input type="color" value="${colors[l]||'#8b919d'}" data-label="${l}" style="width:50px;height:34px;border:1px solid var(--line);border-radius:8px;padding:2px">
      ${canDel?`<button class="del-shift-btn" data-label="${l}" style="border:0;background:#fdecec;color:var(--red);width:30px;height:30px;border-radius:9px;font-size:14px" title="删除">🗑</button>`:''}
    </div>`;
  }).join('');
  document.querySelectorAll('.del-shift-btn').forEach(b=>{
    b.onclick=()=>delShiftLabel(b.dataset.label);
  });
}
function delShiftLabel(l){
  if(['白','夜','休'].includes(l)){toast('默认班次不可删除');return}
  if(data.shiftColors) delete data.shiftColors[l];
  if(data.shiftOverrides){
    Object.keys(data.shiftOverrides).forEach(k=>{if(data.shiftOverrides[k]===l) delete data.shiftOverrides[k]});
  }
  if(Array.isArray(data.shiftPattern)){
    data.shiftPattern=data.shiftPattern.filter(x=>x!==l);
  }
  if(Array.isArray(data.quickLabels)){
    data.quickLabels=data.quickLabels.filter(x=>x!==l);
  }
  save();renderShiftColorList();renderShiftCal();toast('已删除 '+l);
}
function saveShiftSettings(){
  const sd=document.getElementById('shiftStartDate').value;
  if(!sd){alert('请选择开始日期');return}
  data.shiftStart=sd;
  const pat=document.getElementById('shiftPatternInput').value.split(/[,，\s]+/).map(s=>s.trim()).filter(Boolean);
  if(!pat.length){alert('循环模式不能为空');return}
  data.shiftPattern=pat;
  const newColors=Object.assign({},DEFAULT_SHIFT_COLORS,data.shiftColors);
  document.querySelectorAll('#shiftColorList input[type=color]').forEach(inp=>{
    newColors[inp.dataset.label]=inp.value;
  });
  data.shiftColors=newColors;
  data.shiftHours=+document.getElementById('shiftHours').value;
  data.shiftStartTime=document.getElementById('shiftStartTime').value;
  save();renderShiftCal();updateTodayShift();closeShiftSettings();toast('排班设置已保存');
}
function renderDays(c, expectedAt){
  if(!calendarStart) calendarStart=new Date(c.s);
  const days=document.getElementById('days'); days.innerHTML='';
  const todayKey=fmtDate(new Date());
  for(let i=0;i<dayCount;i++){
    const d=new Date(calendarStart); d.setDate(d.getDate()+i);
    const key=fmtDate(d);
    const el=document.createElement('div');
    const spentDay=data.expenses.filter(x=>x.date===key).reduce((a,x)=>a+(+x.amount||0),0);
    const exp=typeof expectedAt==='function'?expectedAt(key):0;
    let cls='day ';
    if(key===todayKey) cls+='today ';
    if(key===selectedDate) cls+='selected ';
    if(exp>0 && key<=todayKey){
      if(spentDay>exp) cls+='over ';
      else cls+='under ';
    }
    el.className=cls.trim();
    const showAmt=spentDay>0?money(spentDay).replace('¥',''):'0.00';
    el.innerHTML=`<div class="d">${d.getMonth()+1}/${d.getDate()}</div><strong>${d.getDate()}</strong><small>${showAmt}</small>`;
    el.onclick=()=>{ selectedDate=(selectedDate===key)?null:key; render(); };
    days.appendChild(el);
  }
}
function setActualImmediate(newText){
  const el=document.getElementById('actualNum');
  el.textContent=newText;
  el.classList.remove('num-new');
  el.parentElement.querySelectorAll('.num-old').forEach(n=>n.remove());
}
function swapActual(newText){
  const el=document.getElementById('actualNum');
  if(el.textContent===newText) return;
  const wrap=el.parentElement;
  const old=document.createElement('span');
  old.className='num-old';
  old.textContent=el.textContent;
  wrap.appendChild(old);
  el.textContent=newText;
  el.classList.remove('num-new'); void el.offsetWidth; el.classList.add('num-new');
  setTimeout(()=>{old.remove();el.classList.remove('num-new')},480);
}
function renderRecords(c){
  let list,title;
  if(selectedDate){
    list=data.expenses.filter(x=>x.date===selectedDate);
    title=selectedDate+' 明细（再点一次格子取消筛选）';
  } else {
    list=data.expenses.filter(x=>c.arr.some(d=>fmtDate(d)===x.date));
    title='本周期明细';
  }
  list=list.slice().sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id);
  document.getElementById('detailTitle').textContent=title;
  document.getElementById('countText').textContent=list.length+' 笔';
  const box=document.getElementById('records');
  if(!list.length){box.innerHTML='<div class="empty">暂无记录<br>点上方＋按钮记一笔，或点日历格子选某天</div>';return}
  box.innerHTML=list.map(x=>`<div class="record"><div class="icon">${DEFAULT_ICONS[x.category]||'💳'}</div><div class="rmain"><b>${escapeHtml(x.item||'未命名消费')}</b><p>${x.date} · ${escapeHtml(x.category||'其他')}</p></div><div><span class="money">-${money(x.amount)}</span><button class="delbtn" onclick="delExpense(${x.id},event)">🗑</button></div></div>`).join('');
}
function renderCats(){
  const box=document.getElementById('catList');
  box.innerHTML=data.categories.map((c,i)=>`<div class="cat-item"><span>${escapeHtml(c)}</span><button class="delbtn" onclick="delCat(${i},this)">🗑</button></div>`).join('');
}
function addCat(){
  const v=document.getElementById('newCat').value.trim();
  if(!v) return;
  if(data.categories.includes(v)){alert('分类已存在');return}
  data.categories.push(v);save();document.getElementById('newCat').value='';renderCats();toast('已添加分类');
}
function delCat(i,btn){
  if(data.categories.length<=1){alert('至少保留一个分类');return}
  if(btn.dataset.arm!=='1'){
    btn.dataset.arm='1';
    btn.classList.add('arm');
    btn.textContent='确认?';
    setTimeout(()=>{btn.dataset.arm='0';btn.classList.remove('arm');btn.textContent='🗑'},2000);
    return;
  }
  data.categories.splice(i,1);save();renderCats();toast('已删除分类');
}
function delExpense(id,ev){
  const card=ev.target.closest('.record');
  if(card) card.classList.add('deleting');
  setTimeout(()=>{
    data.expenses=data.expenses.filter(x=>x.id!==id);
    save();render();toast('已删除');
  },260);
}
function clearCycle(){
  const c=getCycle(selectedOffset);
  const set=new Set(c.arr.map(fmtDate));
  const n=data.expenses.filter(x=>set.has(x.date)).length;
  if(!n){toast('本周期暂无记录');return}
  if(!confirm(`确定清空本周期全部 ${n} 条记录吗？`))return;
  data.expenses=data.expenses.filter(x=>!set.has(x.date));
  save();render();toast('已清空本周期记录');
}
function wipeAll(){
  if(!confirm('确定清空所有记录和设置？此操作不可恢复'))return;
  data={expenses:[],categories:["餐饮","交通","购物","娱乐","生活","其他"]}; selectedOffset=0; dayCount=31; selectedDate=null; calendarStart=null;
  save();switchTab('home');render();toast('已清空全部数据');
}
function exportData(){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='consume-backup-'+fmtDate(new Date())+'.json';
  a.click();
  toast('已导出备份文件');
}
function exportText(){
  const lines=['# 消费记录备份 v1'];
  lines.push('# 周期预算:'+(data.monthBudget||0));
  lines.push('# 分类:'+(data.categories||[]).join(','));
  lines.push('# 记录:日期|物品|分类|金额');
  data.expenses.slice().sort((a,b)=>a.date.localeCompare(b.date)).forEach(x=>{
    lines.push([x.date,x.item||'',x.category||'',(+x.amount).toFixed(2)].join('|'));
  });
  openTextModal('导出文本（长按全选复制）',lines.join('\n'),true);
}
function importText(){
  openTextModal('粘贴备份文本，点解析导入','',false);
}
function openTextModal(title,text,isExport){
  let m=document.getElementById('textModal');
  if(!m){
    m=document.createElement('div');m.id='textModal';m.className='modal';
    m.innerHTML='<div class="sheet"><h3 id="textModalTitle"></h3><textarea id="textModalArea" style="width:100%;height:260px;border:1px solid var(--line);background:#f8f9fc;border-radius:12px;padding:12px;font-size:12px;font-family:monospace;outline:none;resize:vertical"></textarea><div class="actions"><button class="cancel" onclick="closeTextModal()">关闭</button><button class="save" id="textModalBtn"></button></div></div>';
    document.body.appendChild(m);
  }
  document.getElementById('textModalTitle').textContent=title;
  document.getElementById('textModalArea').value=text;
  const btn=document.getElementById('textModalBtn');
  btn.textContent=isExport?'复制':'解析导入';
  btn.onclick=isExport?copyText:parseText;
  m.classList.add('show');
}
function closeTextModal(){document.getElementById('textModal').classList.remove('show')}
function copyText(){
  const ta=document.getElementById('textModalArea');
  ta.select();ta.setSelectionRange(0,99999);
  try{document.execCommand('copy');toast('已复制，去备忘录粘贴')}catch(e){alert('请长按文本手动复制')}
}
function parseText(){
  const txt=document.getElementById('textModalArea').value.trim();
  if(!txt){alert('请先粘贴文本');return}
  const lines=txt.split('\n');
  const adds=[];
  let catFromTxt=[];
  lines.forEach(line=>{
    line=line.trim();
    if(!line||line.startsWith('#')){
      if(line.startsWith('# 分类:')) catFromTxt=line.slice(6).split(/[,，]/).map(s=>s.trim()).filter(Boolean);
      return;
    }
    const p=line.split('|');
    if(p.length>=4){
      const date=p[0].trim(),item=p[1].trim(),cat=p[2].trim(),amount=parseFloat(p[3]);
      if(/^\d{4}-\d{2}-\d{2}$/.test(date)&&amount>0){
        adds.push({id:Date.now()+Math.random(),item,amount,category:cat,date});
      }
    }
  });
  if(!adds.length){alert('没解析到有效记录，请检查文本格式');return}
  if(!confirm('解析到 '+adds.length+' 条记录，追加到当前记录？'))return;
  if(catFromTxt.length) data.categories=Array.from(new Set([...catFromTxt,...(data.categories||[])]));
  data.expenses.push(...adds);
  save();closeTextModal();render();toast('已导入 '+adds.length+' 条');
}
function importData(ev){
  const f=ev.target.files[0]; if(!f)return;
  const r=new FileReader();
  r.onload=e=>{
    try{
      const obj=JSON.parse(e.target.result);
      if(!obj.expenses||!Array.isArray(obj.expenses)) throw 0;
      if(!Array.isArray(obj.categories)||!obj.categories.length) obj.categories=["餐饮","交通","购物","娱乐","生活","其他"];
      data=obj; save(); switchTab('home'); render(); toast('导入成功');
    }catch(err){alert('文件格式不对，不是有效的备份文件')}
  };
  r.readAsText(f);
  ev.target.value='';
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function openExpense(){
  document.getElementById('modal').classList.add('show');
  document.getElementById('date').value=selectedDate||fmtDate(new Date());
  document.getElementById('category').innerHTML=data.categories.map(c=>`<option>${escapeHtml(c)}</option>`).join('');
}
function closeModal(){document.getElementById('modal').classList.remove('show')}
function saveExpense(){
  const item=document.getElementById('item').value.trim();
  const amount=parseFloat(document.getElementById('amount').value);
  const date=document.getElementById('date').value;
  if(!(amount>0)||!date){alert('请填写金额和日期');return}
  const oldActual=document.getElementById('actualNum').textContent;
  data.expenses.push({id:Date.now(),item:item||'',amount,category:document.getElementById('category').value,date});save();closeModal();
  document.getElementById('item').value='';document.getElementById('amount').value='';
  render();
  const todayKey=fmtDate(new Date());
  if(date===todayKey && !selectedDate){
    const todaySpent=money(data.expenses.filter(x=>x.date===todayKey).reduce((a,x)=>a+(+x.amount||0),0));
    document.getElementById('actualNum').textContent=oldActual;
    swapActual(todaySpent);
  }
  toast('已记录 +'+money(amount));
}
async function loadMessages(){
  const box=document.getElementById('msgList');
  const list=(data.messages||[]).slice().reverse();
  renderMessages(list);
}
function renderMessages(list){
  const box=document.getElementById('msgList');
  if(!list.length){box.innerHTML='<div class="empty">还没有留言，来说第一句</div>';return}
  box.innerHTML=list.map(m=>`<div class="record"><div class="icon">💬</div><div class="rmain"><b>${escapeHtml(m.name||'匿名')}</b><p>${new Date(m.time).toLocaleString('zh-CN')}</p><div style="margin-top:4px;font-size:13px">${escapeHtml(m.text)}</div></div></div>`).join('');
}
async function postMessage(){
  const name=document.getElementById('msgName').value.trim();
  const text=document.getElementById('msgText').value.trim();
  if(!text){alert('留言内容不能为空');return}
  data.messages=data.messages||[];
  data.messages.push({name,text,time:Date.now()});
  save();
  document.getElementById('msgText').value='';
  loadMessages();toast('留言已发送');
}
(async function init(){
  await loadCloud();
  // 单人使用：直接以 admin 身份加载数据
  loadUser('admin');
  render();
})();
setTimeout(loadSnakeSettings, 500);
function saveSnakeSettings(){
  localStorage.setItem('h5_snake_len',document.getElementById('snakeLen').value);
  localStorage.setItem('h5_snake_size',document.getElementById('snakeSize').value);
  localStorage.setItem('h5_snake_speed',document.getElementById('snakeSpeed').value);
  toast('小蛇设置已保存');
}
function loadSnakeSettings(){
  const l=localStorage.getItem('h5_snake_len')||26;
  const s=localStorage.getItem('h5_snake_size')||2;
  const v=localStorage.getItem('h5_snake_speed')||0.5;
  document.getElementById('snakeLen').value=l;
  document.getElementById('snakeLenV').textContent=l;
  document.getElementById('snakeSize').value=s;
  document.getElementById('snakeSizeV').textContent=s;
  document.getElementById('snakeSpeed').value=v;
  document.getElementById('snakeSpeedV').textContent=v;
}