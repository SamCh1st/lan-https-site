const assert=require('node:assert/strict');global.window={};require('../site/map-spline-textures.js');const {ribbon,postsAlong}=window.MapSplineTextures;
const square=ribbon([[0,0],[100,0],[100,100],[0,100]],10,true);
assert.deepEqual(square[0].left,[5,5]);assert.deepEqual(square[0].right,[-5,-5]);assert.deepEqual(square.at(-1).left,square[0].left);
const line=ribbon([[0,0],[100,0]],10);assert.deepEqual(line[0].left,[0,5]);assert.deepEqual(line[1].right,[100,-5]);
const curve=[[0,0],[40,20],[60,80],[130,110],[180,60]];
for(const p of postsAlong(curve,12)){const distances=curve.slice(1).map((b,i)=>{const a=curve[i],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);});assert.ok(Math.min(...distances)<1e-6,'Every post is on the actual curve');}
console.log('PASS: closed corner alignment, open end widths, and posts follow curve distance.');
