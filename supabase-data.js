window.FocusCloudData = (() => {
  let client, userId, enabled=false, pending=new Map(), timer=null, flushing=null;
  function status(message,state=""){const el=document.getElementById("sync-status");if(el){el.textContent=message;el.dataset.state=state;}}
  function configure(c){client=c;}
  function clearCache(){try{for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k?.startsWith("fo_"))localStorage.removeItem(k);}}catch{}}
  async function openForUser(user){
    enabled=false;pending.clear();clearTimeout(timer);status("Loading your study data…","saving");
    const local=Store.all();
    const {data:rows,error}=await client.from("study_data").select("data_key,data").eq("user_id",user.id);
    if(error)throw error;
    if(!rows.length){
      const first=Object.entries(local).map(([data_key,data])=>({user_id:user.id,data_key,data,updated_at:new Date().toISOString()}));
      if(first.length){const {error:e}=await client.from("study_data").upsert(first,{onConflict:"user_id,data_key"});if(e)throw e;}
    }else{
      clearCache();
      rows.forEach(r=>{try{localStorage.setItem("fo_"+r.data_key,JSON.stringify(r.data));}catch{}});
    }
    userId=user.id;enabled=true;status("Cloud sync is on","saved");
  }
  function saveKey(key,value){if(!enabled||!userId||!client)return;pending.set(key,value);status("Changes waiting to sync…","saving");clearTimeout(timer);timer=setTimeout(()=>flush(),700);}
  async function flush(){
    clearTimeout(timer);if(!enabled||!userId||!client)return true;
    if(flushing){await flushing;return pending.size?flush():true;}
    if(!pending.size)return true;
    const batch=[...pending.entries()];batch.forEach(([k])=>pending.delete(k));
    const rows=batch.map(([data_key,data])=>({user_id:userId,data_key,data,updated_at:new Date().toISOString()}));
    status("Syncing…","saving");
    flushing=client.from("study_data").upsert(rows,{onConflict:"user_id,data_key"}).then(({error})=>{
      if(error){batch.forEach(([k,v])=>{if(!pending.has(k))pending.set(k,v);});status("Sync failed — local copy retained.","error");if(typeof showToast==="function")showToast("Cloud sync failed. Check connection and sign-in.","error");return false;}
      status("All changes saved","saved");return true;
    }).catch(e=>{batch.forEach(([k,v])=>{if(!pending.has(k))pending.set(k,v);});status("Sync failed — local copy retained.","error");if(typeof showToast==="function")showToast("Cloud sync failed. Check connection and sign-in.","error");console.error(e);return false;}).finally(()=>{flushing=null;});
    return flushing;
  }
  function close(){enabled=false;userId=null;pending.clear();clearTimeout(timer);status("Signed out","");clearCache();}
  window.addEventListener("online",()=>{if(pending.size)flush();});
  return {configure,openForUser,saveKey,flush,close,status};
})();
