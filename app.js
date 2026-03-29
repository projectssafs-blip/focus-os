'use strict';

/* ════════════════════════════════════════════
   STORE — safe localStorage wrapper
════════════════════════════════════════════ */
const Store = {
  esc(v) {
    return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  },
  get(key, fallback=null) {
    try { const v=localStorage.getItem('fo_'+key); return v!==null?JSON.parse(v):fallback; } catch { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem('fo_'+key, JSON.stringify(val)); }
    catch { showToast('Storage full. Export your data!','error'); }
  },
  all() {
    const data={};
    try {
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(k&&k.startsWith('fo_')&&!k.startsWith('fo_pw')&&!k.startsWith('fo_session')&&!k.startsWith('fo_audit')) {
          try{data[k.replace('fo_','')]=JSON.parse(localStorage.getItem(k));}catch{}
        }
      }
    } catch{}
    return data;
  },
  restore(data) {
    Object.entries(data).forEach(([k,v])=>{
      if(k==='pw_hash'||k==='session'||k==='audit') return;
      try{localStorage.setItem('fo_'+k,JSON.stringify(v));}catch{}
    });
  }
};

/* ════════════════════════════════════════════
   DOMAINS — dynamic, stored in localStorage
   Each domain: { id, name, icon, color }
════════════════════════════════════════════ */
const DEFAULT_DOMAINS = [
  { id:'vlsi',  name:'VLSI',  icon:'⚡', color:'#7ecbae' },
  { id:'cuda',  name:'CUDA',  icon:'🖥', color:'#7eb3e8' },
  { id:'gate',  name:'GATE',  icon:'📖', color:'#e8b47e' },
];

function getDomains() { return Store.get('domains', DEFAULT_DOMAINS); }
function setDomains(arr) { Store.set('domains', arr); }
function domainIds() { return getDomains().map(d=>d.id); }
function domainById(id) { return getDomains().find(d=>d.id===id)||{id,name:id,icon:'•',color:'#9e9b96'}; }

function hexToRgba(hex, alpha=1) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ════════════════════════════════════════════
   CONSTANTS
════════════════════════════════════════════ */
const QUOTES = [
  {text:"The secret of getting ahead is getting started.",author:"Mark Twain"},
  {text:"Small daily improvements over time lead to stunning results.",author:"Robin Sharma"},
  {text:"Focus is the art of knowing what to ignore.",author:"James Clear"},
  {text:"You don't rise to your goals. You fall to your systems.",author:"James Clear"},
  {text:"Every expert was once a beginner.",author:"Helen Hayes"},
  {text:"What stands in the way becomes the way.",author:"Marcus Aurelius"},
  {text:"Discipline is choosing what you want most over what you want now.",author:"Abraham Lincoln"},
  {text:"Mastery is a function of time and intense focus.",author:"Robert Greene"},
  {text:"Don't watch the clock. Do what it does. Keep going.",author:"Sam Levenson"},
  {text:"The pain of discipline is far less than the pain of regret.",author:"Jim Rohn"},
  {text:"Hard work beats talent when talent doesn't work hard.",author:"Tim Notke"},
  {text:"It always seems impossible until it's done.",author:"Nelson Mandela"},
];

/* ════════════════════════════════════════════
   ACTIVE TASK TIMER STATE
════════════════════════════════════════════ */
let activeTask = null;
let timerInterval = null;
let pendingComplete = null;

/* ════════════════════════════════════════════
   DOMAIN DOM GENERATION
════════════════════════════════════════════ */
function buildDomainNav() {
  document.querySelectorAll('.nav-btn.domain-nav').forEach(el=>el.remove());
  const nav = document.getElementById('sidebar-nav');
  const dailyBtn = nav.querySelector('[data-page="daily"]');
  getDomains().forEach(d=>{
    const btn = document.createElement('button');
    btn.className = 'nav-btn domain-nav';
    btn.dataset.page = d.id;
    btn.innerHTML = `<span style="font-size:14px">${d.icon}</span> ${Store.esc(d.name)}`;
    btn.addEventListener('click', ()=>{ navigateTo(d.id); closeSidebar(); });
    nav.insertBefore(btn, dailyBtn);
  });
}

function buildDomainPages() {
  const container = document.getElementById('dynamic-pages');
  container.innerHTML = '';
  getDomains().forEach(d=>{
    const sec = document.createElement('section');
    sec.className = 'page';
    sec.id = 'page-'+d.id;
    sec.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title"><span style="color:${d.color}">${d.icon}</span> ${Store.esc(d.name)}</h2>
          <p class="page-sub">Focus &amp; track your progress</p>
        </div>
        <div class="page-pct-badge" id="${d.id}-pct-badge" style="color:${d.color}">0%</div>
      </div>
      <div class="progress-track big"><div class="progress-fill" id="${d.id}-big-bar" style="width:0%;background:${d.color}"></div></div>
      <div id="${d.id}-active-timer" class="active-timer-bar hidden" style="color:${d.color};border-color:${hexToRgba(d.color,.2)};background:${hexToRgba(d.color,.06)}"></div>
      <div class="domain-layout">
        <div class="domain-left">
          <div class="card">
            <div class="card-head"><h3>Tasks</h3><span class="task-count" id="${d.id}-task-count">0/0</span></div>
            <div class="task-input-row">
              <input type="text" class="task-input" id="${d.id}-task-input" placeholder="Add a task…" maxlength="200" />
              <button class="add-btn" style="background:${d.color}" onclick="addTask('${d.id}')">+</button>
            </div>
            <ul class="task-list" id="${d.id}-task-list"></ul>
          </div>
          <div class="card">
            <div class="card-head"><h3>Weekly Goals</h3></div>
            <textarea class="notes-area" id="${d.id}-goals" placeholder="What do you want to achieve this week?"></textarea>
          </div>
        </div>
        <div class="domain-right">
          <div class="card">
            <div class="card-head"><h3>What I did today</h3></div>
            <textarea class="notes-area" id="${d.id}-today" placeholder="Describe what you worked on today…"></textarea>
            <button class="save-btn" style="color:${d.color}" onclick="saveToday('${d.id}')">Save Entry</button>
          </div>
          <div class="card">
            <div class="card-head"><h3>Notes</h3></div>
            <textarea class="notes-area tall" id="${d.id}-notes" placeholder="Concepts, references, ideas…"></textarea>
            <button class="save-btn" style="color:${d.color}" onclick="saveNotes('${d.id}')">Save Notes</button>
          </div>
        </div>
      </div>`;
    container.appendChild(sec);
    sec.querySelector(`#${d.id}-task-input`)?.addEventListener('keydown', e=>{ if(e.key==='Enter') addTask(d.id); });
  });
}

function buildDomainDashboardCards() {
  const grid = document.getElementById('domain-grid');
  grid.innerHTML = '';
  getDomains().forEach(d=>{
    const card = document.createElement('div');
    card.className = 'domain-card';
    card.dataset.domain = d.id;
    card.style.cursor = 'pointer';
    card.innerHTML = `
      <div class="domain-card-header">
        <span class="domain-icon">${d.icon}</span>
        <h3>${Store.esc(d.name)}</h3>
        <span class="domain-pct" id="dash-${d.id}-pct" style="color:${d.color}">0%</span>
      </div>
      <div class="progress-track"><div class="progress-fill" id="dash-${d.id}-bar" style="width:0%;background:${d.color}"></div></div>
      <p class="domain-card-meta" id="dash-${d.id}-meta">0 tasks completed</p>`;
    card.addEventListener('click', ()=>navigateTo(d.id));
    grid.appendChild(card);
  });
}

