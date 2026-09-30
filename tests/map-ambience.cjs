const assert=require('node:assert/strict');global.window=global;global.MapArt={ambience:['flowers','bee'],stamps:['flowers','bee','chest'],buildings:['building']};require('../site/map-ambience.js');
const make=(id,type,x,extra={})=>({id,type,x,y:0,w:20,h:20,rotation:0,opacity:1,label:'',...extra});
let nodes=MapAmbience.pack([make('a','flowers',0),make('b','flowers',100),make('c','bee',0),make('d','flowers',200,{contents:[{record_id:1,quantity:1}]})]);
assert.equal(nodes.length,3);assert.equal(nodes[0].instances.length,2);assert.equal(nodes[2].id,'d');assert.deepEqual(MapAmbience.pack(nodes),nodes);
let erased=MapAmbience.erase(structuredClone(nodes),'flowers',{x:10,y:10},15);assert.equal(erased[0].instances.length,1);assert.equal(erased[1].type,'bee');assert.equal(erased[2].id,'d');
const moved=structuredClone(nodes[0]);moved.x+=40;moved.rotation=90;const q={x:moved.x+moved.w/2,y:moved.y+moved.h/2};assert.equal(MapAmbience.erase([moved],'flowers',q,1000).length,0);
const terrain=make('t','grass',0,{w:200,h:200});const cut=MapAmbience.erase([terrain],'grass',{x:100,y:100},20);assert.deepEqual(cut[0].erasures,[[.5,.5,.1,.1]]);assert.equal(MapAmbience.erase([make('lock','flowers',0,{locked:true})],'flowers',{x:0,y:0},200).length,1);
console.log('PASS grouped ambience, repeated normalization, protected contents, type-specific erase, transformed layers, terrain cutouts and locks');

assert.equal(MapAmbience.pack([make('blocked','flowers',0,{walk_over:false}),make('walkable','flowers',100)]).length,2,'Ambience batching preserves walk-over settings');
