/* Shared illustrated record cards for inventory, equipment, loot and abilities. */
(() => {
  function create(record, config = {}) {
    const content = record.content || {}, interactive = typeof config.onOpen === 'function';
    const card = document.createElement(interactive ? 'button' : 'div');
    card.className = 'rail-entry record-card' + (config.className ? ' ' + config.className : '');
    card.dataset.recordId = record.id;
    if (interactive) { card.type = 'button'; card.setAttribute('aria-label',config.label || 'View ' + record.title); card.addEventListener('click',config.onOpen); }
    const art = document.createElement('span'); art.className = 'rail-entry-image';
    const url = window.StarterArt?.url(record);
    if (url) { const img = document.createElement('img'); img.src = url; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; art.append(img); }
    else art.textContent = content.category === 'spell' ? '✧' : content.category === 'attack' ? '⚔' : '◆';
    const copy = document.createElement('span'); copy.className = 'rail-entry-copy';
    const title = document.createElement('strong'); title.textContent = record.title;
    const description = document.createElement('small'); description.className = 'record-card-description';
    description.textContent = config.description ?? (content.category === 'item' ? (content.item_type || 'Item') + ' · Quantity ' + (content.quantity ?? 1) : content.category === 'spell' ? 'Spell · ' + (content.spell_level === 'Cantrip' ? 'Cantrip' : 'Level ' + (content.spell_level || '?')) : (content.damage ? 'Ability · ' + content.damage : content.action_type && content.action_type !== 'Ability' ? 'Ability · ' + content.action_type : 'Ability'));
    copy.append(title,description);card.append(art,copy);return card;
  }
  window.RecordCards = {create};
})();
