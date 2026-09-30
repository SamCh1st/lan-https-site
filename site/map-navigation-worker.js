importScripts('map-navigation.js?v=20260921-building-walls');
let scene=null;
self.onmessage=event=>{const data=event.data;try{if(data.type==='scene'){scene=MapNavigation.createScene(data.nodes,data.walkable);return;}if(data.type==='path')self.postMessage({id:data.id,...MapNavigation.findPath(scene,data.start,data.goal,data.range)});}catch(error){self.postMessage({id:data.id,path:[],reason:'Unable to find a path.'});}};
