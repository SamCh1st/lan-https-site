/* Shared artwork chooser for catalog cards, chat and Art Atelier. */
(function () {
  let artworks = [];
  const instances = new Set();
  function create(host, options = {}) {
    const details = document.createElement('details'); details.className = 'map-image-library';
    const summary = document.createElement('summary'); summary.textContent = 'Choose from artwork library';
    const search = document.createElement('input'); search.type = 'search'; search.placeholder = 'Search artwork'; search.setAttribute('aria-label', 'Search artwork library');
    const list = document.createElement('div'); list.className = 'map-image-library-grid';
    const status = document.createElement('small'); status.setAttribute('role', 'status');
    details.append(summary, search, list, status); host.append(details);
    let records = null, busy = false, version = 0, signature = '';
    function reset(next) { const nextSignature = JSON.stringify(next || artworks); records = next; if (signature === nextSignature) return; signature = nextSignature; version++; search.value = ''; status.textContent = ''; details.open = false; list.replaceChildren(); }
    async function choose(load) {
      if (busy || options.disabled?.()) return;
      const current = version; busy = true;
      try {
        const image = await load();
        if (current !== version || options.disabled?.()) return;
        await options.onSelect(image);
        status.textContent = options.selectedText || ''; details.open = false; summary.focus();
      } catch (error) { if (current === version) status.textContent = error.message; }
      finally { busy = false; }
    }
    function button(name, src, action, id) {
      const b = document.createElement('button'); b.type = 'button'; b.title = name; b.setAttribute('aria-label', 'Use ' + name);
      if (id) b.dataset.artworkId = id;
      const image = new Image(); image.src = src; image.alt = ''; image.loading = 'lazy';
      const label = document.createElement('span'); label.textContent = name; b.append(image, label);
      b.onclick = () => choose(action); list.append(b);
    }
    function render() {
      list.replaceChildren(); const q = search.value.toLowerCase();
      const seen = new Set();
      for (const art of records || artworks) {
        const c = art.content || {}, id = Number(c.image_id);
        if (!id || seen.has(id) || ![art.title, c.summary, c.notes].join(' ').toLowerCase().includes(q)) continue;
        seen.add(id); button(art.title, '/api/uploads/' + id, () => ({image_id: id, name: art.title}), art.id);
      }
      for (const type of (window.MapSprites?.types || []).filter(t => !['oak', 'tree'].includes(t) && t.replaceAll('_', ' ').includes(q))) {
        const name = window.MapCatalog?.label(type) || type.replaceAll('_', ' ');
        button(name, '/assets/map-art/items/' + type + '.png', async () => {
          status.textContent = 'Preparing image…';
          const url = await MapSprites.tile(type), blob = await (await fetch(url)).blob();
          const response = await fetch('/api/upload', {method: 'POST', headers: {'Content-Type': 'image/png'}, body: blob});
          const result = await response.json(); if (!response.ok) throw Error(result.error || 'Unable to use image.');
          return {image_id: result.image_id, name};
        });
      }
      status.textContent = list.children.length ? (options.help || '') : 'No artwork matches your search.';
    }
    details.addEventListener('toggle', () => { if (details.open) render(); }); search.oninput = render;
    const instance = {setArtwork: reset, close() { version++; details.open = false; }};
    instances.add(instance); return instance;
  }
  window.MapImagePicker = {create, setArtwork(records) {artworks = records; for (const instance of instances) instance.setArtwork(null);}};
  const preview = document.querySelector('#recordImagePreview');
  if (preview) create(preview.parentElement, {
    help: 'Choose artwork, then save the card to apply it.', selectedText: 'Image selected. Save the card to keep it.',
    onSelect(image) {
      document.querySelector('#workForm [name=image_id]').value = image.image_id;
      document.querySelector('#workForm [name=image_file]').value = '';
      const img = new Image(); img.src = '/api/uploads/' + image.image_id; img.alt = ''; preview.replaceChildren(img);
    }
  });
})();
