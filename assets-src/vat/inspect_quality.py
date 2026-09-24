'''Surface-quality check for the tracked VAT outputs (Blender 4.5.14 LTS, uses mathutils BVH).
Run: Blender --background --factory-startup --disable-autoexec --python assets-src/vat/inspect_quality.py
Decodes every baked frame from public/vat and writes assets-src/vat/geometry-quality.json.'''
import json,collections,struct
from pathlib import Path
from mathutils.bvhtree import BVHTree
root=Path(__file__).resolve().parents[2];r=root/'public/vat';m=json.loads((r/'manifest.json').read_text());result={}
for name,variant in m['variants'].items():
 g=json.loads((r/variant['geometry']['file']).read_text());n=variant['vertexCount'];indices=g['indices'];tri=[tuple(indices[i:i+3]) for i in range(0,len(indices),3)]
 # Test occupant only; wheel/frame intersections are intended construction joints.
 body_n=m['variants']['standing']['vertexCount'];body_tri=[t for t in tri if max(t)<body_n]
 edges=collections.Counter(tuple(sorted((t[i],t[(i+1)%3]))) for t in body_tri for i in range(3));adj=collections.defaultdict(set)
 for a,b in edges:adj[a].add(b);adj[b].add(a)
 seen=set();parts=0
 for start in range(body_n):
  if start in seen:continue
  parts+=1;stack=[start];seen.add(start)
  while stack:
   for b in adj[stack.pop()]:
    if b not in seen:seen.add(b);stack.append(b)
 checks=[]
 for clip,c in variant['clips'].items():
  values=struct.unpack('<%se'%((r/c['texture']['file']).stat().st_size//2),(r/c['texture']['file']).read_bytes())
  for f in range(c['frameCount']):
   p=[values[(f*n+i)*4:(f*n+i)*4+3] for i in range(body_n)];bvh=BVHTree.FromPolygons(p,body_tri,all_triangles=True)
   crossing=[(a,b) for a,b in bvh.overlap(bvh) if a<b and not set(body_tri[a]).intersection(body_tri[b])]
   checks.append({'clip':clip,'frame':f,'nonAdjacentTriangleIntersections':len(crossing)})
 result[name]={'bodyComponents':parts,'bodyBoundaryEdges':sum(c==1 for c in edges.values()),'bodyNonManifoldEdges':sum(c!=2 for c in edges.values()),'allFrameIntersectionChecks':checks}
 assert parts==1 and all(c==2 for c in edges.values())
(root/'assets-src/vat/geometry-quality.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:{'bodyComponents':v['bodyComponents'],'bodyBoundaryEdges':v['bodyBoundaryEdges'],'bodyNonManifoldEdges':v['bodyNonManifoldEdges'],'framesChecked':len(v['allFrameIntersectionChecks']),'maximumIntersections':max(x['nonAdjacentTriangleIntersections'] for x in v['allFrameIntersectionChecks'])} for k,v in result.items()},indent=2))
