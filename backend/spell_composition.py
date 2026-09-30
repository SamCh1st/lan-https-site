"""Editable scene construction, independent of the model's choice of spell."""
import math
import copy
from spell_layout import compact


def prepare_layout(scene):
    return compact(circular_layout(scene))


def circular_layout(scene):
    """A rectangular construction frame must not replace the main circle."""
    scene=copy.deepcopy(scene)
    kept=[]
    for stroke in scene.get('strokes',[]):
        points=stroke.get('points',[])
        if len(points)>1 and points[0]==points[-1]:points=points[:-1]
        if stroke.get('closed') and len(points)==4:
            xs={p[0] for p in points};ys={p[1] for p in points}
            if len(xs)==len(ys)==2 and min(xs)<0<max(xs) and min(ys)<0<max(ys):
                scene['boundary']=min(6000,max(scene.get('boundary',60),max(abs(v) for v in xs|ys)))
                continue
        kept.append(stroke)
    scene['strokes']=kept
    return scene


def symmetric_operations(operations, order=2, symbols=None):
    """Balance complete motifs in opposite pairs around the main circle."""
    added=[copy.deepcopy(op) for op in operations if op['action']=='add']
    # Keep the structural skeleton when a symmetry expansion reaches the cap.
    added.sort(key=lambda n:0 if n['type'] in ('ring','openRing') else 1 if n['type']=='stroke' else 2 if symbols and symbols.get(n['type'],(None,))[0]=='sigil' else 3)
    result=[];seen=set()
    def key(n):
        # A mismatched opposite glyph must not become two overlaid glyphs.
        group='ring' if n['type'] in ('ring','openRing') else 'stroke' if n['type']=='stroke' else 'symbol'
        location=(group,round(n['x'],3),round(n['y'],3))
        if group=='ring' and abs(n['x'])<.001 and abs(n['y'])<.001:return location+(round(n['w'],3),round(n['h'],3))
        return location+(round(n['rotation']%360,3),str(n.get('points',''))) if group=='stroke' else location
    # Keep complete existing balanced pairs; unmatched motifs receive a counterpart.
    for n in added:
        if n['type'] in ('ring','openRing'):n['w']=n['h']=max(n['w'],n['h'])
        pair=[n]
        if not (abs(n['x'])<.001 and abs(n['y'])<.001 and n['type']!='stroke'):
            for i in range(1,order):
                angle=2*math.pi*i/order;c,s=math.cos(angle),math.sin(angle)
                partner=copy.deepcopy(n);partner['x']=n['x']*c-n['y']*s;partner['y']=n['x']*s+n['y']*c;partner['rotation']=(n['rotation']+360*i/order)%360
                pair.append(partner)
        fresh=[p for p in pair if key(p) not in seen]
        if len(result)+len(fresh)>1200:continue
        for p in fresh:
            seen.add(key(p));p['id']='sy'+str(len(result));result.append(p)
    if symbols:
        rings=sorted([n for n in result if n['type'] in ('ring','openRing')],key=lambda n:n['w'])
        owners={}
        for n in result:
            if symbols.get(n['type'],(None,))[0]!='sigil':continue
            parent=next((r for r in rings if math.hypot(n['x']-r['x'],n['y']-r['y'])+math.hypot(n['w'],n['h'])/2<r['w']/2),None)
            if parent:
                owners.setdefault(parent['id'],[]).append((math.hypot(n['x']-parent['x'],n['y']-parent['y']),n['id']))
        removed={identity for candidates in owners.values() for _,identity in sorted(candidates)[1:]}
        for parent_id,candidates in owners.items():
            if len(candidates)>1:
                chosen=min(candidates)[1];parent=next(r for r in rings if r['id']==parent_id)
                core=next(n for n in result if n['id']==chosen)
                core['x'],core['y']=parent['x'],parent['y']
        result=[n for n in result if n['id'] not in removed]
    result.extend(dict(action='close',id=n['id'],explanation='Close the circular boundary of the balanced composition.') for n in reversed(result[:]) if n['type']=='openRing')
    return result


