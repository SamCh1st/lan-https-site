/* Cached visibility masks; light animation and color mixing stay on the GPU. */
(function(){
 'use strict';
 let canvas,gl,lightProgram,composeProgram,framebuffer,energy,occlusion,ambient,quad,width=0,height=0,ambientKey='',failed=false;
 const masks=new Map();
 const vertex=`#version 300 es
 in vec2 position;uniform vec4 rect;uniform vec2 viewport;out vec2 uv;
 void main(){uv=position*.5+.5;vec2 p=rect.xy+uv*rect.zw;gl_Position=vec4(p.x/viewport.x*2.-1.,1.-p.y/viewport.y*2.,0.,1.);}`;
 const lightFragment=`#version 300 es
 precision highp float;in vec2 uv;uniform sampler2D visibility;uniform vec4 rect;uniform vec2 center;uniform float radius;uniform float power;uniform float softness;uniform vec3 color;
 layout(location=0) out vec4 light;layout(location=1) out vec4 shadow;
 void main(){vec4 mask=texture(visibility,uv);float d=length(rect.xy+uv*rect.zw-center)/radius;
 float falloff=1.-smoothstep(mix(.65,.08,softness),1.,d);float weight=falloff*power*mask.a;
 float visible=weight*mask.r;light=vec4(pow(color,vec3(2.2))*visible,visible);shadow=vec4(weight*(1.-mask.r),0.,0.,0.);}`;
 const composeFragment=`#version 300 es
 precision highp float;in vec2 uv;uniform sampler2D energy;uniform sampler2D occlusion;uniform sampler2D ambient;out vec4 result;
 void main(){vec2 p=vec2(uv.x,1.-uv.y);vec4 e=texture(energy,p),a=texture(ambient,uv);float coverage=1.-exp(-e.a*3.);
 vec3 color=pow(max(e.rgb/max(e.a,.00001),vec3(0.)),vec3(1./2.2));
 float shade=min(.3,texture(occlusion,p).r*.26)*(1.-coverage);
 float darkness=1.-(1.-a.a*(1.-coverage))*(1.-shade);
 float saturation=max(color.r,max(color.g,color.b))-min(color.r,min(color.g,color.b));float tint=coverage*(.20+.34*saturation);
 float alpha=darkness+tint*(1.-darkness);vec3 rgb=a.rgb*darkness+color*tint*(1.-darkness);
 result=vec4(rgb,alpha);}`;
 function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
 function program(fragment){const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;}
 function texture(){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
 function init(){canvas=document.createElement('canvas');gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,preserveDrawingBuffer:true});if(!gl||!gl.getExtension('EXT_color_buffer_float'))throw Error('Floating point light buffers unavailable');
  lightProgram=program(lightFragment);composeProgram=program(composeFragment);quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  framebuffer=gl.createFramebuffer();energy=texture();occlusion=texture();ambient=texture();
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();failed=true;});
 }
 function use(p,rect){gl.useProgram(p);gl.bindBuffer(gl.ARRAY_BUFFER,quad);const loc=gl.getAttribLocation(p,'position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);gl.uniform2f(gl.getUniformLocation(p,'viewport'),width,height);gl.uniform4fv(gl.getUniformLocation(p,'rect'),rect);}
 function sampler(p,name,t,unit){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(gl.getUniformLocation(p,name),unit);}
 function render(w,h,base,key,lights){
  if(failed)return fallback(w,h,base,lights);
  try{if(!gl)init();gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
   if(width!==w||height!==h){width=w;height=h;canvas.width=w;canvas.height=h;for(const [i,t] of [energy,occlusion].entries()){gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,w,h,0,gl.RGBA,gl.HALF_FLOAT,null);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,t,0);}gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Incomplete light buffer');ambientKey='';}
   gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);
   const used=new Set();for(const l of lights){used.add(l.id);let entry=masks.get(l.id);if(!entry){entry={texture:texture()};masks.set(l.id,entry);}if(entry.key!==l.key){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,entry.texture);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,l.mask);entry.key=l.key;}
    use(lightProgram,l.rect);sampler(lightProgram,'visibility',entry.texture,0);gl.uniform2fv(gl.getUniformLocation(lightProgram,'center'),l.center);gl.uniform1f(gl.getUniformLocation(lightProgram,'radius'),l.radius);gl.uniform1f(gl.getUniformLocation(lightProgram,'power'),l.power);gl.uniform1f(gl.getUniformLocation(lightProgram,'softness'),l.softness);gl.uniform3fv(gl.getUniformLocation(lightProgram,'color'),l.color);gl.drawArrays(gl.TRIANGLES,0,6);
   }for(const [id,entry] of masks)if(!used.has(id)){gl.deleteTexture(entry.texture);masks.delete(id);}
   gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.disable(gl.BLEND);use(composeProgram,[0,0,w,h]);sampler(composeProgram,'energy',energy,0);sampler(composeProgram,'occlusion',occlusion,1);sampler(composeProgram,'ambient',ambient,2);
   if(ambientKey!==key){gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,base);ambientKey=key;}
   gl.drawArrays(gl.TRIANGLES,0,6);canvas.dataset.renderer='gpu';return canvas;
  }catch(error){failed=true;console.warn('Using canvas light blending:',error.message);return fallback(w,h,base,lights);}
 }
 // No GPU: still reuse visibility and use canvas compositing, with no per-frame
 // pixel readback. Only a changed shadow mask needs its luminance converted once.
 let fallbackCanvas,fallbackDark,fallbackShadow,fallbackCoverage,scratch;const fallbackMasks=new Map();
 function fallback(w,h,base,lights){fallbackCanvas??=document.createElement('canvas');fallbackDark??=document.createElement('canvas');fallbackShadow??=document.createElement('canvas');fallbackCoverage??=document.createElement('canvas');scratch??=document.createElement('canvas');for(const c of [fallbackCanvas,fallbackDark,fallbackShadow,fallbackCoverage,scratch])if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
  const out=fallbackCanvas.getContext('2d'),dark=fallbackDark.getContext('2d'),shade=fallbackShadow.getContext('2d'),coverage=fallbackCoverage.getContext('2d'),ctx=scratch.getContext('2d');for(const c of [out,dark,shade,coverage]){c.globalCompositeOperation='source-over';c.globalAlpha=1;c.clearRect(0,0,w,h);}dark.drawImage(base,0,0);const used=new Set();
  for(const l of lights){used.add(l.id);let entry=fallbackMasks.get(l.id);if(!entry||entry.key!==l.key){const mask=document.createElement('canvas'),blocked=document.createElement('canvas');mask.width=blocked.width=l.mask.width;mask.height=blocked.height=l.mask.height;const mc=mask.getContext('2d',{willReadFrequently:true}),bc=blocked.getContext('2d');mc.drawImage(l.mask,0,0);const data=mc.getImageData(0,0,mask.width,mask.height),shadow=bc.createImageData(mask.width,mask.height);for(let i=0;i<data.data.length;i+=4){shadow.data[i+3]=data.data[i+3]*(1-data.data[i]/255);data.data[i+3]*=data.data[i]/255;data.data[i]=data.data[i+1]=data.data[i+2]=255;}mc.putImageData(data,0,0);bc.putImageData(shadow,0,0);entry={key:l.key,mask,blocked};fallbackMasks.set(l.id,entry);}
   ctx.clearRect(0,0,w,h);ctx.globalCompositeOperation='source-over';const [x,y]=l.center,g=ctx.createRadialGradient(x,y,0,x,y,l.radius),color=l.color.map(c=>Math.round(c*255)).join(',');g.addColorStop(0,'rgba('+color+','+Math.min(1,l.power)+')');g.addColorStop(.45,'rgba('+color+','+Math.min(1,l.power*.7)+')');g.addColorStop(1,'rgba('+color+',0)');ctx.fillStyle=g;ctx.fillRect(...l.rect);ctx.globalCompositeOperation='destination-in';ctx.drawImage(entry.mask,...l.rect);dark.globalCompositeOperation='destination-out';dark.drawImage(scratch,0,0);coverage.drawImage(scratch,0,0);out.globalCompositeOperation='screen';out.globalAlpha=.42;out.drawImage(scratch,0,0);
   ctx.clearRect(0,0,w,h);ctx.globalCompositeOperation='source-over';ctx.drawImage(entry.blocked,...l.rect);ctx.globalCompositeOperation='destination-in';ctx.fillRect(...l.rect);shade.drawImage(scratch,0,0);
  }for(const id of fallbackMasks.keys())if(!used.has(id))fallbackMasks.delete(id);shade.globalCompositeOperation='destination-out';shade.drawImage(fallbackCoverage,0,0);dark.globalCompositeOperation='source-over';dark.globalAlpha=.26;dark.drawImage(fallbackShadow,0,0);dark.globalAlpha=1;out.globalCompositeOperation='source-over';out.globalAlpha=1;out.drawImage(fallbackDark,0,0);fallbackCanvas.dataset.renderer='canvas';return fallbackCanvas;
 }
 window.MapLightCompositor={render};
})();
