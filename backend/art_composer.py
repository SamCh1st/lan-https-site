"""Coherent, editable illustration parts. AI chooses art direction, not coordinates."""
import math
import re

COLORS={'purple':'#8958a6','green':'#708554','red':'#ac5148','blue':'#527fa5','brown':'#97603b','black':'#302d39','white':'#dfded3','silver':'#a7bbc6','gold':'#cea35b','gray':'#88908b','grey':'#88908b','pink':'#d790ad','orange':'#d08744'}

def subject(prompt):
    p=prompt.lower()
    if re.search(r'\b(orc|orcs|half-orc|elf|elves|dwarf|dwarves|human|halfling|tiefling|portrait|warrior|paladin|wizard|rogue|cleric|fighter|ranger|barbarian|bard|druid|monk|sorcerer|warlock)\b',p):return 'portrait'
    if re.search(r'\b(bag|pouch|satchel|sack)\b',p):return 'bag'
    return None

def shade(color,amount):
    channels=[int(color[i:i+2],16) for i in (1,3,5)]
    return '#'+''.join(f'{max(0,min(255,round(v+(255-v)*amount if amount>0 else v*(1+amount)))):02x}' for v in channels)

class Drawing:
    def __init__(self):self.nodes=[]
    def shape(self,name,points,fill,ink='#302b35',width=2,closed=True):
        xs,ys=zip(*points);x=(min(xs)+max(xs))/2;y=(min(ys)+max(ys))/2
        self.nodes.append(dict(type='pen',name=name,x=x,y=y,w=max(1,max(xs)-min(xs)),h=max(1,max(ys)-min(ys)),angle=0,scale=1,width=width,ink=ink,fill=fill,closed=closed,points=[[px-x,py-y] for px,py in points],opacity=1))
    def path(self,name,d,fill,ink='#302b35',width=2):
        tokens=re.findall(r'[MLQCZ]|-?\d+(?:\.\d+)?',d);i=0;points=[];current=(0,0);closed=False
        def take(n):
            nonlocal i
            values=list(map(float,tokens[i:i+n]));i+=n;return values
        while i<len(tokens):
            op=tokens[i];i+=1
            if op in ('M','L'):
                if op=='M' and points:
                    self.shape(name,points,fill,ink,width,closed);points=[];closed=False
                current=tuple(take(2));points.append(current)
            elif op=='Q':
                cx,cy,x,y=take(4);a,b=current
                for j in range(1,17):
                    t=j/16;u=1-t;points.append((u*u*a+2*u*t*cx+t*t*x,u*u*b+2*u*t*cy+t*t*y))
                current=x,y
            elif op=='C':
                x1,y1,x2,y2,x,y=take(6);a,b=current
                for j in range(1,21):
                    t=j/20;u=1-t;points.append((u**3*a+3*u*u*t*x1+3*u*t*t*x2+t**3*x,u**3*b+3*u*u*t*y1+3*u*t*t*y2+t**3*y))
                current=x,y
            elif op=='Z':closed=True
            else:raise ValueError('Unknown illustration command.')
        self.shape(name,points,fill,ink,width,closed)
    def oval(self,name,x,y,rx,ry,fill,ink='#302b35',width=2):
        self.shape(name,[(x+rx*math.cos(i*math.tau/64),y+ry*math.sin(i*math.tau/64)) for i in range(64)],fill,ink,width)


