/**
 * auth.js — Focus OS Security Layer v3.1
 * + Trusted Device system: one-time invite from laptop → mobile trusted forever
 *
 * SETUP:        DevTools → await Auth.setPassword("yourpassword")
 * GRANT MOBILE: On logged-in laptop → Auth.createInvite()
 *               On phone lock screen → paste token → never asked again
 * REVOKE:       Auth.revokeDevice()      — untrusts THIS device
 *               Auth.revokeAllInvites() — kills pending unused tokens
 */
const Auth = (() => {
  'use strict';

  const KEYS = {
    pwHash:     'fo_pw_hash',
    attempts:   'fo_attempts',
    lockUntil:  'fo_lock_until',
    session:    'fo_session',
    trustedKey: 'fo_trusted_key',
    audit:      'fo_audit',
    invites:    'fo_invites',
  };
  const MAX_ATTEMPTS = 5, LOCKOUT_BASE = 30, MIN_DELAY = 800;
  const INVITE_TTL_MS = 10 * 60 * 1000;
  let lastAttempt = 0;

  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function randomToken(bytes = 32) {
    const a = new Uint8Array(bytes); crypto.getRandomValues(a);
    return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0;
  }

  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
    del: k => { try { localStorage.removeItem(k); } catch {} },
  };
  const ss = {
    get: k => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
    del: k => { try { sessionStorage.removeItem(k); } catch {} },
  };

  function audit(e, d = '') {
    try {
      const r = JSON.parse(ls.get(KEYS.audit) || '[]').slice(-99);
      r.push({ t: new Date().toISOString(), e, d });
      ls.set(KEYS.audit, JSON.stringify(r));
    } catch {}
  }

  function getAttempts() { return parseInt(ls.get(KEYS.attempts) || '0', 10); }
  function isLocked() { return Date.now() < parseInt(ls.get(KEYS.lockUntil) || '0', 10); }
  function remainingLock() { return Math.ceil((parseInt(ls.get(KEYS.lockUntil) || '0', 10) - Date.now()) / 1000); }
  function incrementAttempts() {
    const n = getAttempts() + 1; ls.set(KEYS.attempts, String(n));
    if (n >= MAX_ATTEMPTS) {
      const s = LOCKOUT_BASE * Math.pow(2, Math.floor(n / MAX_ATTEMPTS) - 1);
      ls.set(KEYS.lockUntil, String(Date.now() + s * 1000)); audit('LOCKOUT', s + 's'); return s;
    }
    return 0;
  }
  function resetAttempts() { ls.set(KEYS.attempts, '0'); ls.set(KEYS.lockUntil, '0'); }

  function loadInvites() { try { return JSON.parse(ls.get(KEYS.invites) || '[]'); } catch { return []; } }
  function saveInvites(arr) { ls.set(KEYS.invites, JSON.stringify(arr)); }
  function pruneExpired() { saveInvites(loadInvites().filter(i => i.exp > Date.now() && !i.used)); }

  function loadTrustedDevices() { try { return JSON.parse(ls.get('fo_trusted_devices') || '[]'); } catch { return []; } }
  function saveTrustedDevices(arr) { ls.set('fo_trusted_devices', JSON.stringify(arr)); }
  function isThisDeviceTrusted() {
    const myKey = ls.get(KEYS.trustedKey);
    if (!myKey) return false;
    return loadTrustedDevices().some(k => timingSafeEqual(k, myKey));
  }

  async function setPassword(p) {
    if (!p || p.length < 6) throw new Error('Min 6 characters.');
    ls.set(KEYS.pwHash, await sha256(p));
    console.log('%cPassword set. Refresh and log in.', 'color:#7ecbae;font-weight:bold');
  }

  async function attempt(p) {
    const now = Date.now();
    if (now - lastAttempt < MIN_DELAY) return { ok: false, reason: 'Too fast, wait a moment.' };
    lastAttempt = now;
    if (isLocked()) return { ok: false, reason: 'locked', remaining: remainingLock() };
    const stored = ls.get(KEYS.pwHash);
    if (!stored) return { ok: false, reason: 'No password set. Open DevTools → await Auth.setPassword("yourpassword")' };
    const hash = await sha256(p);
    if (timingSafeEqual(hash, stored)) {
      resetAttempts(); ss.set(KEYS.session, randomToken()); audit('LOGIN_OK'); return { ok: true };
    }
    const lockSecs = incrementAttempts(); audit('FAIL', getAttempts() + ' attempts');
    if (lockSecs > 0) return { ok: false, reason: 'locked', remaining: lockSecs };
    return { ok: false, reason: `Wrong passphrase. ${MAX_ATTEMPTS - getAttempts()} attempt(s) left.` };
  }

  // On logged-in laptop: Auth.createInvite() — copy token, send to phone
  function createInvite() {
    if (!isAuthenticated()) { console.warn('Must be logged in first.'); return null; }
    pruneExpired();
    const token = randomToken(24);
    const list = loadInvites();
    list.push({ token, exp: Date.now() + INVITE_TTL_MS, used: false });
    saveInvites(list);
    audit('INVITE_CREATED');
    console.log(
      '%cFocus OS Device Invite\n\nToken (10 min, single-use):\n\n  ' + token +
      '\n\nOn your phone: tap "Use Device Token" on the lock screen.\nAfter that, your phone needs nothing ever again.',
      'color:#c8b89a;font-size:13px;font-family:monospace;line-height:1.9'
    );
    return token;
  }

  // On phone: Auth.useInvite("TOKEN") — permanent trust granted
  async function useInvite(token) {
    if (!token || typeof token !== 'string') return { ok: false, reason: 'Invalid token.' };
    pruneExpired();
    const list = loadInvites();
    const idx = list.findIndex(i => timingSafeEqual(i.token, token) && !i.used && i.exp > Date.now());
    if (idx === -1) { audit('INVITE_FAIL'); return { ok: false, reason: 'Token invalid, already used, or expired.' }; }
    list[idx].used = true;
    saveInvites(list);
    const deviceKey = randomToken(32);
    ls.set(KEYS.trustedKey, deviceKey);
    const trusted = loadTrustedDevices();
    trusted.push(deviceKey);
    saveTrustedDevices(trusted);
    ss.set(KEYS.session, randomToken());
    audit('INVITE_LOGIN_TRUSTED');
    console.log('%cThis device is now permanently trusted. No password needed ever again.', 'color:#7ecbae;font-weight:bold');
    return { ok: true };
  }

  function revokeDevice() {
    const myKey = ls.get(KEYS.trustedKey);
    if (myKey) {
      saveTrustedDevices(loadTrustedDevices().filter(k => !timingSafeEqual(k, myKey)));
      ls.del(KEYS.trustedKey); audit('DEVICE_REVOKED');
      console.log('%cThis device is no longer trusted.', 'color:#e87e7e;font-weight:bold');
    } else { console.log('This device was not trusted.'); }
  }

  function revokeAllInvites() {
    saveInvites([]); audit('INVITES_REVOKED');
    console.log('%cAll pending invite tokens revoked.', 'color:#e87e7e;font-weight:bold');
  }

  function logout() { ss.del(KEYS.session); audit('LOGOUT'); }

  // Trusted device (permanent, survives tab/browser close) OR live session
  function isAuthenticated() { return isThisDeviceTrusted() || !!ss.get(KEYS.session); }

  return { setPassword, attempt, logout, isAuthenticated, createInvite, useInvite, revokeDevice, revokeAllInvites };
})();

