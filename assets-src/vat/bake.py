#!/usr/bin/env python3
"""STILL HERE production VAT bake. Blender 4.5.14 LTS.
Run from anywhere (paths resolve from this file):
  Blender --background --factory-startup --disable-autoexec --python assets-src/vat/bake.py
Inputs: immutable CC0 sources under assets-src/vat/sources (see provenance.json).
Writes the tracked runtime contract in public/vat (manifest, geometry, six RGBA16F
textures), bake validation in assets-src/vat/bake-validation.json, the editable
source .blend and geometry previews in assets-src/vat/previews (never shipped).
"""
import bpy, bmesh, json, math, hashlib, struct
from pathlib import Path
from mathutils import Vector, Quaternion, Matrix
ROOT=Path(__file__).resolve().parents[2] if '__file__' in globals() else Path.cwd()
OUT=ROOT/'public/vat'; OUT.mkdir(parents=True,exist_ok=True)
PREVIEWS=ROOT/'assets-src/vat/previews'; PREVIEWS.mkdir(parents=True,exist_ok=True)
assert bpy.app.version[:2]==(4,5) and bpy.app.version_string.startswith('4.5.14'),'Blender 4.5.14 LTS required, got '+bpy.app.version_string
STOCK=ROOT/'assets-src/vat/sources/animated-human-2017.blend'
BASE=ROOT/'assets-src/vat/sources/human-basemeshes.blend'
FPS=30
MAP={'spine':'Spine','chest':'Spine2','neck':'Neck','head':'Head','upper_arm.L':'LeftArm','forearm.L':'LeftForeArm','upper_arm.R':'RightArm','forearm.R':'RightForeArm','thigh.L':'LeftUpLeg','shin.L':'LeftLeg','thigh.R':'RightUpLeg','shin.R':'RightLeg'}

def open_safe(path):
 try: bpy.ops.wm.open_mainfile(filepath=str(path),load_ui=False,use_scripts=False)
 except RuntimeError as e:
  if "Shapekey KEKey.000" not in str(e):raise

def sample_stock():
 open_safe(STOCK); arm=bpy.data.objects['Human Armature']; samples={}
 for action,count,end in [('Idle',301,240),('Walk',31,12.4)]:
  arm.animation_data.action=bpy.data.actions[action]
  if arm.animation_data.nla_tracks:
   for track in arm.animation_data.nla_tracks:track.mute=True
  frames=[]
  for i in range(count):
   f=end*i/(count-1);bpy.context.scene.frame_set(int(f),subframe=f%1)
   frames.append({dst:arm.pose.bones[src].matrix_basis.to_quaternion().copy() for dst,src in MAP.items()})
  samples[action]={'frames':frames,'rest':{dst:arm.data.bones[src].matrix_local.to_quaternion().copy() for dst,src in MAP.items()}}
 return samples
stock=sample_stock();open_safe(BASE)
for o in list(bpy.data.objects):
 if o.name not in ['basemesh_male','basemesh_male_rig']:bpy.data.objects.remove(o,do_unlink=True)
body=bpy.data.objects['basemesh_male'];rig=bpy.data.objects['basemesh_male_rig'];body.name='standing-body';rig.name='standing-rig'
body.shape_key_clear();rig.animation_data_clear()
for pb in rig.pose.bones:pb.matrix_basis=Matrix.Identity(4);pb.rotation_mode='QUATERNION'
# Permanently remove detailed digits/feet from the editable CC0 mesh.
remove_groups={g.index for g in body.vertex_groups if g.name.startswith(('hand.','palm.','f_','thumb.','foot.','toe.','heel.'))}
remove={v.index for v in body.data.vertices if sum(g.weight for g in v.groups if g.group in remove_groups)>.30}
bm=bmesh.new();bm.from_mesh(body.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.verts[i] for i in remove],context='VERTS');bm.to_mesh(body.data);bm.free()
# Fixed subdivision level one (body only), not a runtime quality option.
bpy.context.view_layer.objects.active=body;body.select_set(True)
sub=next(m for m in body.modifiers if m.type=='SUBSURF');sub.levels=1;sub.render_levels=1;bpy.ops.object.modifier_apply(modifier=sub.name)
for p in body.data.polygons:p.use_smooth=True
next(m for m in body.modifiers if m.type=='ARMATURE').use_deform_preserve_volume=True

def active(o):
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o

