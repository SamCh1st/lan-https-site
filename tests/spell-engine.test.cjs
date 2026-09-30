const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../site/spell-engine.js');
test('balanced fireball and water jet are recognized',()=>{
  let v=E.validate(E.example('fire','levitation'));assert.equal(v.valid,true);assert.equal(v.spells[0].behavior,'orb');assert.equal(v.spells[0].element,'fire');assert.equal(v.warnings.length,0);
  v=E.validate(E.example('water','column'));assert.equal(v.valid,true);assert.equal(v.spells[0].behavior,'jet');
});
test('open, stretched, empty and crossed boundaries do not cast',()=>{
  const n=E.example();n[0].type='openRing';assert.equal(E.validate(n).valid,false);
  n[0].type='ring';n[0].w=360;assert.equal(E.validate(n).valid,false);
  n[0].w=320;n[1].x=300;assert.equal(E.validate(n).valid,false);
  assert.equal(E.validate([]).valid,false);assert.equal(E.validate([E.make('ring',0,0)]).valid,false);
});
test('nested seals assign instructions to their closest boundary',()=>{
  const inner=E.example('fire','levitation');
  const outer={...E.make('ring',0,0),w:700,h:700};
  const n=[...inner,outer,E.make('wind',240,0),E.make('stability',-240,0)];
  const v=E.validate(n);assert.equal(v.valid,true);assert.equal(v.spells.length,2);
  outer.x=200;assert.equal(E.validate(n).valid,false);
});
test('rotated geometry containment includes corners, not just center',()=>{
  const ring=E.make('ring',0,0),symbol={...E.make('water',115,0),w:70,h:70,rotation:45};
  assert.equal(E.inside(ring,symbol),false);symbol.x=80;assert.equal(E.inside(ring,symbol),true);
});
test('history preserves snapshots and drops redo only after a new edit',()=>{
  const n=E.example();const h=new E.History(n);n[1].x=20;h.push(n);assert.equal(h.undo()[1].x,0);assert.equal(h.redo()[1].x,20);
  const back=h.undo();back[1].y=50;h.push(back);assert.equal(h.index,h.states.length-1);assert.equal(h.redo()[1].x,0);assert.equal(h.redo()[1].y,50);
});
test('length imbalance steers rather than rejects a seal',()=>{
  const n=E.example('water','column');n[2].h=70;const v=E.validate(n);assert.equal(v.valid,true);assert.notEqual(v.spells[0].angle,-Math.PI/2);
});
test('saved drawings reject invalid identities and nonfinite measurements',()=>{
  assert.deepEqual(E.sanitize([{...E.make('water',0,0),x:Infinity}]),[]);
  assert.deepEqual(E.sanitize([{...E.make('water',0,0),id:'<script>'}]),[]);
});
test('large drawings preserve all components and history reuses unchanged snapshots safely',()=>{
 const nodes=Array.from({length:900},(_,i)=>({...E.make('column',i*20,0),id:'s'+i}));
 assert.equal(E.sanitize(nodes).length,900);
 const history=new E.History(nodes);nodes[899].x+=10;history.push(nodes);
 assert.equal(history.states[0][0],history.states[1][0]);
 assert.notEqual(history.states[0][899],history.states[1][899]);
 nodes[0].x=1234;
 assert.equal(history.undo()[0].x,0);
 assert.equal(history.redo()[899].x,899*20+10);
});
