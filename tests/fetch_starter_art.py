import _bootstrap  # Shared backend import path for tests and previews.
"""Import existing Game-icons.net SVGs verbatim; never synthesizes artwork."""
import concurrent.futures
import json
from pathlib import Path
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from campaign_defaults import starter_records

# Ordered exactly like the curated library. Names resolve to existing source files.
ICONS = '''wood-club plain-dagger wood-club sharp-axe thrown-spear flat-hammer flanged-mace bo sickle spear-feather dart crossbow bow-arrow sling
battle-axe flail spear-hook war-axe two-handed-sword sharp-halberd spear-feather broadsword warhammer spiked-mace spears piercing-sword dervish-swords gladius trident warhammer war-pick whip blowgun crossbow crossbow bow-string
armor-vest leather-armor leather-vest animal-hide mail-shirt scale-mail chest-armor abdominal-armor mail-shirt mail-shirt layered-armor chest-armor round-shield
backpack sleeping-bag rope-coil torch flint-spark meat water-bottle first-aid-kit lockpicks herbs-bundle powder-bag lunar-wand holy-symbol herbs-bundle spell-book quiver plain-arrow light-backpack
health-potion heart-bottle standing-potion potion-ball
shining-sword armor-upgrade templar-shield wing-cloak steampunk-goggles shoulder-bag
fire-ray ice-bolt plasma-bolt flame third-eye candle-light hand healing shining-heart hypersonic-bolt magic-shield armor-upgrade holy-symbol crystal-eye arcing-bolt thunder-struck wingfoot healing-shield fireball
crossed-swords run dodging dodging shaking-hands hood duration magnifying-glass open-book talk magic-swirl hand-grip sword-clash
barbarian lyre healing-shield oak swordman monk-face templar-shield hood cloak-dagger magic-swirl warlock-hood wizard-staff
rule-book'''.split()

def main():
    records = starter_records()
    request = urllib.request.Request('https://api.github.com/repos/game-icons/icons/git/trees/master?recursive=1', headers={'User-Agent':'Starter-art-import'})
    tree = json.load(urllib.request.urlopen(request, timeout=30))
    paths = [r['path'] for r in tree['tree'] if r['path'].endswith('.svg') and not r['path'].startswith('badges/')]
    by_name = {}
    for p in paths:
        by_name.setdefault(Path(p).stem, p)
    # Keep these aliases explicit so every choice can be reviewed before import.
    aliases = {'blowgun':'dart', 'holy-symbol':'ankh'}
    icons = [aliases.get(i,i) for i in ICONS]
    if len(icons)!=len(records):
        raise ValueError(f'{len(icons)} icons for {len(records)} cards')
    missing = sorted(set(icons)-by_name.keys())
    if missing:
        raise ValueError(f'No existing artwork found: {missing}')
    dest = ROOT/'site/assets/starter-art'
    dest.mkdir(parents=True,exist_ok=True)
    selected = {by_name[i] for i in icons}
    def fetch(p):
        target=dest/(p.replace('/','--'))
        if not target.exists():
            data=urllib.request.urlopen('https://raw.githubusercontent.com/game-icons/icons/'+tree['sha']+'/'+p, timeout=30).read()
            if b'<svg' not in data or b'<script' in data: raise ValueError(p)
            target.write_bytes(data)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(fetch,sorted(selected)))
    manifest={r['content']['category']+'|'+r['title']: '/assets/starter-art/'+by_name[i].replace('/','--') for r,i in zip(records,icons)}
    (dest/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    credits=['# Starter artwork', '', 'Existing artwork from https://game-icons.net/, used without modification.', 'License: Creative Commons Attribution 3.0 https://creativecommons.org/licenses/by/3.0/', 'Source: https://github.com/game-icons/icons/tree/'+tree['sha'], '', '| File | Artist | Original |', '| --- | --- | --- |']
    for p in sorted(selected):
        author,name=p.removesuffix('.svg').split('/')
        credits.append(f'| {p.replace("/","--")} | {author} | https://game-icons.net/1x1/{author}/{name}.html |')
    (dest/'CREDITS.md').write_text('\n'.join(credits)+'\n',encoding='utf-8')
    (ROOT/'site/starter-art.js').write_text('/* Existing Game-icons.net art; see assets/starter-art/CREDITS.md. */\nwindow.StarterArt = (() => {\n  const catalog = '+json.dumps(manifest,ensure_ascii=False,indent=2)+''';
  const allowed = new Set(Object.values(catalog));
  function fallback(item) {
    const c = item?.content || {};
    if (allowed.has(c.default_art)) return c.default_art;
    if (c.source_name !== 'SRD 5.2.1 · revised fifth edition') return '';
    return catalog[c.category + '|' + item.title] || '';
  }
  return { fallback, url(item) { const c=item?.content||{}; return c.image_id ? '/api/uploads/'+c.image_id : fallback(item); } };
})();
''',encoding='utf-8')
    print(f'Imported {len(selected)} existing images for {len(records)} cards.')

if __name__=='__main__': main()