function buildDailyTagRow() {
  const row = document.getElementById('daily-tag-row');
  const generalBtn = row.querySelector('[data-tag="general"]');
  // clear all domain tags, keep general
  row.querySelectorAll('.tag-btn:not([data-tag="general"])').forEach(el=>el.remove());
  getDomains().forEach(d=>{
    const btn = document.createElement('button');
    btn.className = 'tag-btn';
    btn.dataset.tag = d.id;
    btn.innerHTML = `${d.icon} ${Store.esc(d.name)}`;
    row.insertBefore(btn, generalBtn);
  });
  // fix selectedTag if its domain was removed
  const ids = domainIds();
  if(selectedTag !== 'general' && !ids.includes(selectedTag)) {
    selectedTag = ids[0] || 'general';
  }
  row.querySelectorAll('.tag-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.tag === selectedTag);
    b.onclick = ()=>setTag(b.dataset.tag);
  });
}

function rebuildDomainUI() {
  buildDomainNav();
  buildDomainPages();
  buildDomainDashboardCards();
  buildDailyTagRow();
  getDomains().forEach(d=>{ loadTasks(d.id); loadNotes(d.id); loadGoals(d.id); loadDrafts(d.id); });
  renderDashboard();
  initAutoSave();
}

/* ════════════════════════════════════════════
   INIT
════════════════════════════════════════════ */
function initApp() {
  renderQuote();
  renderDate();
  rebuildDomainUI();
  initNav();
  renderDailyLog();
  initTagButtons();
  initExportButtons();
  initImport();
  initReminderCheck();
  initUploadModal();
  initSectionManager();
  updateStreak();
  restoreActiveTimer();
}

/* ════════════════════════════════════════════
   QUOTE & DATE
════════════════════════════════════════════ */
function renderQuote() {
  const q = QUOTES[Math.floor(Math.random()*QUOTES.length)];
  const el = document.getElementById('quote-text');
  const au = document.getElementById('quote-author');
  if(el) el.textContent = q.text;
  if(au) au.textContent = '— '+q.author;
}
function renderDate() {
  const el = document.getElementById('today-date');
  if(el) el.textContent = new Date().toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
}

/* ════════════════════════════════════════════
   NAVIGATION
════════════════════════════════════════════ */
function initNav() {
  document.querySelectorAll('.nav-btn:not(.domain-nav)').forEach(btn => {
    btn.addEventListener('click', () => { navigateTo(btn.dataset.page); closeSidebar(); });
  });
  document.getElementById('menu-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open');
  });
  document.addEventListener('click', e => {
    const sb=document.getElementById('sidebar');
    const mt=document.getElementById('menu-toggle');
    if(sb?.classList.contains('open')&&!sb.contains(e.target)&&e.target!==mt) closeSidebar();
  });
  document.getElementById('logout-btn')?.addEventListener('click', () => { Auth.logout(); location.reload(); });
}
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  const pageEl = document.getElementById('page-'+page);
  if(!pageEl) { navigateTo('dashboard'); return; }
  pageEl.classList.add('active');
  const btn=document.querySelector(`.nav-btn[data-page="${page}"]`);
  btn?.classList.add('active');
  const tp=document.getElementById('topbar-page');
  if(tp) tp.textContent = btn ? btn.textContent.trim() : page;
  if(page==='dashboard') renderDashboard();
  if(page==='analytics') { setTimeout(renderCharts,100); renderTimeBreakdown(); }
}
function closeSidebar() { document.getElementById('sidebar')?.classList.remove('open'); }

/* ════════════════════════════════════════════
   TASKS
════════════════════════════════════════════ */
function getTasks(domain) { return Store.get('tasks_'+domain,[]); }
function setTasks(domain,tasks) { Store.set('tasks_'+domain,tasks); }
function loadTasks(domain) { renderTasks(domain, getTasks(domain)); }

function renderTasks(domain, tasks) {
  const list  = document.getElementById(domain+'-task-list');
  const count = document.getElementById(domain+'-task-count');
  if(!list) return;
  list.innerHTML='';
  const done=tasks.filter(t=>t.done).length;
  if(count) count.textContent=`${done}/${tasks.length}`;
  const d = domainById(domain);

  tasks.forEach((task,idx)=>{
    const li=document.createElement('li');
    li.className='task-item'+(task.done?' done':'')+(activeTask&&activeTask.domain===domain&&activeTask.idx===idx?' active-task':'');

    const cb=document.createElement('input');
    cb.type='checkbox'; cb.checked=task.done;
    cb.setAttribute('aria-label','Complete task');
    cb.style.accentColor = d.color;

    const span=document.createElement('span');
    span.className='task-text'; span.textContent=task.text;

    const timeSpan=document.createElement('span');
    timeSpan.className='task-time-info';
    if(task.startTime&&!task.done) timeSpan.textContent='started '+formatTime(task.startTime);
    else if(task.done&&task.focusMin) timeSpan.textContent=`⏱ ${task.focusMin}m focus`;

    const actions=document.createElement('div');
    actions.className='task-actions';

    if(!task.done) {
      if(activeTask&&activeTask.domain===domain&&activeTask.idx===idx) {
        const stopBtn=document.createElement('button');
        stopBtn.className='task-action-btn stop-btn';
        stopBtn.textContent='■ Stop';
        stopBtn.addEventListener('click',()=>openTaskEndModal(domain,idx));
        actions.appendChild(stopBtn);
      } else if(!activeTask) {
        const startBtn=document.createElement('button');
        startBtn.className='task-action-btn start-btn';
        startBtn.textContent='▶ Start';
        startBtn.style.color = d.color;
        startBtn.style.borderColor = hexToRgba(d.color,.3);
        startBtn.style.background = hexToRgba(d.color,.08);
        startBtn.addEventListener('click',()=>startTask(domain,idx));
        actions.appendChild(startBtn);
      }
    }

    const del=document.createElement('button');
    del.className='task-del'; del.textContent='×';
    del.setAttribute('aria-label','Delete');
    del.addEventListener('click',()=>deleteTask(domain,idx));
    actions.appendChild(del);

    cb.addEventListener('change',()=>{
      if(task.done) { toggleTask(domain,idx); return; }
      if(activeTask&&activeTask.domain===domain&&activeTask.idx===idx) openTaskEndModal(domain,idx);
      else toggleTask(domain,idx);
    });

    li.appendChild(cb); li.appendChild(span); li.appendChild(timeSpan); li.appendChild(actions);
    list.appendChild(li);
  });
  updateProgress(domain);
}