def ellipsoid(name,center,radii,bone,axis=None):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=1,location=center)
 o=bpy.context.object;o.name=name;o.scale=radii
 if axis is not None:o.rotation_euler=Vector(axis).to_track_quat('Z','Y').to_euler()
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 g=o.vertex_groups.new(name=bone);g.add(list(range(len(o.data.vertices))),1,'REPLACE')
 for p in o.data.polygons:p.use_smooth=True
 return o
parts=[]
for side in ['L','R']:
 b=rig.data.bones['hand.'+side];d=(b.tail_local-b.head_local).normalized()
 parts.append(ellipsoid('mitten-'+side,b.head_local+d*.045,(.045,.035,.115),'hand.'+side,d))
 b=rig.data.bones['foot.'+side]
 parts.append(ellipsoid('simple-foot-'+side,b.head_local+Vector((0,-.053,-.03)),(.052,.127,.049),'foot.'+side))
active(body)
for o in parts:o.select_set(True)
bpy.ops.object.join()
# Freeze triangulation before deformation; evaluated quad diagonals can otherwise flip.
bm=bmesh.new();bm.from_mesh(body.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(body.data);bm.free()
# Weld the mannequin into one continuous surface before animation. Transfer original
# CC0 rig weights barycentrically from the nearest source triangle after voxel union.
from mathutils.bvhtree import BVHTree
source_vertices=[v.co.copy() for v in body.data.vertices]
source_triangles=[tuple(p.vertices) for p in body.data.polygons]
source_weights=[{g.group:g.weight for g in v.groups} for v in body.data.vertices]
bvh=BVHTree.FromPolygons(source_vertices,source_triangles,all_triangles=True)
arm_mod=next(m for m in body.modifiers if m.type=='ARMATURE');body.modifiers.remove(arm_mod)
active(body);remesh=body.modifiers.new('welded-anonymous-surface','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.016;remesh.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=remesh.name)
smooth=body.modifiers.new('surface-relax','SMOOTH');smooth.factor=.45;smooth.iterations=3;bpy.ops.object.modifier_apply(modifier=smooth.name)
dec=body.modifiers.new('fixed-budget','DECIMATE');dec.ratio=min(1.,1350/len(body.data.vertices));bpy.ops.object.modifier_apply(modifier=dec.name)
# Decimation yields a fixed triangulated surface for every clip and quality tier.
bm=bmesh.new();bm.from_mesh(body.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(body.data);bm.free()
for g in body.vertex_groups:g.remove(list(range(len(body.data.vertices))))
for v in body.data.vertices:
 point,normal,face,distance=bvh.find_nearest(v.co)
 ids=source_triangles[face];a,b,c=[source_vertices[i] for i in ids];ab=b-a;ac=c-a;ap=point-a
 d00=ab.dot(ab);d01=ab.dot(ac);d11=ac.dot(ac);d20=ap.dot(ab);d21=ap.dot(ac);den=d00*d11-d01*d01
 if abs(den)<1e-12:weights=[1.,0.,0.]
 else:
  vb=(d11*d20-d01*d21)/den;vc=(d00*d21-d01*d20)/den;weights=[max(0.,1-vb-vc),max(0.,vb),max(0.,vc)]
 combined={}
 for i,w in zip(ids,weights):
  for gi,gw in source_weights[i].items():combined[gi]=combined.get(gi,0)+w*gw
 total=sum(combined.values())
 for gi,w in combined.items():
  if w/total>.0001:body.vertex_groups[gi].add([v.index],w/total,'REPLACE')
arm_mod=body.modifiers.new('Armature','ARMATURE');arm_mod.object=rig;arm_mod.use_deform_preserve_volume=True
for poly in body.data.polygons:poly.use_smooth=True

hip_group=body.vertex_groups.new(name='seated-hip-corrective')
for v in body.data.vertices:
 z=v.co.z;w=max(0.,min(1.,(z-.72)/.16,(1.23-z)/.13),.8*max(0.,1-abs(z-.53)/.16))
 if abs(v.co.x)<.24 and w>0:hip_group.add([v.index],w,'REPLACE')
hip_corrective=body.modifiers.new('seated-hip-surface-correction','SMOOTH');hip_corrective.factor=0.;hip_corrective.iterations=12;hip_corrective.vertex_group=hip_group.name
# Shift upper arm and thigh rest directions to neutral hanging stance using local rest axes.
base_q={n:Quaternion() for n in rig.pose.bones.keys()}
def aim_base(name,direction):
 b=rig.data.bones[name];rest=b.matrix_local.to_quaternion();delta=(b.tail_local-b.head_local).rotation_difference(Vector(direction))
 base_q[name]=rest.inverted()@delta@rest
for s,sign in [('L',1),('R',-1)]:
 aim_base('upper_arm.'+s,(.25*sign,.02,-1))
 aim_base('thigh.'+s,(.035*sign,0,-1))
# Matched neutral material; preview shading is distinct from final unlit silhouette.
mat=bpy.data.materials.new('neutral-body');mat.diffuse_color=(.72,.72,.72,1);body.data.materials.clear();body.data.materials.append(mat)
for p in body.data.polygons:p.material_index=0

# The source actions are recorded as ordinary baked rig keyframes for repeatability.
def source_delta(dst,action,t,amount):
 spec=stock[action];frames=spec['frames'];sample=frames[min(len(frames)-1,round(t*(len(frames)-1)))][dst]
 delta=frames[0][dst].inverted()@sample
 delta=Quaternion().slerp(delta,amount)
 sr=spec['rest'][dst];world=sr@delta@sr.inverted();dr=rig.data.bones[dst].matrix_local.to_quaternion()
 return dr.inverted()@world@dr

def set_pose(t,clip,wheelchair=False):
 hip_corrective.factor=.85 if wheelchair else 0.
 for n,p in rig.pose.bones.items():p.location=(0,0,0);p.rotation_quaternion=base_q[n].copy();p.scale=(1,1,1)
 root=Vector((0,0,0))
 if wheelchair:
  # Seat by explicit global bone directions, compensating rest axes and parents.
  bpy.context.view_layer.update()
  def aim_pose(name,direction):
   p=rig.pose.bones[name];mat=p.matrix.copy();current=mat.to_3x3()@Vector((0,1,0));delta=current.rotation_difference(Vector(direction));q=delta@mat.to_quaternion();p.matrix=Matrix.Translation(mat.translation)@q.to_matrix().to_4x4();bpy.context.view_layer.update()
  for s in ['L','R']:
   aim_pose('thigh.'+s,(0,-1,-.05))
   aim_pose('shin.'+s,(0,0,-1))
   aim_pose('foot.'+s,(0,-1,-.12))
   aim_pose('forearm.'+s,(0,-1,-.2))
  root.z=-.44
 if clip=='stand-sway':
  for dst in ['spine','chest','neck','head','upper_arm.L','upper_arm.R']:
   rig.pose.bones[dst].rotation_quaternion=base_q[dst]@source_delta(dst,'Idle',t/10,.065*math.sin(math.pi*t/10)**2)
 elif clip in ['arrive-step','arrive']:
  step=max(0,min(1,(t-.6)/.8));smooth=step*step*(3-2*step);root.y=.16*(1-smooth)
  if not wheelchair:
   for dst in MAP:
    amplitude=.60*math.sin(math.pi*step)
    if dst in ['head','neck']:amplitude*=.15
    if 'arm' in dst:amplitude*=.15
    rig.pose.bones[dst].rotation_quaternion=base_q[dst]@source_delta(dst,'Walk',step,amplitude)
  # Settling is the quiet last second: no bouncing or another step.
 elif clip=='fall':
  f=max(0,min(1,(t-.2)/1.6));root.z-=4*bezier_ease(f)
 return root

def bezier_ease(x):
 lo=0.;hi=1.
 for _ in range(30):
  t=(lo+hi)/2;u=1-t;bx=3*u*u*t*.55+3*u*t*t+t*t*t
  if bx<x:lo=t
  else:hi=t
 t=(lo+hi)/2;return 3*(1-t)*t*t*.45+t*t*t

# Chair is original geometry authored here and baked with occupant into one mesh.
chair=[]
def cube(name,center,scale):
 bpy.ops.mesh.primitive_cube_add(size=1,location=center);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);chair.append(o);return o

def tube(name,a,b,r=.018):
 a=Vector(a);b=Vector(b);d=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=r,depth=d.length,location=(a+b)/2);o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();chair.append(o);return o
cube('seat',(0,.0,.525),(.42,.40,.035));cube('back',(0,.17,.75),(.42,.035,.42));cube('footplate',(0,-.52,.09),(.37,.16,.027))
for sign in [-1,1]:
 x=.27*sign
 bpy.ops.mesh.primitive_torus_add(major_segments=20,minor_segments=6,location=(x,.10,.29),rotation=(0,math.pi/2,0),major_radius=.265,minor_radius=.022)
 wheel=bpy.context.object;wheel.name='rear-wheel';chair.append(wheel)
 for a in range(0,180,45):
  r=math.radians(a);dy=math.sin(r)*.25;dz=math.cos(r)*.25;tube('spoke',(x,.10-dy,.29-dz),(x,.10+dy,.29+dz),.007)
 bpy.ops.mesh.primitive_torus_add(major_segments=12,minor_segments=6,location=(x,-.32,.075),rotation=(0,math.pi/2,0),major_radius=.055,minor_radius=.018);chair.append(bpy.context.object)
 tube('frame-side',(x,.15,.53),(x,-.32,.09));tube('back-upright',(x,.16,.34),(x,.16,.96));tube('armrest',(x,-.17,.73),(x,.15,.73));tube('support',(x,-.17,.53),(x,-.17,.73));tube('foot-support',(x,-.3,.3),(x,-.52,.09))
for o in chair:
 if o.name.startswith(('rear-wheel','spoke','Torus')):
  side='L' if o.location.x>0 else 'R';typ='front' if o.name.startswith('Torus') else 'rear';g=o.vertex_groups.new(name='wheel:'+typ+':'+side);g.add(list(range(len(o.data.vertices))),1,'REPLACE')
 o.data.materials.append(mat)
 for p in o.data.polygons:p.use_smooth=True
active(chair[0])
for o in chair:o.select_set(True)
bpy.ops.object.join();chair_obj=bpy.context.object;chair_obj.name='wheelchair-original';chair_obj.hide_render=True
wheel_vertex_groups={v.index:chair_obj.vertex_groups[v.groups[0].group].name for v in chair_obj.data.vertices if v.groups}
# Capture evaluated body mesh with fixed vertex identities; no remesh during sampling.
scene=bpy.context.scene;scene.render.fps=FPS;deps=bpy.context.evaluated_depsgraph_get()

def snapshot(obj):
 deps.update();ev=obj.evaluated_get(deps);m=ev.to_mesh();m.calc_loop_triangles();verts=[obj.matrix_world@v.co for v in m.vertices];tris=[tuple(t.vertices) for t in m.loop_triangles];ev.to_mesh_clear();return verts,tris

def yup(v):
 # Blender Z-up to runtime Y-up, quantized to 0.1 mm. Blender's threaded modifier
 # evaluation jitters positions by ~1e-7 m between runs; quantizing first makes the
 # geometry JSON and half-float textures byte-reproducible (well below binary16 step).
 return tuple(round(c,4)+0.0 for c in (v.x,v.z,-v.y))

# Geometry must match texture vertices exactly; geometry JSON is a draft transport only.
manifest={'schema':'still-here-vat/1','generator':{'tool':'Blender','version':'4.5.14 LTS','script':'assets-src/vat/bake.py'},'fps':FPS,
 'coordinateSystem':{'handedness':'right','up':'+Y','forward':'+Z','units':'metres'},
 'texture':{'format':'RGBA16F','encoding':'raw IEEE 754 binary16, little-endian, no header','width':1024,'channels':'xyz = absolute object-space position in metres, w = 1; unused tail texels are zero','packing':'frame-major','texelIndex':'frame * vertexCount + vertexId','texelCoord':'(texelIndex % width, floor(texelIndex / width))','filter':'nearest','mipmaps':False,'colorSpace':'none','flipY':False},
 'geometryFormat':{'encoding':'JSON {vertexCount, positions[x,y,z...], indices[a,b,c...]}','vertexId':'implicit position order; equals texel vertexId','winding':'counter-clockwise, outward','restPose':'positions equal restClip at restFrame within binary16 quantization'},
 'playback':{'clock':'unscaled sceneT; simulation speed never scales clip time','interpolation':'linear between adjacent integer frames of nearest-fetched texels','loop':'frame = (t * fps) mod (frameCount - 1); the endpoint duplicates frame 0','event':'frame = clamp(t * fps, 0, frameCount - 1) across the whole durationMs including hold phases','reducedMotion':'hold restClip at restFrame; no clip playback','rootMotion':'baked into positions; never apply arrival or fall translation again'},
 'variants':{},'eventPhasesMs':{'arrival':[{'name':'light','start':0,'end':600},{'name':'step','start':600,'end':1400},{'name':'settle','start':1400,'end':2400}],'departure':[{'name':'extinguish','start':0,'end':200},{'name':'fall','start':200,'end':1800},{'name':'dissolve','start':1800,'end':2400}]},'fallEase':[.55,0,1,.45],
 'notes':['Dissolve, extinguish and downlight are renderer opacity/light effects, not mesh deformation.','One topology per variant is shared by every quality tier.','The fall bakes a 4 m eased descent; the renderer fades it inside haze before any lower bound.']}
all_validation=[];rest_positions={};pose_previews={}
for variant in ['standing','wheelchair']:
 seated=variant=='wheelchair';rest_root=set_pose(0,'stand-sway',seated);bpy.context.view_layer.update();v0,tri0=snapshot(body)
 cv,ct=snapshot(chair_obj) if seated else ([],[])
 # Standing floor alignment independent of body import origin; wheelchair already touches z~0.
 floor=min(v.z for v in v0) if not seated else min(v.z for v in cv)
 total_tris=tri0+[tuple(i+len(v0) for i in t) for t in ct];count=len(v0)+len(cv)
 topology=hashlib.sha256(json.dumps(total_tris,separators=(',',':')).encode()).hexdigest()
 geometry={'vertexCount':count,'indices':[i for t in total_tris for i in t],'positions':[a for v in [p+rest_root for p in v0]+cv for a in yup(v-Vector((0,0,floor)))]}
 geometry_bytes=json.dumps(geometry,separators=(',',':')).encode();(OUT/f'{variant}.geometry.json').write_bytes(geometry_bytes)
 rec={'vertexCount':count,'triangleCount':len(total_tris),'geometry':{'file':f'{variant}.geometry.json','bytes':len(geometry_bytes),'sha256':hashlib.sha256(geometry_bytes).hexdigest()},'topologySHA256':topology,'restClip':'stand-sway','restFrame':0,'clips':{}}
 rest_positions[variant]=geometry['positions']
 for clip,duration in [('stand-sway',10),('arrive' if seated else 'arrive-step',2.4),('fall',2.4)]:
  frames=round(duration*FPS)+1;packed=[];bounds=[[float('inf')]*3,[float('-inf')]*3];first=None;last=None
  action=bpy.data.actions.new(f'{variant}/{clip}');action.use_fake_user=True;rig.animation_data_create();rig.animation_data.action=action
  for fi in range(frames):
   t=fi/FPS;root=set_pose(t,clip,seated);bpy.context.view_layer.update();vv,tt=snapshot(body)
   assert tt==tri0 and len(vv)==len(v0),'TOPOLOGY OR VERTEX ORDER CHANGED'
   # Seated hip lowering applies only to occupant; chair stays at its own rest height.
   motion_root=root-Vector((0,0,-.44)) if seated else root
   chair_frame=[]
   for vi,v in enumerate(cv):
    p=v.copy()
    if clip=='arrive' and vi in wheel_vertex_groups:
     _,typ,side=wheel_vertex_groups[vi].split(':');center=Vector((.27 if side=='L' else -.27,.10 if typ=='rear' else -.32,.29 if typ=='rear' else .075));radius=.287 if typ=='rear' else .073
     p=center+Quaternion((1,0,0),-(.16-motion_root.y)/radius)@(p-center)
    chair_frame.append(p+motion_root-Vector((0,0,floor)))
   positions=[v+root-Vector((0,0,floor)) for v in vv]+chair_frame
   fpos=[yup(v) for v in positions]
   if fi==0:first=fpos
   if fi==frames-1:last=fpos
   for p in fpos:
    for j in range(3):bounds[0][j]=min(bounds[0][j],p[j]);bounds[1][j]=max(bounds[1][j],p[j])
    packed.extend((*p,1.))
   for n in rig.pose.bones.keys():
    rig.pose.bones[n].keyframe_insert('rotation_quaternion',frame=fi)
   rig.location=root;rig.keyframe_insert('location',frame=fi);rig.location=(0,0,0)
   if (clip=='stand-sway' and fi==0) or (clip.startswith('arrive') and fi==30) or (clip=='fall' and fi==54):pose_previews[(variant,clip)]=[tuple(p) for p in positions]
  width=1024;texels=count*frames;height=math.ceil(texels/width);packed.extend([0.]*(width*height*4-len(packed)))
  raw=struct.pack('<%se'%len(packed),*packed);filename=f'{variant}.{clip}.rgba16f';(OUT/filename).write_bytes(raw)
  loop_error=max((Vector(a)-Vector(b)).length for a,b in zip(first,last)) if clip=='stand-sway' else None
  assert loop_error is None or loop_error<1e-6
  assert all(math.isfinite(x) for x in packed)
  rec['clips'][clip]={'durationMs':round(duration*1000),'frameCount':frames,'loop':clip=='stand-sway','endpointIncluded':True,'texture':{'file':filename,'width':width,'height':height,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()},'bounds':bounds}
  all_validation.append({'variant':variant,'clip':clip,'stableTopology':True,'finite':True,'loopSeamMaxMeters':loop_error,'textureBytes':len(raw)})
  rig.animation_data.action=None;rig.location=(0,0,0)
 manifest['variants'][variant]=rec
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');(ROOT/'assets-src/vat/bake-validation.json').write_text(json.dumps(all_validation,indent=2)+'\n')
# Save explicit neutral source geometry for both variants, plus editable rig/actions.
for variant in ['standing','wheelchair']:
 g=json.loads((OUT/f'{variant}.geometry.json').read_text());positions=g['positions'];indices=g['indices'];m=bpy.data.meshes.new(variant+'-rest-baked');m.from_pydata([(positions[i],-positions[i+2],positions[i+1]) for i in range(0,len(positions),3)],[],[indices[i:i+3] for i in range(0,len(indices),3)]);o=bpy.data.objects.new(variant+'-rest-baked',m);scene.collection.objects.link(o);o.hide_render=True;o.hide_viewport=True
# Save editable source with baked actions and standing neutral pose.
set_pose(0,'stand-sway');bpy.context.view_layer.update();body.hide_render=False;chair_obj.hide_render=True
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets-src/vat/mannequin-wheelchair-source.blend'))
# Preview uses the actual sampled geometry, not the skeleton or a reference image.
body.hide_render=True;rig.hide_render=True
scene.render.engine='BLENDER_EEVEE_NEXT';scene.view_settings.view_transform='Standard';scene.render.resolution_x=720;scene.render.resolution_y=880;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.world.color=(.003,.003,.003)
camdata=bpy.data.cameras.new('preview');cam=bpy.data.objects.new('preview',camdata);scene.collection.objects.link(cam);scene.camera=cam;camdata.type='ORTHO';camdata.ortho_scale=2.2
ld=bpy.data.lights.new('preview-key','AREA');lo=bpy.data.objects.new('preview-key',ld);scene.collection.objects.link(lo);ld.energy=180;ld.size=3
unlit=bpy.data.materials.new('silhouette-unlit');unlit.use_nodes=True;nodes=unlit.node_tree.nodes;nodes.clear();em=nodes.new('ShaderNodeEmission');em.inputs['Color'].default_value=(1,1,1,1);out=nodes.new('ShaderNodeOutputMaterial');unlit.node_tree.links.new(em.outputs[0],out.inputs['Surface'])
for variant in ['standing','wheelchair']:
 geom=json.loads((OUT/f'{variant}.geometry.json').read_text());inds=geom['indices'];triangles=[inds[i:i+3] for i in range(0,len(inds),3)]
 for label,kind in [('rest','stand-sway'),('step','arrive' if variant=='wheelchair' else 'arrive-step')]:
  verts=pose_previews[(variant,kind)];mesh=bpy.data.meshes.new('preview-geometry');mesh.from_pydata(verts,[],triangles);obj=bpy.data.objects.new('preview-body',mesh);scene.collection.objects.link(obj)
  for p in mesh.polygons:p.use_smooth=True
  for camera_name in ['front-neutral','front-silhouette','under-silhouette']:
   mesh.materials.clear();mesh.materials.append(mat if camera_name=='front-neutral' else unlit)
   center=Vector((0,0,.95 if variant=='standing' else .72));camdata.ortho_scale=2.10 if variant=='standing' else 1.75
   cam.location=center+Vector((0,-4,.03) if camera_name.startswith('front') else (2,-4,-2.5));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
   lo.location=center+Vector((-2,-3,3));lo.rotation_euler=(center-lo.location).to_track_quat('-Z','Y').to_euler()
   scene.render.filepath=str(PREVIEWS/f'{variant}-{label}-{camera_name}.png');bpy.ops.render.render(write_still=True)
  bpy.data.objects.remove(obj,do_unlink=True)
print('VAT_BAKE_SUCCESS',json.dumps({'variants':{k:{'vertices':v['vertexCount'],'triangles':v['triangleCount']} for k,v in manifest['variants'].items()},'totalTextureBytes':sum(r['textureBytes'] for r in all_validation)}))
