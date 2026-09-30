"""Validated edits on existing artwork; no unrelated full-image overlays."""
import copy,json,math,re,time
import art_composer as C

ACTIONS=['scale','move','recolor','remove','duplicate','add_part']
SCHEMA={'type':'object','properties':{'operations':{'type':'array','maxItems':20,'items':{'type':'object','properties':{'action':{'type':'string','enum':ACTIONS},'targets':{'type':'array','items':{'type':'integer'}},'factor':{'type':'number'},'dx':{'type':'number'},'dy':{'type':'number'},'color':{'type':'string'},'part':{'type':'string','enum':['horns','tusks','scar','bag','beard']},'anchor':{'type':'string','enum':['center','bottom']}},'required':['action','targets']}}},'required':['operations']}
SYSTEM='''Edit the EXISTING artwork using its numbered layers. Return only JSON operations.
Never draw an unrelated full image. Identify targets by their existing names; use all matching left/right parts unless asked otherwise. Locked layers cannot be edited. Selected indices are relevant only when the request says selected/this.
Scale changes an existing part (bigger=1.4, smaller=.75); tusks/horns use anchor=bottom to keep their base fixed. Move uses dx/dy canvas pixels. Recolor uses a #RRGGBB color. Remove deletes targets. Duplicate copies with dx/dy offsets. Add_part supports horns,tusks,scar,bag,beard only; it uses composed parts aligned to the existing Face silhouette. To replace, remove only the named old parts then add_part. If a request cannot be expressed by these operations, return operations=[]; do not approximate it with unrelated shapes.''' 

def context(raw):
    if not isinstance(raw,list) or not 1<=len(raw)<=1000:raise ValueError('Load a drawing before editing it.')
    result=[]
    for i,n in enumerate(raw):
        if not isinstance(n,dict):raise ValueError('Invalid layer context.')
        v={k:n.get(k) for k in ['type','x','y','w','h','scale','angle','fill','ink','locked','stretchX','stretchY','flipX','flipY']}
        for k in ['x','y','w','h','scale','angle']:
            if isinstance(v[k],bool) or not isinstance(v[k],(int,float)) or not math.isfinite(v[k]):raise ValueError('Invalid layer measurement.')
        v.update(index=i,name=str(n.get('name') or n.get('type') or 'Layer')[:80]);result.append(v)
    return result

def validate(operations,layers):
    if not isinstance(operations,list) or not 1<=len(operations)<=20:raise ValueError('No supported edit was identified. Name the part to resize, recolor, move, remove or replace. Your drawing is unchanged.')
    out=[];removed=set()
    for op in operations:
        if not isinstance(op,dict) or op.get('action') not in ACTIONS:raise ValueError('Unsupported edit operation.')
        action=op['action'];targets=op.get('targets',[])
        if not isinstance(targets,list) or any(type(i)!=int or not 0<=i<len(layers) for i in targets):raise ValueError('The AI referenced a missing layer.')
        targets=list(dict.fromkeys(targets))
        if action!='add_part' and not targets:raise ValueError('The edit did not identify a layer.')
        if any(layers[i].get('locked') or i in removed for i in targets):raise ValueError('The AI tried to edit a locked or removed layer.')
        item={'action':action,'targets':targets}
        def number(key,default,lo,hi):
            v=op.get(key,default)
            if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not lo<=v<=hi:raise ValueError('Invalid edit measurement.')
            return v
        if action=='scale':item.update(factor=number('factor',1,.2,4),anchor='bottom' if op.get('anchor')=='bottom' else 'center')
        if action in ('move','duplicate'):item.update(dx=number('dx',12 if action=='duplicate' else 0,-512,512),dy=number('dy',12 if action=='duplicate' else 0,-512,512))
        if action=='recolor':
            if not re.fullmatch(r'#[0-9a-fA-F]{6}',str(op.get('color',''))):raise ValueError('Invalid edit color.')
            item['color']=op['color']
        if action=='remove':removed.update(targets)
        if action=='add_part':
            part=op.get('part');patterns={'horns':('tiefling portrait','horn'),'tusks':('orc portrait','tusk'),'scar':('human portrait','scar'),'bag':('human portrait with a bag','satchel /'),'beard':('dwarf portrait','beard')}
            if part not in patterns:raise ValueError('That added part is not supported yet.')
            face=next((n for n in layers if n['name']=='Face silhouette'),None)
            if not face:raise ValueError('Adding this composed part needs an existing character portrait.')
            if face.get('locked'):raise ValueError('Unlock the portrait before adding parts.')
            query,match=patterns[part];generated,_=C.render(query,{'scar':True,'skin':face.get('fill') or '#c58e69'})
            base=next(n for n in generated if n['name']=='Face silhouette')
            sx=face['w']/base['w']*face['scale']*(face.get('stretchX') or 1)*(-1 if face.get('flipX') else 1);sy=face['h']/base['h']*face['scale']*(face.get('stretchY') or 1)*(-1 if face.get('flipY') else 1)
            a=math.radians(face['angle']);ca,sa=math.cos(a),math.sin(a)
            added=[n for n in generated if match in n['name'].lower()]
            for n in added:
                x=(n['x']-base['x'])*sx;y=(n['y']-base['y'])*sy
                n.update(x=face['x']+x*ca-y*sa,y=face['y']+x*sa+y*ca,stretchX=abs(sx),stretchY=abs(sy),flipX=sx<0,flipY=sy<0,angle=face['angle'])
            item['nodes']=added
        out.append(item)
    return out