function addTask(domain) {
  const input=document.getElementById(domain+'-task-input');
  if(!input) return;
  const raw=input.value.trim(); if(!raw) return;
  const safe=raw.replace(/[<>"'&]/g,c=>({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;','&':'&amp;'}[c]));
  const tasks=getTasks(domain);
  tasks.push({text:safe,done:false,created:Date.now(),startTime:null,endTime:null,focusMin:null,breakMin:null,notes:''});
  setTasks(domain,tasks); renderTasks(domain,tasks);
  input.value=''; input.focus();
  showToast('Task added');
}

function toggleTask(domain,idx) {
  const tasks=getTasks(domain); tasks[idx].done=!tasks[idx].done;
  setTasks(domain,tasks); renderTasks(domain,tasks);
}
function deleteTask(domain,idx) {
  if(activeTask&&activeTask.domain===domain&&activeTask.idx===idx) stopTimer();
  const tasks=getTasks(domain); tasks.splice(idx,1);
  setTasks(domain,tasks); renderTasks(domain,tasks); showToast('Task removed');
}

/* ════════════════════════════════════════════
   TASK TIMER
════════════════════════════════════════════ */
function startTask(domain,idx) {
  if(activeTask) { showToast('Finish your current task first.','error'); return; }
  const tasks=getTasks(domain); tasks[idx].startTime=Date.now();
  setTasks(domain,tasks); activeTask={domain,idx,startTime:Date.now()};
  Store.set('active_task',activeTask); startTimerUI(domain,idx); renderTasks(domain,tasks);
  showToast('Timer started ▶');
}
function startTimerUI(domain,idx) {
  const tasks=getTasks(domain); const task=tasks[idx];
  const bar=document.getElementById(domain+'-active-timer'); if(!bar) return;
  bar.classList.remove('hidden'); clearInterval(timerInterval);
  timerInterval=setInterval(()=>{
    const elapsed=Math.floor((Date.now()-activeTask.startTime)/1000);
    const m=Math.floor(elapsed/60), s=elapsed%60;
    bar.innerHTML=`<span class="timer-dot" style="background:currentColor"></span><span class="timer-label"><strong>${Store.esc(task.text)}</strong> — running ${m}m ${String(s).padStart(2,'0')}s</span><button class="timer-stop-btn" onclick="openTaskEndModal('${domain}',${idx})">■ Stop</button>`;
  },1000);
}
function stopTimer() {
  clearInterval(timerInterval);
  if(activeTask) document.getElementById(activeTask.domain+'-active-timer')?.classList.add('hidden');
  activeTask=null; Store.set('active_task',null);
}
function restoreActiveTimer() {
  const saved=Store.get('active_task',null);
  if(saved&&saved.startTime) {
    activeTask=saved; const tasks=getTasks(saved.domain);
    if(tasks[saved.idx]&&!tasks[saved.idx].done) { startTimerUI(saved.domain,saved.idx); renderTasks(saved.domain,tasks); }
    else { Store.set('active_task',null); activeTask=null; }
  }
}
function openTaskEndModal(domain,idx) {
  const tasks=getTasks(domain); const task=tasks[idx];
  pendingComplete={domain,idx};
  const elapsed=task.startTime?Math.floor((Date.now()-task.startTime)/60000):0;
  document.getElementById('modal-task-name').textContent=task.text;
  document.getElementById('modal-time-stats').innerHTML=`<div class="modal-stat"><span>${elapsed}m</span><small>Total time</small></div><div class="modal-stat"><span>${formatTime(task.startTime||Date.now())}</span><small>Started at</small></div><div class="modal-stat"><span>${formatTime(Date.now())}</span><small>Ending now</small></div>`;
  document.getElementById('modal-notes').value=''; document.getElementById('modal-break').value='0';
  document.getElementById('task-end-modal').classList.remove('hidden');
}
function closeTaskModal() { document.getElementById('task-end-modal').classList.add('hidden'); pendingComplete=null; }
function confirmTaskEnd() {
  if(!pendingComplete) return;
  const {domain,idx}=pendingComplete; const tasks=getTasks(domain); const task=tasks[idx];
  const breakMin=parseInt(document.getElementById('modal-break').value)||0;
  const notes=document.getElementById('modal-notes').value.trim();
  const totalMin=task.startTime?Math.floor((Date.now()-task.startTime)/60000):0;
  const focusMin=Math.max(0,totalMin-breakMin);
  task.done=true; task.endTime=Date.now(); task.focusMin=focusMin; task.breakMin=breakMin; task.completionNotes=notes;
  const records=Store.get('time_records',[]);
  records.push({domain,taskText:task.text,startTime:task.startTime,endTime:task.endTime,totalMin,focusMin,breakMin,notes,date:new Date().toLocaleDateString('en-IN'),ts:Date.now()});
  Store.set('time_records',records.slice(-500));
  setTasks(domain,tasks); stopTimer(); renderTasks(domain,tasks); closeTaskModal(); renderDashboard();
  showToast(`✓ Done! ${focusMin}m focus, ${breakMin}m breaks`);
}
function formatTime(ts) { if(!ts) return '--'; return new Date(ts).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}); }

/* ════════════════════════════════════════════
   PROGRESS
════════════════════════════════════════════ */
function getProgress(domain) { const t=getTasks(domain); if(!t.length) return 0; return Math.round((t.filter(x=>x.done).length/t.length)*100); }
function updateProgress(domain) {
  const pct=getProgress(domain);
  const bar=document.getElementById(domain+'-big-bar'); const badge=document.getElementById(domain+'-pct-badge');
  if(bar) bar.style.width=pct+'%'; if(badge) badge.textContent=pct+'%';
}

/* ════════════════════════════════════════════
   NOTES & GOALS
════════════════════════════════════════════ */
function loadNotes(domain){const el=document.getElementById(domain+'-notes');if(el)el.value=Store.get('notes_'+domain,'');}
function saveNotes(domain){const el=document.getElementById(domain+'-notes');if(!el)return;Store.set('notes_'+domain,el.value);showToast('Notes saved ✓');}
function loadGoals(domain){const el=document.getElementById(domain+'-goals');if(el)el.value=Store.get('goals_'+domain,'');}
function saveToday(domain){
  const el=document.getElementById(domain+'-today');
  if(!el||!el.value.trim()){showToast('Nothing to save.','error');return;}
  const logs=Store.get('today_'+domain,[]);
  logs.unshift({text:el.value.trim(),date:new Date().toLocaleDateString('en-IN'),ts:Date.now()});
  Store.set('today_'+domain,logs.slice(0,30)); Store.set('draft_today_'+domain,'');
  el.value=''; showToast('Entry saved ✓'); updateStreak(); renderDashboard();
}
function initAutoSave(){
  domainIds().forEach(d=>{
    document.getElementById(d+'-notes')?.addEventListener('input',debounce(()=>Store.set('notes_'+d,document.getElementById(d+'-notes')?.value||''),1000));
    document.getElementById(d+'-goals')?.addEventListener('input',debounce(()=>Store.set('goals_'+d,document.getElementById(d+'-goals')?.value||''),1000));
    document.getElementById(d+'-today')?.addEventListener('input',debounce(()=>Store.set('draft_today_'+d,document.getElementById(d+'-today')?.value||''),500));
    document.getElementById(d+'-task-input')?.addEventListener('input',debounce(()=>Store.set('draft_task_'+d,document.getElementById(d+'-task-input')?.value||''),500));
  });
  document.getElementById('daily-entry-text')?.addEventListener('input',debounce(()=>Store.set('draft_daily',document.getElementById('daily-entry-text').value),500));
}
function loadDrafts(domain){
  const today=document.getElementById(domain+'-today'); const taskInput=document.getElementById(domain+'-task-input');
  if(today) today.value=Store.get('draft_today_'+domain,'');
  if(taskInput) taskInput.value=Store.get('draft_task_'+domain,'');
  const daily=document.getElementById('daily-entry-text'); if(daily) daily.value=Store.get('draft_daily','');
}

/* ════════════════════════════════════════════
   DAILY LOG
════════════════════════════════════════════ */
let selectedTag = null;

function initTagButtons(){
  if(!selectedTag) { const ids=domainIds(); selectedTag=ids[0]||'general'; }
  buildDailyTagRow();
}
function setTag(tag) {
  selectedTag=tag;
  document.querySelectorAll('.tag-btn').forEach(b=>b.classList.toggle('active',b.dataset.tag===tag));
}
function saveDailyLog(){
  const el=document.getElementById('daily-entry-text'); const hrs=document.getElementById('daily-hours');
  if(!el||!el.value.trim()){showToast('Write something first.','error');return;}
  const logs=Store.get('daily_logs',[]);
  logs.unshift({text:el.value.trim(),tag:selectedTag,hours:parseFloat(hrs?.value||1),date:new Date().toLocaleDateString('en-IN'),ts:Date.now()});
  Store.set('daily_logs',logs.slice(0,365)); Store.set('draft_daily','');
  el.value=''; showToast('Log saved ✓'); renderDailyLog(); updateStreak(); renderDashboard();
}
function renderDailyLog(){
  const c=document.getElementById('daily-log-list'); if(!c) return;
  const logs=Store.get('daily_logs',[]);
  if(!logs.length){c.innerHTML='<p class="empty-msg">No entries yet.</p>';return;}
  c.innerHTML=logs.map(l=>`<div class="log-entry"><div class="log-entry-header"><span class="log-tag" style="${tagStyle(l.tag)}">${tagLabel(l.tag)}</span><span class="log-date">${l.date}</span><span class="log-hours">${l.hours}h</span></div><p class="log-text">${Store.esc(l.text)}</p></div>`).join('');
}
function tagLabel(t){ if(t==='general') return '✦ General'; const d=domainById(t); return `${d.icon} ${d.name}`; }
function tagStyle(t){ if(t==='general') return 'background:rgba(200,184,154,.1);color:var(--accent)'; const d=domainById(t); return `background:${hexToRgba(d.color,.12)};color:${d.color}`; }

