/* Keep the writing-persona picker above scrollable chat regions, including fullscreen. */
(() => {
  const menu=document.getElementById('aiSpeakerMenu'),button=document.getElementById('aiSpeakerButton');
  if (!menu || !button) return;
  const native=typeof menu.showPopover==='function';
  if (native) menu.setAttribute('popover','manual');
  else document.getElementById('aiChatForm').classList.add('speaker-menu-fallback');
  function place() {
    if (menu.classList.contains('d-none')) return;
    const anchor=button.getBoundingClientRect(),width=Math.min(235,innerWidth-16);
    const above=anchor.top-16,below=innerHeight-anchor.bottom-16,up=above>=Math.min(180,below);
    menu.style.width=width+'px';
    menu.style.maxHeight=Math.max(60,Math.min(430,up?above:below))+'px';
    menu.style.left=Math.max(8,Math.min(anchor.left,innerWidth-width-8))+'px';
    menu.style.top=(up?Math.max(8,anchor.top-menu.getBoundingClientRect().height-7):anchor.bottom+7)+'px';
  }
  function sync() {
    const open=!menu.classList.contains('d-none');
    button.setAttribute('aria-expanded',String(open));
    if (native) {
      if (open && !menu.matches(':popover-open')) menu.showPopover();
      else if (!open && menu.matches(':popover-open')) menu.hidePopover();
    }
    if (open) place();
  }
  function close() { menu.classList.add('d-none');sync(); }
  new MutationObserver(sync).observe(menu,{attributes:true,attributeFilter:['class'],childList:true});
  window.addEventListener('resize',place);
  document.addEventListener('scroll',place,true);
  document.addEventListener('fullscreenchange',close);
  document.addEventListener('keydown',event=>{
    if (event.key==='Escape' && !menu.classList.contains('d-none')) {event.preventDefault();event.stopImmediatePropagation();close();button.focus();}
  },true);
})();
