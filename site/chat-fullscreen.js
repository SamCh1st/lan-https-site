/**
 * Coordinate native or fallback chat fullscreen and side-panel visibility.
 * See [README: browser interface](../README.md#browser-interface).
 */
/* Same native-fullscreen / viewport-fallback behavior as the 2D workspace. */
(function () {
  const root=document.querySelector('#campaignDashboard'),panel=document.querySelector('#aiCampaignPanel');
  if(!root||!panel)return;
  const compact=matchMedia('(max-width: 950px), (pointer: coarse)');
  let open={left:true,right:true},lastPlayer=false,priorFocus=null,home=null,extrasOpen=true;
  const entry=document.createElement('div');entry.className='chat-fullscreen-entry';
  const enter=document.createElement('button');enter.type='button';enter.textContent='Fullscreen chat';enter.setAttribute('aria-pressed','false');entry.append(enter);panel.prepend(entry);
  const bar=document.createElement('header');bar.id='chatFullscreenBar';
  const title=document.createElement('strong');title.textContent='Chat';bar.append(title);
  const toggles={};
  for(const side of ['left','right']){
    const button=document.createElement('button');button.type='button';button.dataset.chatPanel=side;
    button.onclick=()=>{open[side]=!open[side];if(compact.matches&&open[side])open[side==='left'?'right':'left']=false;refresh();};
    toggles[side]=button;bar.append(button);
  }
  const leave=document.createElement('button');leave.type='button';leave.textContent='Exit fullscreen';leave.onclick=()=>exit();bar.append(leave);root.prepend(bar);
  /**
   * Synchronize fullscreen controls and panel state with the current browser layout.
   * See [README](../README.md#browser-interface).
   */
  function refresh(){
    const player=root.classList.contains('ai-player-tools-active');lastPlayer=player;
    root.classList.toggle('chat-compact-panels',compact.matches);
    for(const [selector,side,active] of [['.ai-world-left','left',!player],['.ai-world-right','right',!player],['.inventory-rail','left',player],['.attacks-rail','right',player]]){
      const rail=root.querySelector(':scope > '+selector);if(!rail)continue;
      rail.dataset.chatSide=side;rail.dataset.chatActive=String(active);
    }
    for(const side of ['left','right']){
      root.classList.toggle('chat-hide-'+side,!open[side]);
      const label=side==='left'?(player?'Inventory / dice':'Scene'):(player?'Spells':'Details');
      toggles[side].textContent=label+(open[side]?' ▾':' ▸');toggles[side].setAttribute('aria-expanded',String(open[side]));toggles[side].setAttribute('aria-label',(open[side]?'Hide ':'Show ')+label.toLowerCase());
    }
    enter.setAttribute('aria-pressed',String(root.classList.contains('chat-fullscreen')));
  }
  function restore(){
    root.classList.remove('chat-fullscreen','chat-fullscreen-fallback');refresh();
    document.querySelector('#aiChatExtras').open=extrasOpen;
    if(home?.isConnected)home.replaceWith(root);home=null;
    if(priorFocus?.isConnected)priorFocus.focus({preventScroll:true});priorFocus=null;
  }
  async function exit(){
    if(!root.classList.contains('chat-fullscreen'))return;
    if(document.fullscreenElement===root){try{await document.exitFullscreen();}catch{restore();}}
    else{restore();document.dispatchEvent(new Event('fullscreenchange'));}
  }
  enter.onclick=async()=>{
    if(root.classList.contains('chat-fullscreen'))return exit();
    priorFocus=document.activeElement;extrasOpen=document.querySelector('#aiChatExtras').open;document.querySelector('#aiChatExtras').open=false;open={left:!compact.matches,right:!compact.matches};
    root.classList.add('chat-fullscreen');refresh();
    try{await root.requestFullscreen();}catch{
      home=document.createComment('Chat fullscreen position');root.before(home);document.body.append(root);
      root.classList.add('chat-fullscreen-fallback');
    }
    leave.focus({preventScroll:true});
  };
  document.addEventListener('fullscreenchange',()=>{if(root.classList.contains('chat-fullscreen')&&document.fullscreenElement!==root&&!root.classList.contains('chat-fullscreen-fallback'))restore();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented&&root.classList.contains('chat-fullscreen-fallback')&&!document.querySelector('.modal.show')){event.preventDefault();exit();}});
  compact.addEventListener('change',()=>{if(compact.matches)open={left:false,right:false};refresh();});
  new MutationObserver(()=>{if(lastPlayer!==root.classList.contains('ai-player-tools-active'))refresh();}).observe(root,{attributes:true,attributeFilter:['class']});
  new MutationObserver(()=>{if(panel.classList.contains('d-none'))exit();}).observe(panel,{attributes:true,attributeFilter:['class']});
  window.ChatFullscreen={exit,setTitle(value){title.textContent=value||'Chat';}};
  refresh();
})();
