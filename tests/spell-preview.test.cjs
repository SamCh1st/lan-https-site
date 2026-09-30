const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../site/spell-engine.js'),P=require('../site/spell-preview.js');
test('uncertified advanced drawings still have an illustrative preview',()=>{
 const nodes=E.example('crystalize','expansion');
 assert.equal(E.validate(nodes).valid,false);assert.equal(P.available(nodes),true);
 const effects=P.illustrate(nodes);assert.equal(effects[0].illustrative,true);
 assert.equal(effects[0].behavior,'spray');assert.equal(effects[0].element,'crystalize');
 assert.ok(P.particles(P.compile(nodes,effects)[0],1).every(p=>Number.isFinite(p.x)));
 nodes[0].type='openRing';assert.equal(P.available(nodes),false);
 assert.equal(P.available([]),false);
});
test('balanced seal has zero drift and spin; time samples are deterministic',()=>{
 const nodes=E.example('fire','levitation'),m=P.measure(nodes,nodes[0]);
 assert.ok(m.imbalance<1e-12);assert.ok(Math.abs(m.omega)<1e-12);
 assert.deepEqual(P.particles({...m,behavior:'orb'},1.25),P.particles({...m,behavior:'orb'},1.25));
 assert.equal(m.area,3600/102400);
});
test('rotating the drawing rotates force and preserves torque',()=>{
 const ring=E.make('ring',0,0),sigil=E.make('water',0,0),sign={...E.make('column',80,0),w:30,h:50};
 const a=P.measure([ring,sigil,sign],ring);
 const b=P.measure([ring,sigil,{...sign,x:0,y:80,rotation:90}],ring);
 assert.ok(Math.abs(a.vy+b.vx)<1e-9);assert.ok(Math.abs(a.omega-b.omega)<1e-9);
 assert.equal(a.direction,90);assert.ok(Math.abs(b.direction)<1e-9);
});
test('scale doubles distances and speeds while preserving relative area',()=>{
 const nodes=E.example('water','column'),a=P.measure(nodes,nodes[0]);
 const scaled=nodes.map(n=>({...n,x:n.x*2,y:n.y*2,w:n.w*2,h:n.h*2})),b=P.measure(scaled,scaled[0]);
 assert.equal(a.area,b.area);assert.equal(a.speed*2,b.speed);
});
test('AI cannot override measured power, angle or torque',()=>{
 const nodes=E.example('fire','levitation');
 const m=P.compile(nodes,[{ring_id:nodes[0].id,behavior:'orb',power:999,angle:999,spin:999}])[0];
 assert.ok(Math.abs(m.omega)<1e-12);assert.equal(m.area,3600/102400);
 assert.ok(P.particles(m,2).every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
});
test('extended registry matches generated browser asset and preserves metadata',()=>{
 const data=require('../site/spell-symbols.json');assert.deepEqual(require('../site/spell-symbols.js'),data);
 for(const [type,c] of Object.entries(data)){assert.equal(E.sanitize([E.make(type,0,0)])[0].type,type);assert.equal(E.catalog[type].evidence,c.evidence);}
 assert.equal(E.validate(E.example('water','cooling')).valid,false);
});
