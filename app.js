/**
 * app.js — Focus OS Application Logic
 * All data stored in localStorage. No network. No backend.
 */

'use strict';

/* ── Storage helpers ────────────────────────────── */

const Store = {
  _sanitize(val) {
    // Prevent XSS when re-rendering stored strings
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  get(key, fallback = null) {
    try {
      const v = localStorage.getItem('fo_data_' + key);
      return v !== null ? JSON.parse(v) : fallback;
    } catch { return fallback; }
  },

  set(key, val) {
    try {
      localStorage.setItem('fo_data_' + key, JSON.stringify(val));
    } catch (e) {
      showToast('Storage quota exceeded. Clear some data.', 'error');
    }
  },
};

/* ── Quotes ─────────────────────────────────────── */

const QUOTES = [
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Small daily improvements over time lead to stunning results.", author: "Robin Sharma" },
  { text: "Focus is the art of knowing what to ignore.", author: "James Clear" },
  { text: "You don't rise to the level of your goals. You fall to the level of your systems.", author: "James Clear" },
  { text: "Every expert was once a beginner.", author: "Helen Hayes" },
  { text: "The impediment to action advances action. What stands in the way becomes the way.", author: "Marcus Aurelius" },
  { text: "It's not about having time. It's about making time.", author: "Unknown" },
  { text: "Do the hard things. The soft things will take care of themselves.", author: "Unknown" },
  { text: "Consistency is the hallmark of the unimaginative.", author: "Oscar Wilde" },
  { text: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln" },
  { text: "Mastery is not a function of genius. It's a function of time and intense focus.", author: "Robert Greene" },
  { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
];

/* ── Domains config ─────────────────────────────── */

const DOMAINS = ['vlsi', 'cuda', 'gate'];

/* ── Init ───────────────────────────────────────── */

function initApp() {
  renderQuote();
  renderDate();
  initNav();
  DOMAINS.forEach(d => {
    loadTasks(d);
    loadNotes(d);
    loadGoals(d);
  });
  renderDashboard();
  renderDailyLog();
  initTagButtons();
  initAutoSave();
  updateStreak();
}

/* ── Quote ──────────────────────────────────────── */

function renderQuote() {
  const idx = Math.floor(Math.random() * QUOTES.length);
  const q   = QUOTES[idx];
  const el  = document.getElementById('quote-text');
  const au  = document.getElementById('quote-author');
  if (el) el.textContent = q.text;
  if (au) au.textContent = '— ' + q.author;
}

/* ── Date ───────────────────────────────────────── */

function renderDate() {
  const el = document.getElementById('today-date');
  if (!el) return;
  const d = new Date();
  el.textContent = d.toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

/* ── Navigation ─────────────────────────────────── */

function initNav() {
  const btns = document.querySelectorAll('.nav-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      navigateTo(page);
      closeSidebar();
    });
  });

  // Domain cards → navigate
  document.querySelectorAll('.domain-card').forEach(card => {
    card.addEventListener('click', () => navigateTo(card.dataset.domain));
    card.style.cursor = 'pointer';
  });

  // Mobile menu
  const menuBtn = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('sidebar');
  if (menuBtn) {
    menuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
  }
  document.addEventListener('click', e => {
    if (sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) &&
        e.target !== menuBtn) {
      closeSidebar();
    }
  });

  // Logout
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      Auth.logout();
      location.reload();
    });
  }
}

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');

  const btn = document.querySelector(`.nav-btn[data-page="${page}"]`);
  if (btn) btn.classList.add('active');

  const topbarPage = document.getElementById('topbar-page');
  if (topbarPage) topbarPage.textContent = btn ? btn.textContent.trim() : page;

  if (page === 'dashboard') renderDashboard();
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
}

/* ── Tasks ──────────────────────────────────────── */

function getTasks(domain) {
  return Store.get('tasks_' + domain, []);
}

function setTasks(domain, tasks) {
  Store.set('tasks_' + domain, tasks);
}

function loadTasks(domain) {
  const tasks = getTasks(domain);
  renderTasks(domain, tasks);
}

function renderTasks(domain, tasks) {
  const list  = document.getElementById(domain + '-task-list');
  const count = document.getElementById(domain + '-task-count');
  if (!list) return;

  list.innerHTML = '';
  const done = tasks.filter(t => t.done).length;
  if (count) count.textContent = `${done}/${tasks.length}`;

  tasks.forEach((task, idx) => {
    const li = document.createElement('li');
    li.className = 'task-item' + (task.done ? ' done' : '');

    const cb = document.createElement('input');
    cb.type    = 'checkbox';
    cb.checked = task.done;
    cb.setAttribute('aria-label', 'Complete task');
    cb.addEventListener('change', () => toggleTask(domain, idx));

    const span = document.createElement('span');
    span.className   = 'task-text';
    span.textContent = task.text; // safe: we stored sanitized

    const del = document.createElement('button');
    del.className   = 'task-del';
    del.textContent = '×';
    del.setAttribute('aria-label', 'Delete task');
    del.addEventListener('click', () => deleteTask(domain, idx));

    li.appendChild(cb);
    li.appendChild(span);
    li.appendChild(del);
    list.appendChild(li);
  });

  updateProgress(domain);
}

