"""Campaign-scoped identity checks shared by forms and AI effects.

See [README: character creation flow](../README.md#character-creation-flow)."""
import unicodedata
import re


def generated_name(value):
    """Remove model field labels without rewriting a player's stored record.

    See [README: character creation flow](../README.md#character-creation-flow)."""
    if not isinstance(value, str) or '\n' in value.strip() or '\r' in value.strip():
        raise ValueError('Return only the character or encounter name in title')
    title = value.strip().strip('`*# ').strip('"“” ')
    title = re.sub(r'^(?:(?:character|npc|encounter)(?:\s+(?:reference|profile|name))?|name|title)\s*:\s*',
                   '', title, flags=re.IGNORECASE).strip().strip('`*"“” ')
    if (not 1 <= len(title) <= 120 or not name_key(title) or '{{' in title
            or re.match(r'^(?:visual description|personality|roleplay behavior examples)\s*:', title, re.I)):
        raise ValueError('Return a name without headings, placeholders or instructions')
    return title


def name_key(title):
    text = unicodedata.normalize('NFKD', str(title)).casefold()
    return ''.join(c for c in text if c.isalnum())


def categories(category):
    return ('character', 'npc') if category in ('character', 'npc') else ('encounter',) if category == 'encounter' else ()


def conflict(db, campaign_id, category, title, exclude=None):
    kinds = categories(category)
    if not campaign_id or not kinds:
        return None
    key = name_key(title)
    for row in db.execute("SELECT id,title,json_extract(content,'$.category') AS category FROM work_items WHERE CAST(json_extract(content,'$.campaign_id') AS INTEGER)=?", (campaign_id,)):
        if row['id'] != exclude and row['category'] in kinds and name_key(row['title']) == key:
            return row
    return None


def ensure_unique(db, title, content, exclude=None):
    if categories(content.get('category')) and not name_key(title):
        raise ValueError('Enter a name containing letters or numbers.')
    if conflict(db, content.get('campaign_id'), content.get('category'), title, exclude):
        raise ValueError('That name is already used in this campaign. Open the existing record or choose a distinct name.')
