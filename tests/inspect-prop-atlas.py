import _bootstrap  # Shared backend import path for tests and previews.
"""Read alpha components to audit sprite crop bounds; does not modify images."""
from pathlib import Path
from collections import deque
import json
import numpy as np
from PIL import Image

root=Path(__file__).resolve().parents[1]
result={}
for name in ('props','scatter'):
    im=Image.open(root/'site/assets/map-art'/f'{name}-atlas.png')
    alpha=np.asarray(im.getchannel('A'))>32
    h,w=alpha.shape
    components=[]
    for y in range(h):
        for x in np.flatnonzero(alpha[y]):
            x=int(x)
            if not alpha[y,x]: continue
            queue=deque([(x,y)])
            alpha[y,x]=False
            left=right=x;top=bottom=y;area=0;sumx=sumy=0
            while queue:
                px,py=queue.popleft();area+=1;sumx+=px;sumy+=py
                left=min(left,px);right=max(right,px);top=min(top,py);bottom=max(bottom,py)
                for nx,ny in ((px-1,py),(px+1,py),(px,py-1),(px,py+1)):
                    if 0<=nx<w and 0<=ny<h and alpha[ny,nx]:
                        alpha[ny,nx]=False;queue.append((nx,ny))
            if area>=32:components.append({'box':[left,top,right+1,bottom+1],'area':area,'center':[round(sumx/area,1),round(sumy/area,1)]})
    result[name]={'size':[w,h],'components':components}
    print(name,[(c['box'],c['area']) for c in components if c['area']>1500])
(root/'tests/artifacts/atlas-props-components.json').write_text(json.dumps(result,indent=2))
