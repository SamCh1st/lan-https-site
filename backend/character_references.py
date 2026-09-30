"""Official SRD 5.2.1 character-option summaries (CC BY 4.0)."""
import json
SOURCE='https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf'

def origin_records(card):
    result=[]
    species=[
      ('Dragonborn','Medium; speed 30 ft.; Darkvision 60 ft.','Choose a draconic ancestry for your damage resistance and breath damage. Replace one attack with a 15-foot cone or 30-foot by 5-foot line; Dexterity save DC 8 + Constitution modifier + proficiency bonus, half damage on success. Damage is 1d10, increasing at levels 5, 11 and 17. Uses equal proficiency bonus per Long Rest. At level 5, a Bonus Action grants flight at your Speed for 10 minutes, once per Long Rest.',84),
      ('Dwarf','Medium; speed 30 ft.; Darkvision 120 ft.','Poison resistance and Advantage on saves to avoid or end Poisoned. Hit Point maximum increases by 1 per character level. Stonecunning: Bonus Action for 60-foot Tremorsense for 10 minutes while on or touching stone; uses equal proficiency bonus per Long Rest.',84),
      ('Elf','Medium; speed 30 ft.; Darkvision 60 ft.','Advantage on saves to avoid or end Charmed. Choose proficiency in Insight, Perception or Survival. Trance replaces sleep and allows a conscious 4-hour Long Rest; magic cannot put you to sleep. Choose Drow, High Elf or Wood Elf lineage. Drow increases Darkvision to 120 ft.; Wood Elf increases Speed to 35 ft. Lineages grant a cantrip and spells at levels 3 and 5; see the source table for selections and casting rules.',84),
      ('Gnome','Small; speed 30 ft.; Darkvision 60 ft.','Advantage on Intelligence, Wisdom and Charisma saving throws. Choose Forest or Rock lineage and Intelligence, Wisdom or Charisma for lineage spellcasting. Forest grants Minor Illusion and Speak with Animals (free uses equal proficiency bonus per Long Rest). Rock grants Mending and Prestidigitation and lets you create temporary tiny clockwork devices using Prestidigitation; see the source for device limits.',85),
      ('Goliath','Medium; speed 35 ft.','Choose one giant ancestry benefit: Cloud teleportation, Fire extra fire damage, Frost extra cold damage and slowing, Hill knocking a target Prone, Stone damage reduction, or Storm reaction damage. Uses equal proficiency bonus per Long Rest. At level 5, Large Form lasts 10 minutes, grants Advantage on Strength checks and +10 ft. Speed, once per Long Rest. Powerful Build grants Advantage to escape Grappled and counts you one size larger for carrying capacity.',85),
      ('Halfling','Small; speed 30 ft.','Advantage on saves to avoid or end Frightened. Move through a larger creature’s space, but cannot stop there. When a D20 Test rolls a natural 1, reroll and use the new roll. You may Hide when obscured only by a creature at least one size larger.',86),
      ('Human','Small or Medium; speed 30 ft.','Gain Heroic Inspiration after a Long Rest. Choose proficiency in one skill and one Origin feat. Size is chosen when selecting this species.',86),
      ('Orc','Medium; speed 30 ft.; Darkvision 120 ft.','Adrenaline Rush lets you Dash as a Bonus Action and gain Temporary Hit Points equal to proficiency bonus; uses equal proficiency bonus, restored on a Short or Long Rest. Relentless Endurance lets you drop to 1 HP instead of 0 when not killed outright, once per Long Rest.',86),
      ('Tiefling','Small or Medium; speed 30 ft.; Darkvision 60 ft.','Know Thaumaturgy. Choose an Abyssal, Chthonic or Infernal legacy: respectively Poison, Necrotic or Fire resistance, plus a cantrip and spells at levels 3 and 5. Choose Intelligence, Wisdom or Charisma for these spells. Each higher-level legacy spell has one free casting per Long Rest and can also use appropriate spell slots. See the source table for spells.',86),
    ]
    for name,summary,notes,page in species:
        result.append(card('species',name,summary,'Humanoid. '+notes+'\n\n2024 species do not supply ability-score increases; backgrounds do. These are concise reminders; consult the linked rules for full choices and exceptions.',source='character-origins',status='2024 · SRD 5.2.1',source_url=SOURCE+'#page='+str(page)))
    for name,scores,feat,skills,tool in [
      ('Acolyte','Intelligence, Wisdom, Charisma','Magic Initiate (Cleric)','Insight and Religion','Calligrapher’s Supplies'),
      ('Criminal','Dexterity, Constitution, Intelligence','Alert','Sleight of Hand and Stealth','Thieves’ Tools'),
      ('Sage','Constitution, Intelligence, Wisdom','Magic Initiate (Wizard)','Arcana and History','Calligrapher’s Supplies'),
      ('Soldier','Strength, Dexterity, Constitution','Savage Attacker','Athletics and Intimidation','one Gaming Set of your choice')]:
        result.append(card('background',name,'Origin feat: '+feat+' · Skills: '+skills,'Ability scores: '+scores+'. Increase one listed score by 2 and a different listed score by 1, or all three by 1; maximum 20.\nSkill proficiencies: '+skills+'.\nTool proficiency: '+tool+'.\nOrigin feat: '+feat+'.\nChoose the listed equipment package or 50 GP; see the source for the exact package. Background describes your formative occupation or circumstances, not your class.',source='character-origins',status='2024 · SRD 5.2.1',source_url=SOURCE+'#page=83'))
    for name,notes in [
      ('Alert','Add proficiency bonus to Initiative. After rolling, you may swap Initiative with one willing ally in that combat, provided neither of you is Incapacitated.'),
      ('Magic Initiate','Choose the Cleric, Druid or Wizard spell list. Learn two cantrips and prepare one level-1 spell from that list. Choose Intelligence, Wisdom or Charisma as the casting ability. Cast the level-1 spell free once per Long Rest, or with your spell slots. On gaining a level, you may replace one chosen spell with another of the same level from that list. Repeatable with a different spell list.'),
      ('Savage Attacker','Once per turn, when you hit with a weapon, roll its damage dice twice and choose which roll to use.'),
      ('Skilled','Gain any combination of three skill or tool proficiencies. This feat is repeatable.')]:
        result.append(card('feat',name,'Origin feat · 2024',notes+'\n\nA reference card does not grant this feat. Select it through an eligible background, species trait or other feature.',source='feats',status='Origin feat',source_url=SOURCE+'#page=87'))
    return result

