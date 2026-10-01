/* Render image slots at the tag's exact position. Rendering never starts a job. */
(function () {
  const drafts = new Map(), pending = new Set(), errors = new Map(), settingsDrafts = new Map();
  function render(host, entry, options) {
    const text = entry.message || '';
    let cursor = 0, count = 0;
    const occurrences = new Map();
    function prose(value) {
      if (!value) return;
      const p = document.createElement('p'); p.className = 'ai-message-text';
      options.text(p, value); host.append(p);
    }
    for (const match of ChatFormat.imageMatches(text, {incomplete:true,partial:entry.generation_status==='streaming'})) {
      prose(text.slice(cursor, match.index)); cursor = match.index + match[0].length;
      const prompt = match[1].trim();
      const occurrence = occurrences.get(prompt) || 0;
      occurrences.set(prompt, occurrence + 1);
      const frame = document.createElement('figure'); frame.className = 'chat-art';
      host.append(frame);
      if(match.incomplete){
        const notice=document.createElement('p');notice.textContent=entry.generation_status==='streaming'?'Preparing image…':'Incomplete image request. Edit the message to finish it.';frame.append(notice);continue;
      }
      if (!prompt || prompt.length > 3000 || count >= 3) {
        const notice = document.createElement('p'); notice.textContent = 'Use up to three image tags, each with a description of 1–3,000 characters.'; frame.append(notice); continue;
      }
      count++;
      const art = (entry.art || []).find(value => value.prompt === prompt && value.occurrence === occurrence);
      if (!art) {
        const notice = document.createElement('p'); notice.textContent = entry.generation_status === 'streaming' ? 'Image will be drawn when the message finishes…' : 'Preparing image…'; frame.append(notice); continue;
      }
      frame.dataset.artId = art.id;
      const busy = ['queued', 'running'].includes(art.status) || pending.has(art.id);
      if (art.image_id) {
        const link = document.createElement('a'); link.href = '/api/uploads/' + art.image_id; link.target = '_blank'; link.rel = 'noopener'; link.setAttribute('aria-label', 'Open generated image');
        const image = new Image(); image.src = link.href; image.alt = 'Generated artwork'; image.style.height='auto'; link.append(image); frame.append(link);
      }
      const status = document.createElement('p'); status.className = 'chat-art-status'; status.setAttribute('role', 'status');
      status.textContent = errors.get(art.id) || art.error || (busy ? (art.status === 'running' ? (art.progress || 'Drawing…') : 'Waiting to draw…') : art.saved ? 'Saved to Artwork' : '');
      frame.append(status);
      const controls = document.createElement('div'); controls.className = 'chat-art-actions'; frame.append(controls);
      async function act(action, extra = {}) {
        if (pending.has(art.id)) return;
        pending.add(art.id); errors.delete(art.id);
        frame.querySelectorAll('button').forEach(button => button.disabled = true);
        status.textContent = action === 'save' ? 'Saving…' : 'Starting drawing…';
        try {
          await options.action(art.id, {action, revision: art.revision, ...(action==='save'?{}:{render_settings:settingsDrafts.get(art.id)||art.render_settings||{}}), ...extra});
          settingsDrafts.delete(art.id);
          if (action === 'edit') drafts.delete(art.id);
        } catch (error) {errors.set(art.id, error.message);}
        finally {pending.delete(art.id); await options.refresh();}
      }
      function button(label, action, disabled) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.disabled = !!disabled;
        b.onclick = action; controls.append(b); return b;
      }
      if (art.image_id) button('Save to artwork catalog', () => act('save'), busy || art.saved);
      if (art.can_change) {
        const settings=document.createElement('details'),heading=document.createElement('summary');heading.textContent='Image size & shape';settings.append(heading);
        const values=settingsDrafts.get(art.id)||art.render_settings||{};
        for(const [key,title,choices,fallback] of [['size','Size',[[512,'512 · Quick'],[768,'768 · Balanced'],[1024,'1024 · Detailed']],512],['shape','Shape',[['square','Square'],['portrait','Portrait'],['landscape','Landscape']],'square']]){
          const label=document.createElement('label'),select=document.createElement('select');label.textContent=title;select.disabled=busy;
          for(const [value,name] of choices){const option=document.createElement('option');option.value=value;option.textContent=name;select.append(option);}
          select.value=values[key]??fallback;select.onchange=()=>settingsDrafts.set(art.id,{...(settingsDrafts.get(art.id)||art.render_settings||{}),[key]:key==='size'?Number(select.value):select.value});label.append(select);settings.append(label);
        }
        frame.append(settings);
        button(art.image_id ? 'Regenerate' : 'Retry', () => act('regenerate'), busy);
        if (art.image_id) {
          const editor = document.createElement('div'); editor.className = 'chat-art-editor'; editor.hidden = !drafts.has(art.id);
          const label = document.createElement('label'); label.textContent = 'What should change?';
          const input = document.createElement('textarea'); input.rows = 3; input.maxLength = 3000; input.placeholder = 'Add a blue cloak, change the background…'; input.value = drafts.get(art.id) || ''; input.disabled = busy;
          input.oninput = () => drafts.set(art.id, input.value); label.append(input); editor.append(label);
          const apply = document.createElement('button'); apply.type = 'button'; apply.textContent = 'Apply changes'; apply.disabled = busy;
          apply.onclick = () => {if (!input.value.trim()) {input.focus(); return;} act('edit', {prompt: input.value.trim()});};
          const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
          cancel.onclick = () => {drafts.delete(art.id); editor.hidden = true;};
          editor.append(apply, cancel); frame.append(editor);
          button('Edit image', () => {editor.hidden = !editor.hidden; if (!editor.hidden) {drafts.set(art.id, input.value); input.focus();} else drafts.delete(art.id);}, busy);
        }
      }
      if(art.recipe?.prompt){const details=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('pre');summary.textContent='Prompt & settings';text.style.whiteSpace='pre-wrap';text.style.overflowWrap='anywhere';text.textContent=JSON.stringify(art.recipe,null,2);details.append(summary,text);frame.append(details);}
    }
    prose(text.slice(cursor));
  }
  window.ChatArt = {render};
})();
