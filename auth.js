/**
 * auth.js — Focus OS Security Layer
 *
 * Security model:
 *  • Password stored as SHA-256 hash in localStorage (never plaintext)
 *  • Session token: random 256-bit hex, stored in sessionStorage (cleared on tab close)
 *  • Brute-force lockout: 5 attempts → 30s lockout, exponential backoff
 *  • Rate limiting: max 1 attempt per 800ms
 *  • Attempt log: stored in localStorage for audit
 *  • No network calls, no external dependencies
 *
 * ─────────────────────────────────────────────────
 * FIRST-TIME SETUP:
 *   1. Open browser DevTools console on this page
 *   2. Run: await Auth.setPassword("your-passphrase-here")
 *   3. Refresh. Done.
 * ─────────────────────────────────────────────────
 */

const Auth = (() => {
  'use strict';

  const KEYS = {
    pwHash:    'fo_pw_hash',
    attempts:  'fo_attempts',
    lockUntil: 'fo_lock_until',
    session:   'fo_session',
    auditLog:  'fo_audit',
  };

  const MAX_ATTEMPTS   = 5;
  const LOCKOUT_BASE   = 30;   // seconds
  const MIN_DELAY_MS   = 800;  // min time between attempts

  let lastAttemptTime  = 0;
  let lockoutInterval  = null;

  /* ── Crypto helpers ───────────────────────────── */

  async function sha256(str) {
    const buf = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(str)
    );
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function randomToken() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function timingSafeEqual(a, b) {
    // Constant-time comparison to prevent timing attacks
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  /* ── Storage helpers (safe wrappers) ─────────── */

  function lsGet(key) {
    try { return localStorage.getItem(key); }
    catch { return null; }
  }

  function lsSet(key, val) {
    try { localStorage.setItem(key, val); }
    catch { /* quota exceeded or private mode */ }
  }

  function ssGet(key) {
    try { return sessionStorage.getItem(key); }
    catch { return null; }
  }

  function ssSet(key, val) {
    try { sessionStorage.setItem(key, val); }
    catch { /* session storage unavailable */ }
  }

  function ssDel(key) {
    try { sessionStorage.removeItem(key); }
    catch { /* ignore */ }
  }

  /* ── Audit log ────────────────────────────────── */

  function logAudit(event, detail = '') {
    try {
      const raw  = lsGet(KEYS.auditLog) || '[]';
      const logs = JSON.parse(raw).slice(-99); // keep last 100
      logs.push({
        t: new Date().toISOString(),
        e: event,
        d: detail,
      });
      lsSet(KEYS.auditLog, JSON.stringify(logs));
    } catch { /* ignore */ }
  }

  /* ── Lockout logic ────────────────────────────── */

  function getAttempts()   { return parseInt(lsGet(KEYS.attempts)  || '0', 10); }
  function getLockUntil()  { return parseInt(lsGet(KEYS.lockUntil) || '0', 10); }

  function isLocked() {
    return Date.now() < getLockUntil();
  }

  function remainingLock() {
    return Math.ceil((getLockUntil() - Date.now()) / 1000);
  }

  function incrementAttempts() {
    const n = getAttempts() + 1;
    lsSet(KEYS.attempts, String(n));
    if (n >= MAX_ATTEMPTS) {
      // Exponential backoff: 30s, 60s, 120s, …
      const multiplier = Math.pow(2, Math.floor(n / MAX_ATTEMPTS) - 1);
      const secs       = LOCKOUT_BASE * multiplier;
      lsSet(KEYS.lockUntil, String(Date.now() + secs * 1000));
      logAudit('LOCKOUT', `${secs}s after ${n} attempts`);
      return secs;
    }
    return 0;
  }

  function resetAttempts() {
    lsSet(KEYS.attempts, '0');
    lsSet(KEYS.lockUntil, '0');
  }

  /* ── Session management ───────────────────────── */

  function createSession() {
    const token = randomToken();
    ssSet(KEYS.session, token);
    return token;
  }

  function hasSession() {
    return !!ssGet(KEYS.session);
  }

  function destroySession() {
    ssDel(KEYS.session);
  }

  /* ── Public API ───────────────────────────────── */

  async function setPassword(plaintext) {
    if (!plaintext || plaintext.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }
    const hash = await sha256(plaintext);
    lsSet(KEYS.pwHash, hash);
    console.log('%c✓ Password set successfully. Refresh and log in.', 'color:#4ade80;font-weight:bold');
    return true;
  }

  async function attempt(plaintext) {
    // Rate limit
    const now = Date.now();
    if (now - lastAttemptTime < MIN_DELAY_MS) {
      return { ok: false, reason: 'Too fast. Please wait.' };
    }
    lastAttemptTime = now;

    // Check lockout
    if (isLocked()) {
      return { ok: false, reason: 'locked', remaining: remainingLock() };
    }

    const stored = lsGet(KEYS.pwHash);
    if (!stored) {
      return { ok: false, reason: 'No password set. Open DevTools and run: await Auth.setPassword("yourpassword")' };
    }

    const hash = await sha256(plaintext);
    if (timingSafeEqual(hash, stored)) {
      resetAttempts();
      createSession();
      logAudit('LOGIN_OK');
      return { ok: true };
    } else {
      const lockSecs = incrementAttempts();
      const left = MAX_ATTEMPTS - getAttempts();
      logAudit('LOGIN_FAIL', `${getAttempts()} attempts`);
      if (lockSecs > 0) {
        return { ok: false, reason: 'locked', remaining: lockSecs };
      }
      return { ok: false, reason: `Wrong passphrase. ${left > 0 ? left + ' attempt(s) remaining.' : ''}` };
    }
  }

  function logout() {
    destroySession();
    logAudit('LOGOUT');
  }

  function isAuthenticated() {
    return hasSession();
  }

  /* Expose minimal surface to console for setup */
  return { setPassword, attempt, logout, isAuthenticated };
})();

/* ── UI Binding ──────────────────────────────────── */

(function initAuthUI() {
  const lockScreen = document.getElementById('lock-screen');
  const app        = document.getElementById('app');
  const input      = document.getElementById('pw-input');
  const btn        = document.getElementById('unlock-btn');
  const alert      = document.getElementById('lock-alert');
  const lockoutMsg = document.getElementById('lockout-msg');
  const timerEl    = document.getElementById('lockout-timer');
  const toggle     = document.getElementById('pw-toggle');

  /* Restore session without re-entering password */
  if (Auth.isAuthenticated()) {
    showApp();
    return;
  }

  /* Eye toggle */
  toggle.addEventListener('click', () => {
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    toggle.style.opacity = isPass ? '1' : '0.5';
  });

  /* Unlock */
  async function tryUnlock() {
    const pw = input.value.trim();
    if (!pw) return;

    btn.disabled = true;
    btn.textContent = '…';

    const result = await Auth.attempt(pw);

    if (result.ok) {
      input.value = '';
      showApp();
    } else if (result.reason === 'locked') {
      showLockout(result.remaining);
    } else {
      showAlert(result.reason);
      input.value = '';
      input.focus();
    }

    btn.disabled    = false;
    btn.textContent = 'Unlock';
  }

  btn.addEventListener('click', tryUnlock);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });

  /* Prevent form of brute force via copy-paste flood */
  input.addEventListener('paste', e => {
    const text = e.clipboardData.getData('text');
    if (text.length > 128) e.preventDefault();
  });

  function showAlert(msg) {
    alert.textContent = msg;
    alert.classList.remove('hidden');
    setTimeout(() => alert.classList.add('hidden'), 4000);
  }

  function showLockout(secs) {
    lockoutMsg.classList.remove('hidden');
    timerEl.textContent = secs;
    alert.classList.add('hidden');

    const iv = setInterval(() => {
      secs--;
      timerEl.textContent = secs;
      if (secs <= 0) {
        clearInterval(iv);
        lockoutMsg.classList.add('hidden');
      }
    }, 1000);
  }

  function showApp() {
    lockScreen.classList.add('hidden');
    app.classList.remove('hidden');
    // App init happens in app.js after DOM is ready
    if (typeof initApp === 'function') initApp();
  }
})();