def install_existing(db,records):
    db.execute('CREATE TABLE IF NOT EXISTS campaign_reference_updates(campaign_id INTEGER PRIMARY KEY REFERENCES work_items(id) ON DELETE CASCADE,version INTEGER NOT NULL)')
    for campaign in db.execute("SELECT id,user_id,content FROM work_items WHERE json_extract(content,'$.category')='campaign'").fetchall():
        if db.execute('SELECT 1 FROM campaign_reference_updates WHERE campaign_id=?',(campaign['id'],)).fetchone(): continue
        if (json.loads(campaign['content']).get('tabletop') or {}).get('ruleset','2024')!='2024': continue
        existing=db.execute("SELECT id,title,content FROM work_items WHERE CAST(json_extract(content,'$.campaign_id') AS INTEGER)=?",(campaign['id'],)).fetchall()
        known={(json.loads(r['content']).get('category'),r['title']) for r in existing}
        for ref in records:
            if ref['content']['category'] not in ('species','background','feat','class'): continue
            if (ref['content']['category'],ref['title']) in known: continue
            old=next((r for r in existing if r['title']==ref['title'] and json.loads(r['content']).get('category')=='lore' and json.loads(r['content']).get('reference_only') and json.loads(r['content']).get('source_name')==ref['content']['source_name']),None)
            if old and ref['content']['category']=='class':
                content=json.loads(old['content']);content['category']='class';db.execute('UPDATE work_items SET content=? WHERE id=?',(json.dumps(content),old['id']));continue
            content={**ref['content'],'campaign_id':campaign['id']}
            db.execute('INSERT INTO work_items(user_id,title,content) VALUES (?,?,?)',(campaign['user_id'],ref['title'],json.dumps(content)))
        db.execute('INSERT INTO campaign_reference_updates VALUES (?,1)',(campaign['id'],))
