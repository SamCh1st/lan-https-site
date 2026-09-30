import _bootstrap  # Shared backend import path for tests and previews.
"""Reference-inspired architecture fixtures, not certified canonical spells."""
import math


def band(radius, pattern, count, size=28, start=0, sweep=360):
    return dict(x=0,y=0,radius=radius,pattern=pattern,count=count,start=start,sweep=sweep,rotation=180,size=size)


def scene(linked=False):
    modules=[]
    positions=[(-280,0,150,'water'),(280,0,150,'wind'),(0,-290,170,'water'),(0,290,160,'wind')]
    if linked:
        positions=[(0,0,180,'light')]+[(round(490*math.sin(i*math.tau/8)),round(490*math.cos(i*math.tau/8)),110+10*(i%3),['water','wind','repetition','earth'][i%4]) for i in range(8)]
    patterns=[['column','convergence','levitation'],['pulling','dispersion','stability'],['gathering','cooling','convergence'],['regions','levitation','dispersion']]
    for i,(x,y,r,core) in enumerate(positions):
        modules.append(dict(x=x,y=y,radius=r,core=core,core_size=55,bands=[band(r*.75,patterns[i%4],12,22),band(r*.45,patterns[(i+1)%4][:2],6,18,start=30)]))
    strokes=[dict(points=[[x*.4,y*.4],[x*.58,y*.58]],closed=False) for x,y,_,_ in positions if x or y]
    if not linked:
        strokes.extend(dict(points=[[-85,-20+j*24],[-40,-35+j*24],[0,-10+j*24],[45,-35+j*24],[85,-20+j*24]],closed=False) for j in range(3))
    return dict(action='composition',boundary=700 if not linked else 800,modules=modules,
                bands=[band(660 if not linked else 755,['pulling','cooling','stability'],72,30),band(555 if not linked else 700,['column','dispersion','levitation','convergence'],64,28)],
                marks=[],strokes=strokes)
