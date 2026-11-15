/* Couple features use Supabase tables/RPCs. The browser key is publishable only;
   membership and visibility are enforced by the database policies in couples.sql. */
window.FocusCouples = (() => {
  let client=null,user=null,coupleId=null,channel=null,inboxChannel=null,refreshTimer=null,clockTimer=null,publishTimer=null,latestTasks=[],latestFocus=null,latestInvitations=[],latestProfiles=[];
  const $=id=>document.getElementById(id);
  const escape=s=>Store.esc(s??'');
  const message=(text,isError=false)=>{const el=$('couple-message');if(el){el.textContent=text;el.classList.toggle('error',isError);el.classList.remove('hidden');}};
  const clearMessage=()=>{const el=$('couple-message');if(el){el.textContent='';el.classList.add('hidden');}};
  const call=async(name,args={})=>{const {data,error}=await client.rpc(name,args);if(error)throw error;return data;};

  async function initForUser(signedInUser){
    close();client=window.FocusSupabaseClient;user=signedInUser;
    if(!client||!user)return;
    try{await call('save_my_couple_profile',{p_display_name:user.user_metadata?.full_name||user.user_metadata?.name||'Study partner',p_avatar_url:user.user_metadata?.picture||user.user_metadata?.avatar_url||''});await loadRoom();subscribe();subscribeInbox();schedulePublish(1000);}
    catch(e){console.error('Study partner setup:',e);renderSetupError(e);}
  }
  function close(){if(channel&&client)client.removeChannel(channel);if(inboxChannel&&client)client.removeChannel(inboxChannel);channel=null;inboxChannel=null;clearInterval(refreshTimer);clearInterval(clockTimer);clearTimeout(publishTimer);refreshTimer=null;clockTimer=null;publishTimer=null;client=null;user=null;coupleId=null;latestTasks=[];latestFocus=null;latestInvitations=[];latestProfiles=[];}
  function renderSetupError(error){const root=$('couples-content');if(!root)return;root.innerHTML=`<div class="page-header"><div><h2 class="page-title">♡ Profile &amp; Study Partner</h2><p class="page-sub">Connect privately and study together from anywhere.</p></div></div><div class="card couple-card"><h3>One setup step remains</h3><p>The secure couple tables are not ready yet. Run <strong>supabase/couples.sql</strong> in your Supabase SQL Editor, then reload this page.</p><details><summary>Technical detail</summary><p class="couple-muted">${escape(error?.message||'Setup could not be loaded.')}</p></details></div>`;}

  async function loadRoom(){
    if(!client||!user)return;
    const {data:invites,error:inviteError}=await client.from('couple_invitations').select('id,couple_id,inviter_id,invitee_id,status,created_at,responded_at').or(`inviter_id.eq.${user.id},invitee_id.eq.${user.id}`).order('created_at',{ascending:false}).limit(10);
    if(inviteError)throw inviteError;latestInvitations=invites||[];
    updateInboxBadge();
    const {data:members,error}=await client.from('couple_members').select('couple_id,user_id,joined_at').eq('user_id',user.id).limit(1);
    if(error)throw error;
    coupleId=members?.[0]?.couple_id||null;
    if(coupleId){
      const [memberResult,eventResult,taskResult,focusResult]=await Promise.all([
        client.from('couple_members').select('user_id,joined_at').eq('couple_id',coupleId),
        client.from('couple_events').select('event_type,created_at,actor_id').eq('couple_id',coupleId).order('created_at',{ascending:false}).limit(8),
        client.from('couple_tasks').select('owner_id,task_id,subject,title,due_date,is_done,updated_at').eq('couple_id',coupleId).order('due_date'),
        client.from('couple_focus_sessions').select('started_by,started_at,duration_seconds,label,status,updated_at').eq('couple_id',coupleId).maybeSingle()
      ]);
      for(const r of [memberResult,eventResult,taskResult,focusResult])if(r.error)throw r.error;
      latestTasks=taskResult.data||[];latestFocus=focusResult.data||null;
      const memberIds=(memberResult.data||[]).map(m=>m.user_id);
      const profileResult=memberIds.length?await client.from('couple_profiles').select('user_id,display_name,avatar_url').in('user_id',memberIds):{data:[],error:null};
      if(profileResult.error)throw profileResult.error;
      latestProfiles=profileResult.data||[];
      renderRoom(memberResult.data||[],latestProfiles,eventResult.data||[]);
    }else{clearInterval(refreshTimer);clearInterval(clockTimer);refreshTimer=null;clockTimer=null;latestProfiles=[];latestTasks=[];latestFocus=null;renderUnpaired();renderFocusPage([],[]);}
  }

  function renderUnpaired(){
    const root=$('couples-content');if(!root)return;
    const incoming=latestInvitations.filter(i=>i.invitee_id===user?.id&&i.status==='pending'&&Date.now()-Date.parse(i.created_at)<7*86400000);
    const inviteHtml=incoming.length?`<section class="card couple-card couple-inbox"><span class="couple-eyebrow">IN-PORTAL INVITATION</span><h3>Someone invited you to study together</h3>${incoming.map(i=>`<div class="couple-invite-row"><span>Private Focus OS room · ${new Date(i.created_at).toLocaleDateString()}</span><div><button class="action-btn couple-primary" data-invite-accept="${escape(i.id)}">Accept</button> <button class="cancel-btn" data-invite-decline="${escape(i.id)}">Decline</button></div></div>`).join('')}</section>`:'';
    root.innerHTML=`<div class="page-header"><div><h2 class="page-title">♡ Profile &amp; Study Partner</h2><p class="page-sub">Connect privately and study together from anywhere.</p></div></div><div class="card couple-card couple-profile"><span class="couple-eyebrow">YOUR PROFILE</span><h3>Signed in to Focus OS</h3><p>${escape(user?.email||'Google account')}</p></div>${inviteHtml}
      <div class="couple-grid"><section class="card couple-card"><span class="couple-eyebrow">YOUR ACCOUNT</span><h3>Start a shared study room</h3><p>Only you and one partner can join. Invitations stay inside the portal, or you can share a one-time code.</p><button class="action-btn couple-primary" id="couple-create">Create study room</button></section>
      <section class="card couple-card"><span class="couple-eyebrow">ALREADY INVITED?</span><h3>Join your partner</h3><p>Enter the invite code they share with you. It expires after 7 days and can be used once.</p><label for="couple-code">Invite code</label><input id="couple-code" class="couple-input" maxlength="24" autocomplete="one-time-code" placeholder="Paste the 18-character code"/><button class="action-btn couple-primary" id="couple-join">Join study room</button></section></div>
      <div class="card couple-card couple-privacy"><h3>What gets shared?</h3><p>Study task titles, subject, due date and completion status are visible to both partners. Tasks marked 🔒 stay private. Personal notes, daily logs, reminders, analytics and account email are not shared.</p></div>
      <p id="couple-message" class="couple-message hidden" role="status"></p>`;
    $('couple-create')?.addEventListener('click',createRoom);$('couple-join')?.addEventListener('click',joinRoom);
    $('couple-code')?.addEventListener('keydown',e=>{if(e.key==='Enter')joinRoom();});
    root.querySelectorAll('[data-invite-accept]').forEach(b=>b.addEventListener('click',()=>respondToPortalInvite(b.dataset.inviteAccept,true)));
    root.querySelectorAll('[data-invite-decline]').forEach(b=>b.addEventListener('click',()=>respondToPortalInvite(b.dataset.inviteDecline,false)));
  }

  function updateInboxBadge(){const badge=$('couple-notice-badge');if(!badge)return;const count=latestInvitations.filter(i=>i.invitee_id===user?.id&&i.status==='pending'&&Date.now()-Date.parse(i.created_at)<7*86400000).length;badge.textContent=String(count);badge.classList.toggle('hidden',count===0);}

  function avatarHTML(profile,label){
    const initial=escape((profile?.display_name||label||'?').trim().slice(0,1).toUpperCase());
    let src='';try{const url=new URL(profile?.avatar_url||'');if(url.protocol==='https:'&&(url.hostname==='googleusercontent.com'||url.hostname.endsWith('.googleusercontent.com')))src=url.href;}catch{}
    return src?`<img class="couple-photo" src="${escape(src)}" alt="${escape(profile?.display_name||label)}" referrerpolicy="no-referrer" loading="lazy"/>`:`<span class="couple-photo couple-photo-fallback" aria-label="${escape(label)}">${initial}</span>`;
  }
  function pairHTML(members,profiles){
    const me=profiles.find(p=>p.user_id===user?.id),partnerMember=members.find(m=>m.user_id!==user?.id),partner=profiles.find(p=>p.user_id===partnerMember?.user_id);
    return `<div class="couple-pair"><div class="couple-person">${avatarHTML(me,'You')}<strong>${escape(me?.display_name||'You')}</strong><small>You</small></div><span class="couple-chain" aria-label="Connected">⛓</span><div class="couple-person">${partnerMember?avatarHTML(partner,'Study partner'):'<span class="couple-photo couple-photo-fallback">?</span>'}<strong>${escape(partner?.display_name||(partnerMember?'Study partner':'Waiting'))}</strong><small>${partnerMember?'Partner':'Waiting for partner'}</small></div></div>`;
  }

  function renderRoom(members,profiles,events){
    const root=$('couples-content');if(!root)return;
    const partner=members.find(m=>m.user_id!==user.id);
    const personal=latestTasks.filter(t=>t.owner_id===user.id),partners=latestTasks.filter(t=>t.owner_id!==user.id);
    const all=[...personal.map(t=>({...t,who:'You'})),...partners.map(t=>({...t,who:'Partner'}))];
    const today=new Date();today.setHours(0,0,0,0);
    const upcoming=all.map(t=>{const [day,month,year]=String(t.due_date).split('/').map(Number);return {...t,dueTs:new Date(year,month-1,day).getTime()};})
      .filter(t=>Number.isFinite(t.dueTs)&&t.dueTs>=today.getTime()).sort((a,b)=>a.dueTs-b.dueTs||a.who.localeCompare(b.who));
    const eventHtml=events.length?events.map(e=>`<li><span class="couple-event-dot">♡</span><span>${e.event_type==='partner_joined'?'Your partner joined the study room.':'Room updated.'}</span><time>${new Date(e.created_at).toLocaleString()}</time></li>`).join(''):'<li class="couple-muted">Room activity will appear here.</li>';
    root.innerHTML=`<div class="page-header"><div><h2 class="page-title">♡ Profile &amp; Study Partner</h2><p class="page-sub">A private study room for two.</p></div><button class="cancel-btn couple-leave" id="couple-leave">End shared room</button></div><div class="card couple-card couple-profile"><span class="couple-eyebrow">YOUR PROFILE</span><h3>Signed in to Focus OS</h3><p>${escape(user?.email||'Google account')} · private to you</p></div>
      <section class="card couple-card couple-together"><span class="couple-eyebrow">CONNECTED ROOM</span><h3>${partner?'You and your study partner':'Your study room is ready'}</h3>${pairHTML(members,profiles)}<p>${partner?'Your Google photos connect your profiles here. Account emails stay private.':'Invite your partner to complete your connected profiles.'}</p><label for="couple-partner-email">Partner’s Google account email</label><input id="couple-partner-email" class="couple-input" type="email" autocomplete="off" maxlength="254" placeholder="name@example.com"/><button class="action-btn couple-primary" id="couple-portal-invite">Send in-portal invite</button><small class="couple-muted">This creates a notice inside their portal only. It does not send an email. The account must already exist in Focus OS.</small><button class="invite-toggle-btn" id="couple-invite">Create one-time code instead</button><div id="couple-code-result"></div></section>
      <section class="card couple-card"><span class="couple-eyebrow">TODAY + UPCOMING</span><h3>Shared study plan</h3><p>Today, tomorrow and future tasks are shown. Tasks marked 🔒 by their owner never appear here.</p><div class="couple-task-list">${upcoming.length?upcoming.map(t=>`<article class="couple-task"><div><strong>${escape(t.title)}</strong><small>${escape(t.subject)} · ${escape(t.who)} · ${escape(t.due_date===todayKey()?'Today':t.due_date===tomorrowKey()?'Tomorrow':t.due_date)}</small></div><span class="couple-task-state ${t.is_done?'is-done':''}">${t.is_done?'Done':'Planned'}</span></article>`).join(''):'<p class="couple-muted">No upcoming shared tasks yet.</p>'}</div></section></div>
      <section class="card couple-card"><span class="couple-eyebrow">IN-PORTAL UPDATES</span><h3>Room activity</h3><ul class="couple-events">${eventHtml}</ul></section>
      <div class="card couple-card couple-privacy"><h3>Privacy settings</h3><p>Tap ↗ beside any of your tasks to share it, or 🔒 to hide it. Your personal notes, diary, reminders and account email are never shared. Only invited signed-in members can read this room.</p></div>
      <p id="couple-message" class="couple-message hidden" role="status"></p>`;
    $('couple-invite')?.addEventListener('click',makeInvite);$('couple-portal-invite')?.addEventListener('click',sendPortalInvite);$('couple-leave')?.addEventListener('click',leaveRoom);
    if(partner){$('couple-partner-email').disabled=true;$('couple-portal-invite').disabled=true;$('couple-invite').disabled=true;}
    renderFocusPage(members,profiles);
  }

  function renderFocusPage(members=[],profiles=[]){
    const root=$('couple-focus-content');if(!root)return;
    if(!user){root.innerHTML='<div class="card couple-card"><p>Sign in to use the shared focus timer.</p></div>';return;}
    const signature=`${coupleId||'none'}:${members.length}`;
    if(root.dataset.roomSignature===signature&&$('couple-focus-status')){renderFocus();return;}
    root.dataset.roomSignature=signature;
    const connected=members.length===2;
    const timerHtml=connected
      ? `<section class="card couple-card shared-timer-card"><div class="shared-timer-heading"><span class="couple-eyebrow">STUDYING TOGETHER</span><span class="shared-live-pill" id="couple-focus-live">READY</span></div>${pairHTML(members,profiles)}<p class="shared-timer-caption">One shared session, visible to both of you.</p><div class="shared-timer-ring" id="couple-focus-ring"><div class="shared-timer-face" id="couple-focus-status" aria-live="polite">25:00</div></div><p class="shared-timer-label" id="couple-focus-label-display">Choose a topic, set your time, and begin.</p><div class="shared-timer-form"><label for="couple-focus-label-input">What are you focusing on?</label><input id="couple-focus-label-input" class="couple-input" maxlength="80" placeholder="e.g. DICD Unit 2 revision"/><label for="couple-focus-duration">Session length</label><div class="custom-duration-row"><input id="couple-focus-duration" class="couple-input custom-duration" type="number" min="1" max="240" step="1" value="25"/><span>minutes · choose 1–240</span></div><div class="shared-timer-actions"><button class="action-btn couple-primary" id="couple-focus-start">Start together</button><button class="cancel-btn" id="couple-focus-stop">Stop session</button></div><p class="shared-timer-hint">Changing or stopping the timer updates it for both partners.</p></div></section>`
      : `<section class="card couple-card shared-timer-card"><span class="couple-eyebrow">WAITING FOR YOUR PARTNER</span>${members.length?pairHTML(members,profiles):''}<h3>Connect a study partner to start together</h3><p>The shared timer appears here after both accounts join your room.</p><button class="action-btn couple-primary" id="go-to-couples">Open Profile &amp; Study Partner</button></section>`;
    root.innerHTML=`<div class="page-header"><div><h2 class="page-title">⏱ Shared Focus Timer</h2><p class="page-sub">Choose your own session length and focus together.</p></div></div>${timerHtml}`;
    $('go-to-couples')?.addEventListener('click',()=>navigateTo('couples'));
    $('couple-focus-start')?.addEventListener('click',startFocus);$('couple-focus-stop')?.addEventListener('click',stopFocus);
    renderFocus();
  }

  async function createRoom(){clearMessage();const b=$('couple-create');if(b)b.disabled=true;try{await call('create_study_couple');await loadRoom();subscribe();await makeInvite();schedulePublish(10);}catch(e){message(e.message||'Could not create the study room.',true);}finally{if(b)b.disabled=false;}}
  async function joinRoom(){clearMessage();const code=$('couple-code')?.value.trim().replace(/\s/g,'');if(!code){message('Paste the invite code first.',true);return;}const b=$('couple-join');if(b)b.disabled=true;try{await call('accept_study_couple_invite',{invite_code:code});await loadRoom();subscribe();schedulePublish(10);message('You joined the study room. Your partner will see the update here.');}catch(e){message(e.message||'Could not join. Check the invite code.',true);}finally{if(b)b.disabled=false;}}
  async function sendPortalInvite(){clearMessage();const email=$('couple-partner-email')?.value.trim();if(!email){message('Enter your partner’s Google account email.',true);return;}const b=$('couple-portal-invite');if(b)b.disabled=true;try{await call('send_study_couple_portal_invite',{invitee_email:email});message('Invite request processed. If the account exists and can join, the invitation will appear inside their portal; no email is sent.');await loadRoom();}catch(e){message(e.message||'Could not create the in-portal invitation.',true);}finally{if(b)b.disabled=false;}}
  async function respondToPortalInvite(id,accept){const b=document.querySelector(`[data-invite-${accept?'accept':'decline'}="${CSS.escape(id)}"]`);if(b)b.disabled=true;try{await call('respond_to_study_couple_invite',{invitation_id:id,accept});await loadRoom();if(accept)subscribe();message(accept?'You joined the study room. Your partner will see the update here.':'Invitation declined.');}catch(e){message(e.message||'Could not respond to this invitation.',true);}finally{if(b)b.disabled=false;}}
  async function makeInvite(){clearMessage();const b=$('couple-invite');if(b)b.disabled=true;try{const code=await call('create_study_couple_invite');const el=$('couple-code-result');if(el)el.innerHTML=`<div class="couple-invite-code"><span>One-time code · expires in 7 days</span><strong>${escape(code)}</strong><button class="cancel-btn" id="couple-copy-code">Copy</button></div>`;$('couple-copy-code')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(code);message('Code copied. Share it privately with your partner.');}catch{message('Copy was blocked. Select and copy the code above.');}});}catch(e){message(e.message||'Could not create an invite code.',true);}finally{if(b)b.disabled=false;}}
  async function leaveRoom(){if(!confirm('End this shared room for both people? Shared tasks, timer and room activity will be deleted. Your personal study data will stay.'))return;try{await call('leave_study_couple');if(channel)client.removeChannel(channel);channel=null;coupleId=null;await loadRoom();message('Shared room ended. Your personal study data is unchanged.');}catch(e){message(e.message||'Could not end the shared room.',true);}}

  function localSharedTasks(){
    const out=[];
    for(const d of Store.get('domains',[])){
      const tasks=Store.get('tasks_'+d.id,[]);
      let changed=false;
      tasks.forEach(t=>{
        if(t.private)return;
        if(!t.id){t.id=crypto.randomUUID();changed=true;}
        const title=String(t.text||'').trim().slice(0,200);if(!title)return;
        out.push({task_id:String(t.id),subject:String(d.name||d.id).slice(0,80),title,due_date:String(t.taskDate||todayKey()).slice(0,20),is_done:!!t.done});
      });
      if(changed)Store.set('tasks_'+d.id,tasks);
    }
    return out.slice(0,3000);
  }
  function schedulePublish(delay=900){if(!client||!user)return;clearTimeout(publishTimer);publishTimer=setTimeout(async()=>{try{await call('replace_my_shared_tasks',{tasks:localSharedTasks()});}catch(e){console.error('Shared task sync failed:',e);if($('page-couples')?.classList.contains('active'))message('Could not sync shared tasks. Check that the couples.sql setup has been run.',true);}},delay);}
  function onLocalDataChanged(key){if(typeof key==='string'&&key.startsWith('tasks_'))schedulePublish();}
  async function loadPage(){if(!user){const root=$('couples-content');if(root)root.innerHTML='<div class="card couple-card"><p>Sign in to manage your study partner.</p></div>';return;}try{await loadRoom();}catch(e){console.error(e);renderSetupError(e);}}

  function subscribe(){
    if(!client||!coupleId)return;if(channel)client.removeChannel(channel);
    channel=client.channel('focus-couple-'+coupleId)
      .on('postgres_changes',{event:'*',schema:'public',table:'couple_tasks',filter:`couple_id=eq.${coupleId}`},()=>loadPage())
      .on('postgres_changes',{event:'*',schema:'public',table:'couple_focus_sessions',filter:`couple_id=eq.${coupleId}`},()=>refreshFocus())
      .on('postgres_changes',{event:'*',schema:'public',table:'couple_events',filter:`couple_id=eq.${coupleId}`},()=>loadPage())
      .subscribe();
    clearInterval(refreshTimer);refreshTimer=setInterval(()=>{if(coupleId)refreshFocus();},5000);
    clearInterval(clockTimer);clockTimer=setInterval(renderFocus,1000);
  }
  function subscribeInbox(){if(!client||!user)return;if(inboxChannel)client.removeChannel(inboxChannel);inboxChannel=client.channel('focus-inbox-'+user.id)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'couple_invitations',filter:`invitee_id=eq.${user.id}`},()=>{loadPage();if(typeof showToast==='function')showToast('♡ New study partner invitation');})
    .subscribe();}
  async function refreshFocus(){if(!client||!coupleId)return;try{const {data,error}=await client.from('couple_focus_sessions').select('started_by,started_at,duration_seconds,label,status,updated_at').eq('couple_id',coupleId).maybeSingle();if(error)throw error;latestFocus=data;renderFocus();}catch(e){console.error('Shared timer refresh:',e);}}
  async function startFocus(){if(!coupleId)return;const label=($('couple-focus-label-input')?.value.trim()||'Focus session').slice(0,80),minutes=Number($('couple-focus-duration')?.value);if(!Number.isInteger(minutes)||minutes<1||minutes>240){message('Choose a whole number from 1 to 240 minutes.',true);return;}try{const {error}=await client.from('couple_focus_sessions').upsert({couple_id:coupleId,started_by:user.id,started_at:new Date().toISOString(),duration_seconds:minutes*60,label,status:'running',updated_at:new Date().toISOString()},{onConflict:'couple_id'});if(error)throw error;await refreshFocus();}catch(e){message(e.message||'Could not start the shared timer.',true);}}
  async function stopFocus(){if(!coupleId||!latestFocus)return;try{const {error}=await client.from('couple_focus_sessions').upsert({...latestFocus,couple_id:coupleId,status:'stopped',updated_at:new Date().toISOString()},{onConflict:'couple_id'});if(error)throw error;await refreshFocus();}catch(e){message(e.message||'Could not stop the shared timer.',true);}}
  function renderFocus(){
    const el=$('couple-focus-status');if(!el)return;
    const ring=$('couple-focus-ring'),live=$('couple-focus-live'),label=$('couple-focus-label-display'),stop=$('couple-focus-stop');
    if(!latestFocus||latestFocus.status!=='running'){
      el.textContent=latestFocus?.status==='stopped'?'Stopped':'25:00';el.classList.remove('is-running');
      if(ring)ring.style.setProperty('--timer-progress','0%');
      if(live){live.textContent=latestFocus?.status==='stopped'?'SESSION ENDED':'READY';live.classList.remove('is-live');}
      if(label)label.textContent=latestFocus?.status==='stopped'?`${latestFocus.label||'Focus session'} · ready when you are`:'Choose a topic, set your time, and begin.';
      if(stop)stop.disabled=true;return;
    }
    const duration=Number(latestFocus.duration_seconds),end=Date.parse(latestFocus.started_at)+duration*1000,remaining=Math.max(0,Math.ceil((end-Date.now())/1000)),progress=Math.min(100,Math.max(0,(1-remaining/duration)*100));
    if(ring)ring.style.setProperty('--timer-progress',`${progress}%`);
    if(live){live.textContent=remaining===0?'COMPLETE':'IN FOCUS';live.classList.toggle('is-live',remaining>0);}
    if(label)label.textContent=remaining===0?`${latestFocus.label} · session complete`:`${latestFocus.label} · ${Math.floor(progress)}% complete`;
    if(stop)stop.disabled=remaining===0;
    if(remaining===0){el.textContent='00:00';el.classList.remove('is-running');return;}
    const hh=Math.floor(remaining/3600),mm=Math.floor((remaining%3600)/60),ss=remaining%60;
    el.textContent=`${hh?String(hh).padStart(2,'0')+':':''}${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;el.classList.add('is-running');
  }

  async function loadFocusPage(){if(!user){renderFocusPage([],[]);return;}try{await loadRoom();}catch(e){console.error(e);const root=$('couple-focus-content');if(root)root.innerHTML=`<section class="card couple-card"><h3>Timer setup needed</h3><p>Run the latest <strong>supabase/couples.sql</strong> in Supabase, then reload.</p><p class="couple-muted">${escape(e.message||'')}</p></section>`;}}

  return {initForUser,close,loadPage,loadFocusPage,onLocalDataChanged};
})();
