"""Normalize tabletop records without changing the database schema."""
import math

ABILITIES = ('strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma')

def normalize_tabletop(content):
    data = content.get('tabletop')
    if not isinstance(data, dict):
        content.pop('tabletop', None)
        return
    data = dict(data)
    def number(key, default=0, low=0, high=999999):
        try:
            result = int(data.get(key, default))
        except (ValueError, TypeError, OverflowError):
            result = default
        data[key] = max(low, min(high, result))
        return data[key]
    data['ruleset'] = data.get('ruleset') if data.get('ruleset') in ('2024', '2014', 'custom') else '2024'
    if content.get('category') in ('character', 'character_template'):
        number('exhaustion', high=6)
        try:
            level = max(1, min(20, int(content.get('character_level', 1))))
        except (ValueError, TypeError, OverflowError):
            level = 1
        number('hit_dice_spent', high=level)
        for i in range(1, 10):
            maximum = number(f'slot_{i}_max', high=20)
            number(f'slot_{i}_remaining', high=maximum)
        number('pact_level', 1, 1, 5)
        number('pact_remaining', high=number('pact_max', high=10))
        data['spell_ability'] = data.get('spell_ability') if data.get('spell_ability') in ABILITIES else ''
        for key in list(data):
            if key.startswith(('skill_', 'save_')):
                number(key, low=-99 if key.endswith('_extra') else 0, high=99 if key.endswith('_extra') else (1 if key.startswith('save_') else 2))
    if content.get('category') == 'item':
        number('charges_remaining', high=number('charges_max', high=9999))
        try:
            weight = float(data.get('weight', 0))
            data['weight'] = max(0, min(999999, weight)) if math.isfinite(weight) else 0
        except (ValueError, TypeError, OverflowError):
            data['weight'] = 0
    if content.get('category') == 'attack':
        number('uses_remaining', high=number('uses_max', high=9999))
    if content.get('category') == 'encounter':
        number('round', 1, 1, 9999)
        rows = data.get('combatants', [])
        normalized = []
        seen = set()
        for row in (rows[:50] if isinstance(rows, list) else []):
            if not isinstance(row, dict):
                continue
            identifier = str(row.get('id', ''))[:80]
            if not identifier or identifier in seen:
                continue
            seen.add(identifier)
            def bounded(key, low, high):
                try:
                    return max(low, min(high, int(row.get(key, 0))))
                except (ValueError, TypeError, OverflowError):
                    return 0
            normalized.append({'id': identifier, 'name': str(row.get('name', ''))[:120], 'initiative': bounded('initiative', -99, 99), 'hp': bounded('hp', 0, 999999), 'notes': str(row.get('notes', ''))[:500]})
        data['combatants'] = normalized
        active = data.get('active_turn')
        data['active_turn'] = active if isinstance(active, str) and active in seen else (normalized[0]['id'] if normalized else '')
    content['tabletop'] = data
