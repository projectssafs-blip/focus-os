/**
 * auth.js — Focus OS Security Layer v2
 * SHA-256 hashing · session tokens · brute-force lockout · rate limiting
 *
 * SETUP: Open DevTools console → await Auth.setPassword("yourpassword")
 */
const Auth = (() => {
  'use strict';
  const KEYS = { pwHash:'fo_pw_hash', attempts:'fo_attempts', lockUntil:'fo_lock_until', session:'fo_session', audit:'fo_audit' };
  const MAX_ATTEMPTS = 5, LOCKOUT_BASE = 30, MIN_DELAY = 800;
  let lastAttempt = 0;

  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  function randomToken() {
    const a = new Uint8Array(32); crypto.getRandomValues(a);
    return Array.from(a).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  function timingSafeEqual(a,b) {
    if(a.length!==b.length) return false;
    let d=0; for(let i=0;i<a.length;i++) d|=a.charCodeAt(i)^b.charCodeAt(i); return d===0;
  }
  const ls = { get:k=>{try{return localStorage.getItem(k)}catch{return null}}, set:(k,v)=>{try{localStorage.setItem(k,v)}catch{}}, };
  const ss = { get:k=>{try{return sessionStorage.getItem(k)}catch{return null}}, set:(k,v)=>{try{sessionStorage.setItem(k,v)}catch{}}, del:k=>{try{sessionStorage.removeItem(k)}catch{}} };
  function audit(e,d=''){try{const r=JSON.parse(ls.get(KEYS.audit)||'[]').slice(-99);r.push({t:new Date().toISOString(),e,d});ls.set(KEYS.audit,JSON.stringify(r))}catch{}}
  function getAttempts(){return parseInt(ls.get(KEYS.attempts)||'0',10);}
  function isLocked(){return Date.now()<parseInt(ls.get(KEYS.lockUntil)||'0',10);}
  function remainingLock(){return Math.ceil((parseInt(ls.get(KEYS.lockUntil)||'0',10)-Date.now())/1000);}
  function incrementAttempts(){
    const n=getAttempts()+1; ls.set(KEYS.attempts,String(n));
    if(n>=MAX_ATTEMPTS){const m=Math.pow(2,Math.floor(n/MAX_ATTEMPTS)-1),s=LOCKOUT_BASE*m;ls.set(KEYS.lockUntil,String(Date.now()+s*1000));audit('LOCKOUT',s+'s');return s;}
    return 0;
  }
  function resetAttempts(){ls.set(KEYS.attempts,'0');ls.set(KEYS.lockUntil,'0');}

  async function setPassword(p){
    if(!p||p.length<6) throw new Error('Min 6 characters.');
    ls.set(KEYS.pwHash, await sha256(p));
    console.log('%c✓ Password set. Refresh and log in.','color:#7ecbae;font-weight:bold');
  }
  async function attempt(p){
    const now=Date.now();
    if(now-lastAttempt<MIN_DELAY) return{ok:false,reason:'Too fast, wait a moment.'};
    lastAttempt=now;
    if(isLocked()) return{ok:false,reason:'locked',remaining:remainingLock()};
    const stored=ls.get(KEYS.pwHash);
    if(!stored) return{ok:false,reason:'No password set. Open DevTools → await Auth.setPassword("yourpassword")'};
    const hash=await sha256(p);
    if(timingSafeEqual(hash,stored)){resetAttempts();ss.set(KEYS.session,randomToken());audit('LOGIN_OK');return{ok:true};}
    const lockSecs=incrementAttempts(); audit('FAIL',getAttempts()+' attempts');
    if(lockSecs>0) return{ok:false,reason:'locked',remaining:lockSecs};
    const left=MAX_ATTEMPTS-getAttempts();
    return{ok:false,reason:`Wrong passphrase. ${left} attempt(s) left.`};
  }
  function logout(){ss.del(KEYS.session);audit('LOGOUT');}
  function isAuthenticated(){return!!ss.get(KEYS.session);}
  return{setPassword,attempt,logout,isAuthenticated};
})();

(function initAuthUI(){
  const lockScreen=document.getElementById('lock-screen');
  const app=document.getElementById('app');
  const input=document.getElementById('pw-input');
  const btn=document.getElementById('unlock-btn');
  const alertEl=document.getElementById('lock-alert');
  const lockoutMsg=document.getElementById('lockout-msg');
  const timerEl=document.getElementById('lockout-timer');
  const toggle=document.getElementById('pw-toggle');

  if(Auth.isAuthenticated()){showApp();return;}

  toggle.addEventListener('click',()=>{
    input.type=input.type==='password'?'text':'password';
    toggle.style.opacity=input.type==='text'?'1':'0.6';
  });

  async function tryUnlock(){
    const pw=input.value.trim(); if(!pw) return;
    btn.disabled=true; btn.textContent='…';
    const r=await Auth.attempt(pw);
    if(r.ok){input.value='';showApp();}
    else if(r.reason==='locked'){showLockout(r.remaining);}
    else{showAlert(r.reason);input.value='';input.focus();}
    btn.disabled=false; btn.textContent='Unlock';
  }

  btn.addEventListener('click',tryUnlock);
  input.addEventListener('keydown',e=>{if(e.key==='Enter')tryUnlock();});
  input.addEventListener('paste',e=>{if(e.clipboardData.getData('text').length>128)e.preventDefault();});

  function showAlert(msg){alertEl.textContent=msg;alertEl.classList.remove('hidden');setTimeout(()=>alertEl.classList.add('hidden'),4000);}
  function showLockout(secs){
    lockoutMsg.classList.remove('hidden');timerEl.textContent=secs;alertEl.classList.add('hidden');
    const iv=setInterval(()=>{secs--;timerEl.textContent=secs;if(secs<=0){clearInterval(iv);lockoutMsg.classList.add('hidden');}},1000);
  }
  function showApp(){
    lockScreen.classList.add('hidden');
    app.classList.remove('hidden');
    if(typeof initApp==='function') initApp();
  }
})();
