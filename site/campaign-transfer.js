/* Main-library campaign ZIP transfers. */
window.CampaignTransfer=(()=>{
 let busy=false;
 const status=text=>{document.getElementById('campaignTransferStatus').textContent=text;};
 const t=text=>window.SiteI18n?.translate?.(text)||text;
 function setBusy(value){busy=value;document.querySelectorAll('#importCampaignButton,.campaign-export').forEach(el=>el.disabled=value);}
 async function error(response){try{return (await response.json()).error||'Campaign transfer failed.';}catch{return 'Campaign transfer failed.';}}
 async function download(campaign,button){
  if(busy)return;setBusy(true);status(t('Preparing campaign download…'));
  try{
   const response=await fetch('/api/campaign/'+campaign.id+'/export');if(!response.ok)throw Error(await error(response));
   const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download=(campaign.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,100)||'campaign')+'.zip';
   document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
   status(t('Campaign downloaded.'));
  }catch(e){status(e.message);}finally{setBusy(false);button?.focus();}
 }
 function setup(onImported){
  const input=document.getElementById('campaignImportFile');
  document.getElementById('importCampaignButton').addEventListener('click',()=>{if(!busy)input.click();});
  input.addEventListener('change',async()=>{
   const file=input.files[0];input.value='';if(!file||busy)return;
   if(file.size>512*1024*1024){status(t('Choose a campaign ZIP up to 512 MB.'));return;}
   if(!confirm(t('Import this file as a new campaign? You will own the copy. Account logins and other players’ private notes are not imported. Invite players again to continue playing.')))return;
   setBusy(true);status(t('Importing campaign…'));
   try{
    const response=await fetch('/api/campaign/import',{method:'POST',headers:{'Content-Type':'application/zip'},body:file});
    if(!response.ok)throw Error(await error(response));const result=await response.json();
    await onImported(result);status(t('Campaign imported.')+' '+result.title);
   }catch(e){status(e.message);}finally{setBusy(false);}
  });
 }
 async function assignPlayers(campaign){
  if(busy)return;setBusy(true);
  try{
   const url='/api/campaign/'+campaign.id+'/imported-players',response=await fetch(url);if(!response.ok)throw Error(await error(response));const data=await response.json();
   const dialog=document.createElement('dialog');dialog.className='campaign-player-dialog';
   const form=document.createElement('form');form.method='dialog';
   const title=document.createElement('h3');title.textContent=t('Assign imported players');form.append(title);
   const help=document.createElement('p');help.textContent=t('Invite players into this campaign first. After they accept, match their old characters to their accounts here. Saved map positions will be restored.');form.append(help);
   const selects=[];
   for(const player of data.players){const label=document.createElement('label');label.textContent=player.username;const select=document.createElement('select');select.append(new Option(t('Leave unchanged'),''));for(const member of data.members)select.append(new Option(member.username,member.id));label.append(select);form.append(label);selects.push([player.id,select]);}
   const result=document.createElement('p');result.setAttribute('role','status');form.append(result);
   const save=document.createElement('button');save.textContent=t('Save assignments');save.type='submit';form.append(save);
   const cancel=document.createElement('button');cancel.type='button';cancel.textContent=t('Cancel');cancel.onclick=()=>dialog.close();form.append(cancel);
   form.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{const mapping=Object.fromEntries(selects.filter(([id,s])=>s.value).map(([id,s])=>[id,Number(s.value)]));const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mapping})});if(!response.ok)throw Error(await error(response));status(t('Player assignments saved.'));dialog.close();}catch(e){result.textContent=e.message;}finally{save.disabled=false;}};
   dialog.append(form);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
  }catch(e){status(e.message);}finally{setBusy(false);}
 }
 return {setup,download,assignPlayers};
})();