def repair_instructions(scene, prompt, symbols):
    """Recover missing instruction bands, explicitly as an editable model proposal."""
    scene=copy.deepcopy(scene)
    requested=[key for key,entry in symbols.items() if entry[0]=='sign' and key in prompt.lower()]
    text=prompt.lower()
    for words,sign in [(('ball','orb','float','hover'),'levitation'),(('jet','beam','shoot'),'column'),(('mist','spray','spread'),'dispersion'),(('gather','focus'),'convergence'),(('hide','invisible'),'concealment')]:
        if any(word in text for word in words) and sign not in requested:requested.append(sign)
    if not requested:requested=['stability','convergence']
    repairs=[]
    def fix_band(band):
        signs=[k for k in band.get('pattern',[]) if symbols.get(k,(None,))[0]=='sign']
        if signs!=band.get('pattern'):
            band['pattern']=signs or requested[:3]
            repairs.append('Replaced non-instruction glyphs in a band with proposed signs: '+', '.join(band['pattern'])+'.')
    for module in scene.get('modules',[]):
        if not module.get('bands'):
            r=module['radius'];size=max(10,min(40,r*.18))
            module['bands']=[dict(x=0,y=0,radius=max(20,r*.65),pattern=requested[:3],count=max(3,min(12,int(2*math.pi*r*.65/(size*2)))),start=0,sweep=360,rotation=180,size=size)]
            repairs.append('Added a proposed instruction band around '+module['core']+'; review its intended behavior.')
        for band in module['bands']:fix_band(band)
    for band in scene.get('bands',[]):fix_band(band)
    return scene,list(dict.fromkeys(repairs))


def refine_density(scene, target, symbols):
    """Budget detail across the authored mixed instruction groups, without extra sources."""
    scene=copy.deepcopy(scene)
    order=4 if scene.get('symmetry')=='quarter_turn' else 2
    def size():
        return sum(n['action']=='add' for n in symmetric_operations(expand(circular_layout(scene),symbols),order,symbols))
    count=size()
    if count>=target*.8:return scene,False
    groups=[]
    for module in scene.get('modules',[]):
        # Complementary inner instructions retain the model's chosen signs.
        bands=module.get('bands',[])
        if len(bands)==1 and len(bands[0].get('pattern',[]))>1:
            inner=copy.deepcopy(bands[0]);inner['radius']=max(20,float(module['radius'])*.42)
            inner['start']=float(inner.get('start') or 0)+15
            inner['pattern']=list(reversed(inner['pattern']))
            bands.append(inner)
        groups.extend(bands)
    groups.extend(scene.get('bands',[]))
    for _ in range(3):
        if count>=target*.8:break
        factor=min(4,target/max(count,1))
        changed=False;scale=1
        for band in groups:
            pattern=band.get('pattern',[])
            if len(set(pattern))<2:continue
            old=int(float(band.get('count') or 8));period=len(pattern)
            new=min(96,max(old,math.ceil(old*factor/period)*period))
            if new==old:continue
            band['count']=new;changed=True
            # Keep dense glyph sequences readable by respecting arc spacing.
            sweep=abs(float(band.get('sweep') or 360));radius=max(20,abs(float(band.get('radius') or 100)))
            scale=max(scale,16*new/(math.radians(min(360,sweep))*radius))
            band['size']=max(10,min(float(band.get('size') or 30),math.radians(min(360,sweep))*radius/new/1.6))
        if not changed:break
        # Increase physical space, not glyph overlap, when a dense motif needs it.
        limit=min([6000/max(60,float(scene.get('boundary') or 60))]+[5000/max(60,float(m['radius'])) for m in scene.get('modules',[])]+[5500/max(20,abs(float(b.get('radius') or 100))) for b in groups])
        scale=min(scale,max(1,limit))
        if scale>1:
            scene['boundary']=max(60,float(scene.get('boundary') or 60))*scale
            for m in scene.get('modules',[]):
                for key in ('x','y','radius'):m[key]*=scale
            for b in groups:
                for key in ('x','y'):b[key]=float(b.get(key) or 0)*scale
                b['radius']=max(20,abs(float(b.get('radius') or 100)))*scale
            for m in scene.get('marks',[]):
                for key in ('x','y'):m[key]*=scale
            for stroke in scene.get('strokes',[]):stroke['points']=[[x*scale,y*scale] for x,y in stroke['points']]
        for b in groups:
            capacity=max(2,int(math.radians(min(360,abs(float(b.get('sweep') or 360))))*max(20,abs(float(b.get('radius') or 100)))/16))
            b['count']=min(int(float(b.get('count') or 8)),capacity)
        total=sum(int(float(b.get('count') or 8)) for b in groups)
        if total>1000:
            for b in groups:b['count']=max(2,int(b['count']*1000/total))
        count=size()
    return scene,True


