/**
 * Manage uploaded chat attachments separately from generated image slots.
 * See [README: message editing and images](../README.md#message-editing-and-images).
 */
/* Thumbnail-only chat attachments, using the catalog artwork chooser. */
(function () {
  /**
   * Build an attachment tray whose changes are returned through the caller's callbacks.
   * See [README](../README.md#message-editing-and-images).
   */
  function create(host, options) {
    host.innerHTML = '<div class="chat-image-tools"><label class="image-pick">Import images<input type="file" accept="image/png,image/jpeg,image/webp" multiple aria-label="Import chat images"></label><div class="chat-image-picker"></div></div><div class="chat-image-tray" aria-label="Attached images" hidden></div>';
    const input = host.querySelector('input'), tray = host.querySelector('.chat-image-tray');
    let images = [], scope = '', version = 0, uploading = false, locked = false;
    const picker = MapImagePicker.create(host.querySelector('.chat-image-picker'), {disabled: () => uploading || locked, onSelect: add});
    function render() {
      tray.replaceChildren(); tray.hidden = !images.length; options.changed?.(images.length);
      images.forEach(image => {
        const tile = document.createElement('div'); tile.className = 'chat-image-tile';
        const img = new Image(); img.src = '/api/uploads/' + image.image_id; img.alt = image.name || 'Attached image';
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Remove ' + (image.name || 'image')); remove.disabled = locked || uploading;
        remove.onclick = () => {images = images.filter(value => value !== image); render();};
        tile.append(img, remove); tray.append(tile);
      });
    }
    function add(image) {
      if (images.some(value => value.image_id === image.image_id)) throw Error('That image is already attached.');
      if (images.length >= 3) throw Error('Choose up to three images per message.');
      images.push(image); render();
    }
    input.onchange = async () => {
      const files = [...input.files], current = version;
      uploading = true; input.disabled = true; render(); options.error('');
      try {
        if (images.length + files.length > 3) throw Error('Choose up to three images per message.');
        for (const file of files) {
          if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw Error('Choose PNG, JPEG or WebP images.');
          const result = await options.upload(file);
          if (current !== version) return;
          add({image_id: result.image_id, name: file.name});
        }
      } catch (error) {if (current === version) options.error(error.message);}
      finally {uploading = false; input.value = ''; input.disabled = locked; render();}
    };
    return {
      ids: () => images.map(image => image.image_id),
      busy: () => uploading,
      clear() {version++; images = []; picker.close(); render();},
      lock(value) {locked = value; input.disabled = locked || uploading; render();},
      setScope(next, records) {if (next !== scope) {this.clear(); scope = next;} picker.setArtwork(records);}
    };
  }
  /**
   * Render saved uploaded images for a message.
   * See [README](../README.md#message-editing-and-images).
   */
  function display(host, ids) {
    if (!ids?.length) return;
    const tray = document.createElement('div'); tray.className = 'chat-image-tray chat-message-images';
    for (const id of ids) {
      const link = document.createElement('a'); link.href = '/api/uploads/' + Number(id); link.target = '_blank'; link.rel = 'noopener'; link.setAttribute('aria-label', 'Open attached image');
      const img = new Image(); img.src = link.href; img.alt = 'Attached image'; img.loading = 'lazy'; link.append(img); tray.append(link);
    }
    host.append(tray);
  }
  window.ChatImages = {create, display};
})();
