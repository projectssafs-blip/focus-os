const Auth=(()=>{
  let client=null,activeUserId=null,openingUserId=null,loginNotice=null;
  function login(message,isError=false){
    document.getElementById("app")?.classList.add("hidden");document.getElementById("lock-screen")?.classList.remove("hidden");
    const s=document.getElementById("login-status");if(s)s.textContent=message||"";
    const a=document.getElementById("lock-alert");if(a){a.textContent=isError?message:"";a.classList.toggle("hidden",!isError);}
  }
  async function activate(session){
    if(!session?.user){if(activeUserId){window.FocusCloudData.close();activeUserId=null;}const note=loginNotice;loginNotice=null;login(note||"Sign in with Google to open your study workspace.",!!note);return;}
    const user=session.user;if(activeUserId===user.id||openingUserId===user.id)return;
    const owner=window.FOCUS_OS_SUPABASE?.ownerEmail?.trim().toLowerCase();
    if(!owner||user.email?.trim().toLowerCase()!==owner){loginNotice="This Google account is not authorized for this workspace.";await client.auth.signOut();return;}
    openingUserId=user.id;login("Loading your private study data…");
    try{
      await window.FocusCloudData.openForUser(user);activeUserId=user.id;
      const e=document.getElementById("account-email");if(e)e.textContent=user.email||"Google account";
      document.getElementById("lock-screen")?.classList.add("hidden");document.getElementById("app")?.classList.remove("hidden");
      requestAnimationFrame(()=>setTimeout(()=>{if(typeof initApp==="function")initApp();},50));
    }catch(e){console.error(e);login(e.message||"Could not load study data. Check Supabase setup.",true);}
    finally{openingUserId=null;}
  }
  async function init(){
    const c=window.FOCUS_OS_SUPABASE,b=document.getElementById("google-signin-btn"),h=document.getElementById("auth-hint");
    const ok=c&&/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(c.url||"")&&/^sb_publishable_[A-Za-z0-9_-]+$/.test(c.publishableKey||"")&&c.ownerEmail&&c.ownerEmail!=="REPLACE_WITH_YOUR_GOOGLE_EMAIL";
    if(!ok||!window.supabase?.createClient){if(b)b.disabled=true;if(h)h.textContent="Set the Project URL, publishable key, and your Google email in supabase-config.js, then enable Google sign-in.";login("Supabase is not configured yet.");return;}
    client=window.supabase.createClient(c.url,c.publishableKey);window.FocusCloudData.configure(client);
    b?.addEventListener("click",async()=>{if(b){b.disabled=true;b.textContent="Opening Google…";}
      const redirectTo=location.origin+location.pathname;
      const {error}=await client.auth.signInWithOAuth({provider:"google",options:{redirectTo}});
      if(error){login(error.message,true);if(b){b.disabled=false;b.textContent="Continue with Google";}}
    });
    client.auth.onAuthStateChange((_event,s)=>setTimeout(()=>activate(s),0));
    const {data,error}=await client.auth.getSession();if(error){login(error.message,true);return;}await activate(data.session);
  }
  async function logout(){if(!client)return;if(!await window.FocusCloudData.flush()){showToast("Sync has unsaved changes. Check your connection before signing out.","error");return;}const {error}=await client.auth.signOut();if(error)showToast(error.message,"error");}
  return {init,logout};
})();
document.addEventListener("DOMContentLoaded",()=>Auth.init());
