const assert=require('node:assert/strict'),{createScene,findPath}=require('../site/map-navigation.js');
const part=(type,x,y,w=40,h=40,extra={})=>({type,x,y,w,h,...extra});
const blocker=(type,x,y,w=40,h=40,extra={})=>part(type,x,y,w,h,{walk_over:false,...extra});
for(const type of ['table','wall','building','grass','river','oak_tree','portal']){
 for(const extra of [{},{walk_over:true}])assert.equal(createScene([part(type,40,0,40,40,extra)]).blocked(1,0),false,type+' is walkable by default');
 assert.equal(createScene([blocker(type,40,0)]).blocked(1,0),true,type+' blocks when disabled');
}
let scene=createScene([blocker('table',40,0)]),route=findPath(scene,[0,0],[3,0],5);
assert.ok(route.path.length>4);assert.ok(route.path.some(p=>p[1]!==0));
for(let i=1;i<route.path.length;i++)assert.ok(scene.clear(route.path[i-1],route.path[i]));
assert.deepEqual(findPath(scene,[0,0],[1,0],5).path,[]);assert.deepEqual(findPath(scene,[0,0],[6,0],5).path,[]);
scene=createScene([blocker('table',40,0),blocker('table',0,40)]);assert.ok(findPath(scene,[0,0],[1,1],4).path.length>2,'No diagonal corner cutting');
scene=createScene([blocker('table',40,0,120,20,{rotation:90})]);assert.ok(scene.blocked(2,0));
scene=createScene([blocker('wall',40,-40,4,120)]);assert.equal(scene.clear([0,0],[1,0]),false,'Thin walls cannot be crossed');
scene=createScene([blocker('grass',0,0,120,40,{tile_base_w:120,tile_base_h:40,tile_cells:[[0,0],[2,0]]})]);assert.equal(scene.blocked(0,0),true);assert.equal(scene.blocked(1,0),false,'Empty space between painted tiles remains free');assert.equal(scene.blocked(2,0),true);
scene=createScene([blocker('river',0,0,200,200,{shape:'stroke',baseW:200,baseH:200,brush:20,points:[[20,20],[20,180],[180,180]]})]);assert.equal(scene.blocked(0,2),true);assert.equal(scene.blocked(2,2),false,'Spline blocks its actual path, not its bounding box');
scene=createScene([blocker('oak_tree',0,0,120,40,{ambience_w:120,ambience_h:40,instances:[{x:0,y:0,w:40,h:40},{x:80,y:0,w:40,h:40}]})]);assert.equal(scene.blocked(0,0),true);assert.equal(scene.blocked(1,0),false,'Gaps between ambience instances remain free');
scene=createScene([blocker('building',0,0,160,160,{room_base_w:160,room_base_h:160,building_shapes:[{points:[[0,0],[160,0],[160,40],[40,40],[40,160],[0,160]]}]})]);assert.equal(scene.blocked(0,2),true);assert.equal(scene.blocked(2,2),false,'Concave building uses its footprint');
scene=createScene([blocker('table',40,0,40,40,{hidden:true})]);assert.equal(scene.blocked(1,0),false);
scene=createScene([part('grass',0,0,400,400),blocker('table',40,0)]);assert.equal(scene.blocked(1,0),true,'Walkable floor does not cancel an overlapping obstacle');
scene=createScene(Array.from({length:5000},(_,i)=>part('oak_tree',i*30,0)));assert.equal(scene.count,0,'Default walkable parts add no navigation geometry');
assert.deepEqual(findPath(createScene([]),[.2,0],[3,0],5).path[0],[1,0]);assert.deepEqual(findPath(createScene([blocker('table',52,0)]),[.6,0],[-2,0],5).path[0],[0,0]);
console.log('PASS: default walk-over, opt-in blockers, detours, range, rotation, thin walls, tiled paint, curved splines, ambience gaps, concave buildings, overlaps, and movement redirection.');
const building=part('building',0,0,200,200,{walk_over:true});
for(const type of ['building','hall','cottage','ruin']){
 scene=createScene([{...building,type}]);assert.equal(scene.blocked(2,2),false,'Building floor stays walkable');assert.equal(scene.clear([0,2],[-1,2]),false,'Outer walls cannot be crossed with Walk over enabled');assert.ok(findPath(scene,[2,2],[2,6],6).path.length,'The default doorway remains passable');
 scene=createScene([{...building,type,walk_over:false}]);assert.equal(scene.blocked(2,2),true,'Turning Walk over off also blocks the floor');
}
scene=createScene([{...building,interior_walls:[[[80,0],[80,160]]]}]);route=findPath(scene,[1,1],[3,1],5);assert.ok(route.path.length&&route.path.some(p=>p[1]===4),'Interior walls require walking around their end');
scene=createScene([{...building,w:240,h:160,room_base_w:240,room_base_h:160,rooms:[{x:0,y:0,w:120,h:160},{x:120,y:0,w:120,h:160}]}]);assert.ok(scene.clear([2,1],[3,1]),'Joined rooms have no invisible shared wall');assert.equal(scene.clear([0,1],[-1,1]),false);
scene=createScene([{...building,rotation:90}]);assert.equal(scene.solid([5,100]),false,'Rotated doorway matches the rendering');assert.equal(scene.solid([100,5]),true,'Rotated wall remains solid');
const spline={...building,spline_kind:'building',building_view:'interior',room_base_w:200,room_base_h:200,building_shapes:[{points:[[0,0],[200,0],[200,200],[0,200]]}]};
scene=createScene([spline]);assert.equal(scene.blocked(2,2),false);assert.equal(scene.solid([100,5]),false,'Spline doorway stays open');assert.equal(scene.solid([20,5]),true,'Spline wall stays blocked');assert.ok(findPath(scene,[2,2],[2,-2],6).path.length);
scene=createScene([{...spline,building_entry:false}]);assert.equal(findPath(scene,[2,2],[2,-2],6).path.length,0,'Closed spline cannot be escaped through its walls');
scene=createScene([{...spline,building_view:'exterior'}]);assert.equal(scene.solid([100,5]),true,'Exterior perimeter is closed');
scene=createScene([{...spline,walk_over:false}]);assert.equal(scene.blocked(2,2),true);
console.log('PASS: walkable building floors, solid outer/interior walls, rectangular and spline doorways, closed footprints, rotated walls, and joined-room seams.');
