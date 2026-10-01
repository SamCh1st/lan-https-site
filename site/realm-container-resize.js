/* Desktop outer-frame width; local preference, independent of campaign data. */
(()=>{
 const root=document.getElementById('workspace'),campaign=document.getElementById('campaignView'),dashboard=document.getElementById('campaignDashboard');if(!root||!campaign)return;
 const desktop=matchMedia('(min-width:901px) and (hover:hover) and (pointer:fine)'),key='realm-campaign-width:v1';let preferred=0,drag=null,frame=0;
 try{preferred=Number(localStorage.getItem(key))||0;}catch{}
 const handles=[];const limit=()=>Math.max(860,document.documentElement.clientWidth-32),clamp=n=>Math.max(860,Math.min(limit(),n));
 function save(){try{if(preferred)localStorage.setItem(key,String(preferred));else localStorage.removeItem(key);}catch{}}
 function refresh(){frame=0;const active=desktop.matches&&!campaign.classList.contains('d-none')&&!document.fullscreenElement&&!dashboard?.classList.contains('map-workspace-fullscreen')&&!dashboard?.classList.contains('chat-fullscreen');root.classList.toggle('realm-outer-resizable',active);root.classList.toggle('realm-outer-sized',active&&preferred>0);const width=clamp(preferred);root.style.setProperty('--realm-campaign-width',width+'px');for(const h of handles){h.hidden=!active;h.setAttribute('aria-valuemin','860');h.setAttribute('aria-valuemax',String(limit()));h.setAttribute('aria-valuenow',String(Math.round(root.getBoundingClientRect().width)));}}
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(refresh);};
 function reset(){preferred=0;save();schedule();}
 for(const side of ['left','right']){const h=document.createElement('div');h.className='realm-outer-handle';h.dataset.outerSide=side;h.tabIndex=0;h.hidden=true;h.setAttribute('role','separator');h.setAttribute('aria-orientation','vertical');h.setAttribute('aria-label','Campaign container width: '+side+' edge');h.setAttribute('aria-controls','workspace');h.title='Drag to resize campaign width. Arrow keys adjust; double-click or Home resets.';root.append(h);handles.push(h);
 h.onpointerdown=e=>{if(e.button!==0||e.pointerType==='touch')return;e.preventDefault();h.focus();drag={id:e.pointerId,x:e.clientX,width:root.getBoundingClientRect().width,previous:preferred};h.setPointerCapture(e.pointerId);document.body.classList.add('realm-resizing');};
 h.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;preferred=clamp(drag.width+(e.clientX-drag.x)*(side==='left'?-2:2));schedule();};
 const finish=e=>{if(!drag||drag.id!==e.pointerId)return;if(e.type==='pointercancel')preferred=drag.previous;drag=null;document.body.classList.remove('realm-resizing');save();schedule();};h.onpointerup=finish;h.onpointercancel=finish;h.onlostpointercapture=finish;h.ondblclick=reset;
 h.onkeydown=e=>{if(e.key==='Home'){e.preventDefault();e.stopPropagation();reset();}else if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();e.stopPropagation();preferred=clamp(root.getBoundingClientRect().width+(e.key==='ArrowRight'?1:-1)*(side==='left'?-1:1)*(e.shiftKey?100:20));save();schedule();}};
 }
 new MutationObserver(schedule).observe(campaign,{attributes:true,attributeFilter:['class']});if(dashboard)new MutationObserver(schedule).observe(dashboard,{attributes:true,attributeFilter:['class']});desktop.addEventListener('change',schedule);window.addEventListener('resize',schedule);document.addEventListener('fullscreenchange',schedule);schedule();
})();
