const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../site/spell-engine.js'),P=require('../site/spell-preview.js'),Q=require('../site/spell-equations.js');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function drawing(){return [{...E.make('ring',0,0),w:600,h:600},E.make('water',0,0)];}
function compile(nodes){return P.compile(nodes,P.illustrate(nodes))[0];}

test('exterior modifiers contribute only while their branch reaches the main ring',()=>{
 const nodes=drawing(),sign={...E.make('column',500,0),w:40,h:40};
 const branch={...E.make('stroke',400,0),w:200,h:10,points:[[-50,0],[50,0]],closed:false};
 nodes.push(sign,branch);
 assert.ok(E.branches(nodes).connected.has(sign.id));
 assert.ok(compile(nodes).equations.operators.some(o=>o.type==='column'));
 branch.y=200;
 assert.equal(E.branches(nodes).connected.has(sign.id),false);
 assert.equal(compile(nodes).equations.operators.some(o=>o.type==='column'),false);
 assert.ok(E.validate(nodes).errors.some(e=>e.includes('without a connected branch')));
});
test('matrix exponential agrees with exact constant flow and exponential contraction',()=>{
 const translation=Q.exponential([0,0,2,0,0,-3,0,0,0],2);
 near(translation[2],4);near(translation[5],-6);
 const contraction=Q.exponential([-1,0,0,0,-1,0,0,0,0],2);
 near(contraction[0],Math.exp(-2));near(contraction[4],Math.exp(-2));
 const rotation=Q.exponential([0,-1,0,1,0,0,0,0,0],Math.PI/2);
 near(rotation[0],0);near(rotation[1],-1);near(rotation[3],1);
});
test('opposing modifiers cancel through composition, not preset precedence',()=>{
 const nodes=drawing(),base=P.particles(compile(nodes),2);
 nodes.push(E.make('convergence',-100,0));
 const contracted=P.particles(compile(nodes),2);assert.ok(Math.abs(contracted[0].x)<Math.abs(base[0].x));
 nodes.push(E.make('expansion',100,0));
 const combined=P.particles(compile(nodes),2);
 combined.forEach((p,i)=>{near(p.x,base[i].x);near(p.y,base[i].y);});
});
test('rotating a direction sign redirects the measured flow',()=>{
 const nodes=drawing(),sign=E.make('column',100,0);nodes.push(sign);
 const up=compile(nodes).equations.matrix;
 sign.rotation=90;const right=compile(nodes).equations.matrix;
 near(up[2],0);assert.ok(up[5]<0);assert.ok(right[2]>0);near(right[5],0);
});
test('translation and scale of a complete seal transform the preview consistently',()=>{
 const nodes=drawing();nodes.push(E.make('expansion',100,0));
 const first=P.particles(compile(nodes),2);
 const changed=nodes.map(n=>({...n,x:n.x*2+50,y:n.y*2-80,w:n.w*2,h:n.h*2}));
 P.particles(compile(changed),2).forEach((p,i)=>{near(p.x,first[i].x*2+50);near(p.y,first[i].y*2-80);});
});
test('every catalog entry has an explicit rule or unresolved diagnosis; replay is deterministic',()=>{
 for(const key of Object.keys(E.catalog))assert.ok(Q.rules[key],key);
 const nodes=drawing();nodes.push(E.make('concept',100,0));
 const model=compile(nodes);assert.ok(model.equations.unknown.length);
 assert.deepEqual(P.particles(model,1.25),P.particles(model,1.25));
});
test('outer result composes enclosed inner bands as well as its own signs',()=>{
 const nodes=drawing();nodes.push(E.make('expansion',100,0));
 const outer={...E.make('ring',0,0),w:1000,h:1000};nodes.push(outer,E.make('convergence',350,0));
 const model=P.compile(nodes,[{ring:outer,illustrative:true}])[0];
 const types=model.equations.operators.map(o=>o.type);
 assert.ok(types.includes('expansion'));assert.ok(types.includes('convergence'));
 near(model.equations.matrix[0],0);
});
