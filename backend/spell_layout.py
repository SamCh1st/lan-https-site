"""Compact radial instruction groups without shrinking their glyphs into dots."""
import copy
import math


def compact(scene):
    result=copy.deepcopy(scene)
    modules=result.get('modules',[])
    old_modules=copy.deepcopy(modules)
    old_boundary=max(60,float(result.get('boundary') or 60))
    gap=7

    def pack(bands, inner):
        packed=[];edge=inner
        for source in sorted(bands,key=lambda b:abs(float(b.get('radius') or 100))):
            size=max(22,min(42,abs(float(source.get('size') or 28))))
            half=math.hypot(size,size)/2
            count=max(2,min(96,round(float(source.get('count') or 8))))
            sweep=float(source.get('sweep') or 360)
            sweep=math.copysign(min(360,max(1,abs(sweep))),sweep)
            offset=math.hypot(float(source.get('x') or 0),float(source.get('y') or 0))
            # Preserve offset motif centers, but cap their empty margin.
            offset_scale=min(1,(edge+half+gap)/max(1,offset))
            ox=float(source.get('x') or 0)*offset_scale
            oy=float(source.get('y') or 0)*offset_scale
            remaining=count;index=0
            while remaining:
                radius=max(20,edge+half+gap)
                spacing=2*half+gap
                step=2*math.asin(min(1,spacing/(2*radius)))
                full=abs(sweep)==360
                capacity=max(2,int(math.radians(abs(sweep))/step)+(0 if full else 1))
                amount=min(remaining,capacity)
                if remaining-amount==1:
                    if amount>2:amount-=1
                    else:amount=remaining
                if full and amount>1:radius=max(radius,spacing/(2*math.sin(math.pi/amount)))
                # A two-sign very short arc needs more radius to stay legible.
                if not full and amount>1:
                    radius=max(radius,spacing/(2*math.sin(math.radians(abs(sweep))/(2*(amount-1)))))
                band=copy.deepcopy(source)
                pattern=band.get('pattern',[])
                if pattern:band['pattern']=pattern[index%len(pattern):]+pattern[:index%len(pattern)]
                band.update(x=ox,y=oy,radius=radius,size=size,count=amount,sweep=sweep)
                packed.append(band)
                edge=math.hypot(ox,oy)+radius+half
                remaining-=amount;index+=amount
        return packed,edge

    for module in modules:
        has_core=module.get('core')!='none'
        module['core_size']=max(44,min(76,float(module.get('core_size') or 55)))
        inner=module['core_size']/math.sqrt(2) if has_core else 0
        module['bands'],edge=pack(module.get('bands',[]),inner)
        module['radius']=max(60,edge+gap+3)

    # Pack all symmetry copies together, not just the AI's seed modules.
    order=4 if result.get('symmetry')=='quarter_turn' else 2
    circles=[]
    for m in modules:
        for i in range(order):
            a=math.tau*i/order;c,s=math.cos(a),math.sin(a)
            x,y=m['x']*c-m['y']*s,m['x']*s+m['y']*c
            if not any(math.hypot(x-p[0],y-p[1])<.01 for p in circles):circles.append((x,y,m['radius']))
    scale=0
    for i,a in enumerate(circles):
        for b in circles[i+1:]:
            d=math.hypot(a[0]-b[0],a[1]-b[1])
            if d>.01:scale=max(scale,(a[2]+b[2]+gap)/d)
    if not scale:
        scale=min([1]+[m['radius']/max(60,float(old['radius'])) for m,old in zip(modules,old_modules)])
    internal=[];external=[]
    for module,old in zip(modules,old_modules):
        module['x']*=scale;module['y']*=scale
        # Keep deliberate external branches external.
        (external if math.hypot(old['x'],old['y'])>old_boundary else internal).append(module)
    marks=result.get('marks',[])
    for mark in marks:
        mark['x']*=scale;mark['y']*=scale
    inner=max([0]+[math.hypot(m['x'],m['y'])+m['radius']+gap for m in internal]+[math.hypot(m['x'],m['y'])+math.hypot(m['w'],m['h'])/2+gap for m in marks if math.hypot(m['x'],m['y'])<=old_boundary*scale])
    result['bands'],edge=pack(result.get('bands',[]),inner)
    result['boundary']=max(60,edge+gap+3)
    for module in external:
        distance=math.hypot(module['x'],module['y'])
        wanted=max(distance,result['boundary']+module['radius']+gap)
        if distance:module['x']*=wanted/distance;module['y']*=wanted/distance

    # Align corresponding motif groups before the final symmetry pass. Otherwise
    # copies of a full layout can interleave several differently phased rows.
    motifs={}
    for m in modules:
        d=math.hypot(m['x'],m['y'])
        if d<.01:continue
        angle=math.atan2(m['y'],m['x'])
        signature=(m.get('core'),tuple(tuple(b.get('pattern',[])) for b in m['bands']))
        key=(round(d,2),round((angle%(math.tau/order)),4),signature)
        if key not in motifs:motifs[key]=(copy.deepcopy(m),angle);continue
        seed,seed_angle=motifs[key];delta=angle-seed_angle;c,s=math.cos(delta),math.sin(delta)
        m['radius']=seed['radius'];m['core']=seed['core'];m['core_size']=seed['core_size'];m['bands']=copy.deepcopy(seed['bands'])
        for b in m['bands']:
            x,y=b['x'],b['y'];b['x'],b['y']=x*c-y*s,x*s+y*c;b['start']=float(b.get('start') or 0)+math.degrees(delta)

    def relocate(point):
        x,y=point
        # Preserve attachments to moved/scaled sub-seals, including their rims.
        candidates=[(math.hypot(x-old['x'],y-old['y'])/max(1,old['radius']),old,new) for old,new in zip(old_modules,modules)]
        if candidates:
            distance,old,new=min(candidates,key=lambda item:item[0])
            if distance<=1.08:
                ratio=new['radius']/max(1,old['radius'])
                return [new['x']+(x-old['x'])*ratio,new['y']+(y-old['y'])*ratio]
        ratio=result['boundary']/old_boundary
        return [x*ratio,y*ratio]
    for stroke in result.get('strokes',[]):stroke['points']=[relocate(p) for p in stroke['points']]
    return result