/* ════════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════════ */
function renderDashboard(){
  domainIds().forEach(d=>{
    const pct=getProgress(d), tasks=getTasks(d), done=tasks.filter(t=>t.done).length;
    const bar=document.getElementById('dash-'+d+'-bar'); const pctEl=document.getElementById('dash-'+d+'-pct'); const meta=document.getElementById('dash-'+d+'-meta');
    if(bar) bar.style.width=pct+'%'; if(pctEl) pctEl.textContent=pct+'%';
    if(meta) meta.textContent=`${done} of ${tasks.length} tasks completed`;
  });
  const allTasks=domainIds().flatMap(d=>getTasks(d));
  document.getElementById('stat-tasks').textContent=allTasks.filter(t=>t.done).length;
  const logs=Store.get('daily_logs',[]);
  document.getElementById('stat-logs').textContent=new Set(logs.map(l=>l.date)).size;
  const streak=calcStreak();
  document.getElementById('stat-streak').textContent=streak+'🔥';
  document.getElementById('sidebar-streak').textContent=streak;
  const today=new Date().toLocaleDateString('en-IN');
  const records=Store.get('time_records',[]);
  const todayFocus=records.filter(r=>r.date===today).reduce((s,r)=>s+r.focusMin,0);
  const focusEl=document.getElementById('stat-focus');
  if(focusEl) focusEl.textContent=todayFocus>=60?Math.round(todayFocus/60*10)/10+'h':todayFocus+'m';
  renderRecentLogs();
}
function renderRecentLogs(){
  const c=document.getElementById('recent-logs-list'); if(!c) return;
  const logs=Store.get('daily_logs',[]).slice(0,5);
  if(!logs.length){c.innerHTML='<p class="empty-msg">No entries yet.</p>';return;}
  c.innerHTML=logs.map(l=>`<div class="recent-log-row"><span class="log-tag" style="${tagStyle(l.tag)}">${tagLabel(l.tag)}</span><span class="recent-log-text">${Store.esc(l.text).substring(0,90)}${l.text.length>90?'…':''}</span><span class="log-date">${l.date}</span></div>`).join('');
}

/* ════════════════════════════════════════════
   STREAK
════════════════════════════════════════════ */
function calcStreak(){
  const days=[...new Set(Store.get('daily_logs',[]).map(l=>l.date))]; if(!days.length) return 0;
  let streak=0, check=new Date();
  for(let i=0;i<365;i++){const label=check.toLocaleDateString('en-IN');if(days.includes(label)){streak++;check.setDate(check.getDate()-1);}else{if(i===0){check.setDate(check.getDate()-1);continue;}break;}}
  return streak;
}
function updateStreak(){document.getElementById('sidebar-streak').textContent=calcStreak();}

/* ════════════════════════════════════════════
   ANALYTICS CHARTS
════════════════════════════════════════════ */
let charts={};
function renderCharts(){ renderDailyFocusChart(); renderDomainPieChart(); renderTasksBarChart(); renderCumulativeChart(); renderHeatmap(); renderWeeklyGoalRing(); renderTimeBreakdown(); loadReminderStatus(); }

function renderDailyFocusChart(){
  const ctx=document.getElementById('chart-daily-focus'); if(!ctx) return;
  const records=Store.get('time_records',[]); const labels=[],data=[];
  for(let i=13;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const label=d.toLocaleDateString('en-IN');labels.push(d.toLocaleDateString('en-IN',{day:'numeric',month:'short'}));data.push(Math.round(records.filter(r=>r.date===label).reduce((s,r)=>s+r.focusMin,0)/60*100)/100);}
  if(charts.daily) charts.daily.destroy();
  charts.daily=new Chart(ctx,{type:'bar',data:{labels,datasets:[{label:'Focus Hours',data,backgroundColor:'rgba(126,203,174,0.25)',borderColor:'#7ecbae',borderWidth:2,borderRadius:6}]},options:{responsive:true,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.raw}h focus`}}},scales:{x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#5e5c58',font:{family:'DM Sans',size:11}}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#5e5c58',font:{family:'DM Sans',size:11}},beginAtZero:true}}}});
}
function renderDomainPieChart(){
  const ctx=document.getElementById('chart-domain-pie'); if(!ctx) return;
  const records=Store.get('time_records',[]); const domains=getDomains();
  const totals=domains.map(d=>records.filter(r=>r.domain===d.id).reduce((s,r)=>s+r.focusMin,0));
  if(charts.pie) charts.pie.destroy();
  charts.pie=new Chart(ctx,{type:'doughnut',data:{labels:domains.map(d=>d.name),datasets:[{data:totals,backgroundColor:domains.map(d=>hexToRgba(d.color,.7)),borderColor:domains.map(d=>d.color),borderWidth:2,hoverOffset:6}]},options:{responsive:true,plugins:{legend:{labels:{color:'#9e9b96',font:{family:'DM Sans',size:12},padding:16}},tooltip:{callbacks:{label:c=>`${c.label}: ${Math.round(c.raw/60*10)/10}h`}}},cutout:'68%'}});
}
function renderTasksBarChart(){
  const ctx=document.getElementById('chart-tasks-bar'); if(!ctx) return;
  const domains=getDomains();
  const done=domains.map(d=>getTasks(d.id).filter(t=>t.done).length);
  const pending=domains.map(d=>getTasks(d.id).filter(t=>!t.done).length);
  if(charts.tasks) charts.tasks.destroy();
  charts.tasks=new Chart(ctx,{type:'bar',data:{labels:domains.map(d=>d.name),datasets:[{label:'Done',data:done,backgroundColor:domains.map(d=>hexToRgba(d.color,.6)),borderColor:domains.map(d=>d.color),borderWidth:1,borderRadius:4},{label:'Pending',data:pending,backgroundColor:'rgba(90,90,95,0.4)',borderColor:'#3a3a3e',borderWidth:1,borderRadius:4}]},options:{responsive:true,plugins:{legend:{labels:{color:'#9e9b96',font:{family:'DM Sans',size:12}}}},scales:{x:{stacked:false,grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#5e5c58',font:{family:'DM Sans',size:12}}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#5e5c58',font:{family:'DM Sans',size:12}},beginAtZero:true}}}});
}
function renderCumulativeChart(){
  const ctx=document.getElementById('chart-cumulative'); if(!ctx) return;
  const records=Store.get('time_records',[]).sort((a,b)=>a.ts-b.ts); if(!records.length){if(charts.cumulative)charts.cumulative.destroy();return;}
  const labels=[],data=[]; let running=0;
  records.forEach(r=>{running+=r.focusMin/60;labels.push(r.date);data.push(Math.round(running*10)/10);});
  if(charts.cumulative) charts.cumulative.destroy();
  charts.cumulative=new Chart(ctx,{type:'line',data:{labels,datasets:[{label:'Total Focus Hours',data,borderColor:'#c8b89a',backgroundColor:'rgba(200,184,154,0.08)',borderWidth:2,pointRadius:0,fill:true,tension:0.4}]},options:{responsive:true,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.raw}h total`}}},scales:{x:{display:false},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#5e5c58',font:{family:'DM Sans',size:11}},beginAtZero:true}}}});
}
function renderHeatmap(){
  const container=document.getElementById('heatmap-container'); if(!container) return;
  const records=Store.get('time_records',[]); const dayMap={};
  records.forEach(r=>{dayMap[r.date]=(dayMap[r.date]||0)+r.focusMin/60;});
  const cells=[]; for(let i=83;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const label=d.toLocaleDateString('en-IN');cells.push({label,hours:dayMap[label]||0});}
  const cols=[]; for(let i=0;i<cells.length;i+=7) cols.push(cells.slice(i,i+7));
  const maxH=Math.max(...cells.map(c=>c.hours),1);
  const colors=['var(--bg3)','rgba(126,203,174,0.2)','rgba(126,203,174,0.4)','rgba(126,203,174,0.65)','rgba(126,203,174,0.9)'];
  container.innerHTML='';
  cols.forEach(col=>{const colEl=document.createElement('div');colEl.className='heatmap-col';col.forEach(cell=>{const el=document.createElement('div');el.className='heatmap-cell';el.style.background=colors[cell.hours===0?0:Math.ceil((cell.hours/maxH)*4)];el.title=`${cell.label}: ${Math.round(cell.hours*10)/10}h`;colEl.appendChild(el);});container.appendChild(colEl);});
  const legend=document.querySelector('.heatmap-legend-boxes');
  if(legend){legend.innerHTML='';colors.forEach(c=>{const s=document.createElement('span');s.style.background=c;s.style.width='12px';s.style.height='12px';s.style.borderRadius='2px';s.style.display='block';legend.appendChild(s);});}
}
function renderWeeklyGoalRing(){
  const ctx=document.getElementById('chart-weekly-goal'); if(!ctx) return;
  const goal=Store.get('weekly_goal',10); const inp=document.getElementById('weekly-goal-input'); if(inp) inp.value=goal;
  document.getElementById('goal-ring-target').textContent=goal;
  const records=Store.get('time_records',[]); const now=new Date();
  const weekStart=new Date(now); weekStart.setDate(now.getDate()-now.getDay()+1); weekStart.setHours(0,0,0,0);
  const weekMins=records.filter(r=>r.ts>=weekStart.getTime()).reduce((s,r)=>s+r.focusMin,0);
  const weekHours=Math.round(weekMins/60*10)/10; const pct=Math.min(weekHours/goal,1);
  document.getElementById('goal-ring-val').textContent=weekHours+'h';
  if(charts.goalRing) charts.goalRing.destroy();
  charts.goalRing=new Chart(ctx,{type:'doughnut',data:{datasets:[{data:[pct,1-pct],backgroundColor:[pct>=1?'rgba(126,203,174,0.9)':'rgba(126,203,174,0.7)','rgba(255,255,255,0.04)'],borderWidth:0,hoverOffset:0}]},options:{responsive:false,cutout:'78%',animation:{duration:800},plugins:{legend:{display:false},tooltip:{enabled:false}}}});
}
function saveWeeklyGoal(){ const v=parseFloat(document.getElementById('weekly-goal-input')?.value)||10; Store.set('weekly_goal',v); renderWeeklyGoalRing(); showToast('Weekly goal set: '+v+'h'); }
function renderTimeBreakdown(){
  const c=document.getElementById('time-breakdown-list'); if(!c) return;
  const records=Store.get('time_records',[]).slice(0,20);
  if(!records.length){c.innerHTML='<p class="empty-msg">No timed tasks yet. Use ▶ Start on a task.</p>';return;}
  c.innerHTML=records.map(r=>`<div class="breakdown-row"><span class="log-tag" style="${tagStyle(r.domain)}">${tagLabel(r.domain)}</span><span class="breakdown-task">${Store.esc(r.taskText)}</span><div class="breakdown-stats"><span class="bstat focus">⏱ ${r.focusMin}m focus</span><span class="bstat break">☕ ${r.breakMin}m break</span><span class="bstat total">📅 ${r.date}</span></div>${r.notes?`<p class="breakdown-notes">${Store.esc(r.notes)}</p>`:''}</div>`).join('');
}