def schema(symbols):
    number = {"type": "number", "minimum": -12000, "maximum": 12000}
    def obj(properties):
        return {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}
    def array(items, maximum, minimum=0):
        return {"type": "array", "items": items, "minItems": minimum, "maxItems": maximum}
    kind = {"type": "string", "enum": [k for k in symbols if k not in ('concept', 'stroke', 'openRing')]}
    sign = {"type":"string", "enum":[k for k,v in symbols.items() if v[0]=='sign']}
    band = obj({"x": number, "y": number, "radius": {"type": "number", "minimum": 20, "maximum": 5500},
                "pattern": array(sign, 8, 1), "count": {"type": "integer", "minimum": 2, "maximum": 96},
                "start": number, "sweep": {"type": "number", "minimum": 1, "maximum": 360},
                "rotation": number, "size": {"type": "number", "minimum": 10, "maximum": 500}})
    module = obj({"x": number, "y": number, "radius": {"type": "number", "minimum": 60, "maximum": 5000},
                  "core": {"type": "string", "enum": ['none']+[k for k,v in symbols.items() if v[0]=='sigil']},
                  "core_size": {"type": "number", "minimum": 10, "maximum": 500},
                  "bands": array(band, 4, 1)})
    mark = obj({"type": kind, **{k:number for k in ('x','y','rotation')}, **{k:{"type":"number","minimum":10,"maximum":12000} for k in ('w','h')}})
    stroke = obj({"points": array(array(number, 2, 2), 64, 2), "closed": {"type": "boolean"}})
    return obj({"action": {"type": "string", "const": "composition"},
                "symmetry": {"type":"string", "enum":["half_turn","quarter_turn"]},
                "boundary": {"type": "number", "minimum": 60, "maximum": 6000},
                "modules": array(module, 16, 1), "bands": array(band, 12),
                "marks": array(mark, 48), "strokes": array(stroke, 24)})


