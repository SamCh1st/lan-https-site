"""Curated revised-fifth-edition starter references, copied into each new campaign.

Mechanical data and original summaries based on SRD 5.2.1 (CC BY 4.0).
See site/rules-attribution.html. These references grant no equipment or powers.
"""
import copy
import economy
import json
from pathlib import Path

STARTER_ART = json.loads((Path(__file__).parent.parent / 'site/assets/starter-art/manifest.json').read_text(encoding='utf-8'))

BASE = 'https://www.dndbeyond.com/sources/dnd/br-2024/'

def card(category, title, summary, notes='', source='equipment', **fields):
    content = {
        'category': category, 'summary': summary, 'notes': notes,
        'tags': 'starter library, 2024, ' + category, 'reference_only': True,
        'player_visible': True, 'important': False,
        'assigned_user_ids': [], 'owner_ids': [], 'user_ids': [],
        'source_url': BASE + source, 'source_name': 'SRD 5.2.1 · revised fifth edition',
        'tabletop': {'ruleset': '2024'},
        'default_art': STARTER_ART.get(category + '|' + title),
    }
    tabletop = fields.pop('tabletop', {})
    content.update(fields)
    content['tabletop'].update(tabletop)
    economy.normalize(content)
    from starter_prices import apply
    apply(content)
    return {'title': title, 'content': content}

