"""Versioned campaign ZIPs; imports always allocate new records and media."""
import hashlib
import io
import json
import math
import re
import secrets
import shutil
import sqlite3
import tempfile
import zipfile
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit, parse_qs, unquote
from xml.etree import ElementTree
import storage
import audio_library

WEB_ROOT = Path(__file__).resolve().parent.parent / 'site'
MAX_ARCHIVE = 512 * 1024 * 1024
MAX_TOTAL = 1024 * 1024 * 1024
MAX_FILE = 128 * 1024 * 1024
MAX_JSON = 32 * 1024 * 1024
MAX_ENTRIES = 10000
FORMAT = 'lan-campaign'
CATEGORIES = {'campaign','chat','session','quest','encounter','character','npc','location','faction','item','spell','attack','lore','artwork','species','background','class','feat','chronicle','map_part'}
UPLOAD_KEYS = {'image_id','part_image_id','character_image_id','avatar_id','upload_id'}
MAP_KEYS = {'map_id','connected_map_id','arrival_from_map_id','active_map_id','viewer_map_id','from_map_id'}
USER_KEYS = {'user_id','owner_user_id','created_by','invited_by','deleted_by'}
USER_LISTS = {'assigned_user_ids','audience_user_ids'}
RECORD_KEYS = {'campaign_id','record_id','character_id','npc_id','card_id','part_card_id','item_id','required_item_id','steal_required_item_id','chat_id','persona_id','giver_id','leader_id','location_id','loot_source_record_id','source_record_id','reply_as_id'}
RECORD_LISTS = {'owner_ids','user_ids','participant_ids','encounter_ids','equipment_attuned'}
URL = re.compile(r'(?:/api/uploads/\d+|/?assets/[^\s"\'<>\)]+|/api/audio/file\?[^\s"\'<>\)]+)')


def _json(data):
    return json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(',', ':'))


def _tree(value, depth=0):
    if depth > 55: raise ValueError('Campaign data is nested too deeply.')
    if isinstance(value, dict):
        for k,v in value.items():
            if not isinstance(k,str): raise ValueError('Invalid object key.')
            _tree(v,depth+1)
    elif isinstance(value,list):
        for v in value: _tree(v,depth+1)
    elif value is not None and not isinstance(value,(str,bool,int,float)):
        raise ValueError('Invalid campaign value.')
    elif isinstance(value,float) and not math.isfinite(value): raise ValueError('Invalid number.')


def _image(data, mime):
    if mime == 'image/svg+xml':
        if len(data)>5*1024*1024 or b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper(): raise ValueError('Unsafe SVG artwork.')
        try: root=ElementTree.fromstring(data)
        except ElementTree.ParseError as e: raise ValueError('Invalid SVG artwork.') from e
        if root.tag.split('}')[-1]!='svg': raise ValueError('Invalid SVG artwork.')
        forbidden={'script','foreignObject','style','iframe','object','embed','animate','set','animateTransform','animateMotion'}
        for el in root.iter():
            if el.tag.split('}')[-1] in forbidden: raise ValueError('Active SVG artwork is not supported.')
            for key,value in el.attrib.items():
                key=key.split('}')[-1].lower()
                if key.startswith('on') or (key in ('href','src') and not value.startswith('#')) or ('url(' in value.lower() and not re.fullmatch(r'url\(#[\w-]+\)',value)):
                    raise ValueError('External or active SVG artwork is not supported.')
        return '.svg'
    from PIL import Image
    try:
        with Image.open(io.BytesIO(data)) as image:
            kind=image.format
            if image.width*image.height>80_000_000: raise ValueError('Artwork is too large.')
            image.verify()
    except Exception as e: raise ValueError('Invalid image in campaign file.') from e
    types={'PNG':('image/png','.png'),'JPEG':('image/jpeg','.jpg'),'GIF':('image/gif','.gif'),'WEBP':('image/webp','.webp')}
    if kind not in types or types[kind][0]!=mime: raise ValueError('Unsupported image format.')
    return types[kind][1]


