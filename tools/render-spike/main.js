/* global document, window, innerWidth, innerHeight, navigator, fetch, requestAnimationFrame, addEventListener, console */
import * as THREE from 'three';
const $=s=>document.querySelector(s),errors=[];window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);renderer.setClearColor(0x080808);renderer.toneMapping=THREE.NoToneMapping;document.body.append(renderer.domElement);renderer.debug.checkShaderErrors=true;
const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');const environment={threeRevision:THREE.REVISION,userAgent:navigator.userAgent,webglVersion:gl.getParameter(gl.VERSION),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),maxTextureSize:gl.getParameter(gl.MAX_TEXTURE_SIZE),vertexTextureUnits:gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),floatColorBuffer:!!gl.getExtension('EXT_color_buffer_float'),pixelRatio:1,viewport:[innerWidth,innerHeight]};
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.1,160);let sceneT=0,playing=false,last=null,cameraName='level',pose='rest',frameNumber=0,frameIntervals=[];
const tiers={high:{dpr:1.5,bloom:5,hazeSamples:48,path:'raymarch'},medium:{dpr:1,bloom:3,hazeSamples:28,path:'raymarch'},low:{dpr:.75,bloom:0,hazeSamples:8,path:'screen-space-shafts'}};let tierName='high',reducedMotion=false;
const manifest=await (await fetch('/vat/manifest.json')).json(),loaded={},meshes=[],textureRecords=[];
const fetchGLSL=`
vec3 readVertex(sampler2D map, int frame, int vertex, int vertexCount) {
  int index=frame*vertexCount+vertex;
  return texelFetch(map,ivec2(index%1024,index/1024),0).xyz;
}
vec3 interpolated(sampler2D map,float frame,int vertex,int vertexCount,int lastFrame){
  float f=clamp(frame,0.0,float(lastFrame));int a=int(floor(f));int b=min(a+1,lastFrame);
  return mix(readVertex(map,a,vertex,vertexCount),readVertex(map,b,vertex,vertexCount),fract(f));
}`;
const vertexShader=`
in float vertexId;in float actorClip;in float actorPhase;in float actorStart;
uniform sampler2D idleMap;uniform sampler2D arriveMap;uniform sampler2D fallMap;uniform float sceneClock;uniform int vertexCount;
out float alpha;
${fetchGLSL}
void main(){
 int id=int(vertexId);vec3 p;alpha=1.0;
 if(actorClip<.5){float t=mod(sceneClock+actorPhase,10.0);p=interpolated(idleMap,t*30.0,id,vertexCount,300);}
 else{float t=clamp(sceneClock-actorStart,0.0,2.4);if(actorClip<1.5){p=interpolated(arriveMap,t*30.0,id,vertexCount,72);}else{p=interpolated(fallMap,t*30.0,id,vertexCount,72);alpha=1.0-smoothstep(1.8,2.4,t);}}
 gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(p,1.0);
}`;
const fragmentShader=`precision highp float;in float alpha;out vec4 color;void main(){if(alpha<.001)discard;color=vec4(vec3(alpha),1.0);}`;
async function loadVariant(name,variant){
 const geometryData=await (await fetch('/vat/'+variant.geometry)).json();const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(geometryData.positions,3));geometry.setIndex(geometryData.indices);geometry.setAttribute('vertexId',new THREE.Float32BufferAttribute(Array.from({length:variant.vertexCount},(_,i)=>i),1));
 const clips={};
 for(const [clip,c] of Object.entries(variant.clips)){
  const buffer=await (await fetch('/vat/'+c.texture.file)).arrayBuffer();if(buffer.byteLength!==c.texture.bytes)throw Error('texture byte mismatch');const bits=new Uint16Array(buffer);const tex=new THREE.DataTexture(bits,c.texture.width,c.texture.height,THREE.RGBAFormat,THREE.HalfFloatType);tex.minFilter=tex.magFilter=THREE.NearestFilter;tex.colorSpace=THREE.NoColorSpace;tex.generateMipmaps=false;tex.flipY=false;tex.unpackAlignment=1;tex.needsUpdate=true;clips[clip]={tex,bits,record:c};textureRecords.push({variant:name,clip,width:c.texture.width,height:c.texture.height,bytes:buffer.byteLength,type:'RGBA16F'});
 }
 const count=name==='standing'?1520:80,total=count;const types=new Float32Array(total),phases=new Float32Array(total),starts=new Float32Array(total);let seed=name==='standing'?8341:412;
 const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<count;i++)phases[i]=random()*10;types[count-2]=1;types[count-1]=2;
 geometry.setAttribute('actorClip',new THREE.InstancedBufferAttribute(types,1));geometry.setAttribute('actorPhase',new THREE.InstancedBufferAttribute(phases,1));geometry.setAttribute('actorStart',new THREE.InstancedBufferAttribute(starts,1));
 const material=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,vertexShader,fragmentShader,uniforms:{idleMap:{value:clips['stand-sway'].tex},arriveMap:{value:clips[name==='standing'?'arrive-step':'arrive'].tex},fallMap:{value:clips.fall.tex},sceneClock:{value:0},vertexCount:{value:variant.vertexCount}},side:THREE.FrontSide});
 const mesh=new THREE.InstancedMesh(geometry,material,total);mesh.name=name;mesh.frustumCulled=false;const transform=new THREE.Object3D();let used=0;
 // Exactly 1600 population slots; deterministic 5% wheelchair allocation across all rows.
 for(let slot=0;slot<1600;slot++){
  const isChair=slot%20===7;if(isChair!==(name==='wheelchair')||used>=count-2)continue;
  const row=Math.floor(slot/40),col=slot%40;transform.position.set((col-19.5)*.48+(random()-.5)*.08,0,-9-row*.58);transform.rotation.set(0,(random()-.5)*.3,0);transform.updateMatrix();mesh.setMatrixAt(used++,transform.matrix);
 }
 for(let i=0;i<2;i++){transform.position.set(name==='standing'?-1.5+i:0.6+i,0,-2.5);transform.rotation.set(0,0,0);transform.updateMatrix();mesh.setMatrixAt(count-2+i,transform.matrix);}
 mesh.instanceMatrix.needsUpdate=true;scene.add(mesh);meshes.push(mesh);loaded[name]={geometryData,geometry,clips,material,mesh,count,total};
}
await Promise.all(Object.entries(manifest.variants).map(([n,v])=>loadVariant(n,v)));
// A minimal neutral beam is only an occlusion probe; it is not the production slab.
const slab=new THREE.Mesh(new THREE.BoxGeometry(20,.65,1.25),new THREE.MeshBasicMaterial({color:0x24272a}));slab.position.set(0,-.45,-12);scene.add(slab);
const target=new THREE.WebGLRenderTarget(innerWidth,innerHeight,{depthBuffer:true});target.depthTexture=new THREE.DepthTexture(innerWidth,innerHeight,THREE.UnsignedIntType);
const postScene=new THREE.Scene(),postCamera=new THREE.Camera();
const postMaterial=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,depthTest:false,depthWrite:false,uniforms:{tScene:{value:target.texture},tDepth:{value:target.depthTexture},inverseProjection:{value:new THREE.Matrix4()},inverseView:{value:new THREE.Matrix4()},cameraWorld:{value:new THREE.Vector3()},samples:{value:48},shaftMode:{value:0},bloomStrength:{value:.2}},vertexShader:'out vec2 uv0;void main(){uv0=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`precision highp float;in vec2 uv0;uniform sampler2D tScene;uniform sampler2D tDepth;uniform mat4 inverseProjection;uniform mat4 inverseView;uniform vec3 cameraWorld;uniform float samples;uniform float shaftMode;uniform float bloomStrength;out vec4 color;
vec3 viewAt(vec2 uv,float depth){vec4 p=inverseProjection*vec4(uv*2.-1.,depth*2.-1.,1.);return p.xyz/p.w;}
void main(){vec3 base=texture(tScene,uv0).rgb;float depth=texture(tDepth,uv0).r;vec3 viewPoint=viewAt(uv0,depth);float maxDistance=depth<.99999?length(viewPoint):60.;vec3 ray=normalize((inverseView*vec4(normalize(viewAt(uv0,1.)),0.)).xyz);float fog=0.;
if(shaftMode<.5){float stepLength=maxDistance/max(1.,samples);for(int i=0;i<48;i++){if(float(i)>=samples)break;vec3 p=cameraWorld+ray*(float(i)+.5)*stepLength;float vertical=exp(-abs(p.y-.8)*.22);float longitudinal=smoothstep(10.,-2.,p.z)*smoothstep(-38.,-24.,p.z);fog+=vertical*longitudinal*stepLength*.018;}}
else{vec2 lightUv=vec2(.5,.08);vec2 delta=(lightUv-uv0)/max(1.,samples);vec2 p=uv0;for(int i=0;i<48;i++){if(float(i)>=samples)break;p+=delta;float d=texture(tDepth,p).r;float lum=dot(texture(tScene,p).rgb,vec3(.2126,.7152,.0722));fog+=(step(.9999,d)*.8+lum*.2)/samples;}fog*=.32;}
float glow=smoothstep(.55,1.,max(base.r,max(base.g,base.b)))*bloomStrength;color=vec4(base+vec3(.52,.56,.6)*clamp(fog,0.,.7)+base*glow,1.);}`});
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),postMaterial));
function resize(){renderer.setPixelRatio(tiers[tierName].dpr);renderer.setSize(innerWidth,innerHeight);const size=renderer.getDrawingBufferSize(new THREE.Vector2());target.setSize(size.x,size.y);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
function setTier(name){if(!tiers[name])throw Error('unknown tier: '+name);tierName=name;const t=tiers[name];postMaterial.uniforms.samples.value=t.hazeSamples;postMaterial.uniforms.shaftMode.value=t.path==='screen-space-shafts'?1:0;postMaterial.uniforms.bloomStrength.value=t.bloom*.04;resize();draw();}
function setCamera(name){cameraName=name;if(name==='level'){camera.position.set(0,4.2,12);camera.lookAt(0,.55,-18);}else if(name==='under'){camera.position.set(0,-3.8,11);camera.lookAt(0,.4,-18);}else{camera.position.set(0,1.8,3.8);camera.lookAt(0,.55,-2.5);}camera.updateMatrixWorld();}
function draw(){for(const m of meshes)m.material.uniforms.sceneClock.value=reducedMotion?0:sceneT;camera.updateMatrixWorld();postMaterial.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);postMaterial.uniforms.inverseView.value.copy(camera.matrixWorld);postMaterial.uniforms.cameraWorld.value.copy(camera.position);renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);const sceneDrawCalls=renderer.info.render.calls;renderer.setRenderTarget(null);renderer.render(postScene,postCamera);frameNumber++;$('#state').textContent=`Ready · ${cameraName} · ${pose} · ${tierName} · sceneT ${sceneT.toFixed(3)}s · ${playing?'playing':'paused'}`;$('#stats').textContent=`${environment.renderer}\n${sceneDrawCalls} scene draws / 2 figure draws · ${renderer.info.render.triangles.toLocaleString()} post triangles · exactly 1600 figures (4 showcase slots)\n${textureRecords.length} RGBA16F textures · ${textureRecords.reduce((n,t)=>n+t.bytes,0).toLocaleString()} bytes · ${tiers[tierName].path} · errors ${errors.length}`;$('#error').textContent=errors.join('\n');}
function setPose(name){if(!['rest','step','fall'].includes(name))throw Error('unknown pose: '+name);pose=name;playing=false;sceneT=name==='step'?1.017:name==='fall'?1.55:0;last=null;draw();}
function frame(now){if(last!==null&&playing&&!document.hidden){const dt=Math.max(0,(now-last)/1000);sceneT+=dt;frameIntervals.push(now-last);if(frameIntervals.length>240)frameIntervals.shift();}last=now;if(playing&&!document.hidden)draw();requestAnimationFrame(frame);}
function cpuSample(data,id,f){const lastFrame=data.record.frameCount-1,f0=Math.floor(Math.min(lastFrame,Math.max(0,f))),f1=Math.min(lastFrame,f0+1),blend=Math.min(lastFrame,Math.max(0,f))-f0;return [0,1,2].map(k=>THREE.DataUtils.fromHalfFloat(data.bits[(f0*data.vertexCount+id)*4+k])*(1-blend)+THREE.DataUtils.fromHalfFloat(data.bits[(f1*data.vertexCount+id)*4+k])*blend);}
function measureFrame(){const size=renderer.getDrawingBufferSize(new THREE.Vector2()),points=[[.5,.5],[.5,.38],[.5,.62],[.2,.5],[.8,.5]],pixels=[];for(const [x,y] of points){const rgba=new Uint8Array(4);gl.readPixels(Math.floor(size.x*x),Math.floor(size.y*y),1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);pixels.push({x,y,rgba:[...rgba],luminance:(rgba[0]+rgba[1]+rgba[2])/765});}return pixels;}
async function verifyGPU(){
 if(!environment.floatColorBuffer)throw Error('Float render target diagnostic unavailable');
 const checks=[],probeIds=[0,1,1023,1024];const probeCamera=new THREE.Camera();const quadGeo=new THREE.PlaneGeometry(2,2);const oldInfo=renderer.info.autoReset;renderer.info.autoReset=true;
 for(const [name,v] of Object.entries(loaded)){
  const n=manifest.variants[name].vertexCount,ids=[...probeIds,n-2,n-1];
  for(const [clip,d] of Object.entries(v.clips)){
   d.vertexCount=n;
   for(const f of [0,18.51,30.51,d.record.frameCount-1]){
    const target=new THREE.WebGLRenderTarget(ids.length,1,{type:THREE.FloatType,format:THREE.RGBAFormat,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false});
    const material=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,uniforms:{map:{value:d.tex},sampleFrame:{value:f},vertexCount:{value:n},lastFrame:{value:d.record.frameCount-1},ids:{value:ids}},vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`precision highp float;uniform sampler2D map;uniform float sampleFrame;uniform int vertexCount;uniform int lastFrame;uniform int ids[6];out vec4 color;${fetchGLSL}\nvoid main(){int i=int(gl_FragCoord.x);color=vec4(interpolated(map,sampleFrame,ids[i],vertexCount,lastFrame),1.);}`});
    const q=new THREE.Mesh(quadGeo,material),s=new THREE.Scene();s.add(q);renderer.setRenderTarget(target);renderer.render(s,probeCamera);const values=new Float32Array(ids.length*4);renderer.readRenderTargetPixels(target,0,0,ids.length,1,values);let max=0;for(let i=0;i<ids.length;i++){const expected=cpuSample(d,ids[i],f);for(let k=0;k<3;k++)max=Math.max(max,Math.abs(expected[k]-values[i*4+k]));}checks.push({variant:name,clip,frame:f,probes:ids.length,maxPositionErrorMeters:max,passed:max<1e-5});renderer.setRenderTarget(null);target.dispose();material.dispose();
   }
  }
 }
 quadGeo.dispose();renderer.info.autoReset=oldInfo;renderer.setRenderTarget(null);let diagnosticError;do{diagnosticError=gl.getError();}while(diagnosticError!==gl.NO_ERROR);draw();const result={passed:checks.every(c=>c.passed),checks,positionsCompared:checks.reduce((n,c)=>n+c.probes,0),shaderUsesSameSamplerHelper:true};window.vatGPU.lastCheck=result;return result;
}
window.vatGPU={environment,manifest,textureRecords,ready:true,setCamera(name){setCamera(name);draw();},setPose,setTier,setReducedMotion(value){reducedMotion=!!value;if(reducedMotion){playing=false;sceneT=0;}draw();},setTime(t){if(!Number.isFinite(t))throw Error('scene time must be finite');sceneT=t;playing=false;draw();},play(){if(!reducedMotion){playing=true;last=null;}},pause(){playing=false;draw();},verifyGPU,report(){const intervals=frameIntervals.filter(Number.isFinite),totalFigures=meshes.reduce((n,m)=>n+m.count,0);return{environment:{...environment,pixelRatio:tiers[tierName].dpr},frameNumber,sceneT,camera:cameraName,pose,playing,reducedMotion,tier:tierName,tierConfig:tiers[tierName],totalFigures,showcaseSlots:4,figureDraws:2,variants:Object.fromEntries(Object.entries(loaded).map(([n,v])=>[n,{total:v.count,showcaseSlots:2,vertices:manifest.variants[n].vertexCount,triangles:manifest.variants[n].triangleCount}])),effectUniforms:{samples:postMaterial.uniforms.samples.value,shaftMode:postMaterial.uniforms.shaftMode.value,bloomStrength:postMaterial.uniforms.bloomStrength.value},pixelProbes:measureFrame(),textures:textureRecords,errors:[...errors],frameIntervals:[...frameIntervals],diagnosticFps:intervals.length?1000/(intervals.reduce((a,b)=>a+b,0)/intervals.length):null,gpuCheck:window.vatGPU.lastCheck??null};}};
for(const b of document.querySelectorAll('[data-camera]'))b.addEventListener('click',()=>window.vatGPU.setCamera(b.dataset.camera));for(const b of document.querySelectorAll('[data-pose]'))b.addEventListener('click',()=>setPose(b.dataset.pose));for(const b of document.querySelectorAll('[data-tier]'))b.addEventListener('click',()=>setTier(b.dataset.tier));$('#play').onclick=()=>{playing=!playing;last=null;};$('#gpu-check').onclick=()=>verifyGPU().then(r=>console.log('VAT_GPU_CHECK',r)).catch(e=>errors.push(String(e)));document.addEventListener('visibilitychange',()=>{last=null;});addEventListener('resize',resize);setCamera('level');setTier('high');requestAnimationFrame(frame);
