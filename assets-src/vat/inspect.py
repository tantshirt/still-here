import bpy, json
from pathlib import Path
root=Path.cwd()
base=root/'.bmad-loop/cache/assets/pistachio/extracted/Human Basemeshes.blend'
try: bpy.ops.wm.open_mainfile(filepath=str(base), load_ui=False, use_scripts=False)
except RuntimeError as e: print(e)
a=bpy.data.objects['basemesh_male_rig'];m=bpy.data.objects['basemesh_male']
print('ARM WORLD',list(a.matrix_world),'MESH',list(m.matrix_world))
for n in ['hips','spine','chest','head','upper_arm.L','forearm.L','hand.L','thigh.L','shin.L','foot.L','toe.L']:
 b=a.data.bones[n];print(n,tuple(b.head_local),tuple(b.tail_local))
print('GROUPS',[(g.name,sum(1 for v in m.data.vertices if any(x.group==g.index and x.weight>.5 for x in v.groups))) for g in m.vertex_groups])
