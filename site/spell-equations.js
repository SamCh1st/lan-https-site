(function(root){
  'use strict';
  const E=typeof module!=='undefined'&&module.exports?require('./spell-engine.js'):root.SpellEngine;
  // These are this application's declared simulation rules, not manga physics.
  // Motion is one composed affine differential equation in ring-normalized units.
  const rules={
    fire:['source','Disk source; heat(t) = +w t'], water:['source','Disk source'], earth:['source','Square material source'],
    wind:['source','Air tracer source'],light:['source','Luminous disk source'],repetition:['source','Reset time: τ = t mod 4 s'],
    calling:['source','Signal(t) = sin(2πt); visual pulse'],sand:['source','Discrete grain source'],
    bridging:['source','Initial arch: y = 0.3(2u−1)²−0.15'],bird:['source','Initial wing curve: y = −0.15|sin(2πu)|'],
    flower:['source','Initial petals: r = 0.2 + 0.07 cos(5θ)'],fish:['source','Initial fish outline: x = 0.3 cos θ; y = 0.12 sin θ'],
    crystalize:['source','Quantize initial source to a 0.04 R lattice; inferred'],
    column:['direction','b += w d'],dispersion:['expand','A += w I'],levitation:['lift','A -= 0.5w I; b += w d'],
    convergence:['contract','A -= w I'],pulling:['pull','A -= w c I; A += w s J'],
    crushing:['fragment','grain radius *= exp(−wt); A += 0.25w I'],stability:['steady','A -= 0.3w I'],
    concealment:['hide','opacity *= exp(−wt)'],regions:['region','Mask outside the indicated radial region'],
    cooling:['cool','heat(t) -= wt; color blends toward blue'],gathering:['contract','A -= w I'],
    reflection:['reflect','Initial position reflected about the sign axis'],stretch:['stretch','A += w(ddᵀ − 0.5I)'],
    coil:['spin','A += w J'],strengthening:['steady','A -= 0.3w I'],sights:['direction','b += w d'],
    entwining:['spiral','A += w J − 0.25w I'],solidification:['solid','Motion rate divided by (1 + Σw); show faceted grains'],
    binding:['contract','A -= w I'],immobility:['lock','Motion rate divided by (1 + 20Σw)'],
    piercing:['pierce','b += 2w d; compress perpendicular spread'],rain:['rain','b += (0,w); downward fall is inferred'],
    expansion:['expand','A += w I; inferred'],
    sword:['unknown','Unresolved meaning: no motion operator'],detection:['unknown','Unresolved detection mechanism: no motion operator'],
    concept:['unknown','Unspecified mechanic: no motion operator'],
    stroke:['guide','Custom construction path; no established motion operator'],
    ring:['boundary','Activation gate: closed circular boundary containing components'],
    openRing:['boundary','Activation gate = 0 until closed'],line:['guide','Construction geometry; motion contribution = 0'],arc:['guide','Construction geometry; motion contribution = 0']
  };
  const identity=()=>[1,0,0,0,1,0,0,0,1];
  function mul(a,b){const c=Array(9).fill(0);for(let r=0;r<3;r++)for(let k=0;k<3;k++)for(let j=0;j<3;j++)c[3*r+j]+=a[3*r+k]*b[3*k+j];return c;}
  function exponential(matrix,t){
    const norm=Math.max(...[0,1,2].map(r=>Math.abs(matrix[r*3])+Math.abs(matrix[r*3+1])+Math.abs(matrix[r*3+2])))*t;
    const squarings=Math.max(0,Math.ceil(Math.log2(Math.max(1,norm*2))));
    const a=matrix.map(v=>v*t/2**squarings);let sum=identity(),term=identity();
    for(let k=1;k<=18;k++){term=mul(term,a).map(v=>v/k);sum=sum.map((v,i)=>v+term[i]);}
    for(let k=0;k<squarings;k++)sum=mul(sum,sum);
    return sum;
  }
  function compile(model,nodes){
    const R=model.radius, r=model.ring, network=E.branches(nodes), members=nodes.filter(n=>!E.isRing(n)&&(E.inside(r,n)||r.id===network.main&&network.connected.has(n.id)));
    // Outer instruction bands share the enclosed material source for the preview.
    // This linkage is explicitly a model assumption, not canonical activation.
    const sources=members.filter(n=>E.catalog[n.type].group==='sigil');
    const out={matrix:Array(9).fill(0),sources,operators:[],heat:0,hide:0,fragment:0,slow:0,mask:0,reflections:[],pulse:false,reset:false,unknown:[]};
    for(const n of members){
      const rule=rules[n.type]||['unknown','No defined operator'];
      const weight=12*n.w*n.h/(r.w*r.h),a=n.rotation*Math.PI/180,d={x:Math.sin(a),y:-Math.cos(a)};
      const dx=n.x-r.x,dy=n.y-r.y,len=Math.hypot(dx,dy)||1;
      const inward=-(dx*d.x+dy*d.y)/len,spin=(dx*d.y-dy*d.x)/len;
      const m=out.matrix;
      function isotropic(v){m[0]+=v;m[4]+=v;}
      function rotate(v){m[1]-=v;m[3]+=v;}
      switch(rule[0]){
        case 'direction':m[2]+=weight*d.x;m[5]+=weight*d.y;break;
        case 'expand':isotropic(weight);break;
        case 'contract':isotropic(-weight);break;
        case 'lift':isotropic(-.5*weight);m[2]+=weight*d.x;m[5]+=weight*d.y;break;
        case 'pull':isotropic(-weight*inward);rotate(weight*spin);break;
        case 'fragment':out.fragment+=weight;isotropic(.25*weight);break;
        case 'steady':isotropic(-.3*weight);break;
        case 'hide':out.hide+=weight;break;
        case 'region':out.mask+=weight*(inward>=0?1:-1);break;
        case 'cool':out.heat-=weight;break;
        case 'reflect':out.reflections.push(d);break;
        case 'stretch':m[0]+=weight*(d.x*d.x-.5);m[1]+=weight*d.x*d.y;m[3]+=weight*d.x*d.y;m[4]+=weight*(d.y*d.y-.5);break;
        case 'spin':rotate(weight);break;
        case 'spiral':rotate(weight);isotropic(-weight*.25);break;
        case 'solid':out.slow+=weight;break;
        case 'lock':out.slow+=20*weight;break;
        case 'pierce':m[2]+=2*weight*d.x;m[5]+=2*weight*d.y;m[0]-=weight*d.y*d.y;m[4]-=weight*d.x*d.x;m[1]+=weight*d.x*d.y;m[3]+=weight*d.x*d.y;break;
        case 'rain':m[5]+=weight;break;
        case 'unknown':out.unknown.push(E.catalog[n.type].name);break;
      }
      out.operators.push({type:n.type,name:E.catalog[n.type].name,weight,equation:rule[1]});
    }
    out.reset=sources.some(n=>n.type==='repetition');out.pulse=sources.some(n=>n.type==='calling');
    out.heat+=sources.filter(n=>n.type==='fire').reduce((s,n)=>s+12*n.w*n.h/(r.w*r.h),0);
    out.matrix=out.matrix.map(v=>v/(1+out.slow));
    // Protect rendering from extreme inputs. Report any numeric stabilization.
    const largest=Math.max(...out.matrix.map(Math.abs));out.stabilized=largest>2;
    if(out.stabilized)out.matrix=out.matrix.map(v=>v*2/largest);
    return out;
  }
  function particles(model,t,count=64){
    const q=model.equations,R=model.radius,ring=model.ring,clock=q.reset?t%4:t,M=exponential(q.matrix,clock);
    const sources=q.sources.length?q.sources:[null];
    return Array.from({length:count},(_,i)=>{
      const source=sources[i%sources.length],u=(Math.floor(i/sources.length)+.5)/Math.ceil(count/sources.length),a=i*Math.PI*(3-Math.sqrt(5));
      const scale=source?Math.max(source.w,source.h)/R:0.35;
      let x=Math.cos(a)*Math.sqrt(u)*.5*scale,y=Math.sin(a)*Math.sqrt(u)*.5*scale;
      switch(source?.type){
        case 'earth':case 'sand':x=((i%8)/7-.5)*scale;y=(Math.floor(i/8)/7-.5)*scale;break;
        case 'bridging':x=(2*u-1)*scale;y=(.3*(2*u-1)**2-.15)*scale;break;
        case 'bird':x=(2*u-1)*scale;y=-.15*Math.abs(Math.sin(2*Math.PI*u))*scale;break;
        case 'flower':x=(.2+.07*Math.cos(5*a))*Math.cos(a)*scale;y=(.2+.07*Math.cos(5*a))*Math.sin(a)*scale;break;
        case 'fish':x=.3*Math.cos(a)*scale;y=.12*Math.sin(a)*scale;break;
        case 'crystalize':x=Math.round(x/.04)*.04;y=Math.round(y/.04)*.04;break;
      }
      if(source){const p=E.world(source,x*R,y*R);x=(p.x-ring.x)/R;y=(p.y-ring.y)/R;}
      for(const d of q.reflections){const dot=x*d.x+y*d.y;x=2*dot*d.x-x;y=2*dot*d.y-y;}
      const px=M[0]*x+M[1]*y+M[2],py=M[3]*x+M[4]*y+M[5];
      const inside=px*px+py*py<=1,masked=q.mask>0&&!inside||q.mask<0&&inside;
      const opacity=masked?0:Math.exp(-q.hide*clock)*(q.pulse?.55+.45*Math.sin(2*Math.PI*clock)**2:.8);
      const color=q.heat<0?'#78cfff':E.catalog[source?.type]?.color||E.catalog[model.element]?.color||'#bca5ed';
      return {x:ring.x+px*R,y:ring.y+py*R,r:Math.max(.4,R*.015*Math.exp(-q.fragment*clock)),opacity,color};
    });
  }
  const api={rules,compile,particles,exponential};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SpellEquations=api;
})(typeof window!=='undefined'?window:globalThis);
