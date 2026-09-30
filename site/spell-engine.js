(function (root) {
  'use strict';
  // A deliberately bounded, fan interpretation of the illustrated spell grammar.
  // Templates are original shorthand, not reproductions of official glyph art.
  const catalog = {
    fire: { name: 'Fire', group: 'sigil', hint: 'Flame and heat', color: '#e77645', path: 'M0 -44 C8 -17 38 -11 25 20 C37 6 45 33 16 42 C-24 55 -42 22 -24 0 C-21 20 -7 17 -9 5 C-15 -14 2 -26 0 -44 Z' },
    water: { name: 'Water', group: 'sigil', hint: 'Water and flowing currents', color: '#438fbd', path: 'M0 -43 C-8 -24 -33 2 -29 21 C-23 50 26 48 30 19 C32 1 9 -22 0 -43 Z M-18 18 Q0 5 19 18 M-15 29 Q0 18 16 29' },
    earth: { name: 'Earth', group: 'sigil', hint: 'Stone, soil and solid matter', color: '#a88148', path: 'M0 -40 L34 0 L0 40 L-34 0 Z M-34 0 H34 M0 -40 V40 M-20 20 H20' },
    wind: { name: 'Wind', group: 'sigil', hint: 'Moving air', color: '#568f78', path: 'M26 -32 C-12 -54 -42 -7 -3 -4 C38 -1 33 43 -9 38 M-35 9 Q0 -5 34 9 M-26 24 Q0 10 24 24' },
    light: { name: 'Light', group: 'sigil', hint: 'Illumination and radiance', color: '#bc942d', path: 'M0 -40 L8 -9 L35 0 L8 9 L0 40 L-8 9 L-35 0 L-8 -9 Z M-28 -28 L-19 -19 M28 -28 L19 -19 M28 28 L19 19 M-28 28 L-19 19' },
    column: { name: 'Columns', group: 'sign', hint: 'T-shaped sign · a directed jet', path: 'M-30 -33 H30 M0 -33 V38' },
    dispersion: { name: 'Dispersion', group: 'sign', hint: 'An outward spray', path: 'M0 38 V0 M0 0 L-30 -32 M0 0 V-40 M0 0 L30 -32 M-30 -32 V-12 M30 -32 V-12' },
    levitation: { name: 'Levitation', group: 'sign', hint: 'Lift into a hovering orb', path: 'M-32 12 Q0 -40 32 12 M0 -14 V38 M-21 25 H21' },
    convergence: { name: 'Convergence', group: 'sign', hint: 'Triangle · gather into a point', path: 'M0 -40 L35 30 H-35 Z' },
    pulling: { name: 'Pulling', group: 'sign', hint: 'Draw material inward; rotate to redirect', path: 'M0 40 V-36 M-26 -10 L0 -36 L26 -10 M-19 16 H19' },
    crushing: { name: 'Crushing', group: 'sign', hint: 'Break earth into fragments', path: 'M-35 -32 L-10 -6 L-28 10 L-5 36 M35 -32 L10 -6 L28 10 L5 36 M0 -36 V-20' },
    stability: { name: 'Stability', group: 'sign', hint: 'Parallel bars · steady the effect', path: 'M-35 -23 H35 M-35 0 H35 M-35 23 H35' },
    concealment: { name: 'Concealment', group: 'sign', hint: 'Hides a target · exact mechanism inferred', path: 'M-38 0 Q0 -38 38 0 Q0 38 -38 0 M-30 30 L30 -30' },
    regions: { name: 'Regions', group: 'sign', hint: 'Defines where an effect manifests', path: 'M-35 -30 V30 H35 V-30 M-20 0 H20 M10 -10 L20 0 L10 10' },
    repetition: { name: 'Repetition', group: 'sigil', hint: 'Restores an initial state; not a guarantee of permanence', color: '#8973a1', path: 'M-30 -15 A34 34 0 1 1 -25 25 M-30 -15 V-38 M-30 -15 H-7' },
    concept: { name: 'Proposed symbol', group: 'concept', hint: 'A labeled design idea; not an established symbol', color: '#9065ac', path: 'M0 -40 L38 -12 L24 32 H-24 L-38 -12 Z M-10 -13 Q-8 -30 7 -22 Q23 -12 3 0 V10 M3 22 V24' },
    ring: { name: 'Enclosing ring', group: 'shape', hint: 'A closed circle activates its contents' },
    openRing: { name: 'Open ring', group: 'shape', hint: 'Prepare the seal; close its gap to activate' },
    line: { name: 'Line', group: 'shape', hint: 'Construction mark · does not add a spell instruction', path: 'M-40 0 H40' },
    stroke: { name:'Custom stroke', group:'shape', hint:'Editable construction polyline; not a named magic symbol', path:'M-40 0 H40' },
    arc: { name: 'Arc', group: 'shape', hint: 'Construction mark · does not close a ring', path: 'M-35 25 A40 40 0 1 1 35 25' }
  };
  const extra=typeof module!=='undefined'&&module.exports?require('./spell-symbols.js'):root.SpellSymbols;
  for(const [type,c] of Object.entries(extra||{})) catalog[type]={...c,advanced:true,source:'https://witchhatatelier.telepedia.net/wiki/'+(c.group==='sigil'?'Sigils':'Signs')+'_Explained#'+(c.heading||c.name.replaceAll(' ','_'))};
  const copy = v => JSON.parse(JSON.stringify(v));
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const snap = (v, step, enabled) => enabled ? Math.round(v / step) * step : v;
  const isRing = n => n.type === 'ring' || n.type === 'openRing';
  function make(type, x, y) {
    if (!catalog[type]) throw new Error('Unknown symbol');
    return { id: 's' + Math.random().toString(36).slice(2, 12), type, x, y, w: isRing({ type }) ? 320 : 60, h: isRing({ type }) ? 320 : 60, rotation: 0 };
  }
  function local(n, p) {
    const r = -n.rotation * Math.PI / 180, dx = p.x - n.x, dy = p.y - n.y;
    return { x: dx * Math.cos(r) - dy * Math.sin(r), y: dx * Math.sin(r) + dy * Math.cos(r) };
  }
  function world(n, x, y) {
    const r = n.rotation * Math.PI / 180;
    return { x: n.x + x * Math.cos(r) - y * Math.sin(r), y: n.y + x * Math.sin(r) + y * Math.cos(r) };
  }
  function corners(n) { return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y]) => world(n, x*n.w/2, y*n.h/2)); }
  function inside(ring, n) {
    const points = isRing(n) ? Array.from({length: 48}, (_, i) => world(n, Math.cos(i*Math.PI/24)*n.w/2, Math.sin(i*Math.PI/24)*n.h/2)) : corners(n);
    return points.every(p => { const q = local(ring,p); return (q.x/(ring.w/2))**2 + (q.y/(ring.h/2))**2 < .98; });
  }
  function sanitize(value) {
    if (!Array.isArray(value) || value.length > 1200) return [];
    const ids = new Set();
    return value.filter(n => n && catalog[n.type] && (n.type!=='stroke'||!n.points||(Array.isArray(n.points)&&n.points.length>=2&&n.points.length<=64&&n.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=100)))) && typeof n.id === 'string' && /^s[a-z0-9]+$/i.test(n.id) && !ids.has(n.id) && ids.add(n.id) && ['x','y','w','h','rotation'].every(k => Number.isFinite(n[k])) && n.w >= 10 && n.h >= 10 && n.w <= 12000 && n.h <= 12000 && Math.abs(n.x) <= 100000 && Math.abs(n.y) <= 100000).map(n => ({id:n.id,type:n.type,x:n.x,y:n.y,w:n.w,h:n.h,rotation:n.rotation % 360,...(n.type==='stroke'?{points:copy(n.points||[[-40,0],[40,0]]),closed:!!n.closed}:{}),...(n.type==='concept'?{label:String(n.label||'Proposed symbol').slice(0,60),meaning:String(n.meaning||'Unspecified proposed mechanic.').slice(0,500)}:{})}));
  }
  function branches(nodes) {
    const rings=nodes.filter(n=>n.type==='ring').sort((a,b)=>Math.hypot(a.x,a.y)-Math.hypot(b.x,b.y)||b.w*b.h-a.w*a.h),main=rings[0],connected=new Set();
    if(!main)return {main:null,connected};
    const graph=new Map(nodes.map(n=>[n.id,new Set()])),paths=new Map();
    for(const n of nodes)if(['stroke','line'].includes(n.type)){
      const pts=(n.type==='stroke'?(n.points||[[-40,0],[40,0]]):[[-40,0],[40,0]]).map(p=>world(n,p[0]*n.w/100,p[1]*n.h/100));
      if(n.closed)pts.push(pts[0]);paths.set(n.id,pts.slice(1).map((p,i)=>[pts[i],p]));
    }
    const dist=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy,t=d?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/d,0,1):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);};
    const touch=(n,a,b)=>dist(n,a,b)<=Math.min(n.w,n.h)/2+3&&(!isRing(n)||Math.max(Math.hypot(n.x-a.x,n.y-a.y),Math.hypot(n.x-b.x,n.y-b.y))>=Math.min(n.w,n.h)/2-3);
    const side=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
    const cross=(a,b,c,d)=>side(a,b,c)*side(a,b,d)<0&&side(c,d,a)*side(c,d,b)<0||Math.min(dist(a,c,d),dist(b,c,d),dist(c,a,b),dist(d,a,b))<=3;
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
      const a=nodes[i],b=nodes[j],ap=paths.get(a.id),bp=paths.get(b.id);let hit;
      if(ap&&bp)hit=ap.some(s=>bp.some(t=>cross(...s,...t)));
      else if(ap||bp)hit=(ap||bp).some(s=>touch(ap?b:a,...s));
      else {const d=Math.hypot(a.x-b.x,a.y-b.y),ar=a.type==='ring',br=b.type==='ring';hit=ar&&br&&d<=(a.w+b.w)/2+3||ar&&!br&&d+Math.hypot(b.w,b.h)/2<a.w/2||br&&!ar&&d+Math.hypot(a.w,a.h)/2<b.w/2;}
      if(hit){graph.get(a.id).add(b.id);graph.get(b.id).add(a.id);}
    }
    const pending=[main.id];connected.add(main.id);
    while(pending.length)for(const id of graph.get(pending.pop()))if(!connected.has(id)){connected.add(id);pending.push(id);}
    return {main:main.id,connected};
  }
  function validate(nodes) {
    const network=branches(nodes);
    const errors = [], warnings = [], spells = [];
    if(nodes.some(n=>n.type==='concept'))errors.push('Proposed symbols need a supported mechanic before this blueprint can cast. Ask the AI to read the design.');
    if(nodes.some(n=>catalog[n.type]?.advanced))errors.push('Advanced symbols need an AI reading to interpret their combination.');
    if(nodes.some(n=>n.type==='repetition'))errors.push('Repetition needs an AI reading; the basic preview covers elemental effects.');
    const rings = nodes.filter(isRing).sort((a,b) => a.w*a.h - b.w*b.h);
    if (!rings.length) errors.push('Add an enclosing ring around your sigil and signs.');
    const assigned = new Map(rings.map(r => [r.id, []]));
    if(network.main)for(const ring of rings)if(ring.type==='ring'&&!network.connected.has(ring.id))errors.push('A detached ring needs a branch connection to the main ring.');
    for (const n of nodes.filter(n => !isRing(n))) {
      const r = rings.find(r => inside(r,n));
      if (!r && catalog[n.type].group !== 'shape' && !network.connected.has(n.id)) errors.push(catalog[n.type].name + ' lies outside a ring without a connected branch.');
      else if(r) assigned.get(r.id).push(n);
    }
    // Intersecting boundaries cannot resolve to separate or nested seals.
    for (let i=0; i<rings.length; i++) for (let j=i+1;j<rings.length;j++) {
      const a=rings[i], b=rings[j];
      if (Math.hypot(a.x-b.x,a.y-b.y) < (a.w+b.w)/2 && !inside(a,b) && !inside(b,a)) errors.push('Rings overlap. Separate them or nest one completely inside the other.');
    }
    rings.forEach((ring, index) => {
      const label = rings.length > 1 ? 'Seal ' + (index+1) + ': ' : '';
      if (ring.type === 'openRing') errors.push(label + 'the ring is open. Select it and close the gap.');
      if (Math.abs(ring.w-ring.h) > 1) errors.push(label + 'the ring must be circular. Match its width and height.');
      const members = assigned.get(ring.id), sigils = members.filter(n => catalog[n.type].group === 'sigil'), signs = members.filter(n => catalog[n.type].group === 'sign');
      if (sigils.length > 1) errors.push(label + 'use at most one elemental sigil per ring.');
      if (!sigils.length) warnings.push(label + 'instruction-only circle; no elemental source.');
      if (!signs.length) errors.push(label + 'add a sign to give the element a behavior.');
      if (sigils.some(n => Math.max(n.w/n.h,n.h/n.w) > 1.6)) errors.push(label + 'the elemental sigil is too distorted. Keep its proportions close to square.');
      // Overlapping symbol footprints make the shorthand ambiguous.
      const instructions = members.filter(n => catalog[n.type].group !== 'shape');
      if (instructions.some((a,i) => instructions.slice(i+1).some(b => Math.hypot(a.x-b.x,a.y-b.y) < Math.min(a.w,a.h)/2 + Math.min(b.w,b.h)/2 - 2))) errors.push(label + 'symbols overlap. Leave space between their strokes.');
      const sigil=sigils[0];
      if (!sigil || !signs.length) return;
      const types = signs.map(n=>n.type);
      if (types.includes('crushing') && sigil.type !== 'earth') errors.push(label + 'Crushing needs Earth in this atelier.');
      let dx=0,dy=0,spin=0;
      for (const s of signs.filter(n=>['column','pulling','levitation','dispersion'].includes(n.type))) {
        const rad=s.rotation*Math.PI/180;
        dx+=Math.sin(rad)*s.h; dy-=Math.cos(rad)*s.h;
        const radial=Math.atan2(s.y-ring.y,s.x-ring.x)+Math.PI/2;
        spin+=Math.sin(rad-radial)*s.h;
      }
      const directional=signs.filter(n=>['column','pulling','levitation','dispersion'].includes(n.type));
      const imbalance=Math.hypot(dx,dy)/(directional.reduce((a,n)=>a+n.h,0)||1);
      if (directional.length>1 && imbalance>.35 && !types.includes('stability')) warnings.push(label+'uneven signs steer the effect off-center.');
      const behavior=types.includes('crushing')?'fragments':types.includes('pulling')?'vortex':types.includes('levitation')?'orb':types.includes('column')?'jet':types.includes('dispersion')?'spray':types.includes('convergence')?'focus':'field';
      spells.push({ring,element:sigil.type,behavior,power:clamp((sigil.w*sigil.h/(ring.w*ring.h))*12,.15,2),angle:Math.hypot(dx,dy)>1?Math.atan2(dy,dx):-Math.PI/2,spin:spin/(directional.reduce((a,n)=>a+n.h,0)||1),steady:types.includes('stability'),focused:types.includes('convergence')});
    });
    if (nodes.some(n => ['line','arc'].includes(n.type))) warnings.push('Lines and arcs are guides only. Use named symbols and an enclosing ring for spell instructions.');
    return { valid: errors.length===0 && spells.length>0, errors:[...new Set(errors)], warnings:[...new Set(warnings)], spells };
  }
  function example(element='water', behavior='levitation') {
    const ring=make('ring',0,0), sigil=make(element,0,0);
    return [ring,sigil,...[0,90,180,270].map(angle=> {const rad=angle*Math.PI/180;return {...make(behavior,Math.sin(rad)*110,-Math.cos(rad)*110),w:40,h:40,rotation:angle+180};})];
  }
  class History {
    constructor(nodes=[]) { this.states=[copy(nodes)];this.index=0; }
    push(nodes) { if (JSON.stringify(nodes)===JSON.stringify(this.states[this.index])) return false;this.states.splice(this.index+1);const previous=new Map(this.states[this.index].map(n=>[n.id,n]));this.states.push(nodes.map(n=>{const old=previous.get(n.id);return old&&JSON.stringify(old)===JSON.stringify(n)?old:copy(n);}));if(this.states.length>1400)this.states.splice(1,1);this.index=this.states.length-1;return true; }
    undo() { if(this.index>0)this.index--;return copy(this.states[this.index]); }
    redo() { if(this.index<this.states.length-1)this.index++;return copy(this.states[this.index]); }
  }
  const api={catalog,copy,clamp,snap,isRing,make,local,world,corners,inside,sanitize,validate,example,History,branches};
  if(typeof module!=='undefined' && module.exports)module.exports=api;
  else root.SpellEngine=api;
})(typeof window!=='undefined'?window:globalThis);