def _scan(value, uploads, urls):
    if isinstance(value,dict):
        for key,v in value.items():
            if key in UPLOAD_KEYS and v:
                if type(v) is not int or v<1: raise ValueError('Invalid artwork reference.')
                uploads.add(v)
            _scan(v,uploads,urls)
    elif isinstance(value,list):
        for v in value: _scan(v,uploads,urls)
    elif isinstance(value,str):
        for match in URL.finditer(value):
            url=match.group()
            if url.startswith('/api/uploads/'): uploads.add(int(url.rsplit('/',1)[1]))
            else: urls.add(url)


def export_campaign(user_id,cid):
    """Return an open temporary ZIP. The caller closes it after streaming."""
    if storage.campaign_role(user_id,cid)!='creator':
        raise PermissionError('Only the campaign creator can download the full campaign.')
    with storage.connect() as db:
        db.execute('BEGIN')
        records=[dict(r) for r in db.execute("SELECT id,title,content FROM work_items WHERE id=? OR CAST(json_extract(content,'$.campaign_id') AS INTEGER)=? ORDER BY id",(cid,cid))]
        for r in records:r['content']=json.loads(r['content'])
        if not any(r['id']==cid and r['content'].get('category')=='campaign' for r in records):raise ValueError('Campaign not found.')
        maps=[dict(r) for r in db.execute('SELECT id,title,kind,state FROM campaign_maps WHERE campaign_id=? ORDER BY id',(cid,))]
        for m in maps:m['state']=json.loads(m['state'])
        settings=db.execute('SELECT kind FROM campaign_map_settings WHERE campaign_id=?',(cid,)).fetchone()
        selection=db.execute('SELECT map_id FROM campaign_map_selection WHERE campaign_id=?',(cid,)).fetchone()
        messages=[dict(r) for r in db.execute('SELECT id,chat_id,user_id,persona_type,persona_id,persona_name,role,addressed_to_ai,audience_user_ids,message,generation_status,created_at FROM campaign_ai_messages WHERE campaign_id=? AND deleted_at IS NULL ORDER BY id',(cid,))]
        for message in messages:message['audience_user_ids']=json.loads(message['audience_user_ids'])
        notes=[dict(r) for r in db.execute("SELECT n.work_id,n.note FROM personal_notes n JOIN work_items w ON w.id=n.work_id WHERE n.user_id=? AND (w.id=? OR CAST(json_extract(w.content,'$.campaign_id') AS INTEGER)=?)",(user_id,cid,cid))]
        members=[dict(r) for r in db.execute("SELECT u.id,u.username,m.role FROM campaign_members m JOIN users u ON u.id=m.user_id WHERE m.campaign_id=? AND m.status='accepted'",(cid,))]
        snapshots={}
        for table in ('campaign_map_views','campaign_map_visits','campaign_map_positions','campaign_player_positions','campaign_marker_meetings','campaign_part_rolls'):
            if table in ('campaign_map_positions','campaign_part_rolls'):
                rows=db.execute(f'SELECT t.* FROM {table} t JOIN campaign_maps m ON m.id=t.map_id WHERE m.campaign_id=?',(cid,))
            else: rows=db.execute(f'SELECT * FROM {table} WHERE campaign_id=?',(cid,))
            snapshots[table]=[dict(r) for r in rows]
        manifest={'format':FORMAT,'version':1,'campaign_id':cid,'exporter_id':user_id,'records':records,'maps':maps,'map_kind':settings['kind'] if settings else None,'active_map_id':selection['map_id'] if selection else None,'messages':messages,'notes':notes,'players':members,'player_state':snapshots,'media':[]}
        manifest['catalog_state']={
            'map_parts':[r[0] for r in db.execute('SELECT part_type FROM map_part_seeds WHERE campaign_id=?',(cid,))],
            'business':[r[0] for r in db.execute('SELECT asset_id FROM business_catalog_seeds WHERE campaign_id=?',(cid,))],
            'references':[r[0] for r in db.execute('SELECT version FROM campaign_reference_updates WHERE campaign_id=?',(cid,))]}
        # Resolve catalog IDs to actual image files so artwork does not depend on titles
        # or the destination site's copy of the catalog.
        for record in records:
            content=record['content']
            if content.get('image_id'):continue
            ident=content.get('catalog_asset_id') or (content.get('part_type') if content.get('category')=='map_part' else None)
            if isinstance(ident,str) and re.fullmatch(r'[a-z0-9_]+',ident):
                path=WEB_ROOT/'assets/map-art/items'/(ident+'.png')
                if path.is_file():content['_portable_art']='/assets/map-art/items/'+ident+'.png'
            if not content.get('_portable_art') and isinstance(content.get('default_art'),str):content['_portable_art']=content['default_art']
        for map_record in maps:
            for node in map_record['state'].get('nodes',[]):
                ident=node.get('type')
                if not node.get('part_image_id') and isinstance(ident,str) and re.fullmatch(r'[a-z0-9_]+',ident) and (WEB_ROOT/'assets/map-art/items'/(ident+'.png')).is_file():
                    node['_portable_part_art']='/assets/map-art/items/'+ident+'.png'
        uploads=set();urls=set();_scan([records,maps,messages],uploads,urls)
        source_uploads={r['id']:dict(r) for r in db.execute('SELECT id,user_id,filename,mime_type FROM uploads') if r['id'] in uploads}
    archive=tempfile.TemporaryFile()
    try:
        total=0
        with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=3) as bundle:
            def add(path,mime,**link):
                nonlocal total
                if not path.is_file() or path.is_symlink():raise ValueError('A campaign media file is missing: '+path.name)
                size=path.stat().st_size;total+=size
                if size>MAX_FILE or total>MAX_TOTAL or len(manifest['media'])>=MAX_ENTRIES-1:raise ValueError('Campaign media exceeds the archive limit.')
                name='media/'+str(len(manifest['media'])+1)
                data=path.read_bytes()
                if mime!='audio/mpeg':_image(data,mime)
                bundle.writestr(name,data)
                manifest['media'].append({'path':name,'mime':mime,'size':size,'sha256':hashlib.sha256(data).hexdigest(),**link})
            for ident in sorted(uploads):
                row=source_uploads.get(ident)
                if not row:raise ValueError('Campaign artwork is missing (image '+str(ident)+').')
                # Only bytes already accessible to the campaign creator may leave the site.
                visible=storage.get_visible_upload(user_id,ident)
                if not visible:
                    hidden=any(n.get('part_image_id')==ident for m in maps for n in m['state'].get('nodes',[]))
                    if not hidden:raise PermissionError('Campaign references artwork you cannot export.')
                path=(storage.UPLOAD_DIR/row['filename']).resolve()
                if not path.is_relative_to(storage.UPLOAD_DIR.resolve()):raise ValueError('Invalid stored image path.')
                add(path,row['mime_type'],upload_id=ident)
            for url in sorted(urls):
                parts=urlsplit(url)
                if parts.path=='/api/audio/file':
                    query=parse_qs(parts.query);folder=query.get('folder',[''])[0];name=query.get('name',[''])[0]
                    path=(audio_library.ROOT/folder/name).resolve()
                    if not path.is_relative_to(audio_library.ROOT.resolve()) or path.suffix.lower()!='.mp3':raise ValueError('Invalid campaign audio path.')
                    add(path,'audio/mpeg',url=url)
                else:
                    path=(WEB_ROOT/unquote(parts.path).lstrip('/')).resolve()
                    if not path.is_relative_to((WEB_ROOT/'assets').resolve()):raise ValueError('Invalid catalog artwork path.')
                    mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml'}.get(path.suffix.lower())
                    if mime:add(path,mime,url=url)
            encoded=_json(manifest).encode()
            if len(encoded)>MAX_JSON:raise ValueError('Campaign records exceed the archive limit.')
            bundle.writestr('manifest.json',encoded)
        if archive.tell()>MAX_ARCHIVE:raise ValueError('Campaign file exceeds 512 MB.')
        archive.seek(0)
        return archive,next(r['title'] for r in records if r['id']==cid)
    except Exception:
        archive.close();raise


