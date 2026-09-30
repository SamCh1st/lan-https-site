const assert=require('node:assert/strict');global.window=global;require('../site/map-brushes.js');
function stroke(id,x,y,points,extra={}){return {id,type:'grass',shape:'stroke',x,y,w:100,h:80,brush:40,baseW:100,baseH:80,opacity:1,points,...extra};}
let a=stroke('a',0,0,[[20,20],[80,20]]),b=stroke('b',70,0,[[20,20],[80,20]]);assert.equal(MapBrushes.merge([a,b],b).length,1);assert.equal(b.strokes.length,2);
a=stroke('a',0,0,[[20,20],[80,20]]);b=stroke('b',500,0,[[20,20],[80,20]]);assert.equal(MapBrushes.merge([a,b],b).length,2);
a=stroke('a',0,0,[[20,20],[80,20]],{border:true});b=stroke('b',70,0,[[20,20],[80,20]],{border:true});assert.equal(MapBrushes.merge([a,b],b).length,1);
a=stroke('a',0,0,[[20,20],[80,20]],{locked:true});b=stroke('b',70,0,[[20,20],[80,20]]);assert.equal(MapBrushes.merge([a,b],b).length,2);
a=stroke('a',0,0,[[20,20],[80,20]],{contents:[{record_id:1,quantity:1}]});b=stroke('b',70,0,[[20,20],[80,20]]);assert.equal(MapBrushes.merge([a,b],b).length,2);
console.log('Brush geometry passed: connected outlines, disconnected strokes, and protected objects.');

a=stroke('a',0,0,[[20,20],[80,20]],{w:200,h:40,rotation:30});b=stroke('b',120,30,[[20,20],[80,20]],{opacity:undefined});const before=MapBrushes.bounds({points:a.points,brush:a.brush});assert.equal(MapBrushes.merge([a,b],b).length,1,'Rotated stretched strokes connect with default opacity');assert.equal(b.rotation,0);assert.ok(b.strokes.some(p=>Math.abs(p.transform[1])>.1),'Keep rotation and nonuniform width in stroke transform');
a=stroke('a',0,0,[[20,20],[80,20]],{hidden:true});b=stroke('b',70,0,[[20,20],[80,20]]);assert.equal(MapBrushes.merge([a,b],b).length,2,'Hidden paint is protected');

a=stroke('blocked',0,0,[[20,20],[80,20]],{walk_over:false});b=stroke('walkable',70,0,[[20,20],[80,20]]);assert.equal(MapBrushes.merge([a,b],b).length,2,'Connected paint keeps different walk-over settings separate');
const tilePaint=require('../site/map-tile-paint.js'),tile=(id,x,walk_over)=>({id,type:'grass',x,y:0,w:40,h:40,tile_base_w:40,tile_base_h:40,tile_cells:[[0,0]],walk_over});a=tile('blocked-tile',0,false);b=tile('walkable-tile',40,true);assert.equal(tilePaint.merge([a,b],b).length,2,'Tiled paint keeps movement settings separate');
