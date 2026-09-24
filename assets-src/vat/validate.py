#!/usr/bin/env python3
"""Independent decoder validation for the cached prototype (Python stdlib only)."""
import json,struct,hashlib,math
from pathlib import Path
root=Path(__file__).resolve().parent;m=json.loads((root/'manifest.json').read_text());reports=[]
for variant,v in m['variants'].items():
 g=json.loads((root/v['geometry']).read_text());n=v['vertexCount'];inds=g['indices'];assert len(g['positions'])==n*3;assert len(inds)==v['triangleCount']*3;assert all(0<=i<n for i in inds)
 tri=[inds[i:i+3] for i in range(0,len(inds),3)];assert hashlib.sha256(json.dumps(tri,separators=(',',':')).encode()).hexdigest()==v['topologySHA256']
 for clip,c in v['clips'].items():
  tex=c['texture'];data=(root/tex['file']).read_bytes();assert len(data)==tex['width']*tex['height']*8==tex['bytes'];assert hashlib.sha256(data).hexdigest()==tex['sha256'];assert c['frameCount']==round(c['durationMs']/1000*m['fps'])+1
  floats=struct.unpack('<%se'%(len(data)//2),data);assert all(math.isfinite(x) for x in floats)
  def frame(k):return [floats[(k*n+i)*4:(k*n+i)*4+3] for i in range(n)]
  first=frame(0);last=frame(c['frameCount']-1)
  def maxdist(a,b):return max(math.dist(x,y) for x,y in zip(a,b))
  r={'variant':variant,'clip':clip,'bytes':len(data),'dimensions':[tex['width'],tex['height']],'frames':c['frameCount'],'durationMs':c['durationMs'],'boundsFinite':True,'indicesValid':True}
  if clip=='stand-sway':
   assert first==last,'loop seam after decode';rest=[g['positions'][i:i+3] for i in range(0,n*3,3)];r['restGeometryMaxQuantizationMeters']=maxdist(first,rest);assert r['restGeometryMaxQuantizationMeters']<.001
   motion=max(maxdist(first,frame(k)) for k in range(c['frameCount']));assert motion>1e-5,'idle is static';r['maxIdleDisplacementMeters']=motion;r['loopSeamMeters']=0
  elif clip=='fall':
   assert first==frame(6),'extinguish phase unexpectedly moves';assert frame(54)==last,'dissolve phase unexpectedly moves'
   for a,b in zip(first,last):assert abs(a[0]-b[0])<.002 and abs(a[2]-b[2])<.002 and abs((a[1]-b[1])-4)<.004
   r['uprightFallMeters']=4;r['stationaryExtinguishAndDissolve']=True
  else:
   assert first==frame(18),'light phase unexpectedly moves';assert frame(42)==last,'settle phase unexpectedly moves'
   r['arrivalTravelMeters']=last[0][2]-first[0][2];assert abs(r['arrivalTravelMeters']-.16)<.002
   r['stationaryLightAndSettle']=True
  reports.append(r)
summary={'status':'passed','variants':{k:{'vertices':v['vertexCount'],'triangles':v['triangleCount']} for k,v in m['variants'].items()},'textureBytes':sum(x['bytes'] for x in reports),'decodedChecks':reports,'limitations':['No GPU sampling/performance check','No mobile/physical-device check','No final figure quality acceptance']}
(root/'validation-independent.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary,indent=2))