def _validate(bundle):
    infos=bundle.infolist()
    if not infos or len(infos)>MAX_ENTRIES or len({i.filename for i in infos})!=len(infos):raise ValueError('Invalid campaign ZIP entries.')
    total=0
    for info in infos:
        path=PurePosixPath(info.filename)
        if path.is_absolute() or '..' in path.parts or '\\' in info.filename or ':' in info.filename or info.is_dir() or info.flag_bits&1 or info.compress_type not in (zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED):raise ValueError('Unsafe campaign ZIP entry.')
        if info.filename!='manifest.json' and not re.fullmatch(r'media/[1-9]\d*',info.filename):raise ValueError('Unexpected file in campaign archive.')
        if info.file_size>(MAX_JSON if info.filename=='manifest.json' else MAX_FILE):raise ValueError('Campaign ZIP entry is too large.')
        total+=info.file_size
    if total>MAX_TOTAL:raise ValueError('Campaign archive expands beyond its limit.')
    try:data=json.loads(bundle.read('manifest.json'))
    except (KeyError,ValueError,UnicodeError) as e:raise ValueError('Missing or invalid campaign manifest.') from e
    _tree(data)
    if not isinstance(data,dict) or data.get('format')!=FORMAT or data.get('version')!=1:raise ValueError('Unsupported campaign file version.')
    for name in ('records','maps','media','messages','notes','players'):
        if not isinstance(data.get(name),list) or len(data[name])>30000:raise ValueError('Invalid campaign '+name+'.')
    def rows(name):
        ids=set()
        for r in data[name]:
            if not isinstance(r,dict) or type(r.get('id')) is not int or r['id']<1 or r['id'] in ids:raise ValueError('Invalid or duplicate '+name+' ID.')
            ids.add(r['id'])
        return ids
    record_ids=rows('records');map_ids=rows('maps');rows('messages');rows('players')
    seeds=data.get('catalog_state',{})
    if not isinstance(seeds,dict):raise ValueError('Invalid catalog markers.')
    for key in ('map_parts','business'):
        values=seeds.get(key,[])
        if not isinstance(values,list) or len(values)>10000 or any(not isinstance(v,str) or not re.fullmatch(r'[a-z0-9_]+',v) for v in values):raise ValueError('Invalid catalog markers.')
    versions=seeds.get('references',[])
    if not isinstance(versions,list) or len(versions)>1 or any(type(v) is not int or not 0<=v<=10000 for v in versions):raise ValueError('Invalid catalog version.')
    state=data.get('player_state',{})
    if not isinstance(state,dict) or any(not isinstance(rows,list) or any(not isinstance(row,dict) for row in rows) for rows in state.values()):raise ValueError('Invalid player state.')
    cid=data.get('campaign_id')
    if type(cid) is not int or cid not in record_ids:raise ValueError('Missing campaign record.')
    for r in data['records']:
        c=r.get('content')
        if not isinstance(r.get('title'),str) or not 1<=len(r['title'].strip())<=120 or not isinstance(c,dict) or c.get('category') not in CATEGORIES:raise ValueError('Invalid campaign record.')
        if (r['id']==cid)!=(c['category']=='campaign') or (r['id']!=cid and c.get('campaign_id')!=cid):raise ValueError('Records must belong to one campaign.')
    for m in data['maps']:
        if not isinstance(m.get('title'),str) or not 1<=len(m['title'])<=120 or m.get('kind') not in ('2d','3d') or not isinstance(m.get('state'),dict):raise ValueError('Invalid map.')
    if data.get('active_map_id') is not None and data['active_map_id'] not in map_ids:raise ValueError('Invalid selected map.')
    if data.get('map_kind') not in (None,'2d','3d'):raise ValueError('Invalid map kind.')
    paths=set();upload_ids=set();urls=set()
    for media in data['media']:
        if not isinstance(media,dict) or media.get('path') not in {i.filename for i in infos} or media['path'] in paths or media['path']=='manifest.json':raise ValueError('Invalid campaign media.')
        paths.add(media['path'])
        if ('upload_id' in media)==('url' in media):raise ValueError('Invalid media reference.')
        if 'upload_id' in media:
            uid=media['upload_id']
            if type(uid) is not int or uid<1 or uid in upload_ids:raise ValueError('Invalid artwork ID.')
            upload_ids.add(uid)
        else:
            url=media['url']
            if not isinstance(url,str) or url in urls or not URL.fullmatch(url):raise ValueError('Invalid media URL.')
            urls.add(url)
        body=bundle.read(media['path'])
        if len(body)!=media.get('size') or hashlib.sha256(body).hexdigest()!=media.get('sha256'):raise ValueError('Campaign media is damaged.')
        if media.get('mime')=='audio/mpeg':
            if not (body.startswith(b'ID3') or (len(body)>1 and body[0]==255 and body[1]&224==224)):raise ValueError('Invalid MP3 file.')
        else:_image(body,media.get('mime'))
    if paths!={i.filename for i in infos if i.filename!='manifest.json'}:raise ValueError('Unlisted archive files.')
    requested=set();requested_urls=set();_scan([data['records'],data['maps'],data['messages']],requested,requested_urls)
    if not requested.issubset(upload_ids):raise ValueError('The campaign file is missing artwork.')
    for note in data['notes']:
        if not isinstance(note,dict) or note.get('work_id') not in record_ids or not isinstance(note.get('note'),str):raise ValueError('Invalid personal note.')
    for m in data['messages']:
        if m.get('role') not in ('user','assistant') or m.get('persona_type') not in ('character','dm') or not isinstance(m.get('message'),str) or not 1<=len(m['message'])<=12000 or not isinstance(m.get('persona_name'),str):raise ValueError('Invalid chat message.')
        if m.get('chat_id') is not None and m['chat_id'] not in record_ids:raise ValueError('Invalid chat reference.')
        if not isinstance(m.get('audience_user_ids'),list):raise ValueError('Invalid chat audience.')
    return data


