(function(root){
  'use strict';
  const E=typeof module!=='undefined'&&module.exports?require('./spell-engine.js'):root.SpellEngine;
  const Q=typeof module!=='undefined'&&module.exports?require('./spell-equations.js'):root.SpellEquations;
  const directional=new Set(['column','pulling','levitation','dispersion','regions','piercing','sights']);
  function available(nodes){
    return nodes.some(r=>r.type==='ring'&&Math.abs(r.w-r.h)<1&&nodes.some(n=>!E.isRing(n)&&E.inside(r,n)));
  }
  function illustrate(nodes){
    return nodes.filter(r=>r.type==='ring'&&Math.abs(r.w-r.h)<1).map(ring=>{
      const m=measure(nodes,ring), types=new Set(m.members.map(n=>n.type));
      if(!m.members.some(n=>!E.isRing(n)))return null;
      const core=nodes.find(n=>E.catalog[n.type].group==='sigil'&&E.inside(ring,n));
      const behavior=types.has('crushing')?'fragments':types.has('pulling')?'vortex':types.has('levitation')?'orb':types.has('column')||types.has('piercing')?'jet':types.has('dispersion')||types.has('expansion')?'spray':types.has('convergence')?'focus':'field';
      return {ring,element:core?.type||'concept',behavior,illustrative:true};
    }).filter(Boolean);
  }
  // Drawing units and seconds, not physical units. These are explicit simulation
  // assumptions: canon establishes qualitative relationships, not equations.
  function measure(nodes,ring){
    const rings=nodes.filter(E.isRing).sort((a,b)=>a.w*a.h-b.w*b.h);
    const members=nodes.filter(n=>!E.isRing(n)&&rings.find(r=>E.inside(r,n))?.id===ring.id);
    const sigils=members.filter(n=>E.catalog[n.type].group==='sigil');
    const signs=members.filter(n=>E.catalog[n.type].group==='sign');
    const radius=Math.min(ring.w,ring.h)/2;
    let fx=0,fy=0,torque=0,weight=0;
    const vectors=signs.filter(n=>directional.has(n.type)).map(n=>{
      const a=n.rotation*Math.PI/180,w=n.h;
      const x=Math.sin(a),y=-Math.cos(a);
      fx+=x*w;fy+=y*w;weight+=w;
      torque+=((n.x-ring.x)*y-(n.y-ring.y)*x)*w;
      return {x:n.x,y:n.y,dx:x,dy:y,weight:w};
    });
    const area=sigils.reduce((a,n)=>a+n.w*n.h,0)/(ring.w*ring.h);
    const imbalance=weight?Math.hypot(fx,fy)/weight:0;
    return {ring,members,signs,vectors,area,radius,imbalance,
      vx:weight?radius*fx/weight:0,vy:weight?radius*fy/weight:0,
      omega:weight?torque/(weight*radius):0,
      speed:radius*Math.sqrt(area),extent:radius*Math.sqrt(area),
      direction:imbalance>1e-9?Math.atan2(-fy,fx)*180/Math.PI:null};
  }
  function compile(nodes,effects){
    return effects.map(effect=>{
      const ring=effect.ring||nodes.find(n=>n.id===effect.ring_id&&E.isRing(n));
      if(!ring||ring.type!=='ring')return null;
      const measured=measure(nodes,ring);
      return {...effect,...measured,equations:Q.compile(measured,nodes)};
    }).filter(Boolean);
  }
  function particles(s,t,count=64){
    const equations=s.equations||Q.compile(s,[s.ring,...s.members]);
    return Q.particles({...s,equations},t,count);
  }
  const api={measure,compile,particles,available,illustrate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SpellPreview=api;
})(typeof window!=='undefined'?window:globalThis);
