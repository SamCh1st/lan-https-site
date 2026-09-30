"""Geometric branch connectivity; contact is not proof of magical function."""
import math


def connected(nodes):
    rings=[n for n in nodes if n['type']=='ring']
    if not rings:return set(),None
    main=min(rings,key=lambda n:(math.hypot(n['x'],n['y']),-n['w']*n['h']))
    graph={n['id']:set() for n in nodes}
    def link(a,b):graph[a['id']].add(b['id']);graph[b['id']].add(a['id'])
    def point(n,p):
        a=math.radians(n['rotation']);x,y=p[0]*n['w']/100,p[1]*n['h']/100
        return n['x']+x*math.cos(a)-y*math.sin(a),n['y']+x*math.sin(a)+y*math.cos(a)
    paths={}
    for n in nodes:
        if n['type'] in ('stroke','line'):
            pts=[point(n,p) for p in (n.get('points',[[-40,0],[40,0]]) if n['type']=='stroke' else [[-40,0],[40,0]])]
            if n.get('closed'):pts.append(pts[0])
            paths[n['id']]=list(zip(pts,pts[1:]))
    def distance(p,a,b):
        dx,dy=b[0]-a[0],b[1]-a[1];d=dx*dx+dy*dy
        t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)) if d else 0
        return math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)
    def touch(n,a,b):
        center=(n['x'],n['y']);r=min(n['w'],n['h'])/2
        return distance(center,a,b)<=r+3 and (n['type'] not in ('ring','openRing') or max(math.dist(center,a),math.dist(center,b))>=r-3)
    def cross(a,b,c,d):
        def side(p,q,r):return (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0])
        return (side(a,b,c)*side(a,b,d)<0 and side(c,d,a)*side(c,d,b)<0) or min(distance(a,c,d),distance(b,c,d),distance(c,a,b),distance(d,a,b))<=3
    for i,a in enumerate(nodes):
        for b in nodes[i+1:]:
            ap,bp=paths.get(a['id']),paths.get(b['id'])
            if ap and bp:hit=any(cross(*s,*t) for s in ap for t in bp)
            elif ap or bp:hit=any(touch(b if ap else a,*s) for s in (ap or bp))
            else:
                # Interior contents and touching circular boundaries belong to
                # the same connected diagram. Detached symbols never self-link.
                d=math.hypot(a['x']-b['x'],a['y']-b['y'])
                ar,br=a['type']=='ring',b['type']=='ring'
                hit=(ar and br and d<=(a['w']+b['w'])/2+3) or (ar and not br and d+math.hypot(b['w'],b['h'])/2<a['w']/2) or (br and not ar and d+math.hypot(a['w'],a['h'])/2<b['w']/2)
            if hit:link(a,b)
    seen={main['id']};pending=[main['id']]
    while pending:
        for identity in graph[pending.pop()]-seen:seen.add(identity);pending.append(identity)
    return seen,main['id']