// Lock screen UI
document.addEventListener('DOMContentLoaded', function () {
  const lockScreen  = document.getElementById('lock-screen');
  const app         = document.getElementById('app');
  const input       = document.getElementById('pw-input');
  const btn         = document.getElementById('unlock-btn');
  const alertEl     = document.getElementById('lock-alert');
  const lockoutMsg  = document.getElementById('lockout-msg');
  const timerEl     = document.getElementById('lockout-timer');
  const toggle      = document.getElementById('pw-toggle');
  const inviteBtn   = document.getElementById('invite-unlock-btn');
  const inviteWrap  = document.getElementById('invite-section');
  const inviteInput = document.getElementById('invite-input');
  const inviteGo    = document.getElementById('invite-go-btn');

  function showApp() {
    lockScreen.classList.add('hidden');
    app.classList.remove('hidden');
    requestAnimationFrame(() => { setTimeout(() => { if (typeof initApp === 'function') initApp(); }, 100); });
  }

  if (Auth.isAuthenticated()) { showApp(); return; }

  lockScreen.classList.remove('hidden');
  app.classList.add('hidden');

  toggle.addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    toggle.style.opacity = input.type === 'text' ? '1' : '0.6';
  });

  async function tryUnlock() {
    const pw = input.value.trim(); if (!pw) return;
    btn.disabled = true; btn.textContent = '...';
    const r = await Auth.attempt(pw);
    if (r.ok) { input.value = ''; showApp(); }
    else if (r.reason === 'locked') { showLockout(r.remaining); }
    else { showAlert(r.reason); input.value = ''; input.focus(); }
    btn.disabled = false; btn.textContent = 'Unlock';
  }
  btn.addEventListener('click', tryUnlock);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
  input.addEventListener('paste', e => { if (e.clipboardData.getData('text').length > 128) e.preventDefault(); });

  if (inviteBtn && inviteWrap) {
    inviteBtn.addEventListener('click', () => {
      inviteWrap.classList.toggle('hidden');
      if (!inviteWrap.classList.contains('hidden')) inviteInput.focus();
    });
  }

  if (inviteGo) {
    async function tryInvite() {
      const token = inviteInput.value.trim(); if (!token) return;
      inviteGo.disabled = true; inviteGo.textContent = '...';
      const r = await Auth.useInvite(token);
      if (r.ok) { inviteInput.value = ''; showApp(); }
      else { showAlert(r.reason); inviteInput.value = ''; inviteInput.focus(); }
      inviteGo.disabled = false; inviteGo.textContent = 'Use Token';
    }
    inviteGo.addEventListener('click', tryInvite);
    inviteInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryInvite(); });
  }

  function showAlert(msg) {
    alertEl.textContent = msg; alertEl.classList.remove('hidden');
    setTimeout(() => alertEl.classList.add('hidden'), 4000);
  }
  function showLockout(secs) {
    lockoutMsg.classList.remove('hidden'); timerEl.textContent = secs; alertEl.classList.add('hidden');
    const iv = setInterval(() => { secs--; timerEl.textContent = secs; if (secs <= 0) { clearInterval(iv); lockoutMsg.classList.add('hidden'); } }, 1000);
  }
});