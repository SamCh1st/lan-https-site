/* Display required checks in the existing dice roller, including fullscreen maps. */
(function(){
 let pending=null;
 function cancel(){pending?.close(false);}
 function request(config){
  cancel();
  return new Promise(resolve=>{
   const panel=document.getElementById('inventoryDicePanel'),home=document.createComment('dice roller home'),wasHidden=panel.hidden;
   panel.before(home);
   const modal=document.createElement('div');modal.id='partRollModal';modal.className='modal';modal.tabIndex=-1;modal.setAttribute('aria-label','Dice roll to open');
   modal.innerHTML='<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h2 class="modal-title fs-5"></h2><button type="button" class="btn-close" aria-label="Cancel opening check"></button></div><div class="modal-body"><p data-roll-message role="status"></p><div data-roll-host></div></div><div class="modal-footer"><button type="button" class="btn btn-accent" data-roll-open disabled>Open part</button></div></div></div>';
   modal.querySelector('[data-roll-open]').textContent=config.actionLabel||'Open part';
   modal.querySelector('h2').textContent=config.title+' · Opening check';
   const message=modal.querySelector('[data-roll-message]'),open=modal.querySelector('[data-roll-open]');message.textContent='Total needed: '+config.settings.open_roll_target+'. Click the die to roll.';
   modal.querySelector('[data-roll-host]').append(panel);panel.hidden=false;
   (document.fullscreenElement||document.body).append(modal);
   const view=new bootstrap.Modal(modal,{backdrop:'static'});let success=false,closed=false;
   const task={close(value){if(closed)return;success=value;view.hide();}};pending=task;
   modal.querySelector('.btn-close').onclick=()=>task.close(false);open.onclick=()=>task.close(true);
   modal.addEventListener('hidden.bs.modal',()=>{closed=true;RailDice.endCheck();home.replaceWith(panel);panel.hidden=wasHidden;view.dispose();modal.remove();if(pending===task)pending=null;resolve(success);},{once:true});
   RailDice.beginCheck({...config,result(result){const passed=!!result.allowed;open.disabled=!passed;message.textContent=(result.total===undefined?'':('Total '+result.total+' / needed '+config.settings.open_roll_target+' · '))+(passed?'Passed. You can open the part.':'Failed. The part stays closed. You can try again.');}});
   view.show();
  });
 }
 window.MapOpenRoll={request,cancel};
})();