def direction(prompt,plan):
    p=prompt.lower();kind=subject(prompt);species=next((s for s in ('orc','elf','dwarf','tiefling','halfling') if s in p),str(plan.get('species','human')))
    if species not in ('orc','elf','dwarf','tiefling','human','halfling'):species='human'
    defaults={'skin':'#708554' if species=='orc' else '#b76858' if species=='tiefling' else '#c58e69','leather':'#97603b','cloth':'#44566d','metal':'#a7bbc6','hair':'#302d39','glow':'#aa73e4'}
    colors={k:v if re.fullmatch(r'#[0-9a-fA-F]{6}',str(v:=plan.get(k,default))) else default for k,default in defaults.items()}
    for name,color in COLORS.items():
        if re.search(r'\b'+name+r'[- ](?:skinned|skin)',p):colors['skin']=color
        for word,key in [('leather','leather'),('hair','hair'),('glow','glow'),('armor','metal'),('armour','metal'),('cloak','cloth'),('robes','cloth')]:
            if re.search(r'\b'+name+r'\s+'+word,p):colors[key]=color
    armor=plan.get('armor','plate')
    if any(w in p for w in ('wizard','sorcerer','warlock','robes')):armor='robes'
    elif 'leather' in p and 'breastplate' not in p:armor='leather'
    elif any(w in p for w in ('breastplate','plate','paladin')):armor='plate'
    if armor not in ('plate','leather','robes'):armor='plate'
    hair_style=plan.get('hair_style','short')
    for token,style in [('bald','bald'),('long hair','long'),('topknot','topknot'),('mohawk','mohawk')]:
        if token in p:hair_style=style
    if hair_style not in ('short','long','bald','topknot','mohawk'):hair_style='short'
    face_shape=plan.get('face_shape','broad' if species in ('orc','dwarf') else 'oval')
    expression=plan.get('expression','stern')
    for token in ('angry','gentle','stern'):
        if token in p:expression=token
    return dict(colors,hair_style=hair_style,face_shape=face_shape,expression=expression,bag_shape=plan.get('bag_shape','rounded'),subject=kind,species=species,armor=armor,bag=bool(re.search(r'\b(bag|pouch|satchel|sack)\b',p)),scar=plan.get('scar') is True,beard=species=='dwarf' or 'beard' in p)


def bag(d,c):
    leather=c['leather'];dark=shade(leather,-.4);light=shade(leather,.4);metal=c['metal'];glow=c['glow']
    d.path('Shoulder strap shadow','M 180 169 C 71 80 401 47 345 249 L 327 241 C 372 78 116 113 196 169 Z',dark)
    d.path('Shoulder strap highlight','M 184 155 C 99 96 372 64 335 224','none',light,4)
    d.path('Rounded leather body','M 181 174 C 135 210 100 333 137 400 C 168 458 351 466 387 392 C 419 321 373 213 329 174 C 295 160 212 161 181 174 Z',leather,width=4)
    d.path('Body shadow','M 323 182 C 355 263 385 373 328 424 C 355 419 378 407 387 386 C 409 324 369 213 329 174 Z',dark,dark,1)
    d.path('Leather reflected light','M 171 230 C 144 294 141 359 164 395 C 178 413 188 419 199 416 C 165 354 171 290 190 235 Z',shade(leather,.19),shade(leather,.19),1)
    d.path('Gusset seam','M 162 239 C 135 350 162 400 199 417 M 348 236 C 385 356 353 406 325 421','none',dark,3)
    d.path('Gathered opening','M 181 175 L 169 124 Q 191 133 208 115 Q 226 129 250 110 Q 274 125 301 113 Q 313 132 340 122 L 329 179 Q 257 208 181 175 Z',shade(leather,.1),width=3)
    d.path('Inside opening','M 185 134 Q 222 146 254 133 Q 288 146 325 135 L 316 157 Q 253 174 193 157 Z',shade(leather,-.65))
    d.path('Magic glow within opening','M 194 141 Q 227 151 254 139 Q 283 151 317 142 Q 299 161 254 160 Q 212 162 194 141 Z',glow,glow,1)
    for i,x in enumerate([190,212,238,267,292,316]):
        d.path('Gathered leather fold '+str(i),f'M {x} 163 Q {x-7} 191 {x+2} 221','none',dark,3)
        d.path('Fold light '+str(i),f'M {x+4} 165 Q {x-1} 184 {x+6} 202','none',light,2)
    d.path('Drawstring band','M 176 172 Q 255 196 333 172 L 331 185 Q 255 211 177 185 Z',dark)
    d.path('Drawstring','M 179 178 Q 255 203 329 178','none','#d9b77a',4)
    d.path('Left cord','M 250 191 C 205 159 192 235 249 200 Q 224 229 234 275','none','#d9b77a',4)
    d.path('Right cord','M 255 193 C 302 161 318 235 257 201 Q 279 233 273 283','none','#d9b77a',4)
    d.oval('Drawstring knot',253,196,7,8,'#e9ce90')
    d.path('Flap','M 202 223 Q 251 236 303 223 L 294 298 Q 253 333 211 297 Z',shade(leather,.1),width=3)
    d.path('Flap seam','M 211 239 L 220 290 Q 253 316 285 290 L 294 239','none',light,2)
    d.path('Buckle strap','M 243 241 L 265 241 L 265 357 Q 254 371 243 357 Z',dark)
    d.path('Buckle outer','M 235 270 L 273 270 L 273 306 L 235 306 Z',metal,shade(metal,-.55),3)
    d.path('Buckle opening','M 243 278 L 265 278 L 265 298 L 243 298 Z',dark)
    d.path('Buckle pin','M 254 274 L 254 295','none',shade(metal,.6),3)
    for y in (322,337,352):d.oval('Strap hole',254,y,2,2,'#28222b',width=1)
    for i in range(16):
        a=math.pi*.12+i*math.pi*.76/15;x=256+109*math.cos(a);y=336+91*math.sin(a)
        d.path('Hand stitching '+str(i),f'M {x:.2f} {y:.2f} L {x-3:.2f} {y-5:.2f}','none',light,1.7)
    for x,y in [(224,104),(275,92),(308,106)]:
        d.path('Arcane glint',f'M {x-5} {y} L {x+5} {y} M {x} {y-7} L {x} {y+7}','none',glow,2)


