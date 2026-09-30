/* Desktop splitters keep layout preferences in this browser, never in campaign data. */
(() => {
  'use strict';
  const desktop = matchMedia('(min-width: 901px) and (hover: hover) and (pointer: fine)');
  const storageKey = 'realm-panel-sizes:v1';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch {}
  if (typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  const definitions = [
    {id:'campaignDashboard', center:'.map-stage', name:'Map and campaign panels', height:true},
    {id:'spellAtelier', center:'.sa-center', name:'Spell workshop panels', surface:'.sa-surface'},
    {id:'aaEditor', center:'.aa-canvas-panel', name:'Art tools and canvas', surface:'#aaCanvas', two:true}
  ];
  const states = new Map();
  let frame = 0, drag = null;
  const clamp = (n,lo,hi) => Math.max(lo,Math.min(hi,n));
  const visible = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none';
  const persist = () => { try { localStorage.setItem(storageKey,JSON.stringify(saved)); } catch {} };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(refresh); };
  function makeHandle(state,side) {
    const handle = document.createElement('div');
    handle.className = 'realm-splitter'; handle.dataset.resizeSide = side;
    handle.tabIndex = 0; handle.setAttribute('role','separator');
    handle.setAttribute('aria-orientation',side === 'height' ? 'horizontal' : 'vertical');
    handle.setAttribute('aria-label',state.def.name + ': ' + (side === 'height' ? 'height' : side + ' panel width'));
    handle.setAttribute('aria-controls',state.root.id);
    handle.title = 'Drag to resize. Arrow keys adjust. Double-click or Home resets.';
    handle.hidden = true;
    handle.addEventListener('pointerdown',event => {
      if (event.button !== 0 || event.pointerType === 'touch') return;
      event.preventDefault(); handle.focus();
      drag = {state,side,handle,pointer:event.pointerId,x:event.clientX,y:event.clientY,start:{...state.sizes}};
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add('realm-resizing');
      document.body.classList.toggle('realm-resizing-height',side === 'height');
    });
    handle.addEventListener('pointermove',event => {
      if (!drag || drag.handle !== handle) return;
      const delta = side === 'height' ? event.clientY-drag.y : (event.clientX-drag.x)*(side === 'right' ? -1 : 1);
      change(state,side,drag.start[side]+delta);
    });
    const finish = event => {
      if (!drag || drag.handle !== handle) return;
      if (event.type === 'pointercancel') { state.sizes = drag.start; apply(state); }
      else { saved[state.key] = {...state.sizes}; persist(); }
      drag = null; document.body.classList.remove('realm-resizing','realm-resizing-height'); schedule();
    };
    handle.addEventListener('pointerup',finish); handle.addEventListener('pointercancel',finish); handle.addEventListener('lostpointercapture',finish);
    handle.addEventListener('dblclick',() => reset(state));
    handle.addEventListener('keydown',event => {
      if (event.key === 'Home') { event.preventDefault(); event.stopPropagation(); reset(state); return; }
      const axis = side === 'height' ? ['ArrowUp','ArrowDown'] : ['ArrowLeft','ArrowRight'];
      if (!axis.includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const sign = (event.key === axis[0] ? -1 : 1)*(side === 'right' ? -1 : 1);
      change(state,side,state.sizes[side]+sign*(event.shiftKey ? 40 : 10));
      saved[state.key] = {...state.sizes}; persist();
    });
    state.root.append(handle); return handle;
  }
  function reset(state) { delete saved[state.key]; persist(); state.key = ''; schedule(); }
  function change(state,side,value) { state.sizes[side] = clamp(value,state.limits[side][0],state.limits[side][1]); apply(state); }
  function apply(state) {
    const {root,sizes,def} = state;
    root.style.setProperty('--realm-columns',`${sizes.left}px minmax(0,1fr)${def.two ? '' : ` ${sizes.right}px`}`);
    root.style.setProperty('--realm-work-height',`${sizes.height}px`);
    root.classList.add('realm-resizable-columns');
    root.classList.toggle('realm-resizable-height',state.canHeight);
    schedule();
  }
  function refresh() {
    frame = 0;
    for (const def of definitions) {
      const root = document.getElementById(def.id); if (!root) continue;
      let state = states.get(root);
      if (!state) {
        state = {root,def,key:'',sizes:{},handles:{}}; states.set(root,state);
        for (const side of def.two ? ['left','height'] : ['left','right','height']) state.handles[side] = makeHandle(state,side);
        new ResizeObserver(schedule).observe(root);
      }
      const center = root.querySelector(def.center), fullscreen = document.fullscreenElement;
      const excluded = def.id === 'campaignDashboard' && root.matches('.archive-mode,.art-mode,.spell-mode,.map-mobile-drawers');
      const allowed = desktop.matches && visible(root) && visible(center) && !excluded && (!fullscreen || fullscreen === root || fullscreen.contains(root));
      if (!allowed) {
        Object.values(state.handles).forEach(h => h.hidden = true);
        root.classList.remove('realm-resizable-columns','realm-resizable-height'); state.key = ''; continue;
      }
      // Read the workspace's own layout first, preserving its hidden/fullscreen columns.
      root.classList.remove('realm-resizable-columns','realm-resizable-height');
      const css = getComputedStyle(root);
      // Fieldsets expose authored minmax() values rather than resolved grid tracks.
      const columns = def.two ? [root.querySelector('.aa-tool-panel').getBoundingClientRect().width,center.getBoundingClientRect().width] : css.gridTemplateColumns.split(' ').map(parseFloat);
      if (columns.length !== (def.two ? 2 : 3) || columns.some(n => !Number.isFinite(n))) {
        Object.values(state.handles).forEach(h => h.hidden = true); state.key = ''; continue;
      }
      const full = root.matches('.map-workspace-fullscreen,:fullscreen');
      const key = def.id + (full ? ':full' : ':page') + (root.classList.contains('map-contents-open') ? ':trade' : '') + ':' + (columns[0]>1 ? 'L' : '') + (!def.two && columns[2]>1 ? 'R' : '');
      const surface = def.surface ? root.querySelector(def.surface) : center;
      state.canHeight = !fullscreen && !full;
      const width = columns.reduce((a,b) => a+b,0), minCenter = def.two ? 360 : 320;
      const leftMin = columns[0]>1 ? 180 : 0, rightMin = !def.two && columns[2]>1 ? 180 : 0;
      if (width < leftMin+rightMin+minCenter) { Object.values(state.handles).forEach(h => h.hidden = true); state.key = ''; continue; }
      if (state.key !== key) {
        state.key = key;
        const initial = {left:columns[0],right:def.two ? 0 : columns[2],height:surface.getBoundingClientRect().height};
        const stored = saved[key];
        state.sizes = {...initial};
        for (const name of ['left','right','height']) if (Number.isFinite(stored?.[name])) state.sizes[name] = stored[name];
      }
      state.sizes.left = leftMin ? clamp(state.sizes.left,leftMin,width-minCenter-rightMin) : 0;
      state.sizes.right = rightMin ? clamp(state.sizes.right,rightMin,width-minCenter-state.sizes.left) : 0;
      state.sizes.height = clamp(state.sizes.height,360,1200);
      state.limits = {left:[leftMin,width-minCenter-state.sizes.right],right:[rightMin,width-minCenter-state.sizes.left],height:[360,1200]};
      root.style.setProperty('--realm-columns',`${state.sizes.left}px minmax(0,1fr)${def.two ? '' : ` ${state.sizes.right}px`}`);
      root.style.setProperty('--realm-work-height',`${state.sizes.height}px`);
      root.classList.add('realm-resizable-columns'); root.classList.toggle('realm-resizable-height',state.canHeight);
      const box = root.getBoundingClientRect(), middle = center.getBoundingClientRect(), gap = parseFloat(css.columnGap)||0;
      for (const [side,handle] of Object.entries(state.handles)) {
        const horizontal = side === 'height';
        handle.hidden = horizontal ? !state.canHeight : side === 'left' ? !leftMin : !rightMin;
        if (handle.hidden) continue;
        const target = horizontal ? surface.getBoundingClientRect() : middle;
        const left = horizontal ? target.left-box.left : side === 'left' ? middle.left-box.left-gap/2-5 : middle.right-box.left+gap/2-5;
        handle.style.cssText = `left:${left+root.scrollLeft}px;top:${(horizontal ? target.bottom-box.top-5 : middle.top-box.top)+root.scrollTop}px;width:${horizontal ? target.width : 10}px;height:${horizontal ? 10 : middle.height}px;`;
        handle.setAttribute('aria-valuemin',Math.round(state.limits[side][0]));
        handle.setAttribute('aria-valuemax',Math.round(state.limits[side][1]));
        handle.setAttribute('aria-valuenow',Math.round(state.sizes[side]));
        handle.setAttribute('aria-valuetext',Math.round(state.sizes[side])+' pixels');
      }
    }
  }
  const signatures = new WeakMap();
  new MutationObserver(records => {
    for (const record of records) {
      const node = record.target;
      if (!definitions.some(d => d.id === node.id) && node.id !== 'artAtelier') continue;
      const signature = node.className.replace(/realm-resizable-(columns|height)/g,'')+'|'+node.hidden+'|'+node.style.gridTemplateColumns;
      if (signatures.get(node) !== signature) { signatures.set(node,signature); schedule(); }
    }
  }).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','hidden','style']});
  desktop.addEventListener('change',schedule);
  window.addEventListener('resize',schedule); document.addEventListener('fullscreenchange',schedule);
  document.addEventListener('DOMContentLoaded',schedule); schedule();
})();