def expand(scene, symbols):
    """Return one atomic, bounded scene plan; never relocate intentional geometry."""
    nodes, close = [], []
    def add(kind, x, y, w, h, rotation=0, **extra):
        if kind not in symbols:
            raise ValueError('Unknown composition symbol.')
        # Models commonly use zero height/width for a horizontal/vertical line.
        # Keep the stroke itself unchanged inside a selectable minimum-size box.
        if type(w) in (int,float) and 0<=w<10:w=10
        if type(h) in (int,float) and 0<=h<10:h=10
        values = (x,y,w,h,rotation)
        if any(type(v) not in (int,float) or not math.isfinite(v) for v in values) or not 10 <= w <= 12000 or not 10 <= h <= 12000 or max(abs(x),abs(y)) > 100000:
            raise ValueError('Composition dimensions are invalid.')
        if len(nodes)>=1200:
            raise ValueError('This composition exceeds 1200 editable parts.')
        identity='sc'+str(len(nodes))
        nodes.append(dict(action='add',id=identity,type=kind,x=x,y=y,w=w,h=h,rotation=rotation,
                          explanation='Place this component in the composed layout.',preserve_layout=True,**extra))
        if kind=='openRing':close.append(identity)
    def band(value, ox=0, oy=0):
        def number(key,default):
            raw=value.get(key)
            if raw is None:return default
            if isinstance(raw,bool):raise ValueError('Band '+key+' must be a finite number.')
            try:result=float(raw)
            except (ValueError,TypeError):raise ValueError('Band '+key+' must be a finite number.') from None
            if not math.isfinite(result):raise ValueError('Band '+key+' must be a finite number.')
            return result
        pattern=value.get('pattern')
        if not isinstance(pattern,list) or not 1<=len(pattern)<=8:
            raise ValueError('Invalid mixed-symbol band.')
        # The local model's JSON grammar does not enforce numerical ranges.
        # Normalize recoverable values before emitting any drawing operations.
        count=max(2,min(96,round(number('count',8))))
        radius=max(20,min(5500,abs(number('radius',100))))
        sweep=number('sweep',360)
        sweep=360 if sweep==0 else math.copysign(min(360,max(1,abs(sweep))),sweep)
        start=number('start',0)%360;rotation=number('rotation',0)%360
        size=max(10,min(500,abs(number('size',30))))
        x=number('x',0);y=number('y',0)
        for i in range(count):
            angle=start+i*sweep/(count if abs(sweep)==360 else count-1)
            a=math.radians(angle)
            add(pattern[i%len(pattern)],ox+x+radius*math.sin(a),oy+y-radius*math.cos(a),size,size,angle+rotation)
    boundary=scene.get('boundary',0)
    if type(boundary) not in (int,float) or not math.isfinite(boundary) or not 0<=boundary<=6000:
        raise ValueError('Invalid enclosing boundary.')
    # Keep a centered main boundary even if an older model omits it or returns 0.
    add('openRing',0,0,max(60,boundary)*2,max(60,boundary)*2)
    def enclose(ring, contents, include_rings=False):
        # Keep authored symbol positions; enlarge the boundary to contain their
        # rotated bounding boxes instead of silently placing runes outside it.
        required=max([ring['w']/2]+[(math.hypot(n['x']-ring['x'],n['y']-ring['y'])+math.hypot(n['w'],n['h'])/2)/math.sqrt(.98)+12 for n in contents if symbols[n['type']][0] not in ('shape','ring')])
        if include_rings:
            required=max([required]+[(math.hypot(n['x']-ring['x'],n['y']-ring['y'])+max(n['w'],n['h'])/2)/math.sqrt(.98)+12 for n in contents if n['type'] in ('ring','openRing')])
        if required>6000:raise ValueError('The layout needs a boundary larger than 12,000 units. Reduce its spread.')
        ring['w']=ring['h']=required*2
    modules=scene.get('modules',[])
    if not 1<=len(modules)<=16:raise ValueError('Use 1–16 sub-seals.')
    for module in modules:
        x,y,r=module['x'],module['y'],module['radius']
        if module['core']!='none' and symbols.get(module['core'],(None,))[0]!='sigil':raise ValueError('A sub-seal needs a known core or none.')
        add('openRing',x,y,r*2,r*2)
        ring=nodes[-1]; first=len(nodes)
        if module['core']!='none':add(module['core'],x,y,module['core_size'],module['core_size'])
        for value in module['bands']:band(value,x,y)
        enclose(ring,nodes[first:])
    for value in scene.get('bands',[]):band(value)
    for value in scene.get('marks',[]):add(value['type'],value['x'],value['y'],value['w'],value['h'],value['rotation'])
    for value in scene.get('strokes',[]):
        points=value['points']
        if not 2<=len(points)<=64 or any(not isinstance(p,list) or len(p)!=2 or any(type(v) not in (int,float) or not math.isfinite(v) or abs(v)>100000 for v in p) for p in points):
            raise ValueError('Invalid construction stroke.')
        xs,ys=zip(*points); x=(min(xs)+max(xs))/2;y=(min(ys)+max(ys))/2
        w=max(10,max(xs)-min(xs));h=max(10,max(ys)-min(ys))
        add('stroke',x,y,w,h,points=[[100*(px-x)/w,100*(py-y)/h] for px,py in points],closed=bool(value.get('closed')))
    # Preserve the chosen central ring. External components attach through
    # explicit editable branches rather than forcing the center ring to grow.
    main=nodes[0];radius=main['w']/2
    targets=[n for n in nodes[1:] if n['type']=='openRing']
    targets += [n for n in nodes[1:] if symbols[n['type']][0] not in ('shape','ring') and not any(math.hypot(n['x']-r['x'],n['y']-r['y'])+math.hypot(n['w'],n['h'])/2 < r['w']/2 for r in [main]+targets if r['type']=='openRing')]
    for target in targets:
        distance=math.hypot(target['x'],target['y'])
        extent=target['w']/2 if target['type']=='openRing' else math.hypot(target['w'],target['h'])/2
        if distance+extent<=radius or distance<=radius:continue
        ux,uy=target['x']/distance,target['y']/distance
        start=(ux*radius,uy*radius)
        end=(target['x']-ux*extent,target['y']-uy*extent) if target['type']=='openRing' else (target['x'],target['y'])
        # A ring intersecting the main ring already touches it directly.
        if target['type']=='openRing' and distance-extent<=radius:continue
        x,y=(start[0]+end[0])/2,(start[1]+end[1])/2
        w,h=max(10,abs(end[0]-start[0])),max(10,abs(end[1]-start[1]))
        add('stroke',x,y,w,h,points=[[100*(px-x)/w,100*(py-y)/h] for px,py in (start,end)],closed=False)
    nodes.extend(dict(action='close',id=identity,explanation='Complete this sub-seal boundary.') for identity in reversed(close))
    return nodes