def edit(prompt,model,stream_ai,raw,helpers=None,selected=None):
    layers=context(raw);p=prompt.lower();plan=None
    # Common proportional follow-ups are exact operations, not a new drawing.
    if re.fullmatch(r'\s*(?:make (?:the |my )?)?(bigger|larger|longer|smaller|shorter) (tusks?|horns?|ears?)\s*[.!]?\s*',p):
        match=re.search(r'(bigger|larger|longer|smaller|shorter) (tusks?|horns?|ears?)',p);word=match[2].rstrip('s');targets=[n['index'] for n in layers if word in n['name'].lower()]
        if targets:plan={'operations':[{'action':'scale','targets':targets,'factor':.75 if match[1] in ('smaller','shorter') else 1.4,'anchor':'bottom' if word in ('tusk','horn') else 'center'}]}
    used=[]
    for name in ([model] if plan is None else [])+list(dict.fromkeys(h for h in (helpers or []) if isinstance(h,str) and h and h!=model))[:3]:
        yield {'event':'status','message':('AI helper ' if name!=model else 'AI ')+name+' is checking the requested edit against existing layers…'}
        stream=None;prior=plan
        try:
            payload={'model':name,'stream':True,'think':False,'format':SCHEMA,'options':{'num_predict':1200,'num_ctx':16384},'messages':[{'role':'system','content':SYSTEM},{'role':'user','content':json.dumps({'request':prompt,'layers':layers,'selected':selected,'proposed_edit':plan})}]}
            stream=stream_ai('/api/chat',payload,timeout=45);text='';start=time.monotonic()
            for part in stream:
                if part.get('error') or time.monotonic()-start>75:raise ValueError('Edit planning did not finish.')
                text+=part.get('message',{}).get('content','')
                if len(text)>25000:raise ValueError('Edit plan too large.')
                if part.get('done'):break
            candidate=json.loads(re.sub(r'^```(?:json)?\s*|\s*```$','',text.strip()))
            validate(candidate.get('operations'),layers);plan=candidate
            if name!=model:used.append(name)
        except (OSError,ValueError,TypeError,KeyError,AttributeError):
            if prior is None:raise ValueError('The AI could not plan a supported edit. Your drawing is unchanged.')
            yield {'event':'status','message':'Keeping the valid edit; helper '+name+' could not improve it.'}
        finally:
            close=getattr(stream,'close',None)
            if close:close()
    operations=validate((plan or {}).get('operations'),layers)
    yield {'event':'edit','operations':operations}
    yield {'event':'done','result_kind':'edit','layers':len(operations),'description':f'Applied {len(operations)} targeted edit operations to the current drawing.','interpretation':'Unrelated layers were preserved. Undo restores the previous drawing.','helper_models':used}
