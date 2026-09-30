require('./python-path.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const P=require('../site/spell-preview.js');
test('a corrected saved AI explosion expands under the actual preview equations',()=>{
 const python='C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
 const nodes=JSON.parse(execFileSync(python,['-c',"import json,spell_release; n=json.load(open('tests/intricate-live-result.json',encoding='utf-8'))['nodes']; spell_release.correct(n,'atomic bomb spell'); print(json.dumps(n))"],{encoding:'utf8'}));
 const models=P.compile(nodes,P.illustrate(nodes));
 let expanding=0;
 for(const m of models){
  const a=m.equations.matrix;
  // Positive symmetric eigenvalues guarantee spread in every direction.
  const minimum=(a[0]+a[4]-Math.hypot(a[0]-a[4],a[1]+a[3]))/2;
  assert.ok(minimum>=-1e-10,'a release ring still contracts');
  if(minimum<=0)continue;
  expanding++;
  const spread=t=>{const p=P.particles(m,t),x=p.reduce((s,v)=>s+v.x,0)/p.length,y=p.reduce((s,v)=>s+v.y,0)/p.length;return p.reduce((s,v)=>s+(v.x-x)**2+(v.y-y)**2,0);};
  assert.ok(spread(3)>spread(0),'particles must disperse');
 }
 assert.ok(expanding>0);
});
