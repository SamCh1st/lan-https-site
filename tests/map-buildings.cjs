const assert=require('node:assert/strict');global.window=global;global.MapArt={buildings:['building','hall','cottage','ruin']};require('../site/map-buildings.js');require('../site/map-building-curves.js');
const room=(id,x,y=0,extra={})=>({id,type:'building',x,y,w:160,h:120,floor_texture:'wood',wall_texture:'stone',wall_width:12,...extra});
let a=room('a',0,0,{contents:[{record_id:7,quantity:1}],contents_public:false}),b=room('b',160,0,{contents:[{record_id:7,quantity:2}],contents_public:true});assert.equal(MapBuildings.merge([a,b],b).length,1);assert.equal(b.rooms.length,2);assert.equal(b.w,320);assert.equal(b.contents[0].quantity,3);assert.equal(b.contents_public,false);
const walls=[];function el(tag,attrs,parent){const n={tag,attrs,parent};if(tag==='rect'&&parent?.attrs?.filter)walls.push(attrs);return n;}MapBuildings.render(b,{},el);assert(!walls.some(r=>(r.x===148||r.x===160)&&r.width===12));
a=room('a',0);b=room('b',160,120);assert.equal(MapBuildings.merge([a,b],b).length,2);a=room('a',0);b=room('b',160,0,{type:'hall'});assert.equal(MapBuildings.merge([a,b],b).length,2);
console.log('Building joins passed: outside walls only, corners remain separate, contents preserved and privacy retained.');
const square=[[0,0],[160,0],[160,120],[0,120],[0,0]];
const drawn=MapBuildings.outline(square,'building',[]);assert.equal(drawn.building_shapes.length,1);assert.ok(drawn.building_shapes[0].points.length>4);assert.ok(drawn.w>100&&drawn.h>80);assert.equal(MapBuildings.outline([[0,0],[160,0],[160,120]],'building',[]),null);
a=room('old',0);const extension=MapBuildings.outline([[120,20],[280,20],[280,100],[120,100]],'building',[a]);assert.ok(extension);b=room('drawn',0,0,extension);assert.equal(MapBuildings.merge([a,b],b).length,1);assert.equal(MapBuildings.outline([[120,20],[280,20],[280,100],[120,100]],'hall',[a]),null);console.log('PASS closed outline, open rejection, same-building connection and union');

a=room('axis',0);b=room('angled',100,20,{rotation:35});let joined=MapBuildings.merge([a,b],b);assert.equal(joined.length,1);assert.ok(b.building_shapes.length===2);assert.ok(b.building_shapes.some(s=>s.points.length>4));assert.equal(b.rotation,0);
const l=room('l',0,0,{w:80,h:80,room_base_w:80,room_base_h:80,rooms:[{x:0,y:0,w:80,h:40},{x:0,y:40,w:40,h:40}]});walls.length=0;MapBuildings.render(l,{},el);assert.ok(walls.some(r=>r.x===28&&r.y===28&&r.width===12&&r.height===12));
console.log('PASS rounded outlines, angled unions and filled concave wall corners');

a=room('locked',0,0,{locked:true});b=room('new',80);assert.equal(MapBuildings.merge([a,b],b).length,2);assert.equal(MapBuildings.merge([a,b],a).length,2);b.rotation=35;assert.equal(MapBuildings.merge([a,b],b).length,2);console.log('PASS locked rectangular and angled buildings remain separate');

const eraserRoom=room('erase',0,0,{w:200,h:100,wall_base_w:200,wall_base_h:100,interior_walls:[[[0,50],[200,50]]],contents:[{record_id:7,quantity:1}]});
const erased=MapBuildingCurves.eraseWalls([eraserRoom],{x:100,y:50},20);assert.equal(erased.length,1);assert.equal(eraserRoom.interior_walls.length,2);assert.deepEqual(eraserRoom.interior_walls,[[[0,50],[74,50]],[[126,50],[200,50]]]);assert.equal(eraserRoom.contents[0].quantity,1);assert.equal(eraserRoom.w,200);
const lockedRoom=structuredClone(eraserRoom);lockedRoom.locked=true;const before=JSON.stringify(lockedRoom);MapBuildingCurves.eraseWalls([lockedRoom],{x:100,y:50},500);assert.equal(JSON.stringify(lockedRoom),before);
const rotated=room('rotated',0,0,{w:200,h:100,rotation:90,wall_base_w:200,wall_base_h:100,interior_walls:[[[0,50],[200,50]]]});MapBuildingCurves.eraseWalls([rotated],{x:100,y:50},20);assert.equal(rotated.interior_walls.length,2);assert.ok(Math.abs(rotated.interior_walls[0][1][0]-74)<.00001);console.log('PASS local wall erasing preserves buildings and contents, respects locks and rotations');

a=room('blocked',0,0,{walk_over:false});b=room('walkable',160);assert.equal(MapBuildings.merge([a,b],b).length,2,'Joined buildings preserve movement settings');b.rotation=35;b.x=100;assert.equal(MapBuildingCurves.merge([a,b],b).length,2,'Curved unions preserve movement settings');