function addTask(domain) {
  const input = document.getElementById(domain + '-task-input');
  if (!input) return;

  const raw  = input.value.trim();
  if (!raw) return;

  // Sanitize before storage
  const safe = raw.replace(/[<>"'&]/g, c => ({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;','&':'&amp;'}[c]));

  if (safe.length === 0) return;

  const tasks = getTasks(domain);
  tasks.push({ text: safe, done: false, created: Date.now() });
  setTasks(domain, tasks);
  renderTasks(domain, tasks);
  input.value = '';
  input.focus();
  showToast('Task added');
}

// Allow Enter key in task inputs
document.addEventListener('DOMContentLoaded', () => {
  DOMAINS.forEach(d => {
    const el = document.getElementById(d + '-task-input');
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') addTask(d); });
  });
});

function toggleTask(domain, idx) {
  const tasks = getTasks(domain);
  tasks[idx].done = !tasks[idx].done;
  setTasks(domain, tasks);
  renderTasks(domain, tasks);
}

function deleteTask(domain, idx) {
  const tasks = getTasks(domain);
  tasks.splice(idx, 1);
  setTasks(domain, tasks);
  renderTasks(domain, tasks);
  showToast('Task removed');
}

/* ── Progress ───────────────────────────────────── */

function getProgress(domain) {
  const tasks = getTasks(domain);
  if (!tasks.length) return 0;
  return Math.round((tasks.filter(t => t.done).length / tasks.length) * 100);
}

function updateProgress(domain) {
  const pct = getProgress(domain);
  const bar = document.getElementById(domain + '-big-bar');
  const badge = document.getElementById(domain + '-pct-badge');
  if (bar)   bar.style.width = pct + '%';
  if (badge) badge.textContent = pct + '%';
}

/* ── Notes & Goals ──────────────────────────────── */

function loadNotes(domain) {
  const notes = Store.get('notes_' + domain, '');
  const el    = document.getElementById(domain + '-notes');
  if (el) el.value = notes;
}

function saveNotes(domain) {
  const el  = document.getElementById(domain + '-notes');
  if (!el) return;
  Store.set('notes_' + domain, el.value);
  showToast('Notes saved ✓');
}

function loadGoals(domain) {
  const goals = Store.get('goals_' + domain, '');
  const el    = document.getElementById(domain + '-goals');
  if (el) el.value = goals;
}

function initAutoSave() {
  // Auto-save goals & notes on change (debounced)
  DOMAINS.forEach(d => {
    const notesEl = document.getElementById(d + '-notes');
    const goalsEl = document.getElementById(d + '-goals');
    if (notesEl) notesEl.addEventListener('input', debounce(() => Store.set('notes_' + d, notesEl.value), 1000));
    if (goalsEl) goalsEl.addEventListener('input', debounce(() => Store.set('goals_' + d, goalsEl.value), 1000));
  });
}

/* ── Today log (per domain) ─────────────────────── */

function saveToday(domain) {
  const el = document.getElementById(domain + '-today');
  if (!el || !el.value.trim()) { showToast('Nothing to save.', 'error'); return; }

  const logs = Store.get('today_' + domain, []);
  logs.unshift({
    text: el.value.trim(),
    date: new Date().toLocaleDateString('en-IN'),
    ts:   Date.now(),
  });
  Store.set('today_' + domain, logs.slice(0, 30)); // keep 30
  el.value = '';
  showToast('Entry saved ✓');
  updateStreak();
  renderDashboard();
}

/* ── Daily Log ──────────────────────────────────── */

let selectedTag = 'vlsi';

function initTagButtons() {
  document.querySelectorAll('.tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedTag = btn.dataset.tag;
    });
  });
}

function saveDailyLog() {
  const el    = document.getElementById('daily-entry-text');
  const hours = document.getElementById('daily-hours');
  if (!el || !el.value.trim()) { showToast('Write something first.', 'error'); return; }

  const logs = Store.get('daily_logs', []);
  logs.unshift({
    text:  el.value.trim(),
    tag:   selectedTag,
    hours: parseFloat(hours?.value || 1),
    date:  new Date().toLocaleDateString('en-IN'),
    ts:    Date.now(),
  });
  Store.set('daily_logs', logs.slice(0, 365));

  el.value = '';
  showToast('Daily log saved ✓');
  renderDailyLog();
  updateStreak();
  renderDashboard();
}