/* ════════════════════════════════════════════
   EXPORT — JSON BACKUP
════════════════════════════════════════════ */
function exportJSON(){
  const data=Store.all(); data._exported=new Date().toISOString(); data._version=2;
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;
  a.download=`focusos-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
  showToast('✓ JSON backup downloaded');
}

/* ════════════════════════════════════════════
   IMPORT — JSON RESTORE
════════════════════════════════════════════ */
function initImport(){
  const fileInput=document.getElementById('import-file-input');
  document.getElementById('btn-import-json')?.addEventListener('click',()=>fileInput?.click());
  fileInput?.addEventListener('change',e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const data=JSON.parse(ev.target.result); if(!data||typeof data!=='object') throw new Error('Invalid');
        if(confirm(`Restore backup from ${data._exported||'unknown date'}?\n\nThis will merge with your current data.`)){Store.restore(data);rebuildDomainUI();renderDashboard();renderDailyLog();showToast('✓ Data restored successfully');}
      }catch{showToast('Invalid backup file.','error');}
      fileInput.value='';
    };
    reader.readAsText(file);
  });
}

/* ════════════════════════════════════════════
   EXPORT — PDF REPORT
════════════════════════════════════════════ */
function exportPDF(){
  const today=new Date().toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const records=Store.get('time_records',[]); const logs=Store.get('daily_logs',[]); const domains=getDomains();
  const allTasks=domainIds().flatMap(d=>getTasks(d).map(t=>({...t,domain:d})));
  const totalFocusMin=records.reduce((s,r)=>s+r.focusMin,0); const streak=calcStreak();
  const focusLabels=[],focusData=[];
  for(let i=13;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const label=d.toLocaleDateString('en-IN');focusLabels.push(d.toLocaleDateString('en-IN',{day:'numeric',month:'short'}));focusData.push(Math.round(records.filter(r=>r.date===label).reduce((s,r)=>s+r.focusMin,0)/60*100)/100);}
  const focusCanvas=document.createElement('canvas');focusCanvas.width=700;focusCanvas.height=200;
  const cFocus=new Chart(focusCanvas.getContext('2d'),{type:'bar',data:{labels:focusLabels,datasets:[{label:'Focus Hours',data:focusData,backgroundColor:'rgba(126,203,174,0.5)',borderColor:'#7ecbae',borderWidth:2,borderRadius:4}]},options:{responsive:false,animation:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#555'},grid:{color:'#eee'}},y:{ticks:{color:'#555'},grid:{color:'#eee'},beginAtZero:true}}}});
  const focusImg=focusCanvas.toDataURL('image/png');cFocus.destroy();
  const domainTotals=domains.map(d=>records.filter(r=>r.domain===d.id).reduce((s,r)=>s+r.focusMin,0));
  const pieCanvas=document.createElement('canvas');pieCanvas.width=300;pieCanvas.height=300;
  const cPie=new Chart(pieCanvas.getContext('2d'),{type:'doughnut',data:{labels:domains.map(d=>d.name),datasets:[{data:domainTotals,backgroundColor:domains.map(d=>hexToRgba(d.color,.8)),borderColor:domains.map(d=>d.color),borderWidth:2}]},options:{responsive:false,animation:false,cutout:'60%',plugins:{legend:{display:true,labels:{font:{size:12}}}}}});
  const pieImg=pieCanvas.toDataURL('image/png');cPie.destroy();
  const domainHTML=domains.map(d=>{const tasks=getTasks(d.id);const done=tasks.filter(t=>t.done);const pending=tasks.filter(t=>!t.done);const dRecs=records.filter(r=>r.domain===d.id);const fMin=dRecs.reduce((s,r)=>s+r.focusMin,0);const pct=tasks.length?Math.round(done.length/tasks.length*100):0;return `<div class="pdf-domain"><div class="pdf-domain-header" style="border-left:4px solid ${d.color}"><span>${d.icon} ${d.name.toUpperCase()}</span><span>${pct}% complete</span><span>${Math.round(fMin/60*10)/10}h focused</span></div><div class="pdf-progress-bar"><div style="width:${pct}%;background:${d.color};height:6px;border-radius:3px"></div></div>${done.length?`<div class="pdf-task-section"><strong>✓ Completed (${done.length})</strong><ul>${done.map(t=>`<li>${t.text}${t.focusMin?` <em>(${t.focusMin}m focus)</em>`:''}</li>`).join('')}</ul></div>`:''}${pending.length?`<div class="pdf-task-section"><strong>○ Pending (${pending.length})</strong><ul>${pending.map(t=>`<li>${t.text}</li>`).join('')}</ul></div>`:''}${Store.get('notes_'+d.id,'')?`<div class="pdf-task-section"><strong>Notes</strong><p>${Store.esc(Store.get('notes_'+d.id,''))}</p></div>`:''}</div>`;}).join('');
  const timeHTML=records.slice(0,20).map(r=>`<tr><td>${r.date}</td><td>${r.domain.toUpperCase()}</td><td>${r.taskText}</td><td>${r.focusMin}m</td><td>${r.breakMin}m</td><td>${r.notes||'—'}</td></tr>`).join('');
  const logHTML=logs.slice(0,10).map(l=>`<div class="pdf-log-entry"><span class="pdf-log-tag">${tagLabel(l.tag)}</span><span class="pdf-log-date">${l.date} · ${l.hours}h</span><p>${Store.esc(l.text)}</p></div>`).join('');
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Focus OS Report</title><style>@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'DM Sans',sans-serif;background:#fff;color:#1a1a1a;font-size:13px;line-height:1.6;}.cover{background:#0f0f10;color:#e8e6e1;padding:56px 48px;}.cover h1{font-family:'DM Serif Display',serif;font-size:36px;font-weight:400;color:#c8b89a;margin-bottom:8px;}.cover p{color:#9e9b96;font-size:14px;}.stats-bar{display:flex;gap:0;border-bottom:1px solid #eee;}.stat{flex:1;padding:20px 24px;text-align:center;border-right:1px solid #eee;}.stat:last-child{border-right:none;}.stat .val{font-family:'DM Serif Display',serif;font-size:28px;color:#1a1a1a;display:block;}.stat .lbl{font-size:11px;color:#888;letter-spacing:0.06em;text-transform:uppercase;}.section{padding:32px 48px;border-bottom:1px solid #eee;}.section-title{font-family:'DM Serif Display',serif;font-size:18px;font-weight:400;margin-bottom:20px;color:#1a1a1a;}.pdf-domain{margin-bottom:28px;padding:20px;background:#f9f9f9;border-radius:8px;}.pdf-domain-header{display:flex;justify-content:space-between;font-weight:500;margin-bottom:10px;font-size:13px;}.pdf-progress-bar{background:#e5e5e5;border-radius:3px;height:6px;margin-bottom:14px;}.pdf-task-section{margin-top:12px;}.pdf-task-section strong{font-size:12px;color:#555;display:block;margin-bottom:4px;}.pdf-task-section ul{padding-left:16px;}.pdf-task-section li{margin-bottom:2px;font-size:12px;}.pdf-task-section em{color:#888;font-size:11px;}.pdf-task-section p{font-size:12px;color:#444;margin-top:4px;}table{width:100%;border-collapse:collapse;font-size:12px;}th{background:#f0f0f0;padding:8px 12px;text-align:left;font-weight:500;color:#555;font-size:11px;text-transform:uppercase;}td{padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#333;}.pdf-log-entry{margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #f0f0f0;}.pdf-log-tag{font-size:11px;font-weight:500;background:#f0f0f0;padding:2px 8px;border-radius:20px;margin-right:8px;}.pdf-log-date{font-size:11px;color:#888;}.pdf-log-entry p{margin-top:6px;color:#444;font-size:12px;}.footer{padding:24px 48px;text-align:center;font-size:11px;color:#aaa;background:#fafafa;}img{max-width:100%;border-radius:6px;}</style></head><body><div class="cover"><h1>Focus OS — Progress Report</h1><p>Generated on ${today}</p></div><div class="stats-bar"><div class="stat"><span class="val">${allTasks.filter(t=>t.done).length}</span><span class="lbl">Tasks Done</span></div><div class="stat"><span class="val">${allTasks.filter(t=>!t.done).length}</span><span class="lbl">Pending</span></div><div class="stat"><span class="val">${Math.round(totalFocusMin/60*10)/10}h</span><span class="lbl">Total Focus</span></div><div class="stat"><span class="val">${streak}🔥</span><span class="lbl">Day Streak</span></div><div class="stat"><span class="val">${new Set(logs.map(l=>l.date)).size}</span><span class="lbl">Days Logged</span></div></div><div class="section"><h2 class="section-title">Domain Progress</h2>${domainHTML}</div><div class="section"><h2 class="section-title">Focus Charts</h2><img src="${focusImg}" alt="Focus chart" style="width:100%;" /><div style="display:flex;justify-content:center;margin-top:20px;"><img src="${pieImg}" alt="Domain split" style="max-width:220px;" /></div></div>${timeHTML?`<div class="section"><h2 class="section-title">Task Time Records</h2><table><thead><tr><th>Date</th><th>Domain</th><th>Task</th><th>Focus</th><th>Break</th><th>Notes</th></tr></thead><tbody>${timeHTML}</tbody></table></div>`:''}${logHTML?`<div class="section"><h2 class="section-title">Daily Logs</h2>${logHTML}</div>`:''}<div class="footer">Focus OS · Exported ${new Date().toISOString()} · Keep building.</div></body></html>`;
  const w=window.open('','_blank');w.document.write(html);w.document.close();setTimeout(()=>w.print(),800);
}

