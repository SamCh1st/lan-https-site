"""Campaign-scoped identity checks shared by forms and AI effects."""
import unicodedata


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