function renderDailyLog() {
  const container = document.getElementById('daily-log-list');
  if (!container) return;

  const logs = Store.get('daily_logs', []);
  if (!logs.length) {
    container.innerHTML = '<p class="empty-msg">No entries yet. Log your first day!</p>';
    return;
  }

  container.innerHTML = logs.map(log => `
    <div class="log-entry">
      <div class="log-entry-header">
        <span class="log-tag tag-${log.tag}">${tagLabel(log.tag)}</span>
        <span class="log-date">${log.date}</span>
        <span class="log-hours">${log.hours}h</span>
      </div>
      <p class="log-text">${Store._sanitize(log.text)}</p>
    </div>
  `).join('');
}

function tagLabel(tag) {
  return { vlsi:'⚡ VLSI', cuda:'🖥 CUDA', gate:'📖 GATE', general:'✦ General' }[tag] || tag;
}

/* ── Dashboard ──────────────────────────────────── */

function renderDashboard() {
  // Domain cards
  DOMAINS.forEach(d => {
    const pct  = getProgress(d);
    const tasks = getTasks(d);
    const done  = tasks.filter(t => t.done).length;

    const bar  = document.getElementById('dash-' + d + '-bar');
    const pctEl = document.getElementById('dash-' + d + '-pct');
    const meta  = document.getElementById('dash-' + d + '-meta');

    if (bar)   bar.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct + '%';
    if (meta)  meta.textContent = `${done} of ${tasks.length} tasks completed`;
  });

  // Stats
  const allTasks = DOMAINS.flatMap(d => getTasks(d));
  document.getElementById('stat-tasks').textContent = allTasks.filter(t => t.done).length;

  const logs = Store.get('daily_logs', []);
  const uniqueDays = new Set(logs.map(l => l.date)).size;
  document.getElementById('stat-logs').textContent = uniqueDays;

  const streak = calcStreak();
  document.getElementById('stat-streak').textContent = streak + ' 🔥';
  document.getElementById('sidebar-streak').textContent = streak;

  // Count notes with content
  const noteCount = DOMAINS.filter(d => (Store.get('notes_' + d, '')).trim().length > 0).length;
  document.getElementById('stat-notes').textContent = noteCount;

  // Recent logs
  renderRecentLogs();
}

function renderRecentLogs() {
  const container = document.getElementById('recent-logs-list');
  if (!container) return;

  const logs = Store.get('daily_logs', []).slice(0, 5);
  if (!logs.length) {
    container.innerHTML = '<p class="empty-msg">No entries yet — start your first daily log.</p>';
    return;
  }

  container.innerHTML = logs.map(log => `
    <div class="recent-log-row">
      <span class="log-tag tag-${log.tag}">${tagLabel(log.tag)}</span>
      <span class="recent-log-text">${Store._sanitize(log.text).substring(0, 80)}${log.text.length > 80 ? '…' : ''}</span>
      <span class="log-date">${log.date}</span>
    </div>
  `).join('');
}

/* ── Streak ─────────────────────────────────────── */

function calcStreak() {
  const logs = Store.get('daily_logs', []);
  if (!logs.length) return 0;

  const days = [...new Set(logs.map(l => l.date))];
  let streak = 0;
  let check  = new Date();

  for (let i = 0; i < 365; i++) {
    const label = check.toLocaleDateString('en-IN');
    if (days.includes(label)) {
      streak++;
      check.setDate(check.getDate() - 1);
    } else {
      if (i === 0) { check.setDate(check.getDate() - 1); continue; } // allow today missing
      break;
    }
  }
  return streak;
}

function updateStreak() {
  const s = calcStreak();
  const el = document.getElementById('sidebar-streak');
  if (el) el.textContent = s;
}

/* ── Toast ──────────────────────────────────────── */

let toastTimeout;

function showToast(msg, type = 'ok') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className   = 'toast ' + type;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add('hidden'), 2500);
}

/* ── Utilities ──────────────────────────────────── */

function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

/* ── Security: disable right-click & devtools shortcut on prod ── */
// Note: these are deterrents only — not real security. Real security = server-side.
// Comment these out during development.
document.addEventListener('contextmenu', e => e.preventDefault());

// Detect if page is embedded in iframe (clickjacking)
if (window.self !== window.top) {
  document.body.innerHTML = '<p style="font-family:monospace;color:red;padding:2rem;">Access denied.</p>';
}

/* ── Expose initApp globally (called from auth.js) ── */
window.initApp = initApp;
