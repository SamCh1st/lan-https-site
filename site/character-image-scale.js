/* Shared portrait sizing; model and collision sizes are unchanged. */
window.CharacterImageScale={value(value){const n=Number(value);return Number.isFinite(n)&&n>0?Math.max(.25,Math.min(8,n)):1;},bounds(node,content){const scale=this.value(content?.map_image_scale),w=node.w*scale,h=node.h*scale;return {x:(node.w-w)/2,y:(node.h-h)/2,width:w,height:h};}};