def import_campaign(user_id,source):
    """Validate before mutation; roll back records and new files together on failure."""
    created=[]
    try:
        with zipfile.ZipFile(source) as bundle:
            data=_validate(bundle)
            with storage.connect() as db:
                db.execute('BEGIN IMMEDIATE')
                if not db.execute('SELECT 1 FROM users WHERE id=?',(user_id,)).fetchone():raise PermissionError('Sign in to import a campaign.')
                records={r['id']:db.execute('INSERT INTO work_items(user_id,title,content) VALUES (?,?,?)',(user_id,r['title'],'{}')).lastrowid for r in data['records']}
                cid=records[data['campaign_id']]
                maps={m['id']:db.execute('INSERT INTO campaign_maps(campaign_id,title,kind,state) VALUES (?,?,?,?)',(cid,m['title'],m['kind'],'{}')).lastrowid for m in data['maps']}
                uploads={};urls={};old_owner=data.get('exporter_id')
                storage.UPLOAD_DIR.mkdir(parents=True,exist_ok=True)
                for media in data['media']:
                    body=bundle.read(media['path']);mime=media['mime']
                    if mime=='audio/mpeg':
                        directory=audio_library.ROOT/'Imported campaigns';directory.mkdir(parents=True,exist_ok=True)
                        path=directory/(secrets.token_hex(24)+'.mp3');created.append(path);path.write_bytes(body)
                        replacement=audio_library.track(path)['url']
                    else:
                        ext=_image(body,mime);name=secrets.token_hex(24)+ext;path=storage.UPLOAD_DIR/name
                        created.append(path);path.write_bytes(body)
                        uid=db.execute('INSERT INTO uploads(user_id,filename,mime_type) VALUES (?,?,?)',(user_id,name,mime)).lastrowid
                        replacement='/api/uploads/'+str(uid)
                        if 'upload_id' in media:uploads[media['upload_id']]=uid
                    if 'url' in media:urls[media['url']]=replacement
                def remap(value,key=''):
                    if key in USER_LISTS:return [user_id] if isinstance(value,list) and old_owner in value else []
                    if key in USER_KEYS:return user_id if value==old_owner else None
                    if key in UPLOAD_KEYS:return uploads.get(value) if value else None
                    if key in MAP_KEYS:return maps.get(value) if value else None
                    if key in RECORD_KEYS:return records.get(value) if value else None
                    if key in RECORD_LISTS:return [records[v] for v in value if v in records] if isinstance(value,list) else []
                    if key=='equipment_loadout':return {k:records[v] for k,v in value.items() if v in records} if isinstance(value,dict) else {}
                    if isinstance(value,dict):
                        result={k:remap(v,k) for k,v in value.items() if k not in ('_portable_art','_portable_part_art')}
                        for marker,target in (('_portable_art','image_id'),('_portable_part_art','part_image_id')):
                            if marker in value:
                                url=urls.get(value[marker],'')
                                if not url.startswith('/api/uploads/'):raise ValueError('Missing catalog artwork.')
                                result[target]=int(url.rsplit('/',1)[1])
                        return result
                    if isinstance(value,list):return [remap(v) for v in value]
                    if isinstance(value,str):
                        def rewrite(match):
                            url=match.group()
                            if url.startswith('/api/uploads/'):
                                ident=int(url.rsplit('/',1)[1]);return '/api/uploads/'+str(uploads[ident])
                            return urls.get(url,url)
                        return URL.sub(rewrite,value)
                    return value
                for r in data['records']:
                    content=remap(r['content'])
                    if r['id']==data['campaign_id']:
                        content['campaign_id']=None
                        # Retain former player state for reassignment, without importing accounts or permissions.
                        content['imported_players']=data['players']
                        content['imported_player_state']={name:[{**remap(row),'source_player_id':row.get('user_id')} for row in rows] for name,rows in data.get('player_state',{}).items() if isinstance(rows,list)}
                    if content.get('category')=='character':
                        content['imported_player_key']=r['content'].get('owner_user_id')
                    content['imported_assigned_players']=r['content'].get('assigned_user_ids',[])
                    if content.get('category')=='character' and r['content'].get('owner_user_id') not in (None,old_owner):
                        content['imported_player_name']=next((p.get('username','') for p in data['players'] if p['id']==r['content']['owner_user_id']),'')
                    db.execute('UPDATE work_items SET content=? WHERE id=?',(_json(content),records[r['id']]))
                db.execute("INSERT INTO campaign_members(campaign_id,user_id,role,status,invited_by) VALUES (?,?,'creator','accepted',?)",(cid,user_id,user_id))
                for m in data['maps']:db.execute('UPDATE campaign_maps SET state=? WHERE id=?',(_json(remap(m['state'])),maps[m['id']]))
                seeds=data.get('catalog_state',{})
                for part in seeds.get('map_parts',[]):db.execute('INSERT OR IGNORE INTO map_part_seeds(campaign_id,part_type) VALUES (?,?)',(cid,part))
                for asset in seeds.get('business',[]):db.execute('INSERT OR IGNORE INTO business_catalog_seeds(campaign_id,asset_id) VALUES (?,?)',(cid,asset))
                for version in seeds.get('references',[]):db.execute('INSERT INTO campaign_reference_updates(campaign_id,version) VALUES (?,?)',(cid,version))
                if data.get('map_kind'):db.execute('INSERT INTO campaign_map_settings(campaign_id,kind) VALUES (?,?)',(cid,data['map_kind']))
                if data.get('active_map_id'):db.execute('INSERT INTO campaign_map_selection(campaign_id,map_id) VALUES (?,?)',(cid,maps[data['active_map_id']]))
                for note in data['notes']:db.execute('INSERT OR REPLACE INTO personal_notes(work_id,user_id,note) VALUES (?,?,?)',(records[note['work_id']],user_id,note['note']))
                for m in data['messages']:
                    message=remap(m)
                    # Private chats stay private to the importer until players are explicitly assigned.
                    audience=[user_id] if m['audience_user_ids'] else []
                    message_id=db.execute('INSERT INTO campaign_ai_messages(campaign_id,chat_id,user_id,persona_type,persona_id,persona_name,role,addressed_to_ai,audience_user_ids,message,generation_status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                        (cid,message.get('chat_id'),message.get('user_id'),m['persona_type'],message.get('persona_id'),m['persona_name'],m['role'],int(bool(m.get('addressed_to_ai'))),_json(audience),message['message'],'error' if m.get('generation_status')=='streaming' else 'complete',str(m.get('created_at') or ''))).lastrowid
                    # Never replay historical gifts when imported narration is read.
                    db.execute('INSERT INTO campaign_ai_effects(message_id,result) VALUES (?,?)',(message_id,_json({'imported':True})))
                title=next(r['title'] for r in data['records'] if r['id']==data['campaign_id'])
                return {'id':cid,'title':title,'records':len(records)-1,'maps':len(maps),'media':len(data['media'])}
    except (zipfile.BadZipFile,RuntimeError,KeyError,TypeError,RecursionError,sqlite3.IntegrityError) as e:
        for path in created:path.unlink(missing_ok=True)
        raise ValueError('Invalid or damaged campaign file.') from e
    except Exception:
        for path in created:path.unlink(missing_ok=True)
        raise


def player_assignment(user_id,cid,mapping=None):
    """The importer explicitly reconnects saved player slots to accepted members."""
    if storage.campaign_role(user_id,cid)!='creator':raise PermissionError('Only the campaign creator can assign imported players.')
    with storage.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        row=db.execute('SELECT content FROM work_items WHERE id=?',(cid,)).fetchone();campaign=json.loads(row['content'])
        players=campaign.get('imported_players',[])
        members=[dict(r) for r in db.execute("SELECT u.id,u.username FROM campaign_members m JOIN users u ON u.id=m.user_id WHERE m.campaign_id=? AND m.status='accepted'",(cid,))]
        if mapping is None:return {'players':players,'members':members}
        if not isinstance(mapping,dict) or len(mapping)>1000:raise ValueError('Invalid player assignments.')
        valid={p['id'] for p in players};accepted={p['id'] for p in members};mapped={}
        for source,target in mapping.items():
            try:source=int(source)
            except (ValueError,TypeError):raise ValueError('Invalid source player.')
            if source not in valid or type(target) is not int or target not in accepted:raise ValueError('Choose an accepted campaign member.')
            mapped[source]=target
        if len(set(mapped.values()))!=len(mapped):raise ValueError('Choose a different account for each player.')
        records=db.execute("SELECT id,content FROM work_items WHERE CAST(json_extract(content,'$.campaign_id') AS INTEGER)=?",(cid,)).fetchall()
        for record in records:
            content=json.loads(record['content']);source=content.get('imported_player_key')
            if content.get('category')=='character' and source in mapped:
                content['owner_user_id']=mapped[source];content['assigned_user_ids']=[mapped[source]]
            elif 'imported_assigned_players' in content:
                content['assigned_user_ids']=sorted(set(content.get('assigned_user_ids',[]))|{mapped[i] for i in content['imported_assigned_players'] if i in mapped})
            db.execute('UPDATE work_items SET content=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',(_json(content),record['id']))
        map_ids={r['id'] for r in db.execute('SELECT id FROM campaign_maps WHERE campaign_id=?',(cid,))}
        record_ids={r['id'] for r in records}
        snapshots=campaign.get('imported_player_state',{})
        for table in ('campaign_map_positions','campaign_player_positions','campaign_map_views','campaign_map_visits','campaign_marker_meetings'):
            for row in snapshots.get(table,[]):
                target=mapped.get(row.get('source_player_id'))
                if target is None:continue
                mid=row.get('map_id')
                if table.startswith('campaign_map_') and mid not in map_ids:continue
                if table in ('campaign_map_positions','campaign_player_positions'):
                    xyz=[row.get(k,0) for k in ('x','y','z')]
                    if any(type(v) not in (int,float) or not math.isfinite(v) or abs(v)>10000 for v in xyz):raise ValueError('Invalid saved player position.')
                    if table=='campaign_map_positions':db.execute('INSERT OR REPLACE INTO campaign_map_positions(map_id,user_id,x,y,z,motion) VALUES (?,?,?,?,?,?)',(mid,target,*xyz,'idle'))
                    else:db.execute("INSERT OR REPLACE INTO campaign_player_positions(campaign_id,user_id,x,y,z,motion) VALUES (?,?,?,?,?,?)",(cid,target,*xyz,'idle'))
                elif table in ('campaign_map_views','campaign_map_visits'):db.execute(f'INSERT OR REPLACE INTO {table}(campaign_id,user_id,map_id) VALUES (?,?,?)',(cid,target,mid))
                elif row.get('card_id') in record_ids:db.execute('INSERT OR IGNORE INTO campaign_marker_meetings(campaign_id,card_id,user_id) VALUES (?,?,?)',(cid,row['card_id'],target))
        return {'ok':True}
