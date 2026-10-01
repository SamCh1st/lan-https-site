$(function () {
  const accountModal = new bootstrap.Modal('#accountModal');
  const workModal = new bootstrap.Modal('#workModal');
  const detailModal = new bootstrap.Modal('#recordDetailModal');
  const mapDetailsModal = new bootstrap.Modal('#mapDetailsModal');
  let mapDetailsSelection = null;
  const inviteModal = new bootstrap.Modal('#inviteModal');
  const notificationsModal = new bootstrap.Modal('#notificationsModal');
  const mapIconModal = new bootstrap.Modal('#mapIconModal');
  const mapCheckpointModal = new bootstrap.Modal('#mapCheckpointModal');
  const aiMessageModal = new bootstrap.Modal('#aiMessageModal');
  // Native fullscreen only paints descendants of the fullscreen element.
  const modalHomes = new Map();
  const fullscreenHost = () => document.fullscreenElement || document.querySelector('#campaignDashboard.map-workspace-fullscreen-fallback,#campaignDashboard.chat-fullscreen-fallback');
  $(document).on('show.bs.modal', '.modal', function () {
    const host = fullscreenHost();
    if (host && !host.contains(this)) { modalHomes.set(this,this.parentNode); host.append(this); }
  });
  $(document).on('shown.bs.modal', '.modal', function () {
    const host = fullscreenHost();
    if (host) document.querySelectorAll('body > .modal-backdrop').forEach(backdrop => host.append(backdrop));
  });
  $(document).on('hidden.bs.modal', '.modal', function () {
    const home=modalHomes.get(this);if(home){home.append(this);modalHomes.delete(this);}
  });
  document.addEventListener('fullscreenchange',()=>{
    if(fullscreenHost())return;
    for(const [modal,home] of modalHomes){home.append(modal);modalHomes.delete(modal);}
    document.querySelectorAll('#campaignDashboard .modal-backdrop').forEach(backdrop=>document.body.append(backdrop));
  });
  let user = null;
  let items = [];
  let workFetchVersion = 0, workLoads = 0, workETag = null;
  let authMode = 'login';
  let activeFilter = 'all';
  let detailItemId = null;
  let detailSnapshot = '';
  let activeCampaignId = null;
  let activeSection = null;
  let mapLibrary = null;
  let openingLocationMap = false;
  let workSaveClosePending = false;
  let editableRecordContent = {};
  let mapSaveTimer = null;
  let mapSyncTimer = null;
  let mapSyncBusy = false;
  let mapIconSignature = '';
  let activeMapObjectId = null;
  let visibleCharacterItemId = null;
  let aiSyncTimer = null;
  let aiSyncBusy = false;
  let aiSyncController = null, aiScopeVersion = 0;
  const aiReplyRequests = new Map();
  let aiReplyBusy = false;
  let aiState = null;
  let aiMessageSignature = '';
  let aiUndoDeletion = null;
  let activeAiChatId = null;
  let activeAiReplyPersona = { type: 'dm', id: null, name: 'AI Dungeon Master' };
  let activeAiSpeaker = { type: 'dm', id: null, name: 'AI Dungeon Master' };
  let activeAiToolsPersona = activeAiReplyPersona;
  $('#workModal').on('shown.bs.modal', function () { if (workSaveClosePending) workModal.hide(); });
  $('#workModal').on('hidden.bs.modal', function () { workSaveClosePending = false; if (window.characterRigEditor) window.characterRigEditor.stop(); renderCampaignCharacterWorkshop(); });
  const recordSigils = { campaign: '♛', chat: '☵', session: '☽', quest: '⌖', encounter: '⚔', character: '♙', character_template: '♙', npc: '♝', location: '♜', faction: '⚜', item: '◆', spell: '✧', attack: '🗡', lore: '✦', artwork: '▧', species: '♙', background: '☷', class: '⚔', feat: '✧', chronicle: '☷' };

  function setPageTitle(name) {
    document.title = (name ? name + ' | ' : '') + 'In-House D&D';
  }
  const recordTypes = {
    map_part: { name: "Map Part", title: "Part name", summary: "Description", status: "Type", notes: "Placement notes" },
    artwork: { name: 'Artwork', title: 'Artwork name', summary: 'Description', status: 'Status', notes: 'Additional notes' },
    campaign: { name: 'Campaign Overview', title: 'Campaign name', summary: 'Premise and central conflict', status: 'Current tier or chapter', notes: 'Setting, tone, house rules, party goals, schedule, and other campaign notes' },
    chat: { name: 'Private Chat', title: 'Chat name', summary: 'What is this conversation about?', status: 'Participants', notes: 'Private chat description and context' },
    session: { name: 'Session Journal', title: 'Session title or number', summary: 'What happened this session?', status: 'Date played', notes: 'Key scenes, decisions, discoveries, rewards, unresolved threads, and plans for next time' },
    quest: { name: 'Quest', title: 'Quest or lead', summary: 'Objective', status: 'Status', notes: 'Quest giver, destination, clues, obstacles, rewards, and consequences' },
    encounter: { name: 'Encounter', title: 'Encounter name', summary: 'Situation and purpose', status: 'Difficulty or state', notes: 'Creatures, environment, tactics, initiative notes, treasure, and outcome' },
    character: { name: 'Player Character', title: 'Character name', summary: 'Ancestry, class, level, and player', status: 'Current condition', notes: 'Backstory, traits, ideals, bonds, flaws, abilities, and personal goals' },
    character_template: { name: 'Saved Character', title: 'Character name', summary: 'Ancestry, class, and appearance', status: 'Ready for adventure', notes: 'Backstory, traits, ideals, bonds, flaws, abilities, and reusable character notes' },
    npc: { name: 'Nonplayer Character', title: 'NPC name', summary: 'Role, appearance, and first impression', status: 'Disposition or state', notes: 'Motives, secrets, voice, relationships, location, and what the party knows' },
    location: { name: 'Location', title: 'Place name', summary: 'Region and first impression', status: 'Current state', notes: 'Features, inhabitants, points of interest, dangers, history, and travel connections' },
    faction: { name: 'Faction', title: 'Faction name', summary: 'Purpose and influence', status: 'Standing with party', notes: 'Leadership, goals, resources, territory, allies, rivals, symbols, and secrets' },
    item: { name: 'Item & Treasure', title: 'Item name', summary: 'Type, appearance, and owner', status: 'Location or attunement', notes: 'Properties, history, value, charges, clues, and how it was obtained' },
    spell: { name: 'Spell', title: 'Spell name', summary: 'Brief magical effect', status: 'Level and school', notes: 'Effect, components, scaling, limitations, and rulings' },
    attack: { name: 'Attack & Ability', title: 'Attack or ability name', summary: 'What the action does', status: 'Attack and damage', notes: 'Targets, saving throws, conditions, recharge, and special effects' },
    species: { name: 'Races & Species', title: 'Species name', summary: 'Size, speed and traits', status: 'Rules edition', notes: 'Traits, lineage choices, limitations and sources' },
    background: { name: 'Background', title: 'Background name', summary: 'Origin feat and proficiencies', status: 'Rules edition', notes: 'Ability scores, skills, tools, equipment and sources' },
    class: { name: 'Class', title: 'Class name', summary: 'Hit Die and primary abilities', status: 'Rules edition', notes: 'Features, progression, resources and sources' },
    feat: { name: 'Feat', title: 'Feat name', summary: 'Benefits and category', status: 'Prerequisites', notes: 'Benefits, restrictions, repeatability and sources' },
    lore: { name: 'Lore & Secret', title: 'Lore subject', summary: 'What is commonly known?', status: 'Known by whom?', notes: 'True history, deities, prophecy, hidden connections, sources, and revelations' },
    chronicle: { name: 'Chronicle', title: 'Title', summary: 'Summary', status: 'Status', notes: 'Detailed notes' }
  };

  function setRealmMenu(open) {
    $('body').toggleClass('realm-menu-open', open);
    $('#realmSidebar').attr('aria-hidden', String(!open));
    $('#realmMenuButton').attr('aria-expanded', String(open));
    if (open) {
      $('#realmMenuClose').trigger('focus');
    } else {
      $('#realmMenuButton').trigger('focus');
    }
  }

  $('#realmMenuButton').on('click', function () { setRealmMenu(true); });
  $('#realmMenuClose, #realmSidebarBackdrop').on('click', function () { setRealmMenu(false); });
  $(document).on('keydown', function (event) {
    if (event.key === 'Escape' && $('body').hasClass('realm-menu-open')) setRealmMenu(false);
  });

  $('#address').text(window.location.host);
  $('#year').text(new Date().getFullYear());
  function renderThemeToggle() {
    const dark = document.documentElement.dataset.theme === 'dark';
    $('#themeToggle').attr('aria-pressed', String(dark)).attr('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode').find('span').text(dark ? '☀' : '☾').end().find('b').text(dark ? 'Light' : 'Dark');
  }
  renderThemeToggle();
  $('#themeToggle').on('click', function () {
    const dark = document.documentElement.dataset.theme !== 'dark';
    if (dark) document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('in-house-theme', dark ? 'dark' : 'normal'); } catch (error) {}
    renderThemeToggle();
  });
  $('#copyButton').on('click', async function () {
    await navigator.clipboard.writeText(window.location.href);
    bootstrap.Toast.getOrCreateInstance($('#copyToast')[0], { delay: 1800 }).show();
  });

  async function api(path, options) {
    options = options || {};
    const timeout = AbortSignal.timeout(options.timeoutMs || (options.method && options.method !== 'GET' ? 300000 : 15000));
    const response = await fetch(path, Object.assign({}, options, {
      signal: options.signal ? AbortSignal.any([options.signal,timeout]) : timeout,
      headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {})
    }));
    const data = await response.json();
    if (!response.ok) {
      const message = data.error || 'Something went wrong.';
      if (/^\/api\/campaign\/\d+\/ai(?:\/|$)/.test(path) && /^(invalid request\.|api route not found\.)$/i.test(message)) {
        throw new Error('The LAN server is still running an older version. Restart the server, then reload this page.');
      }
      throw new Error(message);
    }
    return data;
  }

  async function uploadImage(file) {
    if (!file) return null;
    if (file.size > 5_000_000) throw new Error('That image is larger than 5 MB. Choose a smaller copy.');
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });
    let data;
    try { data = await response.json(); }
    catch (error) { throw new Error('The upload service is unavailable. Restart the LAN site and try again.'); }
    if (!response.ok) throw new Error(data.error || 'The image could not be uploaded.');
    return data;
  }

  function showImage(preview, imageId, fallback) {
    const element = $(preview);
    element.empty();
    if (imageId) $('<img>').attr('src', '/api/uploads/' + imageId).attr('alt', '').appendTo(element);
    else $('<span>').text(fallback || '✦').appendTo(element);
  }

  function renderAccount() {
    window.applyBrowserTranslation(user);
    $('#settingsForm [name=ui_language]').val(user?.ui_language || 'auto');
    $('#accountButton').empty();
    if (user) {
      if (user.avatar_id) $('<img class="account-avatar" alt="">').attr('src', '/api/uploads/' + user.avatar_id).appendTo('#accountButton');
      $('<span>').text(user.username).appendTo('#accountButton');
    } else {
      $('#accountButton').text('Sign in');
    }
    $('#signedOutView').toggleClass('d-none', !!user);
    $('#signedInView').toggleClass('d-none', !user);
    $('#currentUsername').text(user ? user.username : '');
    if (user) {
      $('#settingsForm [name=username]').val(user.username);
      $('#settingsForm [name=email]').val(user.email || '');
      $('#settingsForm [name=current_password], #settingsForm [name=new_password], #settingsForm [name=confirm_password]').val('');
      $('#settingsError, #settingsSuccess').text('');
      $('#settingsForm [name=avatar_id]').val(user.avatar_id || '');
      showImage('#profileImagePreview', user.avatar_id, '♙');
    }
    $('#newWorkButton').toggleClass('d-none', !user);
    $('#newCampaignButton,#importCampaignButton').toggleClass('d-none', !user);
    $('#newSavedCharacterButton').toggleClass('d-none', !user);
    $('#notificationButton').toggleClass('d-none', !user);
    $('#archiveTools').toggleClass('d-none', !user);
    $('#workspaceHint').text(user ? 'These chronicles are visible only to your account.' : 'Take an oath to keep private work in this stronghold.');
  }

  async function loadCommunity() {
    $('#communityFaces').empty();
    if (!user) return;
    const profiles = (await api('/api/community')).profiles;
    profiles.forEach(function (profile) {
      const source = profile.avatar_id ? '/api/avatars/' + profile.id : 'assets/profile-placeholder.svg';
      const username = profile.username || profile.display_name || 'Unknown adventurer';
      $('<span class="community-face" tabindex="0"><img alt=""><span class="community-tooltip"></span></span>')
        .attr({ title: username, 'aria-label': username })
        .find('img').attr({ src: source, alt: username }).on('error', function () { this.src = 'assets/profile-placeholder.svg'; }).end()
        .find('.community-tooltip').text(username).end()
        .appendTo('#communityFaces');
    });
    if (!profiles.length) $('#communityFaces').html('<span class="community-none">No profiles yet</span>');
  }

  async function loadNotifications() {
    if (!user) return;
    const notices = (await api('/api/notifications')).notifications;
    const unread = notices.filter(function (notice) { return !notice.read_at; }).length;
    $('#notificationCount').text(unread).toggleClass('d-none', !unread);
    $('#notificationList').empty();
    if (!notices.length) {
      $('#notificationList').html('<div class="notification-empty">No messages have arrived.</div>');
      return;
    }
    notices.forEach(function (notice) {
      const card = $('<article class="notification-card"><div><strong></strong><small></small></div><div class="notification-actions"></div></article>');
      if (!notice.read_at) card.addClass('unread');
      card.find('strong').text(notice.message);
      card.find('small').text(notice.created_at);
      if (notice.type === 'campaign_invite' && notice.invite_status === 'pending') {
        $('<button class="accept-invite" type="button">Accept</button>').attr('data-campaign', notice.campaign_id).appendTo(card.find('.notification-actions'));
        $('<button class="decline-invite" type="button">Decline</button>').attr('data-campaign', notice.campaign_id).appendTo(card.find('.notification-actions'));
      }
      $('#notificationList').append(card);
    });
  }

  function activeCampaign() {
    return items.find(function (item) { return item.id === activeCampaignId; }) || null;
  }

  function isAiCampaign(campaign) {
    campaign = campaign || activeCampaign();
    return !!(campaign && (campaign.content || {}).ai_dm);
  }

  function aiCharacters() {
    return items.filter(function (item) {
      const content = item.content || {};
      return Number(content.campaign_id) === activeCampaignId && content.category === 'character';
    });
  }

  function aiPersonaImage(personaType, personaId) {
    if (personaType === 'dm') return null;
    const character = items.find(function (item) { return item.id === Number(personaId); });
    const content = (character && character.content) || {};
    if (content.image_id) return '/api/uploads/' + content.image_id;
    if (content.owner_user_id) return '/api/avatars/' + content.owner_user_id;
    return 'assets/profile-placeholder.svg';
  }

  function appendAiMessageText(container, message) {
    ChatFormat.append(container[0], message);
  }

  function aiAudienceNames(ids) {
    ids = (ids || []).map(Number);
    if (!ids.length) return 'Everyone at the table';
    const names = (aiState && aiState.members || []).filter(function (member) { return ids.includes(Number(member.id)); }).map(function (member) { return member.username; });
    return names.length ? 'Private: ' + names.join(', ') : 'Private conversation';
  }

  const messageEditors = new Map();
  const editorKey = id => activeCampaignId + ':' + (activeAiChatId || '') + ':' + id;
  function editMessageInline(card, entry) {
    const campaignId = activeCampaignId, chatId = activeAiChatId, key = editorKey(entry.id);
    messageEditors.set(key, card);
    ChatEditor.open(card, entry, {
      complete: draft => api('/api/campaign/' + campaignId + '/ai/continue', {method:'POST', body:JSON.stringify({message_id:entry.id, draft})}),
      save: (message, image_ids) => api('/api/campaign/' + campaignId + '/ai/message/' + entry.id, {method:'PUT', body:JSON.stringify({message, image_ids, expected_message:entry.message, expected_image_ids:entry.image_ids || []})}),
      close: async () => {
        if (messageEditors.get(key) !== card) return;
        messageEditors.delete(key);
        if (activeCampaignId === campaignId && activeAiChatId === chatId) {
          renderAiMessages(aiState.messages || [], false);
          await loadAiCampaign(false);
        }
      }
    });
  }

  function renderAiMessages(messages, forceLatest) {
    const log = $('#aiChatLog');
    const imageCampaignId = activeCampaignId;
    const focusedDraft = log.find('.chat-message-draft:focus')[0];
    const selection = focusedDraft ? [focusedDraft.selectionStart, focusedDraft.selectionEnd] : null;
    const nearBottom = !!forceLatest || !log[0] || log[0].scrollHeight - log.scrollTop() - log.outerHeight() < 90;
    log.children('.ai-message-editing').detach();
    log.empty();
    if (!messages.length) {
      log.html('<div class="ai-chat-empty">The table is quiet. Choose who writes, choose who the AI answers as, then begin the tale.</div>');
      return;
    }
    messages.forEach(function (entry) {
      const editor = messageEditors.get(editorKey(entry.id));
      if (editor) {log.append(editor); return;}
      const card = $('<article class="ai-message"><header class="ai-message-head"><span class="ai-message-avatar"></span><span><strong></strong><small></small></span><span class="ai-message-tools"></span></header><div class="ai-message-copy"></div><div class="ai-message-media"></div><div class="ai-message-audience"></div></article>');
      const streaming = entry.generation_status === 'streaming';
      card.attr('data-message-id', entry.id).toggleClass('ai-message-dm', entry.persona_type === 'dm').toggleClass('ai-message-streaming', streaming).toggleClass('ai-message-error', entry.generation_status === 'error');
      const image = aiPersonaImage(entry.persona_type, entry.persona_id);
      if (image) $('<img alt="">').attr('src', image).on('error', function () { this.src = 'assets/profile-placeholder.svg'; }).appendTo(card.find('.ai-message-avatar'));
      else card.find('.ai-message-avatar').text('♛');
      card.find('.ai-message-head strong').text(entry.persona_name);
      card.find('.ai-message-head small').text((entry.author_username ? 'Written by ' + entry.author_username + ' · ' : '') + entry.created_at);
      ChatArt.render(card.find('.ai-message-copy')[0], entry, {
        text: (host, text) => ChatFormat.append(host, text, 0, entry.generation_status === 'streaming'),
        action: async (id, values) => {
          await api('/api/campaign/' + imageCampaignId + '/ai/art/' + id, {method:'POST', body:JSON.stringify(values)});
          if (values.action === 'save') await loadWork();
        },
        refresh: async () => {
          if (activeCampaignId !== imageCampaignId) return;
          await loadAiCampaign(false);
          if (aiState) renderAiMessages(aiState.messages || [], false);
        }
      });
      ChatImages.display(card.find('.ai-message-media')[0], entry.image_ids);
      const audience = entry.audience_user_ids || [];
      card.find('.ai-message-audience').text(aiAudienceNames(audience));
      if (entry.addressed_to_ai) $('<span class="ai-addressed-mark" title="This was sent to Ollama">✦ AI</span>').prependTo(card.find('.ai-message-audience'));
      const canChange = !streaming && !!(aiState.creator || Number(entry.user_id) === Number(user && user.id));
      if (canChange) $('<button type="button" data-ai-message-action="regenerate" title="Regenerate with guidance">↻</button>').appendTo(card.find('.ai-message-tools'));
      if (canChange) $('<button type="button" data-ai-message-action="edit" title="Edit message">✎</button>').appendTo(card.find('.ai-message-tools'));
      if (canChange) $('<button type="button" data-ai-message-action="delete" title="Delete message">×</button>').appendTo(card.find('.ai-message-tools'));
      if (canChange) card.on('dblclick', function (event) {
        if ($(event.target).closest('button,a,input,textarea,.chat-art').length) return;
        editMessageInline(card[0], entry);
      });
      log.append(card);
    });
    if (focusedDraft && document.contains(focusedDraft)) {focusedDraft.focus({preventScroll:true}); focusedDraft.setSelectionRange(...selection);}
    if (nearBottom && !focusedDraft && log[0]) {
      log.scrollTop(log[0].scrollHeight);
      requestAnimationFrame(function () { if (log[0]) log.scrollTop(log[0].scrollHeight); });
    }
  }

  function clearAiUndo() {
    aiUndoDeletion = null;
    $('#aiUndoDelete').addClass('d-none');
  }

  function makeAiPersonaCard(persona, selected, compact) {
    const card = $('<button class="party-card ai-persona-card" type="button"><span class="party-portrait"></span><strong></strong></button>');
    card.toggleClass('ai-dm-card', persona.type === 'dm').toggleClass('ai-persona-selected', !!selected);
    const image = aiPersonaImage(persona.type, persona.id);
    if (image) $('<img alt="">').attr('src', image).on('error', function () { this.src = 'assets/profile-placeholder.svg'; }).appendTo(card.find('.party-portrait'));
    else card.find('.party-portrait').text('♛');
    card.find('strong').text(persona.name);
    return card;
  }

  function aiPersonas() {
    const participants = aiState && aiState.chat && (aiState.chat.content || {}).participant_ids;
    const characters = Array.isArray(participants) ? aiCharacters().filter(function (character) { return participants.map(Number).includes(character.id); }) : aiCharacters();
    return (aiState?.conversation_mode && aiState.conversation_mode !== 'dnd' ? [] : [{ type: 'dm', id: null, name: 'AI Dungeon Master', summary: 'Narrator and world' }]).concat(characters.map(function (character) {
      return { type: 'character', id: character.id, name: character.title, summary: (character.content || {}).summary || 'Campaign character', owner_user_id: Number((character.content || {}).owner_user_id) || null };
    }));
  }

  function renderAiPersonas() {
    $('#aiConversationMode').prop('disabled', !aiState?.can_change_mode || aiReplyBusy);
    const personas = aiPersonas();
    const fallback = personas[0] || {type:'none',id:null,name:'Choose a character'};
    if (!personas.some(function (persona) { return persona.type === activeAiReplyPersona.type && Number(persona.id || 0) === Number(activeAiReplyPersona.id || 0); })) activeAiReplyPersona = fallback;
    if (!personas.some(function (persona) { return persona.type === activeAiSpeaker.type && Number(persona.id || 0) === Number(activeAiSpeaker.id || 0); })) activeAiSpeaker = fallback;
    const dock = $('#aiPersonaDock').empty();
    activeAiToolsPersona = activeAiSpeaker;
    personas.forEach(function (persona) {
      const selected = persona.type === activeAiReplyPersona.type && Number(persona.id || 0) === Number(activeAiReplyPersona.id || 0);
      makeAiPersonaCard(persona, selected, false).attr('title', 'Ask Ollama to answer as ' + persona.name).prop('disabled', aiReplyBusy).on('click', function () {
        requestAiResponse(persona);
      }).appendTo(dock);
    });
    if (!personas.length) dock.text('Add a character to this chat to begin.');
    const menu = $('#aiSpeakerMenu').empty();
    personas.forEach(function (persona) {
      const selected = persona.type === activeAiSpeaker.type && Number(persona.id || 0) === Number(activeAiSpeaker.id || 0);
      const button = makeAiPersonaCard(persona, selected, true).on('click', function () {
        activeAiSpeaker = persona;
        activeAiToolsPersona = persona;
        $('#aiSpeakerMenu').addClass('d-none');
        $('#aiSpeakerButton').attr('aria-expanded', 'false');
        renderAiPersonas();
      });
      menu.append(button);
    });
    $('#aiChatForm button[type=submit]').prop('disabled', activeAiSpeaker.type === 'none');
    $('#aiSpeakerButton').attr('title', 'You will write as ' + activeAiSpeaker.name).empty();
    const speakerImage = aiPersonaImage(activeAiSpeaker.type, activeAiSpeaker.id);
    if (speakerImage) $('<img alt="">').attr('src', speakerImage).on('error', function () { this.src = 'assets/profile-placeholder.svg'; }).appendTo('#aiSpeakerButton');
    else $('#aiSpeakerButton').text('♛');
    renderDashboard();
  }

  function renderAiPersonaRecords() {
    const target = activeAiReplyPersona;
    let ownerId = null;
    if (target.type === 'character') {
      const character = items.find(function (item) { return item.id === Number(target.id); });
      ownerId = Number((character && character.content || {}).owner_user_id) || null;
    }
    const records = items.filter(function (item) {
      const content = item.content || {};
      if (Number(content.campaign_id) !== activeCampaignId || ['campaign','map_part'].includes(content.category)) return false;
      if (target.type === 'dm') return !!aiState.creator;
      const links = content.category === 'item' ? content.owner_ids : ['spell','attack'].includes(content.category) ? content.user_ids : [];
      const granted = !content.reference_only && (links || []).map(Number).includes(Number(target.id));
      return granted || content.category === 'character' || !!content.player_visible || (content.assigned_user_ids || []).map(Number).includes(ownerId);
    });
    $('#aiPersonaRecordsTitle').text(target.type === 'dm' ? 'Dungeon Master archive' : target.name + "'s tools");
    const shelf = $('#aiPersonaRecords').empty();
    if (!records.length) {
      shelf.html('<span class="ai-record-empty">No assigned cards yet.</span>');
      return;
    }
    records.forEach(function (item) {
      const content = item.content || {};
      const card = $('<button class="ai-persona-record-card" type="button"><span></span><span><strong></strong><small></small></span></button>');
      if (content.image_id) $('<img alt="">').attr('src', '/api/uploads/' + content.image_id).appendTo(card.children().first());
      else card.children().first().text(recordSigils[content.category] || '✦');
      card.find('strong').text(item.title);
      card.find('small').text((recordTypes[content.category] || recordTypes.chronicle).name);
      card.on('click', function () { openDetail(item); }).appendTo(shelf);
    });
  }

  async function requestAiResponse(persona) {
    if (aiReplyBusy || !activeCampaignId || !persona) return;
    const campaignId=activeCampaignId, chatId=activeAiChatId, scope=campaignId+':'+(chatId||0);
    const requestToken={};
    aiReplyRequests.set(scope,requestToken);
    const current=()=>campaignId===activeCampaignId&&chatId===activeAiChatId;
    aiReplyBusy = true;
    activeAiReplyPersona = persona;
    clearAiUndo();
    $('#aiChatError').text('');
    renderAiPersonas();
    if (aiState) {
      aiState.messages = (aiState.messages || []).filter(function (entry) { return entry.id !== 'local-streaming'; });
      aiState.messages.push({ id: 'local-streaming', user_id: null, persona_type: persona.type, persona_id: persona.id, persona_name: persona.name, role: 'assistant', addressed_to_ai: true, audience_user_ids: [], message: '', generation_status: 'streaming', created_at: 'Generating now' });
      renderAiMessages(aiState.messages, true);
    }
    const progressTimer = setInterval(function () { if(current())loadAiCampaign(true); }, 1000);
    try {
      const result = await api('/api/campaign/' + campaignId + '/ai/respond', {
        method: 'POST', timeoutMs:360000,
        body: JSON.stringify({ chat_id: chatId, reply_as_type: persona.type, reply_as_id: persona.id })
      });
      if(!current())return;
      if (result.cards && result.cards.length) await loadWork();
      await loadAiCampaign(false);
    } catch (error) {
      if(!current())return;
      $('#aiChatError').text(error.message);
      await loadAiCampaign(true);
    } finally {
      clearInterval(progressTimer);
      if(aiReplyRequests.get(scope)===requestToken)aiReplyRequests.delete(scope);
      if(current()){
        aiReplyBusy = (aiState?.messages||[]).some(entry=>entry.generation_status==='streaming'&&entry.id!=='local-streaming');
        renderAiPersonas();
      }
    }
  }

  function renderAiAudience() {
    const holder = $('#aiChatAudience').empty();
    const fixed = aiState && aiState.chat && (aiState.chat.content || {}).assigned_user_ids || [];
    $('<label><input type="checkbox" value="all" checked> Everyone</label>').toggleClass('d-none', !!aiState.chat).appendTo(holder);
    (aiState.members || []).filter(function (member) { return member.role === 'member'; }).forEach(function (member) {
      $('<label><input type="checkbox"><span></span></label>').find('input').val(member.id).prop('checked', fixed.map(Number).includes(Number(member.id))).prop('disabled', !!aiState.chat).end().find('span').text(member.username).end().appendTo(holder);
    });
    $('.ai-chat-audience').toggleClass('d-none', true);
  }

  let displayedAiWorld = '';
  function setAiWorld(world) {
    world = world || {};
    displayedAiWorld = JSON.stringify([activeCampaignId, world]);
    $('#aiWorldLocation').val(world.location || '');
    $('#aiWorldTime').val(world.time || 'Day');
    $('#aiWorldWeather').val(world.weather || 'Clear');
    $('#aiWorldVisibility').val(world.visibility || 'Clear');
    $('#aiWorldTemperature').val(world.temperature || 'Mild');
    $('#aiWorldDanger').val(world.danger || 'Safe');
    $('#aiWorldPace').val(world.pace || 'Exploration');
    $('#aiWorldMood').val(world.mood || '');
    $('.ai-world-rail input,.ai-world-rail select,#aiWorldSave').prop('disabled', !aiState.creator);
  }

  function aiWorldValues() {
    return { location: $('#aiWorldLocation').val(), time: $('#aiWorldTime').val(), weather: $('#aiWorldWeather').val(), visibility: $('#aiWorldVisibility').val(), temperature: $('#aiWorldTemperature').val(), danger: $('#aiWorldDanger').val(), pace: $('#aiWorldPace').val(), mood: $('#aiWorldMood').val() };
  }

  function renderAiState(forceFields, forceLatest) {
    chatAttachments.setScope(String(activeCampaignId) + ':' + String(activeAiChatId), items.filter(item => Number(item.content?.campaign_id) === Number(activeCampaignId) && item.content?.image_id));
    $('#aiChatTitle').text(aiState.chat ? aiState.chat.title : 'Main story');
    window.ChatFullscreen?.setTitle(aiState.chat ? aiState.chat.title : 'Main story');
    renderAiMessages(aiState.messages || [], forceLatest);
    renderAiPersonas();
    renderAiPersonaRecords();
    $('#aiConversationMode').val(aiState.conversation_mode || 'dnd').prop('disabled', !aiState.can_change_mode || aiReplyBusy);
    $('#aiConversationModeHelp').text({dnd:'Talk with the DM, ask questions, or continue the adventure.',medieval:'Natural character conversation in a medieval world.',modern:'Everyday contemporary conversation, guided by each character’s personality.'}[aiState.conversation_mode || 'dnd'] + (aiState.can_change_mode ? '' : ' The campaign creator sets this chat’s style.'));
    $('#aiConversationMode').attr('title', $('#aiConversationModeHelp').text());
    $('#aiStoryToggle').toggleClass('d-none', !aiState.creator);
    $('#aiChatGenerators [data-generate-record]').each(function () { $(this).toggleClass('d-none', this.dataset.generateRecord !== 'character' && !aiState.creator); });
    if (displayedAiWorld !== JSON.stringify([activeCampaignId, aiState.world || {}]) && !$('.ai-world-rail input,.ai-world-rail select').is(':focus')) setAiWorld(aiState.world || {});
    if (forceFields) {
      $('#aiStory').val(aiState.story || '');
      $('#aiMemory').val(aiState.memory || '');
      $('#aiStoryMode').val(aiState.story_mode || 'adaptive');
      setAiWorld(aiState.world || {});
      renderAiAudience();
    }
  }

  async function loadAiStatus(version=aiScopeVersion) {
    const status = await api('/api/ai/status');
    if(version!==aiScopeVersion)return;
    const models = status.models || [];
    const select = $('#aiModel').empty();
    const helpers = $('#aiHelperModels').empty();
    models.forEach(function (name) { $('<option></option>').val(name).text(name).appendTo(select); });
    models.forEach(function (name) { $('<option></option>').val(name).text(name).appendTo(helpers); });
    if (aiState && aiState.model && !models.includes(aiState.model)) $('<option></option>').val(aiState.model).text(aiState.model + ' (not currently available)').prependTo(select);
    if (aiState && aiState.model) select.val(aiState.model);
    helpers.val((aiState && aiState.helper_models || []).slice(0, 3));
    $('#aiDmConnection').text(status.available ? 'Ollama is ready on the server computer.' : 'Ollama is unavailable: ' + (status.error || 'start Ollama on the server computer.'));
  }

  async function loadAiCampaign(silent) {
    if (!activeCampaignId || !isAiCampaign() || aiSyncBusy) return;
    const version=aiScopeVersion, campaignId=activeCampaignId, chatId=activeAiChatId;
    const controller=new AbortController();aiSyncController=controller;
    aiSyncBusy = true;
    try {
      const state = await api('/api/campaign/' + campaignId + '/ai' + (chatId ? '?chat_id=' + chatId : ''), {signal:controller.signal});
      if(version!==aiScopeVersion)return;
      const signature = JSON.stringify({ messages: (state.messages || []).map(function (entry) { return [entry.id, entry.message, entry.generation_status, entry.image_ids, entry.art]; }), world: state.world || {}, mode: state.conversation_mode, canChangeMode: state.can_change_mode, participants: state.chat?.content?.participant_ids });
      const firstLoad = !aiState;
      aiState = state;
      if($('#aiChatError').text().startsWith('Could not refresh this conversation.'))$('#aiChatError').text('');
      aiReplyBusy=aiReplyRequests.has(campaignId+':'+(chatId||0))||(state.messages||[]).some(entry=>entry.generation_status==='streaming');
      if (aiUndoDeletion && Number(aiUndoDeletion.chatId || 0) === Number(activeAiChatId || 0)) {
        const newestId = (state.messages || []).reduce(function (latest, entry) { return Math.max(latest, Number(entry.id) || 0); }, 0);
        if (newestId > aiUndoDeletion.guardId) clearAiUndo();
      }
      if (firstLoad || signature !== aiMessageSignature || !silent) renderAiState(firstLoad || !silent || !state.creator, firstLoad || !silent);
      aiMessageSignature = signature;
      if (firstLoad || !silent) loadAiStatus(version).catch(error=>{if(version===aiScopeVersion)$('#aiDmConnection').text('Ollama status unavailable: '+error.message);});
    } catch (error) {
      if(version===aiScopeVersion&&error.name!=='AbortError')$('#aiChatError').text('Could not refresh this conversation. Retrying automatically. '+error.message);
    } finally { if(aiSyncController===controller){aiSyncController=null;aiSyncBusy=false;} }
  }

  function resetAiRequests() {
    aiScopeVersion++;
    if(aiSyncController)aiSyncController.abort();
    aiSyncController=null;aiSyncBusy=false;
    aiReplyBusy=aiReplyRequests.has(activeCampaignId+':'+(activeAiChatId||0));
    $('#aiChatError').text('');
  }

  function stopAiSync() {
    resetAiRequests();
    messageEditors.clear();
    window.ChatFullscreen?.exit();
    chatAttachments.clear();
    clearInterval(aiSyncTimer);
    aiSyncTimer = null;
    aiSyncBusy = false;
    aiState = null;
    aiMessageSignature = '';
    $('#aiChatLog').empty();
    $('#aiPersonaDock').empty();
  }

  async function selectAiChat(chatId) {
    chatAttachments.clear();
    clearAiUndo();
    activeAiChatId = Number(chatId) || null;
    resetAiRequests();
    activeSection = null;
    aiState = null;
    aiMessageSignature = '';
    $('#aiChatLog').empty().append($('<p>').text('Loading conversation…'));
    $('#aiPersonaDock').empty();
    renderWork();
    setRealmMenu(false);
    await loadAiCampaign(false);
    const target = $('#aiCampaignPanel')[0];
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function isMapLibrary() {
    return !!user && !!activeCampaignId && activeSection === 'location' && !isAiCampaign();
  }

  async function showMapDetails(map, data) {
    const selection={id:map.id,campaignId:activeCampaignId,creator:data.creator};
    mapDetailsSelection=selection;
    $('#mapDetailsTitle').text(map.title);
    $('#mapDetailsStatus').text(map.id===data.viewer_map_id?'Your current map':data.creator?'Campaign map':'Previously visited');
    $('#mapDetailsHelp').text(data.creator?'Open this map to view or edit it. Players stay in their own locations.':'Travel to another location by clicking a connected part on your current map.');
    $('#mapDetailsOpen').prop('hidden',!data.creator).prop('disabled',false);
    $('#mapRenameForm').prop('hidden',!data.creator);
    $('#mapRenameTitle').val(map.title);
    $('#mapDetailsError').text('');
    const fields=$('#mapDetailsFields').empty();
    const field=(label,value)=>{if(value)fields.append($('<dt class="col-5">').text(label),$('<dd class="col-7">').text(value));};
    field('Map type',map.kind.toUpperCase());
    mapDetailsModal.show();
    try {
      const details=await api('/api/campaign/'+selection.campaignId+'/maps/'+map.id);
      if(mapDetailsSelection!==selection)return;
      const scene=details.state?.scene||{};
      for(const [key,label] of [['location','Location'],['time','Time of day'],['weather','Weather'],['mood','Mood']])field(label,scene[key]);
    }catch(error){if(mapDetailsSelection===selection)$('#mapDetailsError').text(error.message);}
  }
  $('#mapDetailsModal').on('hidden.bs.modal',()=>{mapDetailsSelection=null;});
  $('#mapRenameForm').on('submit',async function(event){
    event.preventDefault();const selection=mapDetailsSelection;
    if(!selection?.creator||selection.campaignId!==activeCampaignId)return;
    const submit=$(this).find('[type=submit]').prop('disabled',true);
    try{
      const result=await api('/api/campaign/'+selection.campaignId+'/maps/'+selection.id+'/rename',{method:'PUT',body:JSON.stringify({title:$('#mapRenameTitle').val()})});
      if(mapDetailsSelection!==selection)return;
      $('#mapDetailsTitle').text(result.title);$('#mapRenameTitle').val(result.title);$('#mapDetailsError').text('');
      if(mapLibrary)mapLibrary.checkedAt=0;
      await refreshMapLibrary();
    }catch(error){if(mapDetailsSelection===selection)$('#mapDetailsError').text(error.message);}
    finally{submit.prop('disabled',false);}
  });
  $('#mapDetailsOpen').on('click',async function(){
    const selection=mapDetailsSelection;
    if(!selection?.creator||openingLocationMap||selection.campaignId!==activeCampaignId)return;
    openingLocationMap=true;this.disabled=true;
    try{
      const opened=await window.MapWorkspace.openMap(selection.id);
      if(!opened||selection.campaignId!==activeCampaignId)return;
      $('#mapDetailsModal').one('hidden.bs.modal',()=>{if(selection.campaignId===activeCampaignId){activeSection=null;renderWork();$('#mapWorkspaceSelect').trigger('focus');}});
      mapDetailsModal.hide();
    }catch(error){$('#mapDetailsError').text(error.message);}
    finally{openingLocationMap=false;this.disabled=false;}
  });

  function renderMapCards() {
    if (!isMapLibrary()) return;
    const focusedMap=document.activeElement?.closest('.location-map-card')?.dataset.mapId;
    const list = $('#workList').empty();
    if (!mapLibrary || mapLibrary.campaignId !== activeCampaignId || mapLibrary.viewer !== user.id || !mapLibrary.data) {
      $('<p class="empty-state" role="status">').text(mapLibrary?.error || 'Loading campaign maps…').appendTo(list);
      return;
    }
    const query = ($('#recordSearch').val() || '').trim().toLowerCase();
    const data = mapLibrary.data;
    const maps = data.maps.filter(map => [map.title,map.kind].join(' ').toLowerCase().includes(query));
    if (mapLibrary.error) $('<p class="map-library-status" role="status">').text(mapLibrary.error).appendTo(list);
    if (!maps.length) $('<p class="empty-state">').text(query ? 'No matching maps. Try another search.' : 'No maps yet. The DM can create one with New map.').appendTo(list);
    maps.forEach(map => {
      const selected = map.id === data.viewer_map_id;
      const card = $('<article class="work-card location-map-card" tabindex="0" role="button"><div class="card-art" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m5 10 12-4 14 4 12-4v32l-12 4-14-4-12 4Zm12-4v32m14-28v32"/><path d="m10 29 5-7 9 5 12-10m-3 0h3v3" stroke-dasharray="3 2"/><circle cx="25" cy="17" r="3"/></svg></div><div class="card-copy"><div class="work-card-category"></div><h3></h3><p></p><p class="work-card-meta"></p></div></article>');
      card.attr('data-map-id',map.id).attr('aria-label','View map details: '+map.title).toggleClass('current-map-card',selected);
      card.find('.work-card-category').text(map.kind.toUpperCase()+' map');
      card.find('h3').text(map.title);
      card.find('p').first().text(selected ? 'Your current map' : data.creator ? 'Campaign map' : 'Previously visited');
      card.find('.work-card-meta').text('View details →');
      card.on('click',()=>showMapDetails(map,data));
      list.append(card);
      if (String(map.id)===focusedMap) card[0].focus({preventScroll:true});
    });
  }

  async function refreshMapLibrary() {
    if (!isMapLibrary() || document.hidden) return;
    if (!mapLibrary || mapLibrary.campaignId!==activeCampaignId || mapLibrary.viewer!==user.id) {
      mapLibrary={campaignId:activeCampaignId,viewer:user.id,data:null,busy:false,checkedAt:0,error:''};
    }
    const library=mapLibrary;
    if (library.busy || Date.now()-library.checkedAt<900) return;
    library.busy=true;
    try {
      const data=await api('/api/campaign/'+library.campaignId+'/maps',{signal:AbortSignal.timeout(10000)});
      const signature=JSON.stringify([data.active_map_id,data.viewer_map_id,data.creator,data.maps.map(map=>[map.id,map.title,map.kind])]);
      const changed=library.error || library.signature!==signature;
      library.signature=signature;
      library.data=data;library.error='';
      if (changed && mapLibrary===library && isMapLibrary() && activeCampaignId===library.campaignId) renderMapCards();
    } catch (error) {
      library.error='Maps could not be refreshed. Reconnecting…';
      if (mapLibrary===library && isMapLibrary() && activeCampaignId===library.campaignId) renderMapCards();
    } finally { library.busy=false;library.checkedAt=Date.now(); }
  }

  function renderWork() {
    renderCharacterLoadout();
    const artworkCampaignId = activeCampaignId;
    const view = !activeCampaignId ? 'library' : activeSection === 'art' ? 'art' : activeSection === 'atelier' ? 'spell' : activeSection ? 'archive' : 'table';
    document.body.dataset.campaignView = view;
    $('#campaignDashboard').toggleClass('archive-mode', view === 'archive');
    if (window.MapWorkspace) window.MapWorkspace.setVisible(!!activeCampaignId && !isAiCampaign() && !activeSection);
    if (window.SpellAtelier) window.SpellAtelier.setActive(activeSection === 'atelier' && !!activeCampaignId, activeCampaignId, user && user.id);
    if (window.ArtAtelier) window.ArtAtelier.setActive(activeSection === 'art' && !!activeCampaignId, activeCampaignId, user && user.id, {
      referenceRecords: items.filter(item => Number(item.content?.campaign_id) === Number(activeCampaignId) && Number(item.content?.image_id) > 0),
      records: items.filter(item => user && ['item','character','npc'].includes((item.content || {}).category) && Number(item.content.campaign_id) === activeCampaignId && (item.user_id === user.id || Number(item.content.owner_user_id) === Number(user.id) || items.find(c => c.id === activeCampaignId)?.membership_role === 'creator')),
      archive: async function(title, description, blob, recipe) {
        const campaignId=artworkCampaignId;
        if(!campaignId)throw new Error('Open a campaign first.');
        const image=await uploadImage(blob);
        await api('/api/work',{method:'POST',body:JSON.stringify({title,content:{category:'artwork',campaign_id:campaignId,summary:description,image_id:image.image_id,...(recipe?{art_recipe:recipe}:{})}})});
        await loadWork();
      },
      save: async function(id, blob) {
        const latest = (await api('/api/work')).items.find(item => item.id === Number(id));
        if (!latest || Number(latest.content.campaign_id) !== activeCampaignId) throw new Error('This record is no longer available.');
        const image = await uploadImage(blob);
        await api('/api/work/' + latest.id, {method:'PUT', body:JSON.stringify({title:latest.title,content:Object.assign({}, latest.content, {image_id:image.image_id})})});
        await loadWork();
      }
    });
    if (activeSection === 'art' && activeCampaignId) {
      if (window.campaignMap) window.campaignMap.deactivate();
      setPageTitle('Art Atelier — ' + $('#activeCampaignName').text());
      return;
    }
    if (activeSection === 'atelier' && activeCampaignId) {
      if (window.campaignMap) window.campaignMap.deactivate();
      setPageTitle('Spell Atelier — ' + $('#activeCampaignName').text());
      return;
    }
    if (activeCampaignId && isAiCampaign() && !activeSection) {
      $('#campaignRecords,#mapPlaceholder').addClass('d-none');
      $('#aiCampaignPanel').removeClass('d-none');
      if (window.campaignMap) window.campaignMap.deactivate();
      return;
    }
    if (!activeCampaignId || !activeSection) {
      $('#campaignRecords').addClass('d-none');
      $('#aiCampaignPanel').addClass('d-none');
      $('#mapPlaceholder').toggleClass('d-none', !window.MapWorkspace?.active || window.MapWorkspace.kind !== '3d');
      if (activeCampaignId && window.campaignMap && (window.MapWorkspace?.active && window.MapWorkspace.kind === '3d')) window.campaignMap.activate();
      return;
    }
    $('#campaignRecords').removeClass('d-none');
    $('#mapPlaceholder,#aiCampaignPanel').addClass('d-none');
    if (window.campaignMap) window.campaignMap.deactivate();
    const config = recordTypes[activeSection] || recordTypes.chronicle;
    $('#recordsEyebrow').text('CAMPAIGN ARCHIVE');
    $('#recordsTitle').text(config.name==='Artwork'?'Artwork':config.name==='Class'?'Classes':config.name + (config.name.endsWith('s') ? '' : 's'));
    const campaign = items.find(function (item) { return item.id === activeCampaignId; });
    const mayCreateCharacter = activeSection === 'character' && !items.some(item => Number(item.content?.campaign_id) === activeCampaignId && isOwnCharacter(item));
    $('#addSectionRecord').toggleClass('d-none', !campaign || (campaign.membership_role !== 'creator' && !mayCreateCharacter));
    $('#addSectionRecord').html(isMapLibrary()?'<span>＋</span> New map':'<span>＋</span> Add');
    $('#recordSearch').attr('placeholder',isMapLibrary()?'Search maps…':'Search this archive…').attr('aria-label',isMapLibrary()?'Search maps':'Search records');
    setPageTitle(config.name + ' — ' + $('#activeCampaignName').text());
    if(!$('#partTypeFilter').length) $('<select id="partTypeFilter" class="form-control" aria-label="Filter map parts by type"><option value="">All part types</option></select>').append(MapPartCards.groups().map(g=>$('<option>').val(g).text(MapPartCards.names[g]||g))).insertAfter('#recordLibraryFilter').on('change',renderWork);
    $('#partTypeFilter').prop('hidden',activeSection!=='map_part');
    $('#recordLibraryFilter').prop('hidden',activeSection==='map_part'||isMapLibrary());
    $('#workList').toggleClass('map-library',isMapLibrary());
    $('.tt-record-search').toggleClass('map-library-search',isMapLibrary());
    if (isMapLibrary()) {
      $('#recordsEyebrow').text('CAMPAIGN MAPS');
      $('#workList').removeClass('parts-catalog');
      renderMapCards();
      refreshMapLibrary();
      return;
    }
    const visible = items.filter(function (item) {
      const c = item.content || {};
      const query = ($('#recordSearch').val() || '').trim().toLowerCase();
      const kind = $('#recordLibraryFilter').val();
      return Number(c.campaign_id) === activeCampaignId && c.category === activeSection &&
        !(c.category === 'item' && c.loot_source_record_id && !c.reference_only) &&
        (!query || [item.title, c.summary, c.tags, c.item_type, c.rarity, c.school, c.part_group, c.part_type].join(' ').toLowerCase().includes(query)) &&
        (activeSection === 'map_part' ? (!$('#partTypeFilter').val() || c.part_group === $('#partTypeFilter').val()) : (!kind || (kind === 'reference' ? !!c.reference_only : !c.reference_only)));
    });
    $('#workList').empty().toggleClass('parts-catalog',activeSection==='map_part');
    if(activeSection==='map_part') visible.sort((a,b)=>MapPartCards.groups().indexOf(a.content.part_group)-MapPartCards.groups().indexOf(b.content.part_group)||a.title.localeCompare(b.title));
    let partGroup=null;
    if (activeSection === 'chat' && isAiCampaign()) {
      const chats = [{ id: 0, title: 'Main story', content: { category: 'chat', summary: 'The shared campaign conversation', player_visible: true } }].concat(visible);
      chats.forEach(function (chat) {
        const card = $('<article class="work-card ai-chat-card" tabindex="0" role="button"><div class="card-art"><span>☵</span></div><div class="card-copy"><div class="work-card-category">Campaign chat</div><h3></h3><p></p><p class="work-card-meta"></p></div></article>');
        card.attr('data-chat-id', chat.id).toggleClass('important-card', Number(chat.id || 0) === Number(activeAiChatId || 0));
        card.find('h3').text(chat.title);
        card.find('p').first().text((chat.content || {}).summary || 'A private campaign conversation');
        const assigned = ((chat.content || {}).assigned_user_ids || []).map(Number);
        const names = aiState && (aiState.members || []).filter(function (member) { return assigned.includes(Number(member.id)); }).map(function (member) { return member.username; });
        card.find('.work-card-meta').text(chat.id ? (names && names.length ? 'Private · ' + names.join(', ') : 'DM-only chat') : 'Everyone in the campaign');
        card.on('click', function () { selectAiChat(chat.id); });
        card.on('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectAiChat(chat.id); } });
        $('#workList').append(card);
      });
      return;
    }
    if (!visible.length) {
      $('#workList').html('<div class="empty-state">No matching records. Clear the search or use Add to create one.</div>');
      return;
    }
    visible.forEach(function (item) {
      if(activeSection==='map_part'&&partGroup!==item.content.part_group){partGroup=item.content.part_group;const group=partGroup,heading=$('<div class="part-type-heading">'),toggle=$('<button type="button" class="part-type-toggle">').attr('aria-expanded',String(!MapPartCards.collapsed.has(group))).text((MapPartCards.collapsed.has(group)?'▸ ':'▾ ')+(MapPartCards.names[group]||group)+' ('+visible.filter(r=>r.content.part_group===group).length+')').on('click',()=>{if(MapPartCards.collapsed.has(group))MapPartCards.collapsed.delete(group);else MapPartCards.collapsed.add(group);renderWork();$('#workList .part-type-toggle').filter((i,b)=>b.dataset.partGroup===group).trigger('focus');});toggle.attr('data-part-group',group).appendTo(heading);if(campaign?.membership_role==='creator')$('<button type="button">').text('+ New '+(MapPartCards.names[group]||group)+' card').on('click',()=>{$('#partTypeFilter').val(group);openRecord('map_part');}).appendTo(heading);$('#workList').append(heading);}
      const card = $('<article class="work-card" tabindex="0" role="button"><div class="card-art"><span></span></div><div class="card-copy"><div class="work-card-category"></div><h3></h3><p></p><p class="work-card-meta"></p></div><div class="work-actions"><button class="delete-work" type="button" aria-label="Delete record">×</button></div></article>');
      card.attr('data-id', item.id);
      if(activeSection==='map_part') card.attr('data-part-group',item.content.part_group).prop('hidden',MapPartCards.collapsed.has(item.content.part_group));
      const mayManage = campaign && (campaign.membership_role === 'creator' || ((item.content||{}).category==='artwork' && item.user_id===user.id) || ((item.content || {}).category === 'character' && Number((item.content || {}).owner_user_id) === user.id));
      if (!mayManage) card.find('.delete-work').remove();
      if (item.content && (item.content.important || isOwnCharacter(item))) card.addClass('important-card');
      const category = item.content && item.content.category ? item.content.category : 'chronicle';
      if (StarterArt.url(item)) {
        card.find('.card-art').addClass('has-image').empty().append($('<img loading="lazy" decoding="async">').attr('src', StarterArt.url(item)).attr('alt', ''));
      } else {
        card.find('.card-art span').text(recordSigils[category] || '✦');
      }
      card.find('.work-card-category').text(category==='map_part'?(MapPartCards.names[item.content.part_group]||item.content.part_group):(recordTypes[category] || recordTypes.chronicle).name);
      card.find('h3').text(item.title);
      card.find('p').first().text((item.content && (item.content.summary || item.content.notes)) || 'No notes');
      const meta = [item.content && item.content.role, item.content && item.content.affiliation, item.content && item.content.state, item.content && item.content.item_type, item.content && item.content.rarity, item.content && item.content.spell_level ? (item.content.spell_level === 'Cantrip' ? 'Cantrip' : 'Spell level ' + item.content.spell_level) : '', item.content && item.content.damage].filter(Boolean);
      card.find('.work-card-meta').text(category==='map_part'?(item.content.light_enabled?'Light source · ':'')+item.content.part_width+' × '+item.content.part_height:meta.join(' · '));
      $('#workList').append(card);
    });
  }

  function renderCampaigns() {
    const campaigns = items.filter(function (item) {
      return (item.content || {}).category === 'campaign';
    });
    const query = ($('#campaignSearch').val() || '').trim().toLowerCase();
    $('#campaignScroll').empty();
    if (!user) {
      $('#campaignScroll').html('<div class="campaign-empty">Sign in to reveal your campaigns.</div>');
      return;
    }
    campaigns.filter(function (campaign) {
      return !query || [campaign.title, (campaign.content || {}).summary].join(' ').toLowerCase().includes(query);
    }).forEach(function (campaign) {
      const orb = $('<div class="campaign-row" role="button" tabindex="0"><span class="campaign-circle"></span><span class="campaign-row-copy"><strong></strong><small></small></span><span class="campaign-enter">Enter realm →</span></div>');
      const content = campaign.content || {};
      if (content.ai_dm) orb.addClass('ai-campaign-row');
      if (content.image_id) $('<img alt="">').attr('src', '/api/uploads/' + content.image_id).appendTo(orb.find('.campaign-circle'));
      else orb.find('.campaign-circle').text('♛');
      orb.find('strong').text(campaign.title);
      orb.find('small').text((content.ai_dm ? 'AI DM · ' : '') + (content.summary || 'Open this campaign'));
      orb.on('click', function () { enterCampaign(campaign.id); });
      orb.on('keydown', function (event) {
        if (event.target !== this) return;
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); enterCampaign(campaign.id); }
      });
      if (campaign.membership_role === 'creator') {
        const actions=$('<span class="campaign-transfer-actions"></span>');
        $('<button type="button" class="campaign-export">Download campaign</button>').on('click',async function(event){event.stopPropagation();await CampaignTransfer.download(campaign,this);}).appendTo(actions);
        if (content.imported_players?.length) $('<button type="button" class="campaign-export">Assign players</button>').on('click',function(event){event.stopPropagation();CampaignTransfer.assignPlayers(campaign);}).appendTo(actions);
        orb.find('.campaign-enter').before(actions);
      }
      if (user.is_host) {
        $('<button class="host-campaign-delete" type="button" aria-label="Delete campaign">×</button>').on('click', async function (event) {
          event.stopPropagation();
          if (!confirm('Delete "' + campaign.title + '" and all of its campaign records? This cannot be undone.')) return;
          await api('/api/host/campaign/' + campaign.id, { method: 'DELETE' });
          await loadWork();
        }).appendTo(orb);
      }
      $('#campaignScroll').append(orb);
    });
    if (!$('#campaignScroll').children().length) $('#campaignScroll').html('<div class="campaign-empty">No campaigns match your search.</div>');
  }

  function savedCharacters() {
    return items.filter(function (item) {
      const content = item.content || {};
      return content.category === 'character_template' && (!item.user_id || Number(item.user_id) === Number(user && user.id));
    });
  }

  function renderSavedCharacters() {
    const list = $('#savedCharacterList').empty();
    if (!user) {
      list.html('<div class="saved-character-empty">Sign in to build reusable characters.</div>');
      return;
    }
    const characters = savedCharacters();
    if (!characters.length) {
      list.html('<button class="saved-character-empty saved-character-create" type="button">＋ Create your first reusable character</button>');
      list.find('.saved-character-create').on('click', function () { openRecord('character_template'); });
      return;
    }
    characters.forEach(function (character) {
      const content = character.content || {};
      const card = $('<article class="saved-character-card" role="button" tabindex="0"><span class="saved-character-portrait"></span><span class="saved-character-copy"><strong></strong><small></small></span><span class="saved-character-actions"><button class="saved-character-edit" type="button">Edit</button><button class="saved-character-delete" type="button" aria-label="Delete saved character">×</button></span></article>');
      if (content.image_id) $('<img alt="">').attr('src', '/api/uploads/' + content.image_id).appendTo(card.find('.saved-character-portrait'));
      else card.find('.saved-character-portrait').text('♙');
      card.find('.saved-character-copy strong').text(character.title);
      card.find('.saved-character-copy small').text(content.summary || 'Ready to import into a campaign');
      card.on('click', function (event) { if (!$(event.target).closest('.saved-character-actions').length) openRecord('character_template', character); });
      card.on('keydown', function (event) { if ((event.key === 'Enter' || event.key === ' ') && !$(event.target).is('button')) { event.preventDefault(); openRecord('character_template', character); } });
      card.find('.saved-character-edit').on('click', function () { openRecord('character_template', character); });
      card.find('.saved-character-delete').on('click', async function () {
        if (!confirm('Delete the saved character "' + character.title + '"? Campaign copies will not be affected.')) return;
        await api('/api/work/' + character.id, { method: 'DELETE' });
        await loadWork();
      });
      list.append(card);
    });
  }

  function enterCampaign(campaignId) {
    const campaign = items.find(function (item) { return item.id === Number(campaignId); });
    if (!campaign) return;
    const aiDm = isAiCampaign(campaign);
    stopAiSync();
    activeAiChatId = null;
    clearInterval(mapSyncTimer); mapSyncTimer = null;
    activeCampaignId = campaign.id;
    resetAiRequests();
    activeAiToolsPersona = { type: 'dm', id: null, name: 'AI Dungeon Master' };
    activeSection = null;
    $('#campaignLanding, .landing-hero, .landing-details').addClass('d-none');
    $('#campaignView').removeClass('d-none');
    $('#activeCampaignName').text(campaign.title);
    setPageTitle(campaign.title);
    $('#inviteButton').toggleClass('d-none', campaign.membership_role !== 'creator');
    $('.dm-map-tools').toggleClass('d-none', aiDm || campaign.membership_role !== 'creator');
    $('.player-map-tools').toggleClass('d-none', aiDm || campaign.membership_role === 'creator');
    $('.ai-world-rail').toggleClass('d-none', !aiDm);
    $('.ai-campaign-only').toggleClass('d-none', !aiDm);
    $('#aiDirectorConsole').toggleClass('d-none', !aiDm);
    $('#aiConversationStyle').toggleClass('d-none', !aiDm);
    $('#campaignDashboard').toggleClass('player-map-mode', !aiDm && campaign.membership_role !== 'creator').toggleClass('ai-dm-mode', aiDm);
    $('#campaignMapButton').removeClass('d-none');
    $('#spellAtelierButton,#artAtelierButton').removeClass('d-none');
    $('#campaignCenterNavTitle').text(aiDm ? 'Story Table' : 'Campaign Map');
    $('#campaignCenterNavHelp').text(aiDm ? 'Return to the shared AI campaign chat' : 'Return to the live adventuring map');
    $('body').addClass('inside-campaign');
    if (!aiDm) {
      window.MapWorkspace.start({campaign,user,items,api,getRecords:()=>items,onRefreshRecords:async()=>{await loadWork();renderDashboard();},onOpenRecord:openDetail,onIcons:renderMapIconFilters,onObjectSelect:openCheckpoint});
      const npcs=items.filter(item=>(item.content||{}).category==='npc'&&Number(item.content.campaign_id)===campaign.id);
      $('#mapObjectTools .map-npc-tool').remove();
      if(campaign.membership_role==='creator')npcs.forEach(npc=>$('<button type="button" class="map-npc-tool"></button>').text(npc.title+' · NPC').on('click',()=>window.campaignMap.beginNpcPlacement(npc.id)).appendTo('#mapObjectTools'));
    } else window.MapWorkspace.stop();
    if (aiDm) {
      if (window.campaignMap) window.campaignMap.deactivate();
      $('#mapPlaceholder').addClass('d-none');
      $('#aiCampaignPanel').removeClass('d-none');
      clearInterval(aiSyncTimer);
      aiSyncTimer = setInterval(function () { loadAiCampaign(true); }, 1200);
      loadAiCampaign(false);
    }
    renderParty();
    renderDashboard();
    renderWork();
    renderCampaignCharacterWorkshop();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function leaveCampaign() {
    if (window.MapWorkspace) window.MapWorkspace.stop();
    if (window.SpellAtelier) window.SpellAtelier.setActive(false);
    if (window.ArtAtelier) window.ArtAtelier.setActive(false);
    $('#spellAtelierButton,#artAtelierButton').addClass('d-none');
    stopAiSync();
    activeAiChatId = null;
    activeCampaignId = null;
    activeSection = null;
    document.body.dataset.campaignView = 'library';
    $('#campaignDashboard').removeClass('archive-mode');
    $('#campaignView').addClass('d-none');
    $('#campaignLanding, .landing-hero, .landing-details').removeClass('d-none');
    $('#campaignRecords').addClass('d-none');
    $('#mapPlaceholder').addClass('d-none').prop('hidden',true).prop('inert',true);
    $('#aiCampaignPanel,.ai-world-rail,#aiDirectorConsole').addClass('d-none');
    $('.ai-campaign-only').addClass('d-none');
    $('#campaignDashboard').removeClass('ai-dm-mode player-map-mode');
    if (window.campaignMap) window.campaignMap.deactivate();
    clearInterval(mapSyncTimer); mapSyncTimer = null;
    $('body').removeClass('inside-campaign');
    setPageTitle('Campaigns');
    $('#inviteButton').addClass('d-none');
    $('#campaignMapButton, #campaignCharacterArea').addClass('d-none');
    $('#campaignCenterNavTitle').text('Campaign Map');
    $('#campaignCenterNavHelp').text('Return to the live adventuring map');
    visibleCharacterItemId = null;
  }

  $('#homeLink').on('click', function (event) {
    event.preventDefault();
    if (activeCampaignId) leaveCampaign();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  function isOwnCharacter(item) {
    return !!user && item.content?.category === 'character' && Number(item.content.owner_user_id) === Number(user.id);
  }

  function renderParty() {
    const party = items.filter(function (item) {
      const c = item.content || {};
      return Number(c.campaign_id) === activeCampaignId && c.category === 'character' && c.role === 'party';
    });
    $('#partyScroll').empty();
    if (!party.some(isOwnCharacter)) {
      $('#partyScroll').html('<button class="party-empty" type="button">＋ Create your character</button>');
      $('#partyScroll .party-empty').on('click', function () { openRecord('character'); });
    }
    party.sort(function (a, b) { return Number(isOwnCharacter(b)) - Number(isOwnCharacter(a)); });
    party.forEach(function (character) {
      const c = character.content || {};
      const card = $('<button class="party-card" type="button"><span class="party-portrait"></span><span><em></em><strong></strong><small></small></span></button>');
      card.toggleClass('important-card', isOwnCharacter(character) || !!c.important);
      if (c.image_id) $('<img alt="">').attr('src', '/api/uploads/' + c.image_id).on('error', function () { this.src = c.owner_user_id ? '/api/avatars/' + c.owner_user_id : 'assets/profile-placeholder.svg'; }).appendTo(card.find('.party-portrait'));
      else if (c.owner_user_id) $('<img alt="">').attr('src', '/api/avatars/' + c.owner_user_id).on('error', function () { this.src = 'assets/profile-placeholder.svg'; }).appendTo(card.find('.party-portrait'));
      else card.find('.party-portrait').text('♙');
      card.find('strong').text(character.title);
      card.find('em').text(isOwnCharacter(character) ? 'Your character' : 'Party member');
      card.find('small').text(c.summary || c.affiliation || 'Party member');
      card.on('click', function () { openDetail(character); });
      $('#partyScroll').append(card);
    });
  }

  function renderDashboard() {
    const aiCampaign = isAiCampaign(activeCampaign());
    const playerTools = aiCampaign && (activeAiSpeaker.type === 'character' || aiState?.conversation_mode && aiState.conversation_mode !== 'dnd');
    $('#campaignDashboard').toggleClass('ai-player-tools-active', playerTools);
    if (aiCampaign) {
      $('.ai-world-rail').toggleClass('d-none', playerTools);
      $('.player-map-tools').toggleClass('d-none', !playerTools);
    }
    $('.attacks-rail .rail-title').text('Attacks & Spells');
    $('.player-map-tools').attr('aria-label', playerTools ? activeAiToolsPersona.name + "'s tools" : 'Character tools');
    const campaignItems = items.filter(function (item) {
      return Number((item.content || {}).campaign_id) === activeCampaignId;
    });
    const own = playerTools ? items.find(function (item) { return item.id === Number(activeAiToolsPersona.id); }) : ownedCampaignCharacter();
    if (window.RailDice) window.RailDice.setCharacter(own || null, activeCampaignId);
    const ownerId = playerTools ? Number((own && own.content || {}).owner_user_id) || null : user && user.id;
    const belongsToPlayer = function (item, link) {
      const c = item.content || {};
      if (c.reference_only) return false;
      const links = (c[link] || []).map(Number);
      // Explicit character links take precedence over account-wide grants.
      if (c.grant_mode === 'characters' || links.length) return links.includes(own && own.id);
      return links.includes(own && own.id) || (ownerId != null && (c.assigned_user_ids || []).map(Number).includes(ownerId));
    };
    const inventory = campaignItems.filter(function (item) { return (item.content || {}).category === 'item' && belongsToPlayer(item, 'owner_ids'); });
    const attacks = campaignItems.filter(function (item) { return ['attack', 'spell'].includes((item.content || {}).category) && belongsToPlayer(item, 'user_ids'); });
    $('#inventoryCount').text(inventory.reduce(function (total, item) {
      return total + ((item.content || {}).category === 'item' ? Number((item.content || {}).quantity ?? 1) : 1);
    }, 0));
    $('#attackCount').text(attacks.length);
    function fillRail(selector, records, emptyText) {
      const list = $(selector);
      const signature = JSON.stringify([own, records]);
      if (list[0].dataset.records === signature) return;
      list[0].dataset.records = signature;
      const scrollTop = list.scrollTop(), scrollLeft = list.scrollLeft();
      list.empty();
      if(selector==='#inventoryPreview'){const c=own;if(c)$('<div class="character-wallet">').append($('<strong>').text('Money held'),MapTrade.coinSummary(c.content.tabletop?.money_cp||0)).appendTo(list);}
      if (!records.length) {
        $('<span class="rail-empty"></span>').text(emptyText).appendTo(list);
        return;
      }
      records.forEach(function (item) {
        list.append(RecordCards.create(item,{onOpen:()=>openDetail(item)}));
      });
      list.scrollTop(scrollTop).scrollLeft(scrollLeft);
    }
    if (own && window.Equipment) {
      const host = document.getElementById('inventoryPreview');
      const signature = JSON.stringify([own, inventory]);
      if (host.dataset.records !== signature && !host.contains(document.activeElement)) {
        const view = captureLiveView(host);
        host.dataset.records = signature;
        host.replaceChildren();
        Equipment.mount(host, own, activeCampaignId, api, async function () { await loadWork(); }, null, openDetail,()=>restoreLiveView(host,view));
      }
    } else fillRail('#inventoryPreview', inventory, 'No items given to this character yet.');
    fillRail('#attackPreview', attacks, 'No attacks, spells or abilities given to this character yet.');
  }

  const archiveCharacterChoices = new Map();
  function renderCharacterLoadout() {
    const root=document.getElementById('characterLoadout');
    const campaign=activeCampaign(),shown=!!user&&!!campaign&&activeSection==='character';
    root.hidden=!shown;
    if(!shown)return;
    const dm=campaign.membership_role==='creator';
    const characters=items.filter(item=>item.content?.category==='character'&&Number(item.content.campaign_id)===activeCampaignId&&(dm||Number(item.content.owner_user_id)===Number(user.id)));
    const character=characters.find(item=>item.id===archiveCharacterChoices.get(activeCampaignId))||characters[0];
    const select=document.getElementById('characterLoadoutSelect');
    const choices=JSON.stringify(characters.map(item=>[item.id,item.title]));
    if(select.dataset.choices!==choices){
      select.replaceChildren(...characters.map(item=>new Option(item.title,item.id)));
      select.dataset.choices=choices;
    }
    $('#characterLoadoutPicker').prop('hidden',!characters.length||(!dm&&characters.length===1));
    $('#characterLoadoutEmpty').prop('hidden',!!character).text(dm?'Add a player character to view their inventory and abilities.':'Create your campaign character to see your inventory and abilities.');
    $('#characterLoadoutColumns').prop('hidden',!character);
    $('#characterLoadoutTitle').text(character?character.title+' · Equipment & abilities':'Character equipment & abilities');
    if(!character){$('#characterArchiveInventory,#characterArchiveAbilities').empty().removeAttr('data-records');return;}
    archiveCharacterChoices.set(activeCampaignId,character.id);select.value=String(character.id);
    const assigned=(item,key)=>{
      const c=item.content||{},links=(c[key]||[]).map(Number);
      if(c.reference_only||Number(c.campaign_id)!==activeCampaignId)return false;
      if(c.grant_mode==='characters'||links.length)return links.includes(character.id);
      return !!character.content.owner_user_id&&(c.assigned_user_ids||[]).map(Number).includes(Number(character.content.owner_user_id));
    };
    const inventory=items.filter(item=>item.content?.category==='item'&&assigned(item,'owner_ids'));
    const abilities=items.filter(item=>['attack','spell'].includes(item.content?.category)&&assigned(item,'user_ids'));
    const host=document.getElementById('characterArchiveInventory'),signature=JSON.stringify([character,inventory]);
    if(host.dataset.records!==signature&&!host.contains(document.activeElement)){
      const view=captureLiveView(host);host.dataset.records=signature;host.replaceChildren();
      Equipment.mount(host,character,activeCampaignId,api,async()=>{await loadWork();},null,openDetail,()=>restoreLiveView(host,view));
    }
    const list=document.getElementById('characterArchiveAbilities'),abilitySignature=JSON.stringify([character.id,abilities]);
    if(list.dataset.records!==abilitySignature){
      list.dataset.records=abilitySignature;list.replaceChildren();
      abilities.forEach(item=>list.append(RecordCards.create(item,{onOpen:()=>openDetail(item)})));
      if(!abilities.length)$('<p class="character-loadout-muted">').text('No attacks or spells assigned yet.').appendTo(list);
    }
  }
  $('#characterLoadoutSelect').on('change',function(){archiveCharacterChoices.set(activeCampaignId,Number(this.value));renderCharacterLoadout();});
  $('#characterArchiveInventory').on('focusout',()=>setTimeout(renderCharacterLoadout,0));

  function ownedCampaignCharacter() {
    return items.find(function (item) { const content=item.content||{};return content.category==='character'&&Number(content.campaign_id)===activeCampaignId&&Number(content.owner_user_id)===Number(user&&user.id); });
  }

  function is2DCampaign(campaign){return !!campaign&&!isAiCampaign(campaign)&&(window.MapWorkspace?.kind==='2d'||campaign.content?.initial_map_kind==='2d');}
  document.addEventListener('map-workspace-configured',()=>renderCampaignCharacterWorkshop());
  function renderCampaignCharacterWorkshop() {
    const campaign=items.find(function(item){return item.id===activeCampaignId;});
    if(!campaign){$('#campaignCharacterArea').addClass('d-none');visibleCharacterItemId=null;return;}
    if(isAiCampaign(campaign)||is2DCampaign(campaign)){if(window.characterRigEditor)window.characterRigEditor.stop();$('#campaignCharacterArea').addClass('d-none');visibleCharacterItemId=null;return;}
    const isDm=campaign.membership_role==='creator',targets=isDm?items.filter(function(item){const content=item.content||{};return content.category==='npc'&&Number(content.campaign_id)===activeCampaignId;}):[ownedCampaignCharacter()].filter(Boolean);
    let target=targets.find(function(item){return item.id===visibleCharacterItemId;})||targets[0]||null;
    $('#campaignCharacterArea').removeClass('d-none');$('#dmRigTarget, #createCampaignRigNpc').toggleClass('d-none',!isDm);$('#campaignCharacterKicker').text(isDm?'DM CHARACTER FORGE':'YOUR ADVENTURER');$('#campaignCharacterTitle').text(isDm?'NPC models & skeletons':'Character model & skeleton');$('#campaignCharacterHelp').text(isDm?'Choose one of your campaign NPCs, then shape it and fit its skeleton.':'Shape your character and fit its skeleton; its animations stay fixed.');
    const selector=$('#campaignRigNpcSelect').empty();if(isDm)targets.forEach(function(item){$('<option></option>').val(item.id).text(item.title).appendTo(selector);});
    visibleCharacterItemId=target?target.id:null;if(target)selector.val(String(target.id));$('#campaignCharacterEmpty').toggleClass('d-none',!!target);$('#editCampaignCharacter, #saveCampaignCharacterRig').prop('disabled',!target);
    if(!target){$('#characterRigWorkshop').appendTo('#campaignCharacterWorkshopHost').addClass('d-none');return;}
    $('#characterRigWorkshop').appendTo('#campaignCharacterWorkshopHost').removeClass('d-none');$('#campaignCharacterRigStatus').text('');if(window.characterRigEditor)window.characterRigEditor.load((target.content||{}).character_rig||null);
  }

  $('#saveCampaignCharacterRig').on('click',async function(){const character=items.find(function(item){return item.id===visibleCharacterItemId;});if(!character)return;let rig;try{rig=JSON.parse($('#characterRigData').val()||'null');}catch(error){$('#campaignCharacterRigStatus').text('The character model could not be read.');return;}const button=$(this).prop('disabled',true),content=Object.assign({},character.content||{},{character_rig:rig});try{await api('/api/work/'+character.id,{method:'PUT',body:JSON.stringify({title:character.title,content:content})});character.content=content;$('#campaignCharacterRigStatus').text('Character model and fitted skeleton saved.');}catch(error){$('#campaignCharacterRigStatus').text(error.message);}finally{button.prop('disabled',false);}});
  $('#editCampaignCharacter').on('click',function(){const character=items.find(function(item){return item.id===visibleCharacterItemId;});if(character)openRecord((character.content||{}).category||'character',character);});
  $('#createCampaignRigNpc').on('click',function(){openRecord('npc');});
  $('#campaignRigNpcSelect').on('change',function(){visibleCharacterItemId=Number(this.value)||null;renderCampaignCharacterWorkshop();});

  $('#campaignMapButton').on('click',function(){if(!activeCampaignId)return;activeSection=null;renderWork();setRealmMenu(false);const target=isAiCampaign()?$('#aiCampaignPanel')[0]:$('#mapPlaceholder')[0];if(target)target.scrollIntoView({behavior:'smooth',block:'center'});});

  function renderMapIconFilters(content) {
    const icons = (content && content.map_icons) || [];
    const filter = $('#mapIconFilters').empty();
    if (!icons.length) filter.html('<small>No checkpoint icons</small>');
    icons.forEach(function (icon) {
      const label = $('<label class="map-icon-filter"><input type="checkbox"><span class="map-filter-image"></span><strong></strong></label>');
      label.find('input').val(icon.id);
      if (icon.image_id) $('<img alt="">').attr('src', '/api/uploads/' + icon.image_id).appendTo(label.find('.map-filter-image'));
      else label.find('.map-filter-image').text('⌖');
      label.find('strong').text(icon.name);
      if (icon.important) label.addClass('important');
      label.appendTo(filter);
    });
  }

  function openCheckpoint(object, content) {
    activeMapObjectId = object.id;
    const select = $('#mapCheckpointForm [name=icon_id]').empty().append('<option value="">No icon</option>');
    ((content && content.map_icons) || []).forEach(function (icon) { $('<option>').val(icon.id).text(icon.name).appendTo(select); });
    select.val(object.icon_id || '');
    $('#mapCheckpointTitle').text(object.name + ' checkpoint');
    mapCheckpointModal.show();
  }

  function itemNames(ids) {
    return (ids || []).map(Number).map(function (id) {
      const match = items.find(function (item) { return item.id === id; });
      return match ? match.title : null;
    }).filter(Boolean);
  }

  function openDetail(item, refresh = false) {
    const detailBody=document.querySelector('#recordDetailModal .modal-body');
    const view=refresh?captureLiveView(detailBody):null;
    const content = item.content || {};
    const category = content.category || 'chronicle';
    const config = recordTypes[category] || recordTypes.chronicle;
    detailItemId = item.id;
    detailSnapshot = JSON.stringify(items);
    const campaign = items.find(function (value) { return value.id === Number(content.campaign_id); });
    const mayEdit = item.user_id === user.id || Number(content.owner_user_id) === Number(user.id) || (campaign && campaign.membership_role === 'creator');
    $('#detailEditButton').toggleClass('d-none', !mayEdit);
    $('#detailCopyReference').toggleClass('d-none', !(content.reference_only && campaign && campaign.membership_role === 'creator'));
    $('#detailType').text(config.name);
    $('#detailTitle').text(item.title);
    $('#detailDescription').text(content.summary || 'No description has been added yet.');
    $('#detailHero').toggleClass('d-none', !StarterArt.url(item));
    if (StarterArt.url(item)) $('#detailImage').attr('src', StarterArt.url(item)).attr('alt', item.title);
    else $('#detailImage').removeAttr('src');
    $('#detailHero .starter-art-credit').remove();
    if (!content.image_id && StarterArt.fallback(item).startsWith('/assets/starter-art/')) $('#detailHero').append('<a class="starter-art-credit" href="artwork-attribution.html" target="_blank" rel="noopener">Artwork credits · Game-icons.net · CC BY 3.0</a>');
    if (!refresh) {
      $('#detailNotes').val(item.personal_note || '');
      $('#detailError').text('');
    }
    $('#detailTabletop').html(Tabletop.detail(content));
    const equipmentCharacter = category === 'character' ? item : (isAiCampaign() && activeAiToolsPersona.type === 'character' ? items.find(r => r.id === Number(activeAiToolsPersona.id)) : ownedCampaignCharacter());
    if (window.Equipment && equipmentCharacter && (category === 'character' || category === 'item') && (Number(equipmentCharacter.content.owner_user_id) === Number(user.id) || campaign?.membership_role === 'creator')) {
      Equipment.mount(document.getElementById('detailTabletop'), equipmentCharacter, Number(content.campaign_id), api, async function () { await loadWork(); }, category === 'item' ? item.id : null, null,()=>{if(view)restoreLiveView(detailBody,view);});
    }
    $('#detailSharedNotes').toggleClass('d-none', !content.notes);
    $('#detailSharedNotesText').text(content.notes || '');
    const facts = [
      ['Part type',category==='map_part'?(MapPartCards.names[content.part_group]||content.part_group):''],
      ['Placement',category==='map_part'?MapCatalog.label(content.part_type):''],
      ['Default size',category==='map_part'?content.part_width+' × '+content.part_height:''],
      ['Light source',category==='map_part'?(content.light_enabled?'Enabled · radius '+content.light_radius:'Off'):''],
      ['Role', content.role], ['Faction / group', content.affiliation],
      ['Library', content.reference_only ? 'Rules reference · does not grant equipment or spell access' : ''],
      ['State', content.state], ['Difficulty', content.difficulty],
      ['Item type', content.item_type], ['Rarity', content.rarity],
      ['Quantity', category === 'item' ? (content.quantity ?? 1) : ''],
      [category === 'spell' ? 'Spell level' : 'Character level', category === 'character' || category === 'character_template' ? content.character_level : content.spell_level],
      ['Class', content.character_class], ['Subclass', content.subclass], ['Species', content.species],
      ['Proficiency', content.proficiency_bonus ? '+' + content.proficiency_bonus : ''],
      ['Armor class', content.armor_class], ['Hit points', content.hp_max ? (content.hp_current + ' / ' + content.hp_max + (content.hp_temporary ? ' (+' + content.hp_temporary + ' temp)' : '')) : ''],
      ['Abilities', content.strength ? 'STR ' + content.strength + ' · DEX ' + content.dexterity + ' · CON ' + content.constitution + ' · INT ' + content.intelligence + ' · WIS ' + content.wisdom + ' · CHA ' + content.charisma : ''],
      ['School', content.school],
      ['Casting time', content.casting_time], ['Range', content.range],
      ['Duration', content.duration], ['Action type', content.action_type],
      ['Attack / DC', content.attack_bonus], ['Damage', content.damage],
      ['Damage type', content.damage_type], ['Tags', content.tags]
    ].filter(function (entry) { return entry[1] !== '' && entry[1] != null; });
    $('#detailFacts').empty();
    facts.forEach(function (entry) {
      $('<div class="detail-fact"><span></span><strong></strong></div>').find('span').text(entry[0]).end().find('strong').text(entry[1]).end().appendTo('#detailFacts');
    });
    const connections = [
      ['Characters', itemNames(content.participant_ids)],
      ['Owners', itemNames(content.owner_ids)],
      ['Users', itemNames(content.user_ids)],
      ['Encounters', itemNames(content.encounter_ids)],
      ['Location', itemNames(content.location_id ? [content.location_id] : [])],
      ['Quest giver', itemNames(content.giver_id ? [content.giver_id] : [])],
      ['Leader', itemNames(content.leader_id ? [content.leader_id] : [])]
    ].filter(function (entry) { return entry[1].length; });
    $('#detailConnections').empty();
    connections.forEach(function (entry) {
      const block = $('<section class="connection-block"><h3></h3><div></div></section>');
      block.find('h3').text(entry[0]);
      entry[1].forEach(function (name) { $('<span class="connection-chip">').text(name).appendTo(block.find('div')); });
      block.appendTo('#detailConnections');
    });
    if (!refresh) {CharacterMemory.mount(item, api, {chatId:activeAiChatId}); detailModal.show();}
  }

  function renderDynamicFilters() {
    const groups = Array.from(new Set(items.map(function (item) {
      return (item.content || {}).affiliation;
    }).filter(Boolean))).sort();
    $('#dynamicFilters').empty();
    groups.forEach(function (group) {
      $('<button type="button">').attr('data-filter', 'group:' + group).text(group).appendTo('#dynamicFilters');
    });
  }

  function safe(value) {
    return $('<span>').text(value == null ? '' : String(value)).html();
  }

  function linkedOptions(categories, selectedId) {
    return '<option value="">None</option>' + items.filter(function (item) {
      const content = item.content || {};
      return categories.includes(content.category) && (!activeCampaignId || Number(content.campaign_id) === activeCampaignId);
    }).map(function (item) {
      return '<option value="' + item.id + '"' + (Number(selectedId) === item.id ? ' selected' : '') + '>' + safe(item.title) + '</option>';
    }).join('');
  }

  function peopleChecklist(selected, fieldName) {
    selected = (selected || []).map(Number);
    fieldName = fieldName || 'participant_ids';
    const people = items.filter(function (item) {
      const content = item.content || {};
      return ['character', 'npc'].includes(content.category) && Number(content.campaign_id) === activeCampaignId;
    });
    if (!people.length) return '<div class="linked-empty">Add player characters or NPCs first, then connect them here.</div>';
    const groups = {};
    people.forEach(function (person) {
      const content = person.content || {};
      let group = content.important ? 'Important' : content.role === 'party' ? 'Party' : content.affiliation || (content.role === 'villager' ? 'Villagers' : 'Others');
      (groups[group] = groups[group] || []).push(person);
    });
    return Object.keys(groups).map(function (group) {
      return '<fieldset class="linked-group"><legend>' + safe(group) + '</legend>' + groups[group].map(function (person) {
        return '<label class="linked-person ' + ((person.content || {}).important ? 'is-important' : '') + '"><input type="checkbox" name="' + fieldName + '" value="' + person.id + '"' + (selected.includes(person.id) ? ' checked' : '') + '><span><strong>' + safe(person.title) + '</strong><small>' + safe((person.content || {}).summary || (person.content || {}).role || '') + '</small></span></label>';
      }).join('') + '</fieldset>';
    }).join('');
  }

  function grantChecklist(selected, fieldName) {
    return '<details class="editor-help"><summary>How sharing works</summary><p class="modal-intro">Check each character who receives this card, then Save. Items appear in Inventory; spells and abilities appear in Attacks &amp; Spells. Uncheck to remove the card from their panel. Selecting a recipient makes this a playable card, including when editing a rules reference. Multiple recipients share this card’s quantity and settings; create separate cards for independent copies.</p></details>' + peopleChecklist(selected, fieldName);
  }

  function recordChecklist(categories, selected, fieldName, emptyText) {
    selected = (selected || []).map(Number);
    const records = items.filter(function (item) {
      const content = item.content || {};
      return categories.includes(content.category) && Number(content.campaign_id) === activeCampaignId;
    });
    if (!records.length) return '<div class="linked-empty">' + safe(emptyText) + '</div>';
    return '<fieldset class="linked-group"><legend>Connected records</legend>' + records.map(function (record) {
      return '<label class="linked-person"><input type="checkbox" name="' + fieldName + '" value="' + record.id + '"' + (selected.includes(record.id) ? ' checked' : '') + '><span><strong>' + safe(record.title) + '</strong><small>' + safe((recordTypes[(record.content || {}).category] || recordTypes.chronicle).name) + '</small></span></label>';
    }).join('') + '</fieldset>';
  }

  function structuredFields(type, content) {
    if(type === "map_part") return MapPartCards.form(content);
    content = content || {};
    if (type === 'campaign') return '<label class="important-toggle"><input type="checkbox" name="ai_dm"><span>Use a local AI Dungeon Master</span><small>Ollama on the server computer runs the story table. The 3D map is replaced by campaign chat.</small></label><div class="row g-3"><label class="col-sm-6">Preferred Ollama model<input class="form-control" name="ai_model" maxlength="120" placeholder="Leave blank to use the first installed model"></label><label class="col-sm-6">Story behavior<select class="form-control" name="ai_story_mode"><option value="adaptive">Adapt as the campaign changes</option><option value="fixed">Stay faithful to the story</option></select></label></div><label>Starting story prompt<textarea class="form-control" name="ai_story_prompt" rows="3" maxlength="8000" placeholder="A mystery surrounding a drowned keep…"></textarea></label>';
    if (type === 'chat') return '<div class="linked-picker"><div class="linked-picker-title">Characters in this conversation</div>' + peopleChecklist(content.participant_ids, 'participant_ids') + '</div><p class="modal-intro">Choose the matching player accounts below. Only those players, the selected characters, and the campaign creator will know what happens in this chat.</p>';
    if (type === 'character_template') return '';
    if (['character', 'npc'].includes(type)) return '<div class="row g-3"><label class="col-sm-6">Campaign role<select class="form-control" name="role"><option value="party">Party member</option><option value="villager">Villager</option><option value="ally">Ally</option><option value="enemy">Enemy</option><option value="neutral">Neutral</option></select></label><label class="col-sm-6">Faction or group<input class="form-control" name="affiliation" maxlength="100" placeholder="Demon Clan, town guard…"></label></div>' + (type === 'character' ? '<label class="important-toggle"><input type="checkbox" name="is_my_character"><span>This is my character</span><small>Places this character first in the party row.</small></label>' : '');
    if (type === 'encounter') return '<div class="row g-2"><label class="col-6 col-sm-4">Difficulty<select class="form-control" name="difficulty"><option>Low</option><option selected>Moderate</option><option>High</option></select></label><label class="col-6 col-sm-4">State<select class="form-control" name="state"><option>Planned</option><option>Active</option><option>Completed</option></select></label><label class="col-6 col-sm-4">Location<select class="form-control" name="location_id">' + linkedOptions(['location'], content.location_id) + '</select></label></div><div class="linked-picker"><div class="linked-picker-title">Connected characters</div>' + peopleChecklist(content.participant_ids) + '</div>';
    if (type === 'item') return '<div class="row g-2"><label class="col-6 col-sm-4">Item type<select class="form-control" name="item_type"><option>Weapon</option><option>Armor</option><option>Potion</option><option>Scroll</option><option>Tool</option><option>Food</option><option>Consumable</option><option>Trade good</option><option>Treasure</option><option>Quest item</option><option>Wondrous Item</option><option>Ring</option><option>Wand</option><option>Staff</option><option>Rod</option><option>Other</option></select></label><label class="col-6 col-sm-4">Rarity<select class="form-control" name="rarity"><option>Nonmagical</option><option>Common</option><option>Uncommon</option><option>Rare</option><option>Very Rare</option><option>Legendary</option><option>Artifact</option></select></label><label class="col-6 col-sm-4">Quantity<input class="form-control" name="quantity" type="number" min="0" max="9999" value="1"></label></div><div class="linked-picker"><div class="linked-picker-title">Give this item to characters</div>' + grantChecklist(content.owner_ids, 'owner_ids') + '</div><div class="linked-picker"><div class="linked-picker-title">Appears in encounters</div>' + recordChecklist(['encounter'], content.encounter_ids, 'encounter_ids', 'Add encounters first, then connect this item.') + '</div>';
    if (type === 'spell') return '<div class="row g-2"><label class="col-6 col-sm-4">Spell level<select class="form-control" name="spell_level"><option>Cantrip</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option><option>7</option><option>8</option><option>9</option></select></label><label class="col-6 col-sm-4">School<select class="form-control" name="school"><option>Abjuration</option><option>Conjuration</option><option>Divination</option><option>Enchantment</option><option>Evocation</option><option>Illusion</option><option>Necromancy</option><option>Transmutation</option></select></label><label class="col-6 col-sm-4">Casting time<input class="form-control" name="casting_time" maxlength="60" placeholder="1 action"></label></div><div class="row g-3"><label class="col-sm-6">Range<input class="form-control" name="range" maxlength="60"></label><label class="col-sm-6">Duration<input class="form-control" name="duration" maxlength="60"></label></div><div class="linked-picker"><div class="linked-picker-title">Give this spell to characters</div>' + grantChecklist(content.user_ids, 'user_ids') + '</div><div class="linked-picker"><div class="linked-picker-title">Used in encounters</div>' + recordChecklist(['encounter'], content.encounter_ids, 'encounter_ids', 'Add encounters first, then connect this spell.') + '</div>';
    if (type === 'attack') return '<div class="row g-2"><label class="col-6 col-sm-4">Action type<select class="form-control" name="action_type"><option>Weapon attack</option><option>Spell attack</option><option>Saving throw</option><option>Ability</option><option>Legendary action</option><option>Reaction</option></select></label><label class="col-6 col-sm-4">Attack bonus / DC<input class="form-control" name="attack_bonus" maxlength="30" placeholder="+7 or DC 15"></label><label class="col-6 col-sm-4">Range<input class="form-control" name="range" maxlength="60"></label></div><div class="row g-3"><label class="col-sm-6">Damage<input class="form-control" name="damage" maxlength="60" placeholder="2d6 + 4"></label><label class="col-sm-6">Damage type<select class="form-control" name="damage_type"><option>Slashing</option><option>Piercing</option><option>Bludgeoning</option><option>Acid</option><option>Cold</option><option>Fire</option><option>Force</option><option>Lightning</option><option>Necrotic</option><option>Poison</option><option>Psychic</option><option>Radiant</option><option>Thunder</option><option>Other</option></select></label></div><div class="linked-picker"><div class="linked-picker-title">Give this ability to characters</div>' + grantChecklist(content.user_ids, 'user_ids') + '</div><div class="linked-picker"><div class="linked-picker-title">Available in encounters</div>' + recordChecklist(['encounter'], content.encounter_ids, 'encounter_ids', 'Add encounters first, then connect this attack.') + '</div>';
    if (type === 'quest') return '<div class="row g-3"><label class="col-sm-6">Quest state<select class="form-control" name="state"><option>Rumor</option><option>Available</option><option>Active</option><option>Completed</option><option>Failed</option></select></label><label class="col-sm-6">Quest giver<select class="form-control" name="giver_id">' + linkedOptions(['character', 'npc'], content.giver_id) + '</select></label></div>';
    if (type === 'faction') return '<div class="row g-3"><label class="col-sm-6">Disposition<select class="form-control" name="state"><option>Unknown</option><option>Friendly</option><option>Neutral</option><option>Hostile</option></select></label><label class="col-sm-6">Leader<select class="form-control" name="leader_id">' + linkedOptions(['character', 'npc'], content.leader_id) + '</select></label></div>';
    if (type === 'location') return '<div class="row g-3"><label class="col-sm-6">Place type<select class="form-control" name="place_type"><option>Settlement</option><option>Dungeon</option><option>Wilderness</option><option>Landmark</option><option>Plane</option><option>Other</option></select></label><label class="col-sm-6">Region<input class="form-control" name="affiliation" maxlength="100"></label></div>';
    if (type === 'session') return '<label>Date played<input class="form-control" name="date_played" type="date"></label>';
    return '<label>State or chapter<input class="form-control" name="state" maxlength="60"></label>';
  }

  function characterStatsFields(type) {
    if (!['character', 'character_template'].includes(type)) return '';
    const abilities = [['strength', 'Strength'], ['dexterity', 'Dexterity'], ['constitution', 'Constitution'], ['intelligence', 'Intelligence'], ['wisdom', 'Wisdom'], ['charisma', 'Charisma']];
    return '<div class="character-sheet-heading"><div><span>D&amp;D CHARACTER STATISTICS</span><strong>Level &amp; adventuring stats</strong></div><small>Proficiency follows total character level. Record class features and resources from your chosen rules.</small></div>' +
      '<div class="character-level-grid"><label>Level<input class="form-control" name="character_level" type="number" min="1" max="20" value="1"></label><label>Experience points<input class="form-control" name="experience_points" type="number" min="0" max="99999999" value="0"></label><label>Proficiency bonus<input class="form-control" name="proficiency_bonus" value="+2" readonly></label><small class="character-next-level" id="characterNextLevel">Level 2 at 300 XP</small></div>' +
      '<div class="character-identity-grid"><label>Class<input class="form-control" name="character_class" list="ttClasses" maxlength="80" placeholder="Fighter, Wizard…"></label><label>Subclass<input class="form-control" name="subclass" maxlength="80"></label><label>Species<input class="form-control" name="species" maxlength="80"></label><label>Background<input class="form-control" name="background" maxlength="80"></label></div>' +
      '<div class="character-ability-grid">' + abilities.map(function (ability) { return '<label><span>' + ability[1] + '</span><input class="form-control" name="' + ability[0] + '" type="number" min="1" max="30" value="10"><output data-ability-mod="' + ability[0] + '">+0</output></label>'; }).join('') + '</div>' +
      '<div class="character-combat-grid"><label>Armor class<input class="form-control" name="armor_class" type="number" min="0" max="99" value="10"></label><label>Current HP<input class="form-control" name="hp_current" type="number" min="0" max="999999" value="1"></label><label>Maximum HP<input class="form-control" name="hp_max" type="number" min="1" max="999999" value="1"></label><label>Temporary HP<input class="form-control" name="hp_temporary" type="number" min="0" max="999999" value="0"></label><label>Initiative<input class="form-control" name="initiative" type="number" min="-50" max="50" value="0"></label><label>Speed (ft.)<input class="form-control" name="speed" type="number" min="0" max="999" value="30"></label><label>Passive Perception<input class="form-control" name="passive_perception" type="number" min="0" max="99" value="10"></label><label>Hit Die<select class="form-control" name="hit_die"><option>d6</option><option selected>d8</option><option>d10</option><option>d12</option></select></label><label>Death save successes<input class="form-control" name="death_save_successes" type="number" min="0" max="3" value="0"></label><label>Death save failures<input class="form-control" name="death_save_failures" type="number" min="0" max="3" value="0"></label></div>';
  }

  function updateCharacterStatMath() {
    const level = Math.max(1, Math.min(20, Number($('#workForm [name=character_level]').val()) || 1));
    const thresholds = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
    const proficiency = 2 + Math.floor((level - 1) / 4);
    $('#workForm [name=proficiency_bonus]').val('+' + proficiency);
    $('#characterNextLevel').text(level < 20 ? 'Level ' + (level + 1) + ' at ' + thresholds[level].toLocaleString() + ' XP' : 'Level 20 is the adventurer maximum.');
    $('[data-ability-mod]').each(function () {
      const score = Math.max(1, Math.min(30, Number($('#workForm [name="' + $(this).data('ability-mod') + '"]').val()) || 10));
      const modifier = Math.floor((score - 10) / 2);
      $(this).text((modifier >= 0 ? '+' : '') + modifier);
    });
  }

  function setStructuredValues(content) {
    Object.keys(content || {}).forEach(function (key) {
      const field = $('#workForm [name="' + key + '"]');
      if (!field.length || ['character_rig', 'participant_ids', 'owner_ids', 'user_ids', 'encounter_ids', 'assigned_user_ids'].includes(key)) return;
      if (field.attr('type') === 'checkbox') field.prop('checked', !!content[key]);
      else {
        if (field.is('select') && content[key] != null && !field.find('option').toArray().some(function (option) { return option.value === String(content[key]); })) $('<option>').val(content[key]).text(content[key] + ' (saved value)').appendTo(field);
        field.val(content[key]);
      }
    });
  }

  function prepareCharacterTemplateImport(type) {
    const templates = savedCharacters(), panel = $('#characterTemplateImport'), select = $('#characterTemplateSelect').empty();
    const visible = type === 'character' && !!activeCampaignId && templates.length > 0;
    panel.toggleClass('d-none', !visible);
    $('#characterTemplateImportStatus').text('');
    if (!visible) return;
    templates.forEach(function (character) { $('<option></option>').val(character.id).text(character.title).appendTo(select); });
  }

  function prepareRecordAudience(type, content, campaign) {
    const panel = $('#recordAudience'), holder = $('#recordAudiencePlayers').empty();
    const members = aiState && aiState.members || [];
    const visible = !!(campaign && isAiCampaign(campaign) && campaign.membership_role === 'creator' && !['campaign', 'character_template'].includes(type) && members.some(function (member) { return member.role === 'member'; }));
    panel.toggleClass('d-none', !visible);
    if (!visible) return;
    const selected = (content.assigned_user_ids || []).map(Number);
    if (type === 'character') {
      panel.children('strong').text('Assign this character card to a player');
      panel.children('small').text('That player and the campaign DM can open this card and change its level or statistics.');
    } else {
      panel.children('strong').text('Give this card to specific players');
      panel.children('small').text('Only selected players receive this card. Collected items and NPCs met in play appear automatically.');
    }
    members.filter(function (member) { return member.role === 'member'; }).forEach(function (member) {
      const label = $('<label class="record-audience-player"><input type="checkbox" name="assigned_user_ids"><span></span></label>');
      if (type === 'character') label.find('input').attr('type', 'radio');
      label.find('input').val(member.id).prop('checked', selected.includes(Number(member.id)));
      label.find('span').text(member.username);
      holder.append(label);
    });
  }

  let characterGenerationController = null;
  let characterGenerationVersion = 0;
  function resetCharacterGeneration() {
    characterGenerationVersion++;
    if (characterGenerationController) characterGenerationController.abort();
    characterGenerationController = null;
    $('#generateCharacterButton').prop('disabled', false).text('Generate draft');
    $('#workForm button[type=submit]').prop('disabled', false);
    $('#characterGenerationStatus, #characterGenerationError').text('');
  }
  $('#workModal').on('hidden.bs.modal', resetCharacterGeneration);
  $('#aiChatGenerators').on('click', '[data-generate-record]', function () {
    const category=this.dataset.generateRecord;
    if(category!=='character'&&!aiState?.creator)return;
    openRecord(category);
    document.getElementById('characterGenerator').open=true;
    $('#workModal').one('shown.bs.modal',()=>$('#characterGenerationPrompt').trigger('focus'));
  });
  $('#generateCharacterButton').on('click', async function () {
    const prompt = $('#characterGenerationPrompt').val().trim();
    if (!prompt) { $('#characterGenerationError').text('Describe the person or encounter you want to create.'); return; }
    const campaign = activeCampaign();
    const category=$('#workForm [name=category]').val();
    if (!campaign || $('#workForm [name=id]').val() || !['character','npc','encounter'].includes(category) || characterGenerationController) return;
    resetCharacterGeneration();
    const version = characterGenerationVersion;
    characterGenerationController = new AbortController();
    $('#generateCharacterButton').prop('disabled', true).text('Generating…');
    $('#workForm button[type=submit]').prop('disabled', true);
    $('#characterGenerationStatus').text('Creating your draft with the campaign’s local AI. This may take a few minutes.');
    try {
      const result = await api('/api/campaign/' + campaign.id + '/characters/generate', {method:'POST',signal:characterGenerationController.signal,body:JSON.stringify({prompt:prompt,category,chat_id:activeAiChatId||null})});
      if (version !== characterGenerationVersion) return;
      const draft = result.draft, content = draft && draft.content;
      if (!draft || !content || typeof content !== 'object') throw new Error('The AI returned an incomplete draft. Please try again.');
      $('#workForm [name=title]').val(draft.title);
      setStructuredValues(content);
      if(category==='character'){
      // Rebuild the supplemental sheet so regenerating cannot keep a previous class's resources.
      $('#characterStatsFields .tt-panel').remove();
      $('#characterStatsFields').append(Tabletop.fields('character', content, campaign.content || {}));
      setStructuredValues(content);
      updateCharacterStatMath();Tabletop.hydrate(content);
      editableRecordContent.tabletop = JSON.parse(JSON.stringify(content.tabletop || {}));
      }
      editableRecordContent.generation_mode=content.generation_mode;
      $('#generatedCharacterGuidance').toggleClass('d-none',category!=='character');
      $('#generatedCharacterCore').val(draft.guidance?.core||'');$('#generatedCharacterReminder').val(draft.guidance?.reminder||'');
      $('#characterGenerationStatus').text('Draft ready in '+({dnd:'D&D',modern:'Modern',medieval:'Medieval'}[content.generation_mode]||'D&D')+' style. Review the draft, then Save. Nothing has been created yet.');
    } catch (error) {
      if (version === characterGenerationVersion && error.name !== 'AbortError') { $('#characterGenerationStatus').text(''); $('#characterGenerationError').text(error.message); }
    } finally {
      if (version === characterGenerationVersion) { characterGenerationController = null; $('#generateCharacterButton').prop('disabled', false).text('Generate draft'); $('#workForm button[type=submit]').prop('disabled', false); }
    }
  });

  function openRecord(type, item) {
    window.MapImagePicker?.setArtwork(items.filter(r=>r.content?.category==='artwork' && Number(r.content.campaign_id)===Number(activeCampaignId) && Number(r.content.image_id)>0));
    resetCharacterGeneration();
    const config = recordTypes[type] || recordTypes.chronicle;
    const form = $('#workForm')[0];
    $('#characterRigWorkshop').insertAfter('#structuredFields');
    $('#campaignCharacterArea').addClass('d-none');
    form.reset();
    $('#workForm [name=id]').val(item ? item.id : '');
    $('#workForm [name=category]').val(type);
    $('#workTitle').text(item ? 'Open ' + config.name : 'Add ' + config.name);
    $('#recordTitleLabel').contents().first()[0].textContent = config.title;
    $('#recordSummaryLabel').contents().first()[0].textContent = config.summary;
    $('#recordNotesLabel').contents().first()[0].textContent = config.notes;
    const campaign = items.find(function (value) { return value.id === activeCampaignId; });
    $('.creator-visibility').toggleClass('d-none', type !== 'chat' || !campaign || campaign.membership_role !== 'creator');
    $('#characterGenerator').toggleClass('d-none', !!item || !['character','npc','encounter'].includes(type) || !campaign);
    $('#characterGenerationMode').text('Setting: '+({dnd:'D&D',modern:'Modern',medieval:'Medieval'}[aiState?.conversation_mode||campaign?.content?.ai_chat_mode||'dnd'])+' · follows the active conversation.');
    $('#generatedCharacterGuidance').addClass('d-none');$('#generatedCharacterCore,#generatedCharacterReminder').val('');
    const content = item ? item.content || {} : {};
    editableRecordContent = JSON.parse(JSON.stringify(content));
    if (item && type !== 'map_part' && StarterArt.fallback(item)) editableRecordContent.default_art = StarterArt.fallback(item);
    const displayedContent = Object.assign({}, content);
    if (['item','spell','attack'].includes(type) && content.grant_mode !== 'characters') {
      const key = type === 'item' ? 'owner_ids' : 'user_ids';
      if (!(content[key] || []).length) displayedContent[key] = items.filter(function (record) {
        const c = record.content || {};
        return c.category === 'character' && Number(c.campaign_id) === activeCampaignId && (content.assigned_user_ids || []).map(Number).includes(Number(c.owner_user_id));
      }).map(function (record) { return record.id; });
    }
    $('#structuredFields').html(structuredFields(type, displayedContent));
    if(['character','npc','encounter','character_template'].includes(type)) $('#structuredFields').append('<label>Map image scale<input class="form-control" name="map_image_scale" type="number" min="0.25" max="8" step="0.05" value="'+CharacterImageScale.value(content.map_image_scale)+'"><small>1 = normal size. Changes the map portrait, not movement or reach.</small></label>');
    if (type === 'campaign' && !item) {
      $('#structuredFields').append('<label id="startingMapChoice">Campaign map type<select class="form-control" name="initial_map_kind"><option value="3d">3D · dimensional tabletop</option><option value="2d">2D · top-down battle map</option></select><small>All maps in this campaign will use this type.</small></label>');
      const updateMapChoice = function () { $('#startingMapChoice').toggle(!$('#workForm [name=ai_dm]').prop('checked')); };
      $('#workForm [name=ai_dm]').on('change', updateMapChoice); updateMapChoice();
    }
    $('#characterStatsFields').html(characterStatsFields(type)).toggleClass('d-none', !['character', 'character_template'].includes(type));
    const tabletopHost = ['character', 'character_template'].includes(type) ? '#characterStatsFields' : '#structuredFields';
    $(tabletopHost).append(Tabletop.fields(type, content, campaign ? campaign.content : {}));
    if (['item', 'spell', 'attack'].includes(type)) $('#structuredFields').prepend('<label class="important-toggle"><input type="checkbox" name="reference_only"><span>Rules reference only</span><small>Reference cards are not possessions. Choosing a character below clears this when saved and gives them the card.</small></label>');
    prepareRecordAudience(type, content, campaign);
    prepareCharacterTemplateImport(type);
    const usesCharacterRig = (type === 'character' || type === 'npc' || type === 'character_template') && !(campaign && (isAiCampaign(campaign)||is2DCampaign(campaign)) && type !== 'character_template');
    $('#characterRigWorkshop').toggleClass('d-none', !usesCharacterRig);
    $('#characterRigData').val(JSON.stringify(content.character_rig||null));
    if (window.characterRigEditor) {
      if (usesCharacterRig) window.characterRigEditor.load(content.character_rig || null);
      else window.characterRigEditor.stop();
    }
    setStructuredValues(content);
    if (type === 'character' && campaign?.membership_role === 'member' && !item) {
      $('#workForm [name=role]').val('party').prop('disabled', true);
      $('#workForm [name=is_my_character]').prop('checked', true);
    }
    updateCharacterStatMath();
    Tabletop.hydrate(content);
    $('#workForm [name=tt_money_cp],#workForm [name=tt_money_sp],#workForm [name=tt_money_gp],#workForm [name=tt_value_gold]').prop('readOnly',!!campaign&&campaign.membership_role!=='creator');
    $('#workForm [name^=tt_equipment_]').not('[name=tt_equipment_coin_weight]').prop('disabled',!!campaign&&campaign.membership_role!=='creator').attr('title',campaign&&campaign.membership_role!=='creator'?'The DM maintains equipment training and rule exceptions.':'');
    $('#workForm [name=image_id]').val(content.image_id || '');
    showImage('#recordImagePreview', content.image_id, recordSigils[type] || '✦');
    if (item && !content.image_id && StarterArt.fallback(item)) $('#recordImagePreview').empty().append($('<img alt="">').attr('src', StarterArt.fallback(item)));
    if (item) {
      $('#workForm [name=title]').val(item.title);
      $('#workForm [name=summary]').val(content.summary || '');
      $('#workForm [name=tags]').val(content.tags || '');
      $('#workForm [name=notes]').val(content.notes || '');
    }
    if (campaign && isAiCampaign(campaign) && ['character', 'npc'].includes(type)) {
      $('#recordSummaryLabel').contents().first()[0].textContent = 'Appearance';
      $('#recordNotesLabel').contents().first()[0].textContent = 'Personality, history, goals, abilities, and roleplaying notes';
    }
    $('#workError').text('');
    if(type === "map_part") MapPartCards.bindForm(content,items.filter(r=>Number(r.content?.campaign_id)===Number(activeCampaignId))); 
    workModal.show();
  }

  $('#artAtelierButton').on('click', function () {
    if (!activeCampaignId) return;
    activeSection = 'art'; renderWork(); setRealmMenu(false);
    $('#campaignDashboard')[0].scrollIntoView({behavior:'smooth',block:'start'});
  });
  $('#spellAtelierButton').on('click', function () {
    if (!activeCampaignId) return;
    activeSection = 'atelier';
    renderWork();
    setRealmMenu(false);
    $('#spellAtelierCanvas')[0].focus({ preventScroll: true });
    $('#campaignDashboard')[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#realmSidebar [data-record-type]').on('click', function () {
    const type = $(this).data('record-type');
    setRealmMenu(false);
    if (!user) {
      accountModal.show();
      $('#accountError').text('Sign in or create an account to add campaign information.');
      return;
    }
    if (type === 'campaign') {
      if (activeCampaignId) {
        const campaign = items.find(function (item) { return item.id === activeCampaignId; });
        if (campaign) openDetail(campaign);
      } else openRecord('campaign');
      return;
    }
    if (!activeCampaignId) {
      $('#campaignSearch').trigger('focus');
      return;
    }
    activeSection = type;
    $('#recordSearch').val(''); $('#recordLibraryFilter').val('');
    renderWork();
    $('#campaignRecords')[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('[data-dashboard-section]').on('click', function () {
    activeSection = $(this).data('dashboard-section');
    $('#recordSearch').val(''); $('#recordLibraryFilter').val('');
    renderWork();
  });
  $('#campaignSearch').on('input', renderCampaigns);
  $('#campaignBack').on('click', leaveCampaign);
  $('#mapIconFilters').on('change', 'input', function () {
    const visible = $('#mapIconFilters input:checked').map(function () { return this.value; }).get();
    if (window.campaignMap) window.campaignMap.setVisibleIcons(visible);
  });
  $('#newMapIcon').on('click', function () {
    $('#mapIconForm')[0].reset(); $('#mapIconForm [name=image_id]').val(''); showImage('#mapIconPreview', null, '⌖'); $('#mapIconError').text(''); mapIconModal.show();
  });
  $('#mapIconForm [name=image_file]').on('change', async function () {
    try { const image = await uploadImage(this.files[0]); if (image) { $('#mapIconForm [name=image_id]').val(image.image_id); showImage('#mapIconPreview', image.image_id, '⌖'); } }
    catch (error) { $('#mapIconError').text(error.message); }
  });
  $('#mapIconForm').on('submit', async function (event) {
    event.preventDefault(); const campaign = items.find(function (item) { return item.id === activeCampaignId; }); if (!campaign || campaign.membership_role !== 'creator') return;
    const values = Object.fromEntries(new FormData(this).entries()), content = campaign.content || {}; content.map_icons = content.map_icons || [];
    if (window.MapWorkspace && window.MapWorkspace.active) {
      try { await window.MapWorkspace.addIcon({id:'icon-'+Date.now(),name:values.name,description:values.description||'',important:!!this.elements.important.checked,image_id:Number(values.image_id)||null}); mapIconModal.hide(); }
      catch(error) { $('#mapIconError').text(error.message); }
      return;
    }
    content.map_icons.push({ id: 'icon-' + Date.now(), name: values.name, description: values.description || '', important: !!this.elements.important.checked, image_id: Number(values.image_id) || null });
    try { await api('/api/work/' + campaign.id, { method: 'PUT', body: JSON.stringify({ title: campaign.title, content: content }) }); renderMapIconFilters(content); if (window.campaignMap) window.campaignMap.setIcons(content.map_icons); mapIconModal.hide(); }
    catch (error) { $('#mapIconError').text(error.message); }
  });
  $('#mapCheckpointForm').on('submit', function (event) { event.preventDefault(); if (window.campaignMap && activeMapObjectId) window.campaignMap.setObjectIcon(activeMapObjectId, this.elements.icon_id.value); mapCheckpointModal.hide(); });
  $('#addSectionRecord').on('click', function () {
    if (isMapLibrary()) {
      activeSection=null;
      renderWork();
      $('#mapNewForm').prop('hidden',false).find('[name=title]').trigger('focus');
      return;
    }
    if (activeSection) openRecord(activeSection);
  });

  $('#aiSpeakerButton').on('click', function () {
    const menu = $('#aiSpeakerMenu');
    const open = menu.hasClass('d-none');
    menu.toggleClass('d-none', !open);
    $(this).attr('aria-expanded', String(open));
  });

  $(document).on('click', function (event) {
    if (!$(event.target).closest('.ai-speaker-picker').length) $('#aiSpeakerMenu').addClass('d-none').prev().attr('aria-expanded', 'false');
  });

  $('#aiChatAudience').on('change', 'input', function () {
    if (this.value === 'all' && this.checked) $('#aiChatAudience input').not(this).prop('checked', false);
    else if (this.checked) $('#aiChatAudience input[value=all]').prop('checked', false);
    if (!$('#aiChatAudience input:checked').length) $('#aiChatAudience input[value=all]').prop('checked', true);
  });

  $('#aiStoryToggle').on('click', function () {
    $('#aiStoryControls').toggleClass('d-none');
  });

  $('[data-ai-story-action]').on('click', async function () {
    const action = $(this).data('ai-story-action');
    const buttons = $('[data-ai-story-action]');
    $('#aiStoryError,#aiStoryStatus').text('');
    if ((action === 'generate' || action === 'modify') && !$('#aiStoryPrompt').val().trim()) {
      $('#aiStoryError').text('Enter a prompt describing what the story should become.');
      return;
    }
    buttons.prop('disabled', true);
    $('#aiStoryStatus').text(action === 'generate' ? 'Ollama is creating the campaign story…' : action === 'modify' ? 'Ollama is revising the campaign story…' : 'Saving story settings…');
    try {
      const result = await api('/api/campaign/' + activeCampaignId + '/ai/story', { method: 'POST', body: JSON.stringify({ action: action, model: $('#aiModel').val(), helper_models: ($('#aiHelperModels').val() || []).slice(0, 3), story_mode: $('#aiStoryMode').val(), story: $('#aiStory').val(), prompt: $('#aiStoryPrompt').val(), memory: $('#aiMemory').val(), world: aiWorldValues() }) });
      if (result.story !== undefined) $('#aiStory').val(result.story);
      if (result.memory !== undefined) $('#aiMemory').val(result.memory);
      $('#aiStoryStatus').text(action === 'save' ? 'Story settings saved.' : 'The campaign story has been ' + (action === 'generate' ? 'generated.' : 'revised.'));
      await loadAiCampaign(false);
    } catch (error) { $('#aiStoryStatus').text(''); $('#aiStoryError').text(error.message); }
    finally { buttons.prop('disabled', false); }
  });

  $('#aiWorldSave').on('click', async function () {
    const button = $(this).prop('disabled', true);
    $('#aiWorldStatus').text('Saving…');
    try {
      await api('/api/campaign/' + activeCampaignId + '/ai/story', { method: 'POST', body: JSON.stringify({ action: 'save', model: $('#aiModel').val(), helper_models: ($('#aiHelperModels').val() || []).slice(0, 3), story_mode: $('#aiStoryMode').val(), story: $('#aiStory').val(), memory: $('#aiMemory').val(), world: aiWorldValues() }) });
      $('#aiWorldStatus').text('The shared scene has been updated.');
      await loadAiCampaign(false);
    } catch (error) { $('#aiWorldStatus').text(error.message); }
    finally { button.prop('disabled', !aiState || !aiState.creator); }
  });

  ChatFormat.guide(document.querySelector('#aiChatExtras'), '#aiChatInput');
  ChatFormat.guide(document.querySelector('#aiMessageModalForm .modal-body'), '#aiMessageModalForm [name=text]');
  const chatAttachments = ChatImages.create(document.querySelector('#aiChatImages'), {
    upload: uploadImage, error: message => $('#aiChatError').text(message),
    changed: count => $('#aiChatImageCount').text(count ? ' · ' + count + (count === 1 ? ' image' : ' images') : '')
  });
  new MutationObserver(() => {if ($('#aiChatError').text()) document.querySelector('#aiChatExtras').open = true;}).observe(document.querySelector('#aiChatError'), {childList:true,characterData:true,subtree:true});
  $('#aiConversationMode').on('change', async function () {
    const campaign = activeCampaignId, chat = activeAiChatId;
    $(this).prop('disabled', true);
    try {
      await api('/api/campaign/' + campaign + '/ai/mode', {method:'POST',body:JSON.stringify({mode:this.value,chat_id:chat})});
      if (campaign === activeCampaignId && chat === activeAiChatId) await loadAiCampaign(false);
    } catch (error) { $('#aiChatError').text(error.message); if (campaign === activeCampaignId && chat === activeAiChatId) renderAiState(false,false); }
  });
  $('#aiChatForm').on('submit', async function (event) {
    event.preventDefault();
    if (activeAiSpeaker.type === 'none') return;
    const message = $('#aiChatInput').val().trim();
    if ((!message && !chatAttachments.ids().length) || !activeAiSpeaker) return;
    if (chatAttachments.busy()) {$('#aiChatError').text('Wait for the images to finish importing.'); return;}
    const attachmentScope = String(activeCampaignId) + ':' + String(activeAiChatId);
    chatAttachments.lock(true);
    const audience = $('#aiChatAudience input:checked').map(function () { return this.value === 'all' ? 'all' : Number(this.value); }).get();
    const send = $(this).find('button[type=submit]').prop('disabled', true);
    clearAiUndo();
    $('#aiChatError').text('');
    try {
      await api('/api/campaign/' + activeCampaignId + '/ai/message', { method: 'POST', body: JSON.stringify({ message: message, image_ids: chatAttachments.ids(), chat_id: activeAiChatId, persona_type: activeAiSpeaker.type, persona_id: activeAiSpeaker.id, addressed_to_ai: $('#aiAddressToggle').prop('checked'), audience_user_ids: audience }) });
      if (attachmentScope === String(activeCampaignId) + ':' + String(activeAiChatId)) {$('#aiChatInput').val(''); chatAttachments.clear();}
      await loadAiCampaign(false);
    } catch (error) {
      $('#aiChatError').text(error.message);
      await loadAiCampaign(true);
    } finally { send.prop('disabled', activeAiSpeaker.type === 'none'); chatAttachments.lock(false); }
  });

  let editImageIds = [];
  function renderEditImages() {
    const host = document.querySelector('#aiMessageEditImages'); host.replaceChildren();
    editImageIds.forEach(id => {
      const tile = document.createElement('div'); tile.className = 'chat-image-tile';
      const image = new Image(); image.src = '/api/uploads/' + id; image.alt = 'Attached image';
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Remove attached image');
      remove.onclick = () => {editImageIds = editImageIds.filter(value => value !== id); renderEditImages();};
      tile.append(image, remove); host.append(tile);
    });
  }
  $('#aiChatLog').on('click', '[data-ai-message-action]' , async function () {
    const action = $(this).data('ai-message-action');
    const messageId = Number($(this).closest('.ai-message').data('message-id'));
    const entry = (aiState.messages || []).find(function (value) { return Number(value.id) === messageId; });
    if (!entry) return;
    if (action === 'edit') {editMessageInline($(this).closest('.ai-message')[0], entry); return;}
    if (action === 'delete') {
      try {
        const result = await api('/api/campaign/' + activeCampaignId + '/ai/message/' + messageId, { method: 'DELETE' });
        aiUndoDeletion = { messageId: messageId, guardId: Number(result.guard_id) || 0, chatId: activeAiChatId };
        $('#aiUndoDelete').removeClass('d-none');
        await loadAiCampaign(false);
      }
      catch (error) { $('#aiChatError').text(error.message); }
      return;
    }
    const regenerate = action === 'regenerate';
    editImageIds = regenerate ? [] : [...(entry.image_ids || [])]; renderEditImages();
    $('#aiMessageModalForm')[0].reset();
    $('#aiMessageModalForm [name=message_id]').val(messageId);
    $('#aiMessageModalForm [name=action]').val(action);
    $('#aiMessageModalForm [name=text]').val(regenerate ? '' : entry.message).prop('required', false);
    $('#aiMessageModalTitle').text(regenerate ? 'Regenerate ' + entry.persona_name + "'s reply" : 'Edit message');
    $('#aiMessageModalLabel').contents().first()[0].textContent = regenerate ? 'Guidance for the new response' : 'Message';
    $('#aiMessageModalHelp').text(regenerate ? 'Optional: tell Ollama what to change, preserve, avoid, or add. Thoughts can be written between *asterisks*.' : 'Edit the original text and formatting markers here. Remove an image tag to remove that generated image; use the × to remove an attachment.');
    $('#aiMessageModalSubmit').text(regenerate ? 'Regenerate' : 'Save');
    $('#aiMessageModalError').text('');
    aiMessageModal.show();
  });

  $('#aiUndoDelete button').on('click', async function () {
    if (!aiUndoDeletion) return;
    const pending = aiUndoDeletion;
    try {
      await api('/api/campaign/' + activeCampaignId + '/ai/message/' + pending.messageId, { method: 'PUT', body: JSON.stringify({ action: 'restore' }) });
      clearAiUndo();
      await loadAiCampaign(false);
    } catch (error) {
      clearAiUndo();
      $('#aiChatError').text(error.message);
    }
  });

  $('#aiMessageModalForm').on('submit', async function (event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(this));
    const button = $('#aiMessageModalSubmit').prop('disabled', true);
    const submitLabel = button.text();
    if (values.action === 'regenerate') button.text('Regenerating…');
    $('#aiMessageModalError').text('');
    try {
      if (values.action === 'regenerate') await api('/api/campaign/' + activeCampaignId + '/ai/regenerate', { method: 'POST', body: JSON.stringify({ message_id: Number(values.message_id), guidance: values.text || '' }) });
      else await api('/api/campaign/' + activeCampaignId + '/ai/message/' + Number(values.message_id), { method: 'PUT', body: JSON.stringify({ message: values.text, image_ids: editImageIds }) });
      aiMessageModal.hide();
      await loadAiCampaign(false);
    } catch (error) { $('#aiMessageModalError').text(error.message); }
    finally { button.text(submitLabel).prop('disabled', false); }
  });

  function captureLiveView(host) {
    const key=e=>(e.closest('[data-record-id]')?.dataset.recordId||'')+'|'+(e.querySelector(':scope > summary')?.textContent||'');
    return {top:host.scrollTop,left:host.scrollLeft,details:new Map([...host.querySelectorAll('details')].map(e=>[key(e),e.open])),key};
  }
  function restoreLiveView(host,view) {
    host.querySelectorAll('details').forEach(e=>{const open=view.details.get(view.key(e));if(open!==undefined)e.open=open;});
    host.scrollTop=view.top;host.scrollLeft=view.left;
  }
  function closeDetailThen(callback=()=>{}) {
    const modal=$('#recordDetailModal');
    if(!modal.hasClass('show')){callback();return;}
    const hide=()=>detailModal.hide();
    modal.one('hidden.bs.modal',()=>{modal.off('shown.bs.modal',hide);callback();});
    modal.one('shown.bs.modal',hide);
    hide();
  }
  function refreshOpenDetail() {
    if (!$('#recordDetailModal').hasClass('show')) return;
    const item=items.find(record=>record.id===detailItemId);
    if (!item) { closeDetailThen(); return; }
    if (detailSnapshot===JSON.stringify(items)) return;
    // Leave an equipment control alone until its current interaction finishes.
    if (document.getElementById('detailTabletop').contains(document.activeElement)) return;
    const host=document.querySelector('#recordDetailModal .modal-body'),view=captureLiveView(host);
    openDetail(item,true);
    restoreLiveView(host,view);
  }
  function applyWork(latest) {
    const previous=items;
    items=latest;
    renderCampaigns();
    renderSavedCharacters();
    renderDynamicFilters();
    renderWork();
    if (activeCampaignId) {
      const campaign=activeCampaign();
      if (!campaign) { leaveCampaign(); return; }
      $('#activeCampaignName').text(campaign.title);
      setPageTitle(campaign.title);
      const belongs=r=>r.id===activeCampaignId||Number(r.content?.campaign_id)===activeCampaignId;
      if (JSON.stringify(previous.filter(belongs))!==JSON.stringify(items.filter(belongs))) {
        renderDashboard();renderParty();
        window.MapWorkspace?.refreshRecords?.();
      }
    }
    if (isAiCampaign() && aiState) {
      renderAiPersonas();
      renderAiPersonaRecords();
    }
    refreshOpenDetail();
  }
  async function loadWork() {
    const version=++workFetchVersion,viewer=user?.id;
    workLoads++;
    try {
      const latest=user?(await api('/api/work')).items:[];
      if(version!==workFetchVersion||viewer!==user?.id)return;
      workETag=null;
      applyWork(latest);
    } finally { workLoads--; }
  }

  $('#notificationButton').on('click', async function () {
    await loadNotifications();
    notificationsModal.show();
    await api('/api/notifications/read', { method: 'PUT', body: '{}' });
    $('#notificationCount').addClass('d-none').text('0');
  });

  $('#notificationList').on('click', '.accept-invite, .decline-invite', async function () {
    const campaignId = Number($(this).data('campaign'));
    const accept = $(this).hasClass('accept-invite');
    await api('/api/invite/respond', { method: 'PUT', body: JSON.stringify({ campaign_id: campaignId, accept: accept }) });
    await loadWork();
    await loadNotifications();
    if (accept) {
      notificationsModal.hide();
      setTimeout(function () { enterCampaign(campaignId); }, 180);
    }
  });

  $('#inviteButton').on('click', function () {
    $('#inviteForm')[0].reset();
    $('#inviteError, #inviteSuccess').text('');
    inviteModal.show();
  });

  $('#inviteForm').on('submit', async function (event) {
    event.preventDefault();
    const username = new FormData(this).get('username');
    $('#inviteError, #inviteSuccess').text('');
    try {
      await api('/api/campaign/invite', {
        method: 'POST',
        body: JSON.stringify({ campaign_id: activeCampaignId, username: username })
      });
      this.reset();
      $('#inviteSuccess').text('Invitation sent. It will remain waiting until they sign in.');
    } catch (error) { $('#inviteError').text(error.message); }
  });

  $('#accountButton').on('click', function () { accountModal.show(); });
  $('[data-auth-mode]').on('click', function () {
    authMode = $(this).data('auth-mode');
    $('[data-auth-mode]').removeClass('active');
    $(this).addClass('active');
    $('.register-only').toggleClass('d-none', authMode !== 'register');
    $('#accountForm [name=password]').attr('autocomplete', authMode === 'login' ? 'current-password' : 'new-password');
    $('#accountForm button[type=submit]').text(authMode === 'login' ? 'Sign in' : 'Create account');
    $('#accountError').text('');
  });

  $('#accountForm').on('submit', async function (event) {
    event.preventDefault();
    const form = this;
    const values = Object.fromEntries(new FormData(form));
    try {
      const result = await api('/api/' + authMode, { method: 'POST', body: JSON.stringify(values) });
      user = result.user;
      form.reset();
      $('#accountError').text('');
      renderAccount();
      await loadWork();
      await Promise.all([loadCommunity(), loadNotifications()]);
      accountModal.hide();
    } catch (error) { $('#accountError').text(error.message); }
  });

  $('#logoutButton').on('click', async function () {
    await api('/api/logout', { method: 'POST', body: '{}' });
    if (activeCampaignId) leaveCampaign();
    user = null;
    items = [];
    renderAccount();
    renderCampaigns();
    renderSavedCharacters();
    renderWork();
    $('#communityFaces').empty();
    accountModal.hide();
  });

  $('#accountTranslation').on('change', function () { window.SiteI18n.setLanguage(this.value); });

  $('#settingsForm').on('submit', async function (event) {
    event.preventDefault();
    const form = this;
    const values = Object.fromEntries(new FormData(form));
    values.translation_enabled = values.ui_language !== 'en';
    $('#settingsError, #settingsSuccess').text('');
    if (values.new_password !== values.confirm_password) {
      $('#settingsError').text('The new passwords do not match.');
      return;
    }
    try {
      const result = await api('/api/account', {
        method: 'PUT',
        body: JSON.stringify(values)
      });
      user = result.user;
      renderAccount();
      $('#settingsSuccess').text('Account settings saved.');
    } catch (error) {
      $('#settingsError').text(error.message);
    }
  });

  $('#settingsForm [name=avatar_file]').on('change', async function () {
    if (!this.files[0]) return;
    $('#settingsError, #settingsSuccess').text('');
    $('#settingsSuccess').text('Importing image…');
    try {
      const image = await uploadImage(this.files[0]);
      $('#settingsForm [name=avatar_id]').val(image.image_id);
      showImage('#profileImagePreview', image.image_id, '♙');
      $('#settingsSuccess').text('Picture uploaded. Enter your current password and save settings.');
    } catch (error) {
      this.value = '';
      $('#settingsError').text(error.message);
    }
  });

  $('#workForm [name=image_file]').on('change', async function () {
    if (!this.files[0]) return;
    $('#workError').text('');
    $('#workError').text('Importing image…');
    try {
      const image = await uploadImage(this.files[0]);
      $('#workForm [name=image_id]').val(image.image_id);
      showImage('#recordImagePreview', image.image_id, '✦');
      $('#workError').text('');
    } catch (error) {
      this.value = '';
      $('#workError').text(error.message);
    }
  });

  $('#newWorkButton').on('click', function () {
    openRecord('chronicle');
  });
  $('#newCampaignButton').on('click', function () { openRecord('campaign'); });
  CampaignTransfer.setup(async()=>{await loadWork();renderCampaigns();});
  $('#newSavedCharacterButton').on('click', function () { openRecord('character_template'); });

  $('#importCharacterTemplate').on('click', function () {
    const sourceId = Number($('#characterTemplateSelect').val()), source = savedCharacters().find(function (item) { return item.id === sourceId; });
    if (!source) return;
    const content = source.content || {}, rig = content.character_rig ? JSON.parse(JSON.stringify(content.character_rig)) : null;
    editableRecordContent = Object.assign({}, editableRecordContent, content);
    $('#workForm [name=title]').val(source.title);
    $('#workForm [name=summary]').val(content.summary || '');
    $('#workForm [name=tags]').val(content.tags || '');
    $('#workForm [name=notes]').val(content.notes || '');
    ['character_level', 'experience_points', 'character_class', 'subclass', 'species', 'background', 'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma', 'armor_class', 'hp_current', 'hp_max', 'hp_temporary', 'initiative', 'speed', 'passive_perception', 'hit_die', 'death_save_successes', 'death_save_failures'].forEach(function (name) {
      if (content[name] !== undefined) $('#workForm [name="' + name + '"]').val(content[name]);
    });
    updateCharacterStatMath();
    Tabletop.hydrate(content);
    $('#workForm [name=image_id]').val(content.image_id || '');
    showImage('#recordImagePreview', content.image_id, '♙');
    if (window.characterRigEditor && !$('#characterRigWorkshop').hasClass('d-none')) window.characterRigEditor.load(rig);
    else $('#characterRigData').val(JSON.stringify(rig));
    $('#characterTemplateImportStatus').text(source.title + ' copied into this campaign form. Save to finish importing it.');
  });

  $('#workList').on('click', '.work-card', function (event) {
    if ($(this).is('.ai-chat-card,.location-map-card')) return;
    if ($(event.target).closest('.delete-work').length) return;
    const id = Number($(this).data('id'));
    const item = items.find(function (value) { return value.id === id; });
    openDetail(item);
  }).on('keydown', '.work-card', function (event) {
    if ($(this).hasClass('ai-chat-card')) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      $(this).trigger('click');
    }
  }).on('click', '.delete-work', async function (event) {
    event.stopPropagation();
    const id = Number($(this).closest('.work-card').data('id'));
    if (!confirm('Delete this saved item?')) return;
    await api('/api/work/' + id, { method: 'DELETE' });
    await loadWork();
  });

  $('#detailEditButton').on('click', function () {
    const item = items.find(function (value) { return value.id === detailItemId; });
    if (!item) return;
    closeDetailThen(function () {
      openRecord((item.content && item.content.category) || 'chronicle', item);
    });
  });

  $('#detailCopyReference').on('click', function () {
    const item = items.find(function (record) { return record.id === detailItemId; });
    if (!item) return;
    const copy = JSON.parse(JSON.stringify(item));
    copy.id = ''; copy.content.reference_only = false; copy.content.player_visible = false;
    copy.content.tags = String(copy.content.tags || '').replace('starter library', 'campaign copy');
    closeDetailThen(function () { openRecord(copy.content.category, copy); $('#workTitle').text('Create playable copy'); });
  });

  $('#detailSaveNotes').on('click', async function () {
    const item = items.find(function (value) { return value.id === detailItemId; });
    if (!item) return;
    $('#detailError').text('');
    try {
      await api('/api/notes/' + item.id, {
        method: 'PUT',
        body: JSON.stringify({ note: $('#detailNotes').val() })
      });
      item.personal_note = $('#detailNotes').val();
      $('#detailSaveNotes').text('Notes saved');
      setTimeout(function () { $('#detailSaveNotes').text('Save notes'); }, 1400);
    } catch (error) { $('#detailError').text(error.message); }
  });

  let recordSavePending=false;
  $('#workForm').on('submit', async function (event) {
    event.preventDefault();
    if(recordSavePending||characterGenerationController)return;
    const formData = new FormData(this);
    const values = Object.fromEntries(formData);
    let characterRig = null;
    if (['character', 'npc', 'character_template'].includes(values.category) && values.character_rig) {
      try { characterRig = JSON.parse(values.character_rig); }
      catch (error) { $('#workError').text('The character model could not be saved. Reset the skeleton and try again.'); return; }
    }
    const content = {
      category: values.category,
      reference_only: formData.has('reference_only'),
      summary: values.summary,
      tags: values.tags,
      notes: values.notes,
      role: values.role || (values.category === 'character' ? 'party' : ''),
      affiliation: values.affiliation || '',
      important: formData.has('important'),
      player_visible: formData.has('player_visible'),
      assigned_user_ids: formData.getAll('assigned_user_ids').map(Number),
      is_my_character: formData.has('is_my_character'),
      owner_user_id: ['character', 'character_template'].includes(values.category) ? (Number((items.find(function (item) { return item.id === Number(values.id); }) || { content: {} }).content.owner_user_id) || user.id) : null,
      difficulty: values.difficulty || '',
      state: values.state || '',
      location_id: Number(values.location_id) || null,
      participant_ids: formData.getAll('participant_ids').map(Number),
      owner_ids: formData.getAll('owner_ids').map(Number),
      user_ids: formData.getAll('user_ids').map(Number),
      encounter_ids: formData.getAll('encounter_ids').map(Number),
      item_type: values.item_type || '',
      rarity: values.rarity || '',
      quantity: values.quantity === undefined || values.quantity === '' ? 1 : Math.max(0, Number(values.quantity)),
      giver_id: Number(values.giver_id) || null,
      leader_id: Number(values.leader_id) || null,
      place_type: values.place_type || '',
      date_played: values.date_played || '',
      campaign_id: ['campaign', 'character_template'].includes(values.category) ? null : activeCampaignId,
      image_id: Number(values.image_id) || null,
      map_image_scale: CharacterImageScale.value(values.map_image_scale),
      spell_level: values.spell_level || '',
      school: values.school || '',
      casting_time: values.casting_time || '',
      range: values.range || '',
      duration: values.duration || '',
      action_type: values.action_type || '',
      attack_bonus: values.attack_bonus || '',
      damage: values.damage || '',
      damage_type: values.damage_type || '',
      character_level: Number(values.character_level) || 1,
      experience_points: Number(values.experience_points) || 0,
      proficiency_bonus: Number(String(values.proficiency_bonus || '').replace('+', '')) || 2,
      character_class: values.character_class || '',
      subclass: values.subclass || '',
      species: values.species || '',
      background: values.background || '',
      strength: Number(values.strength) || 10,
      dexterity: Number(values.dexterity) || 10,
      constitution: Number(values.constitution) || 10,
      intelligence: Number(values.intelligence) || 10,
      wisdom: Number(values.wisdom) || 10,
      charisma: Number(values.charisma) || 10,
      armor_class: Number(values.armor_class) || 10,
      hp_current: Math.max(0, Number(values.hp_current) || 0),
      hp_max: Number(values.hp_max) || 1,
      hp_temporary: Math.max(0, Number(values.hp_temporary) || 0),
      initiative: Number(values.initiative) || 0,
      speed: Math.max(0, Number(values.speed) || 0),
      passive_perception: Number(values.passive_perception) || 10,
      hit_die: values.hit_die || 'd8',
      death_save_successes: Math.max(0, Number(values.death_save_successes) || 0),
      death_save_failures: Math.max(0, Number(values.death_save_failures) || 0),
      character_rig: ['character', 'npc', 'character_template'].includes(values.category) ? characterRig : null,
      ai_dm: formData.has('ai_dm'),
      initial_map_kind: values.initial_map_kind || editableRecordContent.initial_map_kind || '3d',
      ai_model: values.ai_model || '',
      ai_story_mode: values.ai_story_mode || 'adaptive',
      ai_story_prompt: values.ai_story_prompt || ''
    };
    if (!['character', 'character_template'].includes(values.category)) {
      ['character_level', 'experience_points', 'proficiency_bonus', 'character_class', 'subclass', 'species', 'background', 'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma', 'armor_class', 'hp_current', 'hp_max', 'hp_temporary', 'initiative', 'speed', 'passive_perception', 'hit_die', 'death_save_successes', 'death_save_failures'].forEach(function (name) { delete content[name]; });
    }
    if(values.category === 'map_part') Object.assign(content, MapPartCards.collect(this, editableRecordContent));
    const priorItem = items.find(function (item) { return item.id === Number(values.id); });
    if (['item','spell','attack'].includes(values.category)) {
      content.grant_mode = 'characters';
      if ((values.category === 'item' ? content.owner_ids : content.user_ids).length) content.reference_only = false;
    }
    try { content.tabletop = Tabletop.collect(this, editableRecordContent); }
    catch (error) { $('#workError').text(error.message); return; }
    if (values.category === 'campaign' && priorItem) {
      ['ai_story', 'ai_memory', 'ai_world', 'ai_helper_models', 'map_time', 'map_weather', 'map_objects', 'map_paint', 'map_expanded', 'map_removed', 'map_checkpoints', 'map_folders', 'map_icons'].forEach(function (key) {
        if ((priorItem.content || {})[key] !== undefined) content[key] = (priorItem.content || {})[key];
      });
    }
    if(values.category==='character'&&!values.id&&!$('#generatedCharacterGuidance').hasClass('d-none'))content.character_guidance={core:$('#generatedCharacterCore').val(),reminder:$('#generatedCharacterReminder').val()};
    recordSavePending=true;$('#workForm button[type=submit]').prop('disabled',true);
    try {
      await api(values.id ? '/api/work/' + values.id : '/api/work', {
        method: values.id ? 'PUT' : 'POST',
        body: JSON.stringify({
          title: values.title,
          content: Object.assign({}, editableRecordContent, content)
        })
      });
      await loadWork();
      if (activeCampaignId) renderParty();
      if (activeCampaignId) renderDashboard();
      workSaveClosePending = true;
      workModal.hide();
    } catch (error) { $('#workError').text(error.message); }
    finally{recordSavePending=false;$('#workForm button[type=submit]').prop('disabled',false);}
  });

  $('#workForm').on('input change', '[name=character_level],[name=strength],[name=dexterity],[name=constitution],[name=intelligence],[name=wisdom],[name=charisma],[name^=tt_]', function () { updateCharacterStatMath(); Tabletop.update(); });
  $('#recordSearch').on('input', renderWork);
  $('#recordLibraryFilter').on('change', renderWork);
  $('#workForm').on('change', '[name=owner_ids], [name=user_ids]', function () {
    if (this.checked) $('#workForm [name=reference_only]').prop('checked', false);
  });

  let recordSyncBusy = false;
  async function syncRecords() {
    if (!user || recordSyncBusy || workLoads || document.hidden) return;
    const version=++workFetchVersion,viewer=user.id;
    recordSyncBusy = true;
    try {
      const response=await fetch('/api/work',{cache:'no-store',headers:workETag?{'If-None-Match':workETag}:{},signal:AbortSignal.timeout(10000)});
      if(version!==workFetchVersion||viewer!==user?.id)return;
      if(response.status===304)return;
      if(!response.ok)throw Error('Campaign refresh unavailable.');
      const latest=(await response.json()).items;
      if(version!==workFetchVersion||viewer!==user?.id)return;
      workETag=response.headers.get('ETag');
      if(JSON.stringify(latest)!==JSON.stringify(items))applyWork(latest);
    } catch (error) { /* A later refresh retries when the connection returns. */ }
    finally { recordSyncBusy = false; }
  }
  setInterval(()=>{syncRecords();refreshMapLibrary();},1000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncRecords();});
  window.addEventListener('online',syncRecords);
  window.addEventListener('focus',syncRecords);
  $('#inventoryPreview,#detailTabletop').on('focusout',()=>setTimeout(()=>{if(activeCampaignId)renderDashboard();refreshOpenDetail();},0));

  api('/api/me').then(async function (result) {
    user = result.user;
    renderAccount();
    await loadWork();
    await Promise.all([loadCommunity(), loadNotifications()]);
  }).catch(function () {
    renderAccount();
    renderWork();
  });

  setInterval(function () {
    if (user && !$('body').hasClass('inside-campaign')) loadCommunity().catch(function () {});
  }, 20000);
});
