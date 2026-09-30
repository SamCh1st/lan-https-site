(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const players = new Map();
  let open = false;
  const status = message => { $('audioStatus').textContent = message; };
  async function request(url, options) {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The audio library could not be loaded.');
    return data;
  }
  async function refresh() {
    const data = await request('/api/audio');
    const selected = $('audioFolder').value;
    const expanded = new Set([...$('audioFolders').querySelectorAll('details[open]')].map(el => el.dataset.folder));
    $('audioFolder').replaceChildren();
    $('audioFolders').replaceChildren();
    for (const folder of data.folders) {
      $('audioFolder').add(new Option(folder.name, folder.name));
      const group = document.createElement('details');
      group.dataset.folder = folder.name;
      group.open = expanded.has(folder.name) || folder.name === selected;
      const heading = document.createElement('summary');
      heading.textContent = `${folder.name} (${folder.tracks.length})`;
      group.append(heading);
      for (const track of folder.tracks) {
        const row = document.createElement('div'); row.className = 'audio-track';
        const button = document.createElement('button'); button.type = 'button';
        const name = document.createElement('span'); name.textContent = track.name;
        let player = players.get(track.url);
        if (!player) {
          player = new Audio(track.url);
          player.preload = 'none';
          player.loop = true;
          players.set(track.url, player);
        }
        const sync = () => {
          button.textContent = player.paused ? '▶' : 'Ⅱ';
          button.setAttribute('aria-label', `${player.paused ? 'Play' : 'Pause'} ${track.name}`);
          button.setAttribute('aria-pressed', String(!player.paused));
        };
        player.onplay = player.onpause = sync;
        player.onerror = () => { sync(); status(`Cannot play ${track.name}. Check that it is a valid MP3.`); };
        button.onclick = async () => {
          if (!player.paused) player.pause();
          else try { await player.play(); } catch { status(`Cannot play ${track.name}. Try another MP3.`); }
          sync();
        };
        sync(); row.append(button, name); group.append(row);
      }
      if (!folder.tracks.length) {
        const empty = document.createElement('p'); empty.className = 'audio-empty';
        empty.textContent = 'No MP3s yet. Import some into this folder.'; group.append(empty);
      }
      $('audioFolders').append(group);
    }
    if ([...$('audioFolder').options].some(option => option.value === selected)) $('audioFolder').value = selected;
  }
  function setOpen(value) {
    open = value;
    if (value && document.body.classList.contains('realm-menu-open')) $('realmMenuClose').click();
    document.body.classList.toggle('audio-menu-open', value);
    $('audioSidebar').inert = !value;
    $('audioSidebar').setAttribute('aria-hidden', String(!value));
    $('audioMenuButton').setAttribute('aria-expanded', String(value));
    (value ? $('audioClose') : $('audioMenuButton')).focus();
    if (value) refresh().catch(error => status(error.message));
  }
  $('audioMenuButton').onclick = () => setOpen(!open);
  $('audioClose').onclick = $('audioBackdrop').onclick = () => setOpen(false);
  $('realmMenuButton').addEventListener('click', () => { if (open) setOpen(false); });
  document.addEventListener('keydown', event => {
    if (!open) return;
    if (event.key === 'Escape') setOpen(false);
    if (event.key === 'Tab') {
      const controls = [...$('audioSidebar').querySelectorAll('button,select,summary,[tabindex="0"]')].filter(el => el.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  document.querySelector('.audio-import').addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('audioFiles').click(); }
  });
  $('audioStop').onclick = () => { for (const player of players.values()) { player.pause(); player.currentTime = 0; } };
  $('audioFiles').onchange = async () => {
    const files = [...$('audioFiles').files], folder = $('audioFolder').value;
    $('audioFiles').disabled = true;
    let count = 0;
    const failures = [];
    for (const file of files) {
      status(`Importing ${file.name}…`);
      try {
        if (!file.name.toLowerCase().endsWith('.mp3') || file.size > 100 * 1024 * 1024) throw new Error('Choose an MP3 up to 100 MB.');
        await request(`/api/audio/import?folder=${encodeURIComponent(folder)}&name=${encodeURIComponent(file.name)}`, {method:'POST', headers:{'Content-Type':'audio/mpeg'}, body:file});
        count++;
      } catch (error) { failures.push(`${file.name}: ${error.message}`); }
    }
    $('audioFiles').value = ''; $('audioFiles').disabled = false;
    try { await refresh(); } catch (error) { failures.push(error.message); }
    status(`${count} MP3${count === 1 ? '' : 's'} imported. ${failures.join(' ')}`);
  };
})();