/* ════════════════════════════════════════════
   WEEKLY / MONTHLY REPORTS
════════════════════════════════════════════ */
let _reportMode='weekly', _uploadedReportData=null;
function openWeeklyReport(){_reportMode='weekly';_uploadedReportData=null;if(checkReportData('weekly'))generateReport('weekly',Store.all());else openUploadModal('Weekly Report');}
function openMonthlyReport(){_reportMode='monthly';_uploadedReportData=null;if(checkReportData('monthly'))generateReport('monthly',Store.all());else openUploadModal('Monthly Report');}
function checkReportData(mode){const records=Store.get('time_records',[]);const now=new Date();if(mode==='weekly'){const ws=new Date(now);ws.setDate(now.getDate()-7);ws.setHours(0,0,0,0);return records.some(r=>r.ts>=ws.getTime());}else{const ms=new Date(now.getFullYear(),now.getMonth(),1);return records.some(r=>r.ts>=ms.getTime());}}
function openUploadModal(title){document.getElementById('upload-modal-title').textContent=title;document.getElementById('upload-file-name').textContent='No file selected';document.getElementById('upload-report-file').value='';_uploadedReportData=null;document.getElementById('upload-report-modal').classList.remove('hidden');}
function closeUploadModal(){document.getElementById('upload-report-modal').classList.add('hidden');_uploadedReportData=null;}
function generateReportWithUpload(){if(!_uploadedReportData){showToast('Please select a JSON file first.','error');return;}closeUploadModal();generateReport(_reportMode,_uploadedReportData);}
function generateReportCurrentData(){closeUploadModal();generateReport(_reportMode,Store.all());}
function initUploadModal(){
  const fi=document.getElementById('upload-report-file');const dz=document.getElementById('upload-drop-zone');const ne=document.getElementById('upload-file-name');
  fi?.addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{try{_uploadedReportData=JSON.parse(ev.target.result);ne.textContent='✓ '+f.name;dz.style.borderColor='var(--accent)';}catch{showToast('Invalid JSON.','error');}};r.readAsText(f);});
  dz?.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('drag-over');});dz?.addEventListener('dragleave',()=>dz.classList.remove('drag-over'));
  dz?.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('drag-over');const f=e.dataTransfer.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{try{_uploadedReportData=JSON.parse(ev.target.result);document.getElementById('upload-file-name').textContent='✓ '+f.name;dz.style.borderColor='var(--accent)';}catch{showToast('Invalid JSON.','error');}};r.readAsText(f);});
}
function generateReport(mode,data){
  const getD=(k,fb)=>{try{return data[k]!==undefined?data[k]:fb;}catch{return fb;}};
  const records=getD('time_records',[]);const logs=getD('daily_logs',[]);const domains=getDomains();const now=new Date();
  let periodStart,periodLabel,dateRangeLabel;
  if(mode==='weekly'){periodStart=new Date(now);periodStart.setDate(now.getDate()-6);periodStart.setHours(0,0,0,0);periodLabel='Weekly Report';const opts={month:'short',day:'numeric'};dateRangeLabel=periodStart.toLocaleDateString('en-IN',opts)+' – '+now.toLocaleDateString('en-IN',opts);}
  else{periodStart=new Date(now.getFullYear(),now.getMonth(),1);periodLabel='Monthly Report';dateRangeLabel=now.toLocaleDateString('en-IN',{month:'long',year:'numeric'});}
  const startTs=periodStart.getTime();
  const pRecs=records.filter(r=>r.ts>=startTs);
  const pLogs=logs.filter(l=>{try{const p=l.date.split('/');const d=new Date(parseInt(p[2]),parseInt(p[1])-1,parseInt(p[0]));return d.getTime()>=startTs;}catch{return false;}});
  const totalFocusMin=pRecs.reduce((s,r)=>s+r.focusMin,0);const daysActive=new Set(pRecs.map(r=>r.date)).size;
  const domainFocus={};domains.forEach(d=>{domainFocus[d.id]=pRecs.filter(r=>r.domain===d.id).reduce((s,r)=>s+r.focusMin,0);});
  const dayCount=mode==='weekly'?7:now.getDate();const dHours=[],dLabels=[];
  for(let i=dayCount-1;i>=0;i--){const d=new Date(now);d.setDate(now.getDate()-i);d.setHours(0,0,0,0);const label=d.toLocaleDateString('en-IN');dLabels.push(d.toLocaleDateString('en-IN',{day:'numeric',month:'short'}));const mins=pRecs.filter(r=>r.date===label).reduce((s,r)=>s+r.focusMin,0);dHours.push(Math.round(mins/60*100)/100);}
  const offC=document.createElement('canvas');offC.width=700;offC.height=200;
  const tc=new Chart(offC.getContext('2d'),{type:'bar',data:{labels:dLabels,datasets:[{label:'Focus Hours',data:dHours,backgroundColor:'rgba(126,203,174,0.5)',borderColor:'#7ecbae',borderWidth:2,borderRadius:4}]},options:{responsive:false,animation:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#555',font:{size:11}},grid:{color:'#eee'}},y:{ticks:{color:'#555',font:{size:11}},grid:{color:'#eee'},beginAtZero:true}}}});
  const cImgSrc=offC.toDataURL('image/png');tc.destroy();
  const pC=document.createElement('canvas');pC.width=300;pC.height=300;
  const tp=new Chart(pC.getContext('2d'),{type:'doughnut',data:{labels:domains.map(d=>d.name),datasets:[{data:domains.map(d=>domainFocus[d.id]),backgroundColor:domains.map(d=>hexToRgba(d.color,.8)),borderColor:domains.map(d=>d.color),borderWidth:2}]},options:{responsive:false,animation:false,cutout:'60%',plugins:{legend:{display:true,labels:{font:{size:12}}}}}});
  const pImgSrc=pC.toDataURL('image/png');tp.destroy();
  const domainHTML=domains.map(d=>{const mins=domainFocus[d.id];return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;"><span style="color:${d.color};font-size:16px;">${d.icon}</span><span style="font-weight:500;width:80px;">${d.name}</span><div style="flex:1;background:#eee;border-radius:4px;height:8px;"><div style="width:${totalFocusMin?Math.round(mins/totalFocusMin*100):0}%;background:${d.color};height:8px;border-radius:4px;"></div></div><span style="font-size:13px;color:#555;width:50px;text-align:right;">${Math.round(mins/60*10)/10}h</span></div>`;}).join('');
  const logHTML=pLogs.slice(0,15).map(l=>`<div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #f0f0f0;"><div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;"><span style="font-size:11px;background:#f0f0f0;padding:2px 8px;border-radius:20px;">${tagLabel(l.tag)}</span><span style="font-size:11px;color:#888;">${l.date} · ${l.hours}h</span></div><p style="font-size:13px;color:#444;">${Store.esc(l.text)}</p></div>`).join('');
  const timeHTML=pRecs.slice(0,20).map(r=>`<tr><td>${r.date}</td><td>${r.domain.toUpperCase()}</td><td>${Store.esc(r.taskText)}</td><td>${r.focusMin}m</td><td>${r.breakMin}m</td><td>${r.notes?Store.esc(r.notes):'—'}</td></tr>`).join('');
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Focus OS ${periodLabel}</title><style>@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'DM Sans',sans-serif;background:#fff;color:#1a1a1a;font-size:13px;line-height:1.6;}.cover{background:#0f0f10;color:#e8e6e1;padding:48px;}.cover h1{font-family:'DM Serif Display',serif;font-size:32px;font-weight:400;color:#c8b89a;margin-bottom:6px;}.cover .badge{display:inline-block;background:rgba(200,184,154,.15);border:1px solid rgba(200,184,154,.3);color:#c8b89a;padding:4px 14px;border-radius:20px;font-size:12px;margin-bottom:10px;}.cover p{color:#9e9b96;font-size:14px;}.stats-bar{display:flex;gap:0;border-bottom:1px solid #eee;}.stat{flex:1;padding:18px 24px;text-align:center;border-right:1px solid #eee;}.stat:last-child{border-right:none;}.stat .val{font-family:'DM Serif Display',serif;font-size:26px;color:#1a1a1a;display:block;}.stat .lbl{font-size:11px;color:#888;letter-spacing:.06em;text-transform:uppercase;}.section{padding:28px 48px;border-bottom:1px solid #eee;}.section-title{font-family:'DM Serif Display',serif;font-size:18px;font-weight:400;margin-bottom:18px;}img{max-width:100%;border-radius:6px;}table{width:100%;border-collapse:collapse;font-size:12px;}th{background:#f0f0f0;padding:8px 12px;text-align:left;font-weight:500;color:#555;font-size:11px;text-transform:uppercase;}td{padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#333;}.footer{padding:20px 48px;text-align:center;font-size:11px;color:#aaa;background:#fafafa;}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:start;}@media print{.section{padding:20px 32px;}}</style></head><body><div class="cover"><div class="badge">${mode==='weekly'?'📊 Weekly':'📅 Monthly'}</div><h1>Focus OS — ${periodLabel}</h1><p>${dateRangeLabel}</p></div><div class="stats-bar"><div class="stat"><span class="val">${Math.round(totalFocusMin/60*10)/10}h</span><span class="lbl">Focus Time</span></div><div class="stat"><span class="val">${daysActive}</span><span class="lbl">Active Days</span></div><div class="stat"><span class="val">${pRecs.length}</span><span class="lbl">Sessions</span></div><div class="stat"><span class="val">${pLogs.length}</span><span class="lbl">Log Entries</span></div><div class="stat"><span class="val">${daysActive?(Math.round(totalFocusMin/daysActive)/60*10/10).toFixed(1)+'h':'—'}</span><span class="lbl">Avg / Day</span></div></div><div class="section"><h2 class="section-title">Daily Focus Hours</h2><img src="${cImgSrc}" /></div><div class="section"><h2 class="section-title">Domain Breakdown</h2><div class="two-col"><div>${domainHTML}</div><div style="text-align:center;"><img src="${pImgSrc}" style="max-width:200px;margin:0 auto;" /></div></div></div>${timeHTML?`<div class="section"><h2 class="section-title">Session Log</h2><table><thead><tr><th>Date</th><th>Domain</th><th>Task</th><th>Focus</th><th>Break</th><th>Notes</th></tr></thead><tbody>${timeHTML}</tbody></table></div>`:''}${logHTML?`<div class="section"><h2 class="section-title">Daily Logs</h2>${logHTML}</div>`:''}<div class="footer">Focus OS · ${periodLabel} · Generated ${new Date().toISOString()} · Keep building.</div></body></html>`;
  const w=window.open('','_blank');w.document.write(html);w.document.close();setTimeout(()=>w.print(),900);
}

/* ════════════════════════════════════════════
   EXPORT BUTTONS
════════════════════════════════════════════ */
function initExportButtons(){
  document.getElementById('btn-export-json')?.addEventListener('click',exportJSON);
  document.getElementById('btn-export-pdf')?.addEventListener('click',exportPDF);
  document.getElementById('export-json-side')?.addEventListener('click',exportJSON);
  document.getElementById('export-pdf-side')?.addEventListener('click',exportPDF);
  document.getElementById('btn-weekly-report')?.addEventListener('click',openWeeklyReport);
  document.getElementById('btn-monthly-report')?.addEventListener('click',openMonthlyReport);
}

/* ════════════════════════════════════════════
   REMINDER
════════════════════════════════════════════ */
function saveReminderTime(){const t=document.getElementById('reminder-time')?.value;if(!t)return;Store.set('reminder_time',t);showToast('Reminder set for '+t);loadReminderStatus();}
function clearReminder(){Store.set('reminder_time',null);const s=document.getElementById('reminder-status');if(s)s.textContent='No reminder set.';showToast('Reminder cleared');}
function loadReminderStatus(){const t=Store.get('reminder_time',null);const s=document.getElementById('reminder-status');const inp=document.getElementById('reminder-time');if(t){if(s)s.textContent=`Reminder active at ${t} daily.`;if(inp)inp.value=t;}else{if(s)s.textContent='No reminder set.';}}
function initReminderCheck(){loadReminderStatus();setInterval(()=>{const t=Store.get('reminder_time',null);if(!t)return;const now=new Date();const [h,m]=t.split(':').map(Number);if(now.getHours()===h&&now.getMinutes()===m){const last=Store.get('reminder_last_shown',null);const todayKey=now.toLocaleDateString('en-IN');if(last!==todayKey){document.getElementById('reminder-popup')?.classList.remove('hidden');Store.set('reminder_last_shown',todayKey);}}},30000);}
function closeReminder(){document.getElementById('reminder-popup')?.classList.add('hidden');}

/* ════════════════════════════════════════════
   SECTION MANAGER
════════════════════════════════════════════ */
let _pendingDeleteId = null;

function initSectionManager() {
  document.getElementById('manage-sections-btn')?.addEventListener('click', openSectionManager);
  document.getElementById('section-manager-modal')?.addEventListener('click', e=>{
    if(e.target.id==='section-manager-modal') closeSectionManager();
  });
  document.getElementById('sm-name-input')?.addEventListener('keydown', e=>{ if(e.key==='Enter') addSection(); });
}

function openSectionManager() {
  renderSectionManagerList();
  document.getElementById('section-manager-modal').classList.remove('hidden');
  closeSidebar();
}
function closeSectionManager() {
  document.getElementById('section-manager-modal').classList.add('hidden');
  const n=document.getElementById('sm-name-input'); if(n) n.value='';
  const ic=document.getElementById('sm-icon-input'); if(ic) ic.value='';
}

function renderSectionManagerList() {
  const list = document.getElementById('sm-sections-list');
  const domains = getDomains();
  if(!domains.length) {
    list.innerHTML='<p style="font-size:13px;color:var(--text3);text-align:center;padding:12px;">No sections. Add one below.</p>';
    return;
  }
  list.innerHTML = domains.map(d=>`
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;">
      <span style="font-size:20px;line-height:1;">${d.icon}</span>
      <span style="flex:1;font-size:14px;font-weight:500;">${Store.esc(d.name)}</span>
      <span style="width:14px;height:14px;border-radius:50%;background:${d.color};display:inline-block;flex-shrink:0;border:1px solid rgba(255,255,255,.15)"></span>
      <button onclick="promptDeleteSection('${d.id}')" style="background:none;border:1px solid rgba(232,126,126,.25);border-radius:6px;color:#e87e7e;font-size:12px;padding:4px 10px;cursor:pointer;">Remove</button>
    </div>`).join('');
}

function addSection() {
  const nameEl=document.getElementById('sm-name-input');
  const iconEl=document.getElementById('sm-icon-input');
  const colorEl=document.getElementById('sm-color-input');
  const name=nameEl.value.trim(); if(!name){showToast('Enter a section name.','error');nameEl.focus();return;}
  const icon=iconEl.value.trim()||'●';
  const color=colorEl?.value||'#c8b89a';
  const domains=getDomains();
  if(domains.find(d=>d.name.toLowerCase()===name.toLowerCase())){showToast('Section already exists.','error');return;}
  const id='d_'+name.toLowerCase().replace(/[^a-z0-9]/g,'')+'_'+Date.now().toString(36);
  domains.push({id,name,icon,color});
  setDomains(domains);
  nameEl.value=''; iconEl.value=''; if(colorEl) colorEl.value='#c8b89a';
  rebuildDomainUI();
  renderSectionManagerList();
  showToast(`✓ "${name}" section added`);
}

function promptDeleteSection(id) {
  _pendingDeleteId=id;
  const d=domainById(id);
  document.getElementById('delete-section-msg').textContent=`Remove the "${d.name}" section from your workspace?`;
  document.getElementById('delete-section-modal').classList.remove('hidden');
}
function cancelDeleteSection() { _pendingDeleteId=null; document.getElementById('delete-section-modal').classList.add('hidden'); }
function confirmDeleteSection() {
  if(!_pendingDeleteId) return;
  const domains=getDomains().filter(d=>d.id!==_pendingDeleteId);
  setDomains(domains); _pendingDeleteId=null;
  document.getElementById('delete-section-modal').classList.add('hidden');
  rebuildDomainUI(); renderSectionManagerList(); navigateTo('dashboard');
  showToast('Section removed');
}

/* ════════════════════════════════════════════
   TOAST
════════════════════════════════════════════ */
let toastTimeout;
function showToast(msg,type='ok'){
  const t=document.getElementById('toast'); if(!t) return;
  t.textContent=msg; t.className='toast '+type;
  clearTimeout(toastTimeout);
  toastTimeout=setTimeout(()=>t.classList.add('hidden'),2800);
}

/* ════════════════════════════════════════════
   UTILS
════════════════════════════════════════════ */
function debounce(fn,delay){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),delay);};}

document.addEventListener('contextmenu',e=>e.preventDefault());
if(window.self!==window.top){document.body.innerHTML='<p style="color:red;padding:2rem;font-family:monospace">Access denied.</p>';}

window.initApp=initApp;
window.addTask=addTask;
window.saveNotes=saveNotes;
window.saveToday=saveToday;
window.saveDailyLog=saveDailyLog;
window.exportJSON=exportJSON;
window.exportPDF=exportPDF;
window.openTaskEndModal=openTaskEndModal;
window.closeTaskModal=closeTaskModal;
window.confirmTaskEnd=confirmTaskEnd;
window.saveReminderTime=saveReminderTime;
window.clearReminder=clearReminder;
window.closeReminder=closeReminder;
window.saveWeeklyGoal=saveWeeklyGoal;
window.closeUploadModal=closeUploadModal;
window.generateReportWithUpload=generateReportWithUpload;
window.generateReportCurrentData=generateReportCurrentData;
window.addSection=addSection;
window.promptDeleteSection=promptDeleteSection;
window.cancelDeleteSection=cancelDeleteSection;
window.confirmDeleteSection=confirmDeleteSection;
window.closeSectionManager=closeSectionManager;