def portrait(d,c):
    skin=c['skin'];shadow=shade(skin,-.3);light=shade(skin,.25);cloth=c['cloth'];metal=c['metal'];hair=c['hair'];orc=c['species']=='orc';elf=c['species']=='elf'
    d.path('Cloak silhouette','M 213 296 Q 118 306 78 379 L 60 479 L 452 479 L 432 379 Q 386 305 298 295 Z',shade(cloth,-.35),width=4)
    d.path('Left cloak folds','M 201 319 Q 126 349 108 461 L 70 477 L 83 389 Q 111 337 163 321 Z',cloth)
    d.path('Right cloak folds','M 308 319 Q 384 349 404 464 L 446 478 L 431 389 Q 400 336 349 321 Z',shade(cloth,-.15))
    d.path('Neck','M 215 263 L 208 326 Q 255 365 306 326 L 297 263 Z',skin,width=3)
    d.path('Neck shadow','M 221 282 Q 256 310 294 281 L 292 315 Q 259 335 221 304 Z',shadow,shadow,1)
    armor=c['leather'] if c['armor']=='leather' else metal if c['armor']=='plate' else cloth
    d.path('Breastplate' if c['armor']!='robes' else 'Robe bodice','M 177 332 L 211 316 Q 254 365 302 316 L 340 332 L 380 478 L 136 478 Z',armor,width=3)
    d.path('Bodice shadow','M 259 351 Q 302 338 321 328 L 367 471 L 269 471 Z',shade(armor,-.27),shade(armor,-.27),1)
    d.path('Bodice center seam','M 211 324 Q 254 369 303 325 M 257 353 L 259 470','none',shade(armor,-.5),3)
    d.path('Left armor highlight','M 183 349 Q 174 390 166 413 Q 184 400 239 382 L 247 359 Q 208 355 183 349 Z',shade(armor,.27),shade(armor,.27),1)
    if c['armor']=='plate':
        d.path('Left pauldron','M 174 327 Q 115 317 93 379 Q 123 405 182 387 L 203 346 Z',metal,width=3)
        d.path('Right pauldron','M 339 327 Q 402 317 422 379 Q 392 405 334 387 L 313 346 Z',shade(metal,-.1),width=3)
        for x in [116,140,166,349,374,400]:d.oval('Armor rivet',x,376,3,3,shade(metal,.5))
        d.path('Pauldrons rim','M 103 379 Q 134 392 177 376 M 342 376 Q 382 392 412 379','none',shade(metal,-.5),3)
    if c['hair_style']=='long':
        d.path('Long hair silhouette','M 174 145 Q 152 81 207 61 Q 271 37 324 81 Q 359 141 343 237 L 369 340 Q 328 359 300 331 L 197 327 Q 174 348 148 336 L 172 224 Z',hair,width=3)
    head_start=len(d.nodes)
    # Pointed ears, built behind the head and integrated at the temples.
    end=115 if orc or elf else 161
    d.path('Left ear',f'M 192 176 Q 161 175 {end} 147 Q {end+17} 223 184 228 Z',skin,width=3)
    d.path('Right ear',f'M 321 176 Q 351 175 {512-end} 147 Q {495-end} 223 328 228 Z',skin,width=3)
    d.path('Left ear cartilage',f'M 182 193 L {end+23} 171 Q {end+39} 205 182 213','none',shadow,4)
    d.path('Right ear cartilage',f'M 330 193 L {489-end} 171 Q {473-end} 205 330 213','none',shadow,4)
    d.path('Face silhouette','M 178 169 C 165 89 209 62 255 63 C 319 61 347 108 333 173 L 329 232 Q 325 282 277 306 Q 256 316 234 305 Q 185 285 181 237 Z',skin,width=3.5)
    d.path('Face side shadow','M 300 87 Q 344 118 330 176 L 326 234 Q 319 283 279 301 L 281 273 Q 305 243 299 216 Q 320 194 307 173 Z',shadow,shadow,1)
    d.path('Forehead light','M 198 126 Q 216 83 267 86 Q 285 89 294 106 Q 227 100 211 147 Z',light,light,1)
    d.path('Left cheekbone','M 190 217 L 219 207 L 232 224 L 214 241 Q 195 237 190 217 Z',light,light,1)
    d.path('Right cheekbone','M 281 220 L 305 207 L 319 216 L 302 238 Z',shade(skin,.08),shade(skin,.08),1)
    for x,flip in [(219,1),(292,-1)]:
        d.path('Eye socket',f'M {x-24} 185 Q {x} 171 {x+23} 189 Q {x} 206 {x-24} 185 Z',shade(skin,-.42),width=1)
        d.path('Eye white',f'M {x-16} 186 Q {x} 181 {x+15} 189 Q {x} 197 {x-16} 186 Z','#ddd4ae',width=1.5)
        d.oval('Iris',x,189,5,6,'#c99844',width=1)
        d.oval('Pupil',x,189,2.3,4,'#252129',width=1)
        d.oval('Eye glint',x-1,187,1.1,1.4,'#ffffff','#ffffff',.5)
    d.path('Left brow','M 194 169 Q 212 155 239 178 L 236 185 Q 213 175 194 181 Z',hair,hair,1)
    d.path('Right brow','M 273 178 Q 300 155 321 169 L 320 180 Q 301 175 276 185 Z',hair,hair,1)
    d.path('Nose bridge','M 251 179 Q 247 206 237 218 Q 256 231 278 218 Q 266 203 263 180 Z',shade(skin,.1),shadow,2)
    d.path('Nostrils','M 239 219 Q 244 213 249 219 M 265 219 Q 272 213 277 219','none',shade(skin,-.6),3)
    d.path('Upper lip','M 218 252 Q 237 240 256 245 Q 274 239 295 251 Q 257 265 218 252 Z',shade(skin,-.42))
    d.path('Lower lip','M 221 257 Q 257 272 291 257 Q 281 281 256 279 Q 232 278 221 257 Z',shade(skin,-.14),shadow,1.5)
    d.path('Lip separation','M 224 254 Q 256 259 289 253','none','#302b35',2)
    d.path('Chin light','M 237 285 Q 257 291 278 284','none',light,4)
    if orc:
        d.path('Left tusk','M 223 265 Q 209 254 217 226 Q 222 246 234 257 Z','#efe0bb',width=2)
        d.path('Right tusk','M 280 258 Q 292 245 294 226 Q 304 253 289 266 Z','#efe0bb',width=2)
        d.oval('Ear ring',151,210,8,11,'none','#d8b470',3)
    if c['species']=='tiefling':
        d.path('Left horn','M 199 108 Q 131 60 178 32 Q 158 67 218 84 Z','#d0bda5',width=3)
        d.path('Right horn','M 308 109 Q 378 60 334 32 Q 353 67 292 84 Z','#d0bda5',width=3)
    d.path('Hair silhouette','M 179 174 Q 160 126 176 100 L 171 82 L 192 84 L 202 60 L 222 67 Q 267 42 302 72 L 323 65 L 327 89 Q 349 116 332 164 L 314 137 L 297 103 Q 268 119 229 104 L 200 132 Z',hair,width=3)
    for i,x in enumerate([204,225,247,269,290]):
        d.path('Hair strand '+str(i),f'M {x} 88 Q {x+10} 72 {x+20} 83','none',shade(hair,.23),2)
    if c['beard']:
        d.path('Beard','M 192 236 Q 202 269 224 270 L 257 287 L 288 268 Q 311 267 324 235 Q 328 317 281 354 L 254 344 L 232 354 Q 184 313 192 236 Z',hair)
        for x in range(215,303,14):d.path('Beard strands',f'M {x} 290 Q {x+3} 316 {x-2} 329','none',shade(hair,.22),2)
    if c['scar']:
        d.path('Cheek scar','M 308 226 L 292 253','none',shade(skin,.48),2)
        for i in range(4):d.path('Scar stitches',f'M {307-i*4} {229+i*6} L {301-i*4} {226+i*6}','none',shadow,1)
    if c['hair_style']=='bald':
        d.nodes[head_start:]=[n for n in d.nodes[head_start:] if not n['name'].startswith(('Hair silhouette','Hair strand'))]
    elif c['hair_style']=='topknot':
        d.oval('Topknot',270,62,30,27,hair,width=3)
        d.path('Hair tie','M 251 82 Q 271 87 290 80','none',c['cloth'],5)
    elif c['hair_style']=='mohawk':
        d.nodes[head_start:]=[n for n in d.nodes[head_start:] if not n['name'].startswith(('Hair silhouette','Hair strand'))]
        d.path('Mohawk','M 234 108 L 225 72 L 239 77 L 239 42 L 254 61 L 267 36 L 278 75 L 289 67 L 278 108 Z',hair,width=3)
    for n in d.nodes[head_start:]:
        sx=1.1 if c['face_shape']=='broad' else .90 if c['face_shape']=='slender' else 1
        n['x']=256+(n['x']-256)*sx;n['w']*=sx;n['points']=[[x*sx,y] for x,y in n['points']]
        if n['name'] in ('Left brow','Right brow'):
            side=1 if n['name']=='Left brow' else -1
            n['angle']=side*(12 if c['expression']=='angry' else -10 if c['expression']=='gentle' else 0)
    if c['bag']:
        d.path('Crossbody leather strap','M 184 328 L 205 336 L 343 478 L 310 478 Z',c['leather'],width=3)
        # Reuse the complete bag as a small, proportionate shoulder accessory.
        accessory=Drawing();bag(accessory,c)
        for node in accessory.nodes:
            node['x']=321+node['x']*.23;node['y']=357+node['y']*.23;node['scale']=.23;node['name']='Satchel / '+node['name'];d.nodes.append(node)


def render(prompt,plan):
    c=direction(prompt,plan);d=Drawing()
    if c['subject']=='portrait':portrait(d,c)
    elif c['subject']=='bag':
        bag(d,c)
        sx,sy=(.83,1.1) if c['bag_shape']=='tall' else (1.08,.84) if c['bag_shape']=='wide' else (1,1)
        for n in d.nodes:
            n['x']=256+(n['x']-256)*sx;n['y']=256+(n['y']-256)*sy;n['w']*=sx;n['h']*=sy;n['points']=[[x*sx,y*sy] for x,y in n['points']]
    else:raise ValueError('No composed illustration is available for this subject.')
    return d.nodes,c
