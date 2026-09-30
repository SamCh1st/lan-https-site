import _bootstrap  # Shared backend import path for tests and previews.
import json
import unittest
import test_campaign_maps
import storage
import campaign_maps as maps
import economy

class EconomyTests(unittest.TestCase):
    setUp = test_campaign_maps.CampaignMapsTests.setUp
    tearDown = test_campaign_maps.CampaignMapsTests.tearDown
    def test_interaction_range_and_dm_override(self):
        self.setup_trade()
        maps.move(self.player,self.c,self.first,{'x':-10,'z':0})
        before=maps.get(self.player,self.c,self.first)
        with self.assertRaises(PermissionError): self.transact('buy')
        self.assertEqual(maps.get(self.player,self.c,self.first)['revision'],before['revision'])
        self.assertEqual(economy.balance(self.content(self.hero)),2000)
        change={'action':'set_range','character_id':self.hero,'range':12}
        with self.assertRaises(PermissionError): economy.transact(self.player,self.c,self.first,change)
        economy.transact(self.dm,self.c,self.first,change)
        self.assertEqual(self.content(self.hero)['tabletop']['interaction_range'],12)
        forged=self.content(self.hero);forged['tabletop']['interaction_range']=50
        storage.update_work(self.player,self.hero,'Buyer',forged)
        self.assertEqual(self.content(self.hero)['tabletop']['interaction_range'],12)
        self.transact('buy')
        for value in (-1,51,True):
            with self.assertRaises(ValueError): economy.transact(self.dm,self.c,self.first,{**change,'range':value})

    def test_loot_range_boundary_and_coins(self):
        self.setup_trade()
        state=maps.get(self.dm,self.c,self.first)
        node={'id':'chest','type':'chest','x':200,'y':200,'w':40,'h':40,'money_cp':100,'contents':[{'record_id':self.sword,'quantity':3}]}
        maps.update(self.dm,self.c,self.first,{'revision':state['revision'],'state':{'nodes':[node]}})
        take={'node_id':'chest','record_id':self.sword,'character_id':self.hero}
        maps.take_contents(self.player,self.c,self.first,take)
        maps.move(self.player,self.c,self.first,{'x':-.01,'z':0})
        with self.assertRaises(PermissionError): maps.take_contents(self.player,self.c,self.first,take)
        with self.assertRaises(PermissionError): economy.transact(self.player,self.c,self.first,{**take,'action':'take_money','amount_cp':1})
        maps.take_contents(self.dm,self.c,self.first,take)

    def test_custom_coin_conversion(self):
        self.assertEqual(economy.value_cp({'tabletop':{'value':'1 sp'}}),100)
        self.assertEqual(economy.value_cp({'tabletop':{'value':'1 gp'}}),10000)
        self.assertEqual(economy.value_cp({'tabletop':{'value':'0.11 gp'}}),1100)
        self.assertEqual(economy.value_cp({'tabletop':{'value':'1 cp'}}),1)
        self.assertEqual(economy.value_cp({'category':'item','rarity':'Uncommon','item_type':'Potion'}),2000000)
        self.assertEqual(economy.value_cp({'category':'item','rarity':'Rare'}),40000000)
        self.assertEqual(economy.value_cp({'category':'item','rarity':'Rare','tabletop':{'value_cp':1}}),1)
    def setup_trade(self):
        self.hero=storage.create_work(self.dm,'Buyer',{'category':'character','campaign_id':self.c,'owner_user_id':self.player,'tabletop':{'money_cp':2000}})['id']
        self.sword=storage.create_work(self.dm,'Sword',{'category':'item','campaign_id':self.c,'reference_only':True,'tabletop':{'value_cp':400}})['id']
        node={'id':'shop','type':'shop','x':0,'y':0,'w':80,'h':80,'money_cp':1000,'contents':[{'record_id':self.sword,'quantity':2,'price_cp':600}]}
        maps.update(self.dm,self.c,self.first,{'revision':0,'state':{'nodes':[node]}})
    def content(self,rid):
        with storage.connect() as db:return json.loads(db.execute('SELECT content FROM work_items WHERE id=?',(rid,)).fetchone()[0])
    def transact(self,action,**extra):
        return economy.transact(self.player,self.c,self.first,dict(action=action,node_id='shop',character_id=self.hero,record_id=self.sword,**extra))
    def test_buy_sell_balances_and_inventory(self):
        self.setup_trade();self.transact('buy')
        self.assertEqual(economy.balance(self.content(self.hero)),1400)
        node=maps.get(self.player,self.c,self.first)['state']['nodes'][0];self.assertEqual(node['money_cp'],1600);self.assertEqual(node['contents'][0]['quantity'],1)
        held=next(r for r in storage.list_work(self.player) if r['content'].get('owner_ids')==[self.hero])
        economy.transact(self.player,self.c,self.first,{'action':'sell','node_id':'shop','character_id':self.hero,'record_id':held['id']})
        self.assertEqual(economy.balance(self.content(self.hero)),1800)
        self.assertEqual(maps.get(self.player,self.c,self.first)['state']['nodes'][0]['money_cp'],1200)
        self.assertEqual(self.content(held['id'])['owner_ids'],[])
    def test_insufficient_funds_and_authorization_are_atomic(self):
        self.setup_trade()
        economy.transact(self.dm,self.c,self.first,{'action':'set_money','character_id':self.hero,'amount_cp':1})
        before=maps.get(self.player,self.c,self.first)
        with self.assertRaises(ValueError):self.transact('buy')
        self.assertEqual(maps.get(self.player,self.c,self.first),before)
        for action in ('set_money',):
            with self.assertRaises(PermissionError):self.transact(action,amount_cp=100)
        with self.assertRaises(PermissionError):maps.take_contents(self.player,self.c,self.first,{'node_id':'shop','record_id':self.sword,'character_id':self.hero})
        with self.assertRaises(PermissionError):economy.transact(self.outsider,self.c,self.first,{'action':'buy','node_id':'shop','character_id':self.hero,'record_id':self.sword})
    def test_dm_theft_and_money_sync_with_linked_npc(self):
        self.setup_trade()
        npc=storage.create_work(self.dm,'Shopkeeper',{'category':'npc','campaign_id':self.c,'tabletop':{'money_cp':4000}})['id']
        current=maps.get(self.dm,self.c,self.first);current['state']['nodes'][0]['card_id']=npc
        maps.update(self.dm,self.c,self.first,{'revision':current['revision'],'state':current['state']})
        self.assertTrue(maps.meet_marker(self.player,self.c,self.first,{'node_id':'shop'})['met'])
        economy.transact(self.dm,self.c,self.first,{'action':'steal_money','node_id':'shop','character_id':self.hero,'amount_cp':1000})
        self.assertEqual(economy.balance(self.content(npc)),3000)
        self.assertEqual(economy.balance(self.content(self.hero)),3000)
        economy.transact(self.dm,self.c,self.first,{'action':'steal','node_id':'shop','character_id':self.hero,'record_id':self.sword})
        self.assertEqual(economy.balance(self.content(npc)),3000)
        self.assertEqual(len([r for r in storage.list_work(self.player) if r['content'].get('owner_ids')==[self.hero]]),1)
        old=self.content(self.hero);old['tabletop']['money_cp']=999999
        storage.update_work(self.player,self.hero,'Buyer',old)
        self.assertEqual(economy.balance(self.content(self.hero)),3000)
    def test_no_double_buy_after_stock_runs_out(self):
        self.setup_trade();self.transact('buy');self.transact('buy')
        balance=economy.balance(self.content(self.hero))
        with self.assertRaises(ValueError):self.transact('buy')
        self.assertEqual(economy.balance(self.content(self.hero)),balance)

    def test_buy_one_from_stack_charges_each_and_keeps_remainder(self):
        self.setup_trade()
        # The stock template can itself have a quantity; it must not be copied as a bundle.
        with storage.connect() as db:
            template=self.content(self.sword);template['quantity']=20
            economy.write(db,self.sword,template)
        self.transact('buy')
        held=next(r for r in storage.list_work(self.player) if r['content'].get('owner_ids')==[self.hero])
        self.assertEqual(held['content']['quantity'],1)
        self.assertEqual(economy.balance(self.content(self.hero)),1400)
        self.assertEqual(maps.get(self.player,self.c,self.first)['state']['nodes'][0]['contents'][0]['quantity'],1)
        self.transact('buy')
        self.assertEqual(self.content(held['id'])['quantity'],2)
        self.assertEqual(economy.balance(self.content(self.hero)),800)
        self.assertEqual(maps.get(self.player,self.c,self.first)['state']['nodes'][0]['contents'],[])
        self.assertEqual(self.content(self.sword)['quantity'],20)
    def test_shop_cannot_afford_sale(self):
        self.setup_trade();self.transact('buy')
        held=next(r for r in storage.list_work(self.player) if r['content'].get('owner_ids')==[self.hero])
        economy.transact(self.dm,self.c,self.first,{'action':'set_money','node_id':'shop','amount_cp':0})
        with self.assertRaises(ValueError):economy.transact(self.player,self.c,self.first,{'action':'sell','node_id':'shop','character_id':self.hero,'record_id':held['id']})
        self.assertEqual(self.content(held['id'])['quantity'],1)

    def test_buy_quantity_updates_stock_and_coins_together(self):
        self.setup_trade();self.transact('buy',quantity=2)
        held=next(r for r in storage.list_work(self.player) if r['content'].get('owner_ids')==[self.hero])
        self.assertEqual(held['content']['quantity'],2)
        self.assertEqual(economy.balance(self.content(self.hero)),800)
        shop=maps.get(self.player,self.c,self.first)['state']['nodes'][0]
        self.assertEqual(shop['contents'],[])
        self.assertEqual(shop['money_cp'],2200)

    def test_invalid_buy_quantities_leave_inventory_and_money_unchanged(self):
        self.setup_trade()
        before=maps.get(self.player,self.c,self.first)
        for quantity in (0,-1,1.5,True,'2',None,10000,3):
            with self.subTest(quantity=quantity):
                with self.assertRaises(ValueError):self.transact('buy',quantity=quantity)
                self.assertEqual(maps.get(self.player,self.c,self.first),before)
                self.assertEqual(economy.balance(self.content(self.hero)),2000)
        economy.transact(self.dm,self.c,self.first,{'action':'set_money','character_id':self.hero,'amount_cp':700})
        before=maps.get(self.player,self.c,self.first)
        with self.assertRaises(ValueError):self.transact('buy',quantity=2)
        self.assertEqual(maps.get(self.player,self.c,self.first),before)
        self.assertEqual(economy.balance(self.content(self.hero)),700)

    def test_buy_quantity_respects_existing_inventory_stack_limit(self):
        self.setup_trade();self.transact('buy')
        held=next(r for r in storage.list_work(self.player) if r['content'].get('owner_ids')==[self.hero])
        with storage.connect() as db:
            content=self.content(held['id']);content['quantity']=9999
            economy.write(db,held['id'],content)
        before=maps.get(self.player,self.c,self.first)
        with self.assertRaises(ValueError):self.transact('buy',quantity=1)
        self.assertEqual(maps.get(self.player,self.c,self.first),before)
        self.assertEqual(self.content(held['id'])['quantity'],9999)
        self.assertEqual(economy.balance(self.content(self.hero)),1400)

    def test_hidden_and_other_characters_and_coin_containers(self):
        self.setup_trade()
        other=storage.create_work(self.dm,'Other hero',{'category':'character','campaign_id':self.c,'owner_user_id':self.outsider})['id']
        with self.assertRaises(PermissionError):economy.transact(self.player,self.c,self.first,{'action':'buy','node_id':'shop','character_id':other,'record_id':self.sword})
        current=maps.get(self.dm,self.c,self.first);current['state']['nodes'][0]['hidden']=True
        maps.update(self.dm,self.c,self.first,{'revision':current['revision'],'state':current['state']})
        with self.assertRaises(PermissionError):self.transact('buy')
        current=maps.get(self.dm,self.c,self.first)
        chest={'id':'chest','type':'chest','x':0,'y':0,'w':80,'h':80,'money_cp':1100,'remove_after_looting':True}
        maps.update(self.dm,self.c,self.first,{'revision':current['revision'],'state':{'nodes':[chest]}})
        economy.transact(self.player,self.c,self.first,{'action':'take_money','node_id':'chest','character_id':self.hero,'amount_cp':1100})
        self.assertEqual(economy.balance(self.content(self.hero)),3100)
        self.assertEqual(maps.get(self.dm,self.c,self.first)['state']['nodes'],[])
        self.assertTrue(storage.delete_work(self.player,self.hero))

    def test_sell_quantity_restocks_and_pays_for_every_item(self):
        self.setup_trade()
        held=storage.create_work(self.dm,'Sword',{'category':'item','campaign_id':self.c,'owner_ids':[self.hero],'quantity':5,'loot_source_record_id':self.sword,'tabletop':{'value_cp':400}})['id']
        economy.transact(self.player,self.c,self.first,{'action':'sell','node_id':'shop','character_id':self.hero,'record_id':held,'quantity':2})
        self.assertEqual(self.content(held)['quantity'],3)
        self.assertEqual(self.content(held)['owner_ids'],[self.hero])
        self.assertEqual(economy.balance(self.content(self.hero)),2800)
        shop=maps.get(self.player,self.c,self.first)['state']['nodes'][0]
        self.assertEqual(shop['money_cp'],200)
        self.assertEqual(shop['contents'][0]['quantity'],4)
        self.assertEqual(shop['contents'][0]['price_cp'],600)

    def test_sell_entire_stack_creates_stock_with_unit_price(self):
        self.setup_trade();self.transact('buy',quantity=2)
        held=next(r for r in storage.list_work(self.player) if r['content'].get('owner_ids')==[self.hero])
        economy.transact(self.player,self.c,self.first,{'action':'sell','node_id':'shop','character_id':self.hero,'record_id':held['id'],'quantity':2})
        self.assertEqual(self.content(held['id'])['quantity'],0)
        self.assertEqual(self.content(held['id'])['owner_ids'],[])
        self.assertEqual(economy.balance(self.content(self.hero)),1600)
        shop=maps.get(self.player,self.c,self.first)['state']['nodes'][0]
        self.assertEqual(shop['money_cp'],1400)
        self.assertEqual(shop['contents'][0]['quantity'],2)
        self.assertEqual(shop['contents'][0]['price_cp'],400)

    def test_invalid_sale_quantities_and_insufficient_money_are_atomic(self):
        self.setup_trade()
        held=storage.create_work(self.dm,'Held swords',{'category':'item','campaign_id':self.c,'owner_ids':[self.hero],'quantity':5,'loot_source_record_id':self.sword,'tabletop':{'value_cp':400}})['id']
        before=maps.get(self.dm,self.c,self.first)
        records=storage.list_work(self.dm)
        for quantity in (0,-1,1.5,True,'2',None,10000,6,3):
            with self.subTest(quantity=quantity):
                with self.assertRaises(ValueError):
                    economy.transact(self.player,self.c,self.first,{'action':'sell','node_id':'shop','character_id':self.hero,'record_id':held,'quantity':quantity})
                self.assertEqual(maps.get(self.dm,self.c,self.first),before)
                self.assertEqual(storage.list_work(self.dm),records)

    def test_bulk_sale_cannot_overfill_merchant_stack(self):
        self.setup_trade();self.transact('buy',quantity=2)
        held=next(r for r in storage.list_work(self.player) if r['content'].get('owner_ids')==[self.hero])
        current=maps.get(self.dm,self.c,self.first)
        current['state']['nodes'][0]['contents']=[{'record_id':self.sword,'quantity':9998,'price_cp':600}]
        maps.update(self.dm,self.c,self.first,{'revision':current['revision'],'state':current['state']})
        before=maps.get(self.dm,self.c,self.first)
        records=storage.list_work(self.dm)
        with self.assertRaises(ValueError):
            economy.transact(self.player,self.c,self.first,{'action':'sell','node_id':'shop','character_id':self.hero,'record_id':held['id'],'quantity':2})
        self.assertEqual(maps.get(self.dm,self.c,self.first),before)
        self.assertEqual(storage.list_work(self.dm),records)

    def owned_copy(self, **changes):
        content=self.content(self.sword)
        content.update(reference_only=False,owner_ids=[self.hero],quantity=1)
        content.update(changes)
        return storage.create_work(self.dm,'Sword',content)['id']

    def test_purchase_stacks_with_manually_assigned_matching_item(self):
        self.setup_trade();existing=self.owned_copy(quantity=3)
        self.transact('buy',quantity=2)
        self.assertEqual(self.content(existing)['quantity'],5)
        owned=[r for r in storage.list_work(self.player) if r['content'].get('owner_ids')==[self.hero]]
        self.assertEqual([r['id'] for r in owned],[existing])
        self.assertEqual(economy.balance(self.content(self.hero)),800)

    def test_purchase_combines_duplicates_and_preserves_equipment(self):
        self.setup_trade()
        first=self.owned_copy(quantity=2,loot_source_record_id=123)
        second=self.owned_copy(quantity=3,loot_source_record_id=456)
        with storage.connect() as db:
            character=self.content(self.hero)
            character['tabletop']['equipment_loadout']={'main_hand':first,'off_hand':second}
            character['tabletop']['equipment_attuned']=[second]
            economy.write(db,self.hero,character)
        self.transact('buy')
        self.assertEqual(self.content(first)['quantity'],6)
        self.assertEqual(self.content(second)['quantity'],0)
        self.assertEqual(self.content(second)['owner_ids'],[])
        table=self.content(self.hero)['tabletop']
        self.assertEqual(table['equipment_loadout'],{'main_hand':first,'off_hand':first})
        self.assertEqual(table['equipment_attuned'],[first])
        self.assertEqual(table['money_cp'],1400)

    def test_matching_name_or_source_does_not_merge_different_items(self):
        self.setup_trade()
        altered=self.owned_copy(loot_source_record_id=self.sword,notes='A unique enchanted sword',tabletop={'value_cp':400,'equipment_attack_bonus':1})
        other_hero=storage.create_work(self.dm,'Other hero',{'category':'character','campaign_id':self.c,'owner_user_id':self.outsider})['id']
        other=self.owned_copy(owner_ids=[other_hero])
        shared=self.owned_copy(owner_ids=[self.hero,other_hero])
        self.transact('buy')
        self.assertEqual(self.content(altered)['quantity'],1)
        self.assertEqual(self.content(other)['quantity'],1)
        self.assertEqual(self.content(shared)['quantity'],1)
        owned=[r for r in storage.list_work(self.player) if r['content'].get('owner_ids')==[self.hero]]
        self.assertEqual(len(owned),2)

    def test_matching_items_from_another_stock_card_stack(self):
        self.setup_trade();self.transact('buy')
        existing=next(r['id'] for r in storage.list_work(self.player) if r['content'].get('owner_ids')==[self.hero])
        second=storage.create_work(self.dm,'Sword',self.content(self.sword))['id']
        current=maps.get(self.dm,self.c,self.first)
        current['state']['nodes'][0]['contents'].append({'record_id':second,'quantity':1,'price_cp':700})
        maps.update(self.dm,self.c,self.first,{'revision':current['revision'],'state':current['state']})
        economy.transact(self.player,self.c,self.first,{'action':'buy','node_id':'shop','character_id':self.hero,'record_id':second})
        self.assertEqual(self.content(existing)['quantity'],2)
        self.assertEqual(economy.balance(self.content(self.hero)),700)

    def test_looted_matching_item_uses_existing_inventory_stack(self):
        self.setup_trade();existing=self.owned_copy(quantity=4)
        current=maps.get(self.dm,self.c,self.first)
        current['state']['nodes'][0]['type']='chest'
        maps.update(self.dm,self.c,self.first,{'revision':current['revision'],'state':current['state']})
        result=maps.take_contents(self.player,self.c,self.first,{'node_id':'shop','character_id':self.hero,'record_id':self.sword})
        self.assertEqual(result['record_id'],existing)
        self.assertEqual(self.content(existing)['quantity'],5)

    def test_combined_stack_limit_rejects_purchase_without_changes(self):
        self.setup_trade();self.owned_copy(quantity=6000);self.owned_copy(quantity=3999)
        before=maps.get(self.dm,self.c,self.first);records=storage.list_work(self.dm)
        with self.assertRaises(ValueError):self.transact('buy')
        self.assertEqual(maps.get(self.dm,self.c,self.first),before)
        self.assertEqual(storage.list_work(self.dm),records)

    def test_repeated_sales_to_empty_merchant_use_one_stock_card(self):
        self.setup_trade();held=self.owned_copy(quantity=3)
        current=maps.get(self.dm,self.c,self.first);current['state']['nodes'][0]['contents']=[]
        maps.update(self.dm,self.c,self.first,{'revision':current['revision'],'state':current['state']})
        for count in (1,2):
            economy.transact(self.player,self.c,self.first,{'action':'sell','node_id':'shop','character_id':self.hero,'record_id':held})
            shop=maps.get(self.dm,self.c,self.first)['state']['nodes'][0]
            self.assertEqual(len(shop['contents']),1)
            self.assertEqual(shop['contents'][0]['quantity'],count)
            self.assertEqual(shop['contents'][0]['price_cp'],400)
            self.assertEqual(shop['money_cp'],1000-count*400)
            self.assertEqual(self.content(held)['quantity'],3-count)
            if count==1: stock=shop['contents'][0]['record_id']
            else: self.assertEqual(shop['contents'][0]['record_id'],stock)

    def test_sale_combines_existing_duplicate_stock_and_retains_asking_price(self):
        self.setup_trade();held=self.owned_copy(quantity=3)
        duplicate=storage.create_work(self.dm,'Sword',self.content(self.sword))['id']
        current=maps.get(self.dm,self.c,self.first)
        current['state']['nodes'][0]['contents'].append({'record_id':duplicate,'quantity':3,'price_cp':600})
        maps.update(self.dm,self.c,self.first,{'revision':current['revision'],'state':current['state']})
        economy.transact(self.player,self.c,self.first,{'action':'sell','node_id':'shop','character_id':self.hero,'record_id':held,'quantity':2})
        shop=maps.get(self.dm,self.c,self.first)['state']['nodes'][0]
        self.assertEqual(len(shop['contents']),1)
        self.assertEqual(shop['contents'][0]['record_id'],self.sword)
        self.assertEqual(shop['contents'][0]['quantity'],7)
        self.assertEqual(shop['contents'][0]['price_cp'],600)
        self.assertEqual(economy.balance(self.content(self.hero)),2800)

    def test_sale_does_not_combine_distinct_properties_or_different_prices(self):
        self.setup_trade();held=self.owned_copy(quantity=2)
        cheaper=storage.create_work(self.dm,'Sword',self.content(self.sword))['id']
        enchanted=storage.create_work(self.dm,'Sword',{**self.content(self.sword),'notes':'Enchanted blade'})['id']
        current=maps.get(self.dm,self.c,self.first)
        current['state']['nodes'][0]['contents'] += [{'record_id':cheaper,'quantity':3,'price_cp':500},{'record_id':enchanted,'quantity':4,'price_cp':600}]
        maps.update(self.dm,self.c,self.first,{'revision':current['revision'],'state':current['state']})
        economy.transact(self.player,self.c,self.first,{'action':'sell','node_id':'shop','character_id':self.hero,'record_id':held})
        stock=maps.get(self.dm,self.c,self.first)['state']['nodes'][0]['contents']
        self.assertEqual([(e['record_id'],e['quantity'],e['price_cp']) for e in stock],[(self.sword,3,600),(cheaper,3,500),(enchanted,4,600)])

    def test_consolidated_merchant_limit_rolls_back_sale(self):
        self.setup_trade();held=self.owned_copy(quantity=2)
        duplicate=storage.create_work(self.dm,'Sword',self.content(self.sword))['id']
        current=maps.get(self.dm,self.c,self.first)
        current['state']['nodes'][0]['contents']=[{'record_id':self.sword,'quantity':5000,'price_cp':600},{'record_id':duplicate,'quantity':4998,'price_cp':600}]
        maps.update(self.dm,self.c,self.first,{'revision':current['revision'],'state':current['state']})
        before=maps.get(self.dm,self.c,self.first);records=storage.list_work(self.dm)
        with self.assertRaises(ValueError):
            economy.transact(self.player,self.c,self.first,{'action':'sell','node_id':'shop','character_id':self.hero,'record_id':held,'quantity':2})
        self.assertEqual(maps.get(self.dm,self.c,self.first),before)
        self.assertEqual(storage.list_work(self.dm),records)

if __name__=='__main__':unittest.main()

