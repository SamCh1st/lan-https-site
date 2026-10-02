/**
 * Keep raw message edits local until Save; autocomplete appends a reviewable suffix.
 * See [README: message editing and images](../README.md#message-editing-and-images).
 */
/* Raw, same-card editing. Continuation always appends at the end of the draft. */
window.ChatEditor = {
  /**
   * Open the same-card editor and connect completion, undo, save and cancel callbacks.
   * See [README](../README.md#message-editing-and-images).
   */
  open(card, entry, options) {
    if (card.classList.contains('ai-message-editing')) return;
    card.classList.add('ai-message-editing');
    const copy = card.querySelector('.ai-message-copy');
    const media = card.querySelector('.ai-message-media');
    const tools = card.querySelector('.ai-message-tools');
    tools.hidden = true;
    copy.replaceChildren(); media.replaceChildren();
    const field = document.createElement('textarea');
    field.className = 'chat-message-draft'; field.value = entry.message; field.maxLength = 12000;
    field.setAttribute('aria-label', 'Edit raw message');
    const help = document.createElement('small');
    help.textContent = 'Autocomplete continues from the end. End with <image> to draft an image description and close its tag. Review the text, then Save.';
    const controls = document.createElement('div'); controls.className = 'chat-editor-controls';
    const error = document.createElement('div'); error.className = 'chat-editor-error'; error.setAttribute('role', 'status');
    let images = [...(entry.image_ids || [])], closed = false, busy = false, undo = null;
    const button = (label, action) => {
      const el = document.createElement('button'); el.type = 'button'; el.textContent = label;
      el.onclick = action; controls.append(el); return el;
    };
    const resize = () => { field.style.height = 'auto'; field.style.height = Math.min(650, Math.max(160, field.scrollHeight + 2)) + 'px'; };
    const lock = value => {busy = value; field.readOnly = value; save.disabled = value; complete.disabled = value; undoButton.disabled = value || undo === null; media.querySelectorAll('button').forEach(b => b.disabled = value);};
    const drawImages = () => {
      media.replaceChildren();
      images.forEach(id => {
        const tile = document.createElement('span'); tile.className = 'chat-editor-image';
        const img = document.createElement('img'); img.src = '/api/uploads/' + id; img.alt = 'Attached image';
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label','Remove attached image');
        remove.onclick = () => {if (!busy) {images = images.filter(value => value !== id); drawImages();}};
        tile.append(img, remove); media.append(tile);
      });
    };
    const complete = button('Auto-complete', async () => {
      if (busy) return;
      const before = field.value; error.textContent = ''; lock(true); complete.textContent = 'Continuing…';
      try {
        const result = await options.complete(before);
        if (closed) return;
        undo = before; field.value = before + result.continuation;
        resize(); field.focus(); field.setSelectionRange(field.value.length, field.value.length);
      } catch (e) {if (!closed) error.textContent = e.message;}
      finally {if (!closed) {lock(false); complete.textContent = 'Auto-complete';}}
    });
    const undoButton = button('Undo completion', () => {if (!busy && undo !== null) {field.value = undo; undo = null; undoButton.disabled = true; resize();}});
    undoButton.disabled = true;
    const save = button('Save', async () => {
      if (busy) return;
      error.textContent = ''; lock(true);
      try {await options.save(field.value, images); closed = true; options.close();}
      catch (e) {error.textContent = e.message; lock(false);}
    });
    button('Cancel', () => {closed = true; options.close();});
    field.oninput = () => {undo = null; undoButton.disabled = true; resize();};
    copy.append(field, help, controls, error); drawImages();
    requestAnimationFrame(() => {resize(); field.focus(); field.setSelectionRange(field.value.length, field.value.length);});
  }
};
