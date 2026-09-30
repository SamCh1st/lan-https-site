import _bootstrap  # Shared backend import path for tests and previews.
import gc
import tempfile
import unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import storage
import campaign_maps as maps


class CampaignMapsTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.original=storage.DB_PATH,storage.UPLOAD_DIR
        storage.DB_PATH=Path(self.temp.name)/'test.db'
        storage.UPLOAD_DIR=Path(self.temp.name)/'uploads'
        storage.initialize()
        self.dm=storage.create_user('DM',None,'Map test password')
        self.player=storage.create_user('Player',None,'Map test password')
        self.outsider=storage.create_user('Other',None,'Map test password')
        self.c=storage.create_work(self.dm,'Map campaign',{'category':'campaign','initial_map_kind':'2d'})['id']
        storage.invite_to_campaign(self.dm,self.c,'Player')
        storage.answer_invite(self.player,self.c,True)
        self.first=maps.listing(self.dm,self.c)['active_map_id']

    def tearDown(self):
        storage.DB_PATH,storage.UPLOAD_DIR=self.original
        gc.collect()
        self.temp.cleanup()

    def test_nested_locked_folders_and_individual_props(self):
        folders=[{'id':'room','name':'Room','locked':True},{'id':'table','name':'Table props','parent_id':'room'}]
        nodes=[{'id':t,'type':t,'x':0,'y':0,'w':40,'h':40,'folder_id':'table'} for t in maps.PROP_TYPES+maps.ITEM_PROP_TYPES]
        saved=maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'folders':folders,'nodes':nodes}})
        state=maps.get(self.dm,self.c,self.first)['state']
        self.assertEqual(state['folders'],folders)
        self.assertEqual(len(state['nodes']),95)
        for invalid in [[{'id':'a','name':'A','parent_id':'a'}],[{'id':'a','name':'A','parent_id':'b'},{'id':'b','name':'B','parent_id':'a'}],[{'id':'a','name':'A','parent_id':'missing'}]]:
            with self.assertRaises(ValueError): maps.update(self.dm,self.c,self.first,{'revision':saved['revision'],'state':{'folders':invalid}})

    def test_take_contents_permissions_quantity_and_sections(self):
        char=storage.create_work(self.dm,'Hero',{'category':'character','campaign_id':self.c,'owner_user_id':self.player})['id']
        item=storage.create_work(self.dm,'Loot sword',{'category':'item','campaign_id':self.c,'player_visible':True,'reference_only':True})['id']
        spell=storage.create_work(self.dm,'Loot spell',{'category':'spell','campaign_id':self.c,'player_visible':True})['id']
        node={'id':'chest','type':'chest','x':0,'y':0,'w':80,'h':80,'contents_public':True,'contents':[{'record_id':item,'quantity':2},{'record_id':spell,'quantity':1}]}
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':[node]}})
        data={'node_id':'chest','record_id':item,'character_id':char}
        with self.assertRaises(PermissionError): maps.take_contents(self.outsider,self.c,self.first,data)
        a=maps.take_contents(self.player,self.c,self.first,data)
        b=maps.take_contents(self.player,self.c,self.first,data)
        self.assertEqual(a['record_id'],b['record_id'])
        with self.assertRaises(ValueError): maps.take_contents(self.player,self.c,self.first,data)
        inv=next(r for r in storage.list_work(self.player) if r['id']==a['record_id'])
        self.assertEqual(inv['content']['owner_ids'],[char]);self.assertEqual(inv['content']['quantity'],2)
        got=maps.take_contents(self.player,self.c,self.first,{**data,'record_id':spell})
        inv=next(r for r in storage.list_work(self.player) if r['id']==got['record_id'])
        self.assertEqual(inv['content']['category'],'spell');self.assertEqual(inv['content']['user_ids'],[char]);self.assertEqual(inv['content']['owner_ids'],[])
        self.assertEqual(maps.get(self.dm,self.c,self.first)['state']['nodes'][0]['contents'],[])

    def test_marker_portraits_visible_without_private_notes(self):
        image = storage.save_upload(self.dm, b'portrait test', '.png', 'image/png')
        for kind in ('npc', 'encounter'):
            card = storage.create_work(self.dm, 'Private '+kind, {'category':kind,'campaign_id':self.c,'image_id':image,'player_visible':False,'notes':'DM secret'})['id']
            node = {'id':'marker','type':kind,'card_id':card,'x':0,'y':0,'w':80,'h':80}
            current = maps.get(self.dm,self.c,self.first)
            maps.update(self.dm,self.c,self.first,{'revision':current['revision'],'state':{'nodes':[node]}})
            self.assertIsNotNone(storage.get_visible_upload(self.player,image))
            self.assertIsNone(storage.get_visible_upload(self.outsider,image))
            self.assertFalse(any(r['id']==card for r in storage.list_work(self.player)))
            public = maps.get(self.player,self.c,self.first)['state']['nodes'][0]['marker_card']
            self.assertNotIn('notes',public['content'])
            node['hidden']=True
            current = maps.get(self.dm,self.c,self.first)
            maps.update(self.dm,self.c,self.first,{'revision':current['revision'],'state':{'nodes':[node]}})
            self.assertIsNone(storage.get_visible_upload(self.player,image))

    def test_point_lights_and_daylight_settings(self):
        node={'id':'lamp','type':'point_light','x':-200,'y':-200,'w':400,'h':400,'color':'#ff8844','light_intensity':.8,'shadow_length':3,'shadow_strength':.4,'light_softness':.7}
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':[node],'canvas':{'sun_shadow_length':2.5,'sun_shadow_strength':.6}}})
        saved=maps.get(self.player,self.c,self.first)
        self.assertEqual(saved['state']['nodes'][0]['shadow_length'],3)
        self.assertEqual(saved['state']['nodes'][0]['shadow_strength'],.4)
        self.assertEqual(saved['state']['nodes'][0]['light_softness'],.7)
        self.assertEqual(saved['state']['canvas']['sun_shadow_strength'],.6)
        self.assertEqual(saved['state']['nodes'][0]['color'],'#ff8844')
        self.assertEqual(saved['state']['canvas']['sun_shadow_length'],2.5)
        for field,value in [('light_softness',-1),('light_softness',2),('shadow_strength',-1),('shadow_strength',2),('light_intensity',2),('shadow_length',-1),('shadow_length',float('nan'))]:
            with self.assertRaises(ValueError):maps.update(self.dm,self.c,self.first,{'revision':saved['revision'],'state':{'nodes':[{**node,field:value}]}})
        with self.assertRaises(PermissionError):maps.update(self.player,self.c,self.first,{'revision':saved['revision'],'state':{'nodes':[]}})
        self.assertEqual(maps.get(self.dm,self.c,self.first)['revision'],saved['revision'])

    def test_environment_parts_and_height_settings(self):
        nodes=[{'id':kind,'type':kind,'x':0,'y':0,'w':80,'h':80,'height_scale':2.5} for kind in maps.ENVIRONMENT_TYPES+maps.LOCATION_TYPES]
        nodes[-1].update(light_radius=200,light_color='#aabbcc',light_intensity=.6)
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':nodes}})
        saved=maps.get(self.player,self.c,self.first)['state']['nodes']
        self.assertEqual({n['type'] for n in saved},set(maps.ENVIRONMENT_TYPES+maps.LOCATION_TYPES))
        self.assertTrue(all(n['height_scale']==2.5 for n in saved))
        for value in (-1,4.1,float('nan'),float('inf'),True,'2'):
            with self.assertRaises(ValueError): maps.clean_patch({'nodes':[{**nodes[0],'height_scale':value}]})
        self.assertEqual(maps.clean_patch({'nodes':[{**nodes[0],'height_scale':0}]})['nodes'][0]['height_scale'],0)

    def test_flame_light_options(self):
        nodes=[{'id':kind,'type':kind,'x':0,'y':0,'w':40,'h':40,'light_radius':280,'light_color':'#44ffaa','light_intensity':.7,'light_softness':.8,'shadow_length':2,'shadow_strength':.3,'fire_light':True,'fire_wave':.8,'fire_flicker':.6} for kind in ('torch','campfire')]
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':nodes}})
        saved=maps.get(self.player,self.c,self.first)['state']['nodes']
        for node in saved:
            self.assertEqual(node['light_radius'],280)
            self.assertEqual(node['light_color'],'#44ffaa')
            self.assertEqual(node['w'],40)
            self.assertTrue(node['fire_light'])
            self.assertEqual(node['fire_wave'],.8)
            self.assertEqual(node['fire_flicker'],.6)
        for value in (-1,5001,float('nan')):
            with self.assertRaises(ValueError): maps.clean_patch({'nodes':[{**nodes[0],'light_radius':value}]})

    def test_remove_part_after_last_loot(self):
        char=storage.create_work(self.dm,'Hero',{'category':'character','campaign_id':self.c,'owner_user_id':self.player})['id']
        item=storage.create_work(self.dm,'Coins',{'category':'item','campaign_id':self.c})['id']
        spell=storage.create_work(self.dm,'Spell',{'category':'spell','campaign_id':self.c})['id']
        node={'id':'loot','type':'chest','x':0,'y':0,'w':80,'h':80,'remove_after_looting':True,'contents':[{'record_id':item,'quantity':2},{'record_id':spell,'quantity':1}]}
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':[node]}})
        take={'node_id':'loot','record_id':item,'character_id':char}
        maps.take_contents(self.player,self.c,self.first,take)
        self.assertEqual(len(maps.get(self.player,self.c,self.first)['state']['nodes']),1)
        maps.take_contents(self.player,self.c,self.first,take)
        self.assertEqual(len(maps.get(self.player,self.c,self.first)['state']['nodes']),1)
        maps.take_contents(self.player,self.c,self.first,{**take,'record_id':spell})
        self.assertEqual(maps.get(self.dm,self.c,self.first)['state']['nodes'],[])
        with self.assertRaises(PermissionError): maps.take_contents(self.player,self.c,self.first,take)

    def test_folders_and_interior_walls_persist(self):
        node={'id':'room','type':'building','x':0,'y':0,'w':200,'h':160,'folder_id':'f','wall_base_w':200,'wall_base_h':160,'interior_walls':[[[20,20],[100,80],[200,80]]]}
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':[node],'folders':[{'id':'f','name':'House'}]}})
        state=maps.get(self.dm,self.c,self.first)['state']
        self.assertEqual(state['folders'],[{'id':'f','name':'House'}]);self.assertEqual(state['nodes'][0]['interior_walls'],node['interior_walls'])
        with self.assertRaises(ValueError): maps.clean_patch({'folders':[{'id':'f','name':''}]})
        bad={**node,'interior_walls':[[[0,0]]]}
        with self.assertRaises(ValueError): maps.clean_patch({'nodes':[bad]})

    def test_curved_building_persistence(self):
        node={'id':'curved','type':'building','x':0,'y':0,'w':200,'h':160,'room_base_w':200,'room_base_h':160,'building_shapes':[{'points':[[0,40],[30,0],[180,0],[200,40],[200,130],[160,160],[0,160]],'floor_texture':'wood'}]}
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':[node]}})
        self.assertEqual(maps.get(self.player,self.c,self.first)['state']['nodes'][0]['building_shapes'],node['building_shapes'])
        import copy
        bad=copy.deepcopy(node);bad['building_shapes'][0]['points'][0]=['bad',0]
        with self.assertRaises(ValueError): maps.clean_patch({'nodes':[bad]})
        bad=copy.deepcopy(node);bad['room_base_w']=0
        with self.assertRaises(ValueError): maps.clean_patch({'nodes':[bad]})

    def test_grouped_ambience_and_reverse_persist(self):
        node={'id':'flowers','type':'flowers','x':0,'y':0,'w':100,'h':100,'rotation':0,'ambience_w':100,'ambience_h':100,'instances':[{'x':10,'y':10,'w':20,'h':20,'rotation':90}]}
        ground={'id':'ground','type':'grass','x':0,'y':0,'w':200,'h':200,'erasures':[[.5,.5,.1,.1]]}
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':[node,ground]}})
        state=maps.get(self.dm,self.c,self.first)['state']['nodes']
        self.assertEqual(state[0]['instances'],node['instances'])
        self.assertEqual(state[1]['erasures'],ground['erasures'])
        import copy
        bad=copy.deepcopy(node);bad['instances'][0]['w']=-1
        with self.assertRaises(ValueError): maps.clean_patch({'nodes':[bad]})
        bad=copy.deepcopy(node);bad['instances'][0]['contents']=[{'record_id':1}]
        with self.assertRaises(ValueError): maps.clean_patch({'nodes':[bad]})
        bad=copy.deepcopy(ground);bad['erasures']=[[0,0,-1,1]]
        with self.assertRaises(ValueError): maps.clean_patch({'nodes':[bad]})

    def test_start_choice_migration_and_isolation(self):
        self.assertEqual(maps.get(self.dm,self.c,self.first)['kind'],'2d')
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'scene':{'location':'Keep','weather':'Snow'}}})
        maps.move(self.player,self.c,self.first,{'x':4,'z':8})
        second=maps.create(self.dm,self.c,{'title':'Castle','kind':'2d'})['id']
        self.assertEqual(maps.listing(self.player,self.c)['active_map_id'],second)
        state=maps.get(self.dm,self.c,second)
        self.assertEqual(state['state']['scene'],{'location':'Keep','weather':'Snow'})
        self.assertEqual(state['players'][0]['x'],0)
        maps.activate(self.dm,self.c,self.first)
        self.assertEqual(maps.get(self.player,self.c,self.first)['players'][0]['x'],4)
        legacy=storage.create_work(self.dm,'Old campaign',{'category':'campaign','map_objects':[{'id':'old'}],'map_weather':'rain'})['id']
        initial=maps.listing(self.dm,legacy)['active_map_id']
        self.assertEqual(maps.get(self.dm,legacy,initial)['state']['objects'],[{'id':'old'}])
        self.assertEqual(maps.get(self.dm,legacy,initial)['kind'],'3d')

    def test_fantasy_parts_and_materials(self):
        props='stone_pillar broken_pillar portcullis trapdoor spike_pit pressure_plate lever bone_pile coffin bench round_table cupboard writing_desk weapon_rack market_stall fountain cart hay_bale forge gravestone ritual_circle portal crystal_cluster arcane_obelisk summoning_sigil potion_table bedroll supply_crates camp_tarp rope_bridge fallen_log tree_stump lily_pads reeds thorn_bush spider_web'.split()
        materials='lava swamp ice gravel basalt tiles carpet arcane'.split()
        nodes=[{'id':kind,'type':kind,'x':0,'y':0,'w':80,'h':80,'effects':True} for kind in props+materials]
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':nodes}})
        self.assertEqual(len(maps.get(self.dm,self.c,self.first)['state']['nodes']),44)
        for material in materials:
            maps.clean_patch({'canvas':{'background':material},'nodes':[{'id':'room','type':'building','x':0,'y':0,'w':80,'h':80,'floor_texture':material,'wall_texture':material}]})
        with self.assertRaises(ValueError): maps.clean_patch({'nodes':[{**nodes[0],'effects':'yes'}]})

    def test_campaign_map_type_is_fixed(self):
        self.assertEqual(maps.listing(self.dm,self.c)['map_kind'],'2d')
        with self.assertRaises(ValueError): maps.create(self.dm,self.c,{'title':'Wrong','kind':'3d'})
        self.assertEqual(maps.create(self.dm,self.c,{'title':'Automatic'})['kind'],'2d')
        other=storage.create_work(self.dm,'3D only',{'category':'campaign','initial_map_kind':'3d'})['id']
        self.assertEqual(maps.create(self.dm,other,{'title':'Automatic'})['kind'],'3d')
        with self.assertRaises(ValueError): maps.create(self.dm,other,{'title':'Wrong','kind':'2d'})
        with storage.connect() as db:
            import json
            row=db.execute('SELECT content FROM work_items WHERE id=?',(self.c,)).fetchone()
            content=json.loads(row['content']);content['initial_map_kind']='3d'
            db.execute('UPDATE work_items SET content=? WHERE id=?',(json.dumps(content),self.c))
        self.assertEqual(maps.listing(self.dm,self.c)['map_kind'],'2d')

    def test_existing_mixed_maps_preserved_but_unavailable(self):
        import json
        with storage.connect() as db:
            db.execute('DELETE FROM campaign_map_settings WHERE campaign_id=?',(self.c,))
            old=db.execute("INSERT INTO campaign_maps(campaign_id,title,kind,state) VALUES (?,?,'3d',?)",(self.c,'Legacy 3D',json.dumps({'objects':[{'id':'original-object'}]}))).lastrowid
            db.execute('UPDATE campaign_map_selection SET map_id=? WHERE campaign_id=?',(old,self.c))
        listing=maps.listing(self.dm,self.c)
        self.assertEqual(listing['map_kind'],'3d');self.assertEqual(listing['archived_map_count'],1)
        self.assertEqual([m['id'] for m in listing['maps']],[old])
        for callback in [lambda:maps.activate(self.dm,self.c,self.first),lambda:maps.get(self.player,self.c,self.first),lambda:maps.update(self.dm,self.c,self.first,{'revision':0,'state':{}})]:
            with self.assertRaises(ValueError): callback()
        self.assertEqual(maps.get(self.dm,self.c,old)['state']['objects'],[{'id':'original-object'}])
        with storage.connect() as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM campaign_maps WHERE campaign_id=?',(self.c,)).fetchone()[0],2)

    def test_authorization_validation_and_conflicts(self):
        with self.assertRaises(PermissionError): maps.listing(self.outsider,self.c)
        with self.assertRaises(PermissionError): maps.create(self.player,self.c,{'title':'No','kind':'2d'})
        with self.assertRaises(PermissionError): maps.activate(self.player,self.c,self.first)
        with self.assertRaises(PermissionError): maps.update(self.player,self.c,self.first,{'revision':0,'state':{}})
        with self.assertRaises(PermissionError): maps.move(self.player,self.c,self.first,{'user_id':self.dm,'x':1})
        with self.assertRaises(ValueError): maps.move(self.player,self.c,self.first,{'x':float('nan')})
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'scene':{'time':'Night'}}})
        with self.assertRaises(FileExistsError): maps.update(self.dm,self.c,self.first,{'revision':0,'state':{}})
        other=storage.create_work(self.dm,'Other',{'category':'campaign'})['id']
        with self.assertRaises(ValueError): maps.get(self.dm,other,self.first)
        with self.assertRaises(ValueError): maps.update(self.dm,self.c,self.first,{'revision':1,'state':{'nodes':[{}]}})

    def test_hidden_layers(self):
        node={'id':'secret','type':'chest','x':0,'y':0,'w':40,'h':40,'color':'#aa7755','hidden':True}
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':[node]}})
        self.assertEqual(len(maps.get(self.dm,self.c,self.first)['state']['nodes']),1)
        self.assertEqual(maps.get(self.player,self.c,self.first)['state']['nodes'],[])

    def test_brush_and_canvas_round_trip(self):
        stroke={'id':'terrain','type':'grass','shape':'stroke','x':0,'y':0,'w':200,'h':100,'color':'#647346','brush':80,'baseW':200,'baseH':100,'opacity':.8,'points':[[40,40],[100,60]]}
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':[stroke],'canvas':{'background':'water','grid':False}}})
        state=maps.get(self.player,self.c,self.first)['state']
        self.assertEqual(state['nodes'][0]['points'],stroke['points'])
        self.assertEqual(state['canvas'],{'background':'water','grid':False,'light_angle':315,'relief':1,'sun_shadow_length':1,'sun_shadow_strength':1})
        with self.assertRaises(ValueError): maps.clean_patch({'nodes':[{**stroke,'points':[['bad',0]]}]})
        with self.assertRaises(ValueError): maps.clean_patch({'nodes':[{**stroke,'brush':-1}]})
        with self.assertRaises(ValueError): maps.clean_patch({'canvas':{'background':'arbitrary'}})

    def test_card_markers(self):
        nodes=[]
        for category in ('npc','encounter'):
            card=storage.create_work(self.dm,category+' card',{'category':category,'campaign_id':self.c,'image_id':'portrait.png','notes':'DM secret'})
            nodes.append({'id':category,'type':category,'card_id':card['id'],'x':0,'y':0,'w':80,'h':80})
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':nodes}})
        shown=maps.get(self.player,self.c,self.first)['state']['nodes']
        for node in shown:
            self.assertEqual(node['marker_card']['content']['image_id'],'portrait.png')
            self.assertNotIn('notes',node['marker_card']['content'])
            self.assertEqual(node['marker_card']['title'],node['type']+' card')
        self.assertFalse(shown[0]['met'])
        maps.meet_marker(self.player,self.c,self.first,{'node_id':'npc'})
        maps.meet_marker(self.player,self.c,self.first,{'node_id':'npc'})
        self.assertTrue(maps.get(self.player,self.c,self.first)['state']['nodes'][0]['met'])
        self.assertFalse(maps.get(self.dm,self.c,self.first)['state']['nodes'][0]['met'])
        nodes[0]['card_id']=nodes[1]['card_id']
        with self.assertRaises(ValueError): maps.update(self.dm,self.c,self.first,{'revision':1,'state':{'nodes':nodes}})

    def test_buildings_and_private_contents(self):
        public=storage.create_work(self.dm,'Sword',{'category':'item','campaign_id':self.c,'player_visible':True})['id']
        secret=storage.create_work(self.dm,'Hidden spell',{'category':'spell','campaign_id':self.c})['id']
        room={'id':'room','type':'building','x':0,'y':0,'w':200,'h':160,'floor_texture':'marble','wall_texture':'brick','wall_width':12,'contents':[{'record_id':public,'quantity':2},{'record_id':secret,'quantity':1}]}
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':[room],'canvas':{'background':'empty','light_angle':90}}})
        self.assertEqual(len(maps.get(self.player,self.c,self.first)['state']['nodes'][0]['contents']),2)
        room['contents_public']=True
        maps.update(self.dm,self.c,self.first,{'revision':1,'state':{'nodes':[room]}})
        self.assertEqual(maps.get(self.player,self.c,self.first)['state']['nodes'][0]['contents'],[{'record_id':public,'quantity':2,'title':'Sword','category':'item','price_cp':0},{'record_id':secret,'quantity':1,'title':'Hidden spell','category':'spell','price_cp':0}])
        self.assertEqual(len(maps.get(self.dm,self.c,self.first)['state']['nodes'][0]['contents']),2)
        other=storage.create_work(self.dm,'Other campaign',{'category':'campaign'})['id']
        foreign=storage.create_work(self.dm,'Foreign',{'category':'item','campaign_id':other})['id']
        room['contents']=[{'record_id':foreign,'quantity':1}]
        with self.assertRaises(ValueError): maps.update(self.dm,self.c,self.first,{'revision':2,'state':{'nodes':[room]}})
        room['contents']=[{'record_id':public,'quantity':-1}]
        with self.assertRaises(ValueError): maps.clean_patch({'nodes':[room]})

    def test_connected_brushes(self):
        stroke={'id':'river','type':'river','shape':'stroke','x':0,'y':0,'w':200,'h':100,'brush':80,'baseW':200,'baseH':100,'points':[[40,40],[100,60]],'strokes':[{'points':[[40,40],[100,60]],'brush':80,'softness':.4},{'points':[[100,60],[160,60]],'brush':60,'softness':.4}],'border':True}
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':[stroke]}})
        self.assertEqual(len(maps.get(self.dm,self.c,self.first)['state']['nodes'][0]['strokes']),2)
        with self.assertRaises(ValueError): maps.clean_patch({'nodes':[{**stroke,'strokes':[{'points':[[float('nan'),0]],'brush':30}]}]})
        with self.assertRaises(ValueError): maps.clean_patch({'nodes':[{**stroke,'strokes':[{'points':[[0,0]],'brush':-2}]}]})

    def test_joined_rooms_and_texture_seed(self):
        room={'x':0,'y':0,'w':160,'h':120,'floor_texture':'wood','wall_texture':'brick','wall_width':12}
        building={'id':'joined','type':'building','x':0,'y':0,'w':320,'h':120,'rooms':[room,{**room,'x':160}],'room_base_w':320,'room_base_h':120}
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':[building],'canvas':{'background':'empty','texture_seed':823}}})
        state=maps.get(self.dm,self.c,self.first)['state']
        self.assertEqual(state['canvas']['texture_seed'],823)
        self.assertEqual(len(state['nodes'][0]['rooms']),2)
        with self.assertRaises(ValueError): maps.clean_patch({'canvas':{'texture_seed':-3}})
        with self.assertRaises(ValueError): maps.clean_patch({'nodes':[{**building,'room_base_w':0}]})

    def test_river_flow_validation(self):
        river={'id':'river','type':'river','x':0,'y':0,'w':160,'h':120,'flow_x':-0.5,'flow_y':1.2}
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':[river]}})
        saved=maps.get(self.player,self.c,self.first)['state']['nodes'][0]
        self.assertEqual((saved['flow_x'],saved['flow_y']),(-0.5,1.2))
        for value in ('left',True,float('nan'),float('inf'),-2.1,2.1):
            with self.assertRaises(ValueError): maps.clean_patch({'nodes':[{**river,'flow_x':value}]})
        with self.assertRaises(ValueError): maps.clean_patch({'nodes':[{**river,'type':'water'}]})
        maps.clean_patch({'nodes':[{**river,'flow_x':0,'flow_y':0}]})

    def test_connected_map_targets(self):
        target=maps.create(self.dm,self.c,{'title':'Interior','kind':'2d'})['id']
        stamp={'id':'doorway','type':'house','x':0,'y':0,'w':80,'h':80,'connected_map_id':target}
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':[stamp]}})
        self.assertEqual(maps.get(self.player,self.c,self.first)['state']['nodes'][0]['connected_map_id'],target)
        with self.assertRaises(ValueError): maps.update(self.dm,self.c,self.first,{'revision':1,'state':{'nodes':[{**stamp,'connected_map_id':self.first}]}})
        other=storage.create_work(self.dm,'Other',{'category':'campaign'})['id']
        foreign=maps.listing(self.dm,other)['active_map_id']
        with self.assertRaises(ValueError): maps.update(self.dm,self.c,self.first,{'revision':1,'state':{'nodes':[{**stamp,'connected_map_id':foreign}]}})
        with self.assertRaises(ValueError): maps.clean_patch({'nodes':[{**stamp,'connected_map_id':'invalid'}]})
        maps.update(self.dm,self.c,self.first,{'revision':1,'state':{'nodes':[{**stamp,'connected_map_id':None}]}})
        self.assertIsNone(maps.get(self.dm,self.c,self.first)['state']['nodes'][0]['connected_map_id'])


    def test_player_map_starts_at_main_and_persists_independently(self):
        tavern=maps.create(self.dm,self.c,{'title':'Tavern'})['id']
        initial=maps.listing(self.player,self.c)
        self.assertEqual(initial['viewer_map_id'],self.first)
        self.assertEqual([m['id'] for m in initial['maps']],[self.first])
        with self.assertRaises(PermissionError): maps.get(self.player,self.c,tavern)
        part={'id':'tavern-door','type':'portal','x':40,'y':0,'w':40,'h':40,'connected_map_id':tavern}
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':[part]}})
        maps.visit(self.player,self.c,tavern,{'from_map_id':self.first,'node_id':'tavern-door'})
        village=maps.create(self.dm,self.c,{'title':'Village'})['id']
        self.assertEqual(maps.listing(self.dm,self.c)['viewer_map_id'],village)
        self.assertEqual(maps.listing(self.player,self.c)['viewer_map_id'],tavern)
        self.assertEqual([m['id'] for m in maps.listing(self.player,self.c)['maps']],[self.first,tavern])
        self.assertEqual(maps.get(self.player,self.c,tavern)['title'],'Tavern')
        with storage.connect() as db: maps.initialize(db)
        self.assertEqual(maps.listing(self.player,self.c)['viewer_map_id'],tavern)
        storage.invite_to_campaign(self.dm,self.c,'Other');storage.answer_invite(self.outsider,self.c,True)
        self.assertEqual(maps.listing(self.outsider,self.c)['viewer_map_id'],self.first)
        self.assertEqual([m['id'] for m in maps.listing(self.outsider,self.c)['maps']],[self.first])

    def test_travel_requires_current_visible_reachable_connection(self):
        tavern=maps.create(self.dm,self.c,{'title':'Tavern'})['id']
        part={'id':'door','type':'portal','x':40,'y':0,'w':40,'h':40,'connected_map_id':tavern}
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':[part]}})
        for data in ({},{'from_map_id':tavern,'node_id':'door'},{'from_map_id':self.first,'node_id':'missing'}):
            with self.assertRaises(PermissionError): maps.visit(self.player,self.c,tavern,data)
        with self.assertRaises(PermissionError): maps.visit(self.outsider,self.c,tavern,{'from_map_id':self.first,'node_id':'door'})
        maps.move(self.player,self.c,self.first,{'x':-20,'z':0})
        with self.assertRaises(PermissionError): maps.visit(self.player,self.c,tavern,{'from_map_id':self.first,'node_id':'door'})
        maps.move(self.player,self.c,self.first,{'x':0,'z':0})
        maps.update(self.dm,self.c,self.first,{'revision':1,'state':{'nodes':[{**part,'hidden':True}]}})
        with self.assertRaises(PermissionError): maps.visit(self.player,self.c,tavern,{'from_map_id':self.first,'node_id':'door'})
        self.assertEqual(maps.listing(self.player,self.c)['viewer_map_id'],self.first)
        self.assertEqual([m['id'] for m in maps.listing(self.player,self.c)['maps']],[self.first])


    def test_dm_placement_and_forced_travel_are_separate(self):
        destination=maps.create(self.dm,self.c,{'title':'Village'})['id']
        self.assertEqual(maps.listing(self.player,self.c)['viewer_map_id'],self.first)
        maps.move(self.dm,self.c,destination,{'user_id':self.player,'x':3,'z':2})
        self.assertEqual(maps.listing(self.player,self.c)['viewer_map_id'],self.first)
        placed=maps.get(self.dm,self.c,destination)['players'][0]
        self.assertTrue(placed['placed']);self.assertFalse(placed['present'])
        with self.assertRaises(PermissionError): maps.summon(self.player,self.c,destination,{'user_id':self.player})
        with self.assertRaises(PermissionError): maps.summon(self.dm,self.c,destination,{'user_id':self.outsider})
        maps.summon(self.dm,self.c,destination,{'user_id':self.player})
        self.assertEqual(maps.listing(self.player,self.c)['viewer_map_id'],destination)
        player=maps.get(self.player,self.c,destination)['players'][0]
        self.assertTrue(player['present']);self.assertEqual((player['x'],player['z']),(3,2))
        self.assertEqual(maps.get(self.player,self.c,self.first)['players'],[])

    def test_only_dm_can_rename_without_changing_location_or_scene(self):
        destination=maps.create(self.dm,self.c,{'title':'Village'})['id']
        before=maps.get(self.dm,self.c,destination)
        for title in ('','   ','x'*121,None):
            with self.assertRaises(ValueError): maps.rename(self.dm,self.c,destination,{'title':title})
        with self.assertRaises(PermissionError): maps.rename(self.player,self.c,destination,{'title':'Renamed'})
        maps.rename(self.dm,self.c,destination,{'title':'  Golden village  '})
        after=maps.get(self.dm,self.c,destination)
        self.assertEqual(after['title'],'Golden village');self.assertEqual(after['state'],before['state']);self.assertEqual(after['revision'],before['revision'])
        self.assertEqual(maps.listing(self.player,self.c)['viewer_map_id'],self.first)


if __name__=='__main__': unittest.main()