def starter_records():
    result = []
    # name | damage | properties | mastery | lb | price
    weapons = '''Club|1d4 Bludgeoning|Light|Slow|2|1 sp
Dagger|1d4 Piercing|Finesse, Light, Thrown (20/60 ft.)|Nick|1|2 gp
Greatclub|1d8 Bludgeoning|Two-Handed|Push|10|2 sp
Handaxe|1d6 Slashing|Light, Thrown (20/60 ft.)|Vex|2|5 gp
Javelin|1d6 Piercing|Thrown (30/120 ft.)|Slow|2|5 sp
Light Hammer|1d4 Bludgeoning|Light, Thrown (20/60 ft.)|Nick|2|2 gp
Mace|1d6 Bludgeoning|None|Sap|4|5 gp
Quarterstaff|1d6 Bludgeoning|Versatile (1d8)|Topple|4|2 sp
Sickle|1d4 Slashing|Light|Nick|2|1 gp
Spear|1d6 Piercing|Thrown (20/60 ft.), Versatile (1d8)|Sap|3|1 gp
Dart|1d4 Piercing|Finesse, Thrown (20/60 ft.)|Vex|0.25|5 cp
Light Crossbow|1d8 Piercing|Ammunition (80/320 ft.; bolts), Loading, Two-Handed|Slow|5|25 gp
Shortbow|1d6 Piercing|Ammunition (80/320 ft.; arrows), Two-Handed|Vex|2|25 gp
Sling|1d4 Bludgeoning|Ammunition (30/120 ft.; sling bullets)|Slow|0|1 sp
Battleaxe|1d8 Slashing|Versatile (1d10)|Topple|4|10 gp
Flail|1d8 Bludgeoning|None|Sap|2|10 gp
Glaive|1d10 Slashing|Heavy, Reach, Two-Handed|Graze|6|20 gp
Greataxe|1d12 Slashing|Heavy, Two-Handed|Cleave|7|30 gp
Greatsword|2d6 Slashing|Heavy, Two-Handed|Graze|6|50 gp
Halberd|1d10 Slashing|Heavy, Reach, Two-Handed|Cleave|6|20 gp
Lance|1d10 Piercing|Heavy, Reach, Two-Handed (unless mounted)|Topple|6|10 gp
Longsword|1d8 Slashing|Versatile (1d10)|Sap|3|15 gp
Maul|2d6 Bludgeoning|Heavy, Two-Handed|Topple|10|10 gp
Morningstar|1d8 Piercing|None|Sap|4|15 gp
Pike|1d10 Piercing|Heavy, Reach, Two-Handed|Push|18|5 gp
Rapier|1d8 Piercing|Finesse|Vex|2|25 gp
Scimitar|1d6 Slashing|Finesse, Light|Nick|3|25 gp
Shortsword|1d6 Piercing|Finesse, Light|Vex|2|10 gp
Trident|1d8 Piercing|Thrown (20/60 ft.), Versatile (1d10)|Topple|4|5 gp
Warhammer|1d8 Bludgeoning|Versatile (1d10)|Push|5|15 gp
War Pick|1d8 Piercing|Versatile (1d10)|Sap|2|5 gp
Whip|1d4 Slashing|Finesse, Reach|Slow|3|2 gp
Blowgun|1 Piercing|Ammunition (25/100 ft.; needles), Loading|Vex|1|10 gp
Hand Crossbow|1d6 Piercing|Ammunition (30/120 ft.; bolts), Light, Loading|Vex|3|75 gp
Heavy Crossbow|1d10 Piercing|Ammunition (100/400 ft.; bolts), Heavy, Loading, Two-Handed|Push|18|50 gp
Longbow|1d8 Piercing|Ammunition (150/600 ft.; arrows), Heavy, Two-Handed|Slow|2|50 gp'''
    for i, line in enumerate(weapons.splitlines()):
        name, damage, properties, mastery, weight, price = line.split('|')
        kind = ('Simple' if i < 14 else 'Martial') + (' ranged' if 10 <= i < 14 or i >= 32 else ' melee')
        result.append(card('item', name, f'{kind} weapon · {damage} · {price}',
            'Use the appropriate ability modifier for attack and damage. Add proficiency to the attack roll only when proficient. Mastery requires a feature granting access; owning a weapon does not grant its mastery.',
            item_type='Weapon', rarity='Nonmagical', quantity=1, damage=damage,
            tabletop={'weight': float(weight), 'value': price, 'equipment_state': 'Stored', 'activation': 'Attack action or eligible attack', 'item_properties': f'{kind}\nDamage: {damage}\nProperties: {properties}\nMastery: {mastery}'}))
    armor = '''Padded|11 + Dex|Light|5 gp|8|Stealth disadvantage
Leather Armor|11 + Dex|Light|10 gp|10|None
Studded Leather|12 + Dex|Light|45 gp|13|None
Hide Armor|12 + Dex (maximum +2)|Medium|10 gp|12|None
Chain Shirt|13 + Dex (maximum +2)|Medium|50 gp|20|None
Scale Mail|14 + Dex (maximum +2)|Medium|50 gp|45|Stealth disadvantage
Breastplate|14 + Dex (maximum +2)|Medium|400 gp|20|None
Half Plate|15 + Dex (maximum +2)|Medium|750 gp|40|Stealth disadvantage
Ring Mail|14|Heavy|30 gp|40|Stealth disadvantage
Chain Mail|16|Heavy|75 gp|55|Strength 13; Stealth disadvantage
Splint|17|Heavy|200 gp|60|Strength 15; Stealth disadvantage
Plate|18|Heavy|1500 gp|65|Strength 15; Stealth disadvantage
Shield|+2 to AC|Shield|10 gp|6|Shield training required for its AC bonus'''
    for line in armor.splitlines():
        name, ac, kind, price, weight, properties = line.split('|')
        result.append(card('item', name, f'{kind} · AC {ac} · {price}',
            'Use one base AC calculation at a time. Wearing armor without its training imposes disadvantage on Strength/Dexterity D20 Tests and prevents spellcasting. An unmet armor Strength requirement reduces Speed by 10 ft.',
            item_type='Armor', rarity='Nonmagical', quantity=1,
            tabletop={'weight': int(weight), 'value': price, 'equipment_state': 'Stored', 'item_properties': f'Armor category: {kind}\nAC: {ac}\n{properties}'}))
    gear = [
        ('Backpack','2 gp',5,'Carries up to 30 lb. within 1 cubic foot.'),
        ('Bedroll','1 gp',7,'Portable bedding for camp.'),
        ('Rope','1 gp',5,'50-foot rope; record what it is tied to and how it is used.'),
        ('Torch','1 cp',1,'Burns 1 hour; bright light 20 ft. and dim light a further 20 ft.'),
        ('Tinderbox','5 sp',1,'Tools for lighting fires; use the equipment entry for lighting times.'),
        ('Rations','5 sp',2,'One day of travel food; track remaining days.'),
        ('Waterskin','2 sp',5,'Holds 4 pints; listed weight assumes it is full.'),
        ('Healer’s Kit','5 gp',3,'10 uses. Utilize action: spend a use to stabilize a creature at 0 HP without a Medicine check; this does not restore HP.'),
        ('Thieves’ Tools','25 gp',1,'Tool proficiency uses Dexterity. Picking a lock also depends on the lock’s difficulty.'),
        ('Herbalism Kit','5 gp',3,'Tool proficiency uses Intelligence; consult crafting rules for brewing healing potions.'),
        ('Component Pouch','25 gp',2,'Replaces spell materials only when they have no specified cost and are not consumed.'),
        ('Arcane Focus — Wand','10 gp',1,'A focus only substitutes components when your spellcasting feature allows it.'),
        ('Holy Symbol — Amulet','5 gp',1,'A divine spellcasting focus; consult your class and the item’s wearing/holding rules.'),
        ('Druidic Focus — Sprig of Mistletoe','1 gp',0,'A nature spellcasting focus for a feature that permits it.'),
        ('Spellbook','50 gp',3,'A Wizard’s spell record. Spells written here still follow preparation and spell-slot rules.'),
        ('Arrows (20)','1 gp',1,'Twenty arrows; suitable ammunition for bows.'),
        ('Crossbow Bolts (20)','1 gp',1.5,'Twenty bolts; suitable ammunition for crossbows.'),
        ('Explorer’s Pack','10 gp',55,'Backpack, Bedroll, 2 Oil flasks, 10 days of Rations, Rope, Tinderbox, 10 Torches, Waterskin. When tracking contents individually, avoid counting the pack’s weight twice.'),
    ]
    for name, price, weight, notes in gear:
        result.append(card('item', name, price+' · Adventuring gear', notes, item_type='Tool' if 'Kit' in name or 'Tools' in name else 'Other', rarity='Nonmagical', quantity=1, tabletop={'weight': weight, 'value': price, 'equipment_state': 'Stored'}))
    for name, formula, rarity in [('Potion of Healing','2d4 + 2','Common'),('Potion of Greater Healing','4d4 + 4','Uncommon'),('Potion of Superior Healing','8d4 + 8','Rare'),('Potion of Supreme Healing','10d4 + 20','Very Rare')]:
        result.append(card('item', name, 'Restore '+formula+' HP.', 'Bonus action to drink or administer to a creature within 5 ft. Consumed on use; healing cannot exceed maximum HP.', source='magic-items-a-z', item_type='Potion', rarity=rarity, quantity=1, tabletop={'activation':'Bonus Action','weight':0.5,'value':'50 gp' if rarity=='Common' else 'DM determines availability and price','requires_attunement':False,'equipment_state':'Stored'}))
    magic = [
        ('Weapon +1','Weapon','Uncommon',False,'+1 to attack and damage rolls with this weapon. Choose its base weapon; retain that weapon’s properties.'),
        ('Armor +1','Armor','Rare',False,'+1 AC while worn. Choose a base armor type and retain its requirements.'),
        ('Shield +1','Armor','Uncommon',False,'Adds +1 AC beyond a normal shield’s +2; requires shield training for the normal benefit.'),
        ('Cloak of Protection','Wondrous Item','Uncommon',True,'While worn and attuned: +1 AC and +1 to saving throws.'),
        ('Goggles of Night','Wondrous Item','Uncommon',False,'While worn: Darkvision 60 ft.; if already possessed, extend its range by 60 ft.'),
        ('Bag of Holding','Wondrous Item','Uncommon',False,'Capacity 500 lb. / 64 cubic ft.; weighs 5 lb. regardless of contents. Retrieve an item with a Utilize action. Overloading or piercing destroys it; contents scatter into the Astral Plane. Air lasts 10 minutes divided among breathing occupants. Nesting extradimensional containers can destroy both and pull nearby creatures into the Astral Plane; read the full entry before doing so.'),
    ]
    for name, kind, rarity, attune, notes in magic:
        result.append(card('item', name, notes[:150], notes, source='magic-items-a-z', item_type=kind, rarity=rarity, quantity=1, tabletop={'activation':'Passive when used as specified','requires_attunement':attune,'equipment_state':'Stored'}))
    # Structured starter spells; concise summaries retain a link to the full rule.
    spells = [
        ('Fire Bolt',0,'Evocation','Action','120 ft.','VS','Instantaneous',False,False,'','Spell attack','None','Ranged spell attack: 1d10 Fire damage; an unattended flammable object hit ignites.','Damage becomes 2d10 / 3d10 / 4d10 at character levels 5 / 11 / 17.'),
        ('Ray of Frost',0,'Evocation','Action','60 ft.','VS','Instantaneous',False,False,'','Spell attack','None','Ranged spell attack against a creature: 1d8 Cold damage; its Speed drops by 10 ft. until your next turn starts.','Damage becomes 2d8 / 3d8 / 4d8 at character levels 5 / 11 / 17.'),
        ('Eldritch Blast',0,'Evocation','Action','120 ft.','VS','Instantaneous',False,False,'','Spell attack','None','One ranged spell attack against a creature, dealing 1d10 Force on a hit.','Two / three / four beams at character levels 5 / 11 / 17. Roll each attack separately; choose targets for each.'),
        ('Sacred Flame',0,'Evocation','Action','60 ft.','VS','Instantaneous',False,False,'','Saving throw','Dexterity','One creature you can see makes a Dexterity save: 1d8 Radiant on failure, none on success. Half and three-quarters cover do not benefit the save.','Damage becomes 2d8 / 3d8 / 4d8 at character levels 5 / 11 / 17.'),
        ('Guidance',0,'Divination','Action','Touch','VS','Up to 1 minute',True,False,'','Effect only','None','Touch a willing creature and choose a skill. Add 1d4 to its checks using that skill while the spell lasts.','No higher-slot scaling.'),
        ('Light',0,'Evocation','Action','Touch','VM','1 hour',False,False,'A firefly or phosphorescent moss','Effect only','None','Touch an eligible unattended object: bright light 20 ft., dim light a further 20 ft. Opaque covering blocks the light. Consult the full entry for object size and dismissal.','No higher-slot scaling.'),
        ('Mage Hand',0,'Conjuration','Action','30 ft.','VS','1 minute',False,False,'','Effect only','None','Create a spectral hand. Use a Magic action to control it; maximum load 10 lb. It cannot attack, activate magic items or carry more than its limit.','No higher-slot scaling.'),
        ('Cure Wounds',1,'Abjuration','Action','Touch','VS','Instantaneous',False,False,'','Effect only','None','A touched creature regains 2d8 + spellcasting modifier HP.','+2d8 healing for each slot level above 1.'),
        ('Healing Word',1,'Abjuration','Bonus Action','60 ft.','V','Instantaneous',False,False,'','Effect only','None','A creature you can see regains 2d4 + spellcasting modifier HP.','+2d4 healing for each slot level above 1.'),
        ('Magic Missile',1,'Evocation','Action','120 ft.','VS','Instantaneous',False,False,'','Effect only','None','Three darts hit creatures you can see, simultaneously. Each deals 1d4 + 1 Force. Divide darts among targets as desired; no attack roll.','One additional dart per slot level above 1.'),
        ('Shield',1,'Abjuration','Reaction: hit by an attack roll or targeted by Magic Missile','Self','VS','1 round',False,False,'','Effect only','None','Gain +5 AC, including against the triggering attack, until your next turn starts. Magic Missile deals you no damage during that time.','No higher-slot scaling.'),
        ('Mage Armor',1,'Abjuration','Action','Touch','VSM','8 hours',False,False,'A piece of cured leather','Effect only','None','A willing, unarmored creature has base AC 13 + Dexterity modifier. Ends if the target dons armor.','No higher-slot scaling.'),
        ('Bless',1,'Enchantment','Action','30 ft.','VSM','Up to 1 minute',True,False,'Holy Symbol worth 5+ gp','Effect only','None','Up to three chosen creatures add 1d4 to attack rolls and saving throws while the spell lasts.','One additional target per slot level above 1.'),
        ('Detect Magic',1,'Divination','Action or Ritual','Self','VS','Up to 10 minutes',True,True,'','Effect only','None','Sense magical effects within 30 ft.; use a Magic action to examine visible auras. The full entry describes barriers that block detection.','No higher-slot scaling.'),
        ('Guiding Bolt',1,'Evocation','Action','120 ft.','VS','1 round',False,False,'','Spell attack','None','Ranged spell attack against a creature: 4d6 Radiant. The next attack against it before your next turn ends has advantage.','+1d6 damage per slot level above 1.'),
        ('Thunderwave',1,'Evocation','Action','Self','VS','Instantaneous',False,False,'','Saving throw','Constitution','15-foot Cube: Constitution save. Failure: 2d8 Thunder and pushed 10 ft. away. Success: half damage, no push. Consult the entry for objects and the audible boom.','+1d8 damage per slot level above 1.'),
        ('Misty Step',2,'Conjuration','Bonus Action','Self','V','Instantaneous',False,False,'','Effect only','None','Teleport up to 30 ft. to an unoccupied space you can see.','No higher-slot scaling.'),
        ('Lesser Restoration',2,'Abjuration','Bonus Action','Touch','VS','Instantaneous',False,False,'','Effect only','None','End one condition on a touched creature: Blinded, Deafened, Paralyzed or Poisoned.','No higher-slot scaling.'),
        ('Fireball',3,'Evocation','Action','150 ft.','VSM','Instantaneous',False,False,'A ball of bat guano and sulfur','Saving throw','Dexterity','20-foot-radius Sphere: Dexterity save, 8d6 Fire on failure or half on success. Affects creatures in the area, including allies; ignites unattended flammable objects.','+1d6 damage per slot level above 3.'),
    ]
    for name, level, school, time, distance, components, duration, concentration, ritual, materials, resolution, save, effect, scaling in spells:
        result.append(card('spell', name, effect[:500], effect+'\n'+scaling+'\nReference only. Check the full spell and your class list for access and exact targeting.', source='spell-descriptions', spell_level='Cantrip' if level==0 else str(level), school=school, casting_time=time, range=distance, duration=duration, tabletop={'verbal':'V' in components,'somatic':'S' in components,'material':'M' in components,'materials':materials,'concentration':concentration,'ritual':ritual,'resolution':resolution,'save_ability':save,'upcast':scaling}))
    actions = [
        ('Attack','Action','Make a weapon attack or Unarmed Strike. Extra Attack modifies this action only when a feature grants it.'),
        ('Dash','Action','Gain extra movement equal to your Speed for this turn, after applicable modifiers.'),
        ('Disengage','Action','Your movement does not provoke Opportunity Attacks for the rest of this turn.'),
        ('Dodge','Action','Until your next turn starts, attacks against you have disadvantage if you can see the attacker; Dexterity saves have advantage. These benefits end if Incapacitated or Speed becomes 0.'),
        ('Help','Action','Assist a qualifying ability check or distract an enemy within 5 ft. to help an ally attack it. Follow the full action’s proficiency, timing and reach requirements.'),
        ('Hide','Action','In qualifying concealment and out of enemies’ sight, attempt the specified DC 15 Dexterity (Stealth) check. Read the full 2024 hiding rule for detection and ending conditions.'),
        ('Ready','Action','Choose a perceivable trigger and an action or movement. Spend your reaction after the trigger to respond. Readying a spell requires casting now, spending any required slot, and concentration while holding it.'),
        ('Search','Action','Make a Wisdom check to notice or assess something; the task determines the skill.'),
        ('Study','Action','Make an Intelligence check to examine or recall information; the task determines the skill.'),
        ('Influence','Action','Attempt to influence a creature. Its attitude, willingness and the request determine whether a check is possible and its difficulty.'),
        ('Magic','Action','Cast a spell with an action casting time, or activate an eligible magical feature or item. Some magic uses different timing.'),
        ('Utilize','Action','Use a nonmagical object when its use requires an action. Follow any specific activation rule.'),
        ('Opportunity Attack','Reaction','When a creature you can see leaves your reach using its action, bonus action, reaction, or a speed, you can make one melee attack just before it leaves. Teleportation and qualifying forced movement do not provoke.'),
    ]
    for name, timing, notes in actions:
        result.append(card('attack', name, notes[:500], notes, source='rules-glossary', action_type='Ability' if timing=='Action' else 'Reaction', tabletop={'activation':timing,'limits':'Specific features may change this rule. Apply the full glossary entry.'}))
    for name, die, ability in [('Barbarian','d12','Strength'),('Bard','d8','Charisma'),('Cleric','d8','Wisdom'),('Druid','d8','Wisdom'),('Fighter','d10','Strength or Dexterity'),('Monk','d8','Dexterity and Wisdom'),('Paladin','d10','Strength and Charisma'),('Ranger','d10','Dexterity and Wisdom'),('Rogue','d8','Dexterity'),('Sorcerer','d6','Charisma'),('Warlock','d8','Charisma'),('Wizard','d6','Intelligence')]:
        result.append(card('class', name+' — class reference', f'Hit Die {die} · Primary ability: {ability}', 'Use the linked class table for features, proficiencies, subclass progression and resources. This reference does not grant class features or complete a character build.', source='character-classes'))
    result.append(card('lore','Using your starter library','Equipment, starter spells, actions and class references for revised fifth edition.', 'These cards are references, not treasure awards or prepared spells. The DM can create a playable copy, choose its owners/users, and record its exact properties. Spell and magic-item summaries are concise reminders; open the full source for edge cases. Track owned copies separately. This curated library is not the full rulebook.\n\nBased on SRD 5.2.1 by Wizards of the Coast LLC, licensed CC BY 4.0. Original summaries and structured data; see Rules attribution.', source='creating-a-character'))
    from character_references import origin_records
    result.extend(origin_records(card))
    return copy.deepcopy(result)
