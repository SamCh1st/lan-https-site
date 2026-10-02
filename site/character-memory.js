/**
 * Edit character portrayal and evidence-backed memories through the character-memory API.
 * See [README: character memory flow](../README.md#character-memory-flow).
 */
/* The reverse side of a character sheet. All memory text is rendered as text. */
window.CharacterMemory = (() => {
  let epoch = 0;
  const kinds = ['fact','event','relationship','goal','promise','preference','belief','feeling'];
  const make = (tag, text, cls) => {const el = document.createElement(tag); if(text !== undefined) el.textContent=text; if(cls) el.className=cls; return el;};
  /**
   * Mount the guidance and memory editor for one character, guarding against stale asynchronous updates.
   * See [README](../README.md#character-memory-flow).
   */
  function mount(item, api, options) {
    const token=++epoch, toggle=document.getElementById('detailMemoryToggle'), host=document.getElementById('detailMemoryPage'), front=document.getElementById('detailFront');
    const footer=document.querySelector('#recordDetailModal .modal-footer');
    let state=null, open=false, busy=false, coreDraft=null, filter='', drafts=new Map(), expanded=new Set();
    front.hidden=false; host.hidden=true; footer.hidden=false;host.replaceChildren();
    toggle.hidden=item.content?.category!=='character'||!item.content?.campaign_id;
    toggle.textContent='Memories ▸';toggle.setAttribute('aria-expanded','false');
    const endpoint='/api/campaign/'+item.content?.campaign_id+'/characters/'+item.id+'/memory';
    const error=make('p','','memory-error');error.setAttribute('role','status');
    function field(label, value, multiline=true) {
      const wrap=make('label',label),input=make(multiline?'textarea':'input');
      input.value=value; if(multiline) {input.rows=3;input.maxLength=2000;}
      wrap.append(input);return [wrap,input];
    }
    function button(label,action,parent) {const el=make('button',label);el.type='button';el.onclick=action;parent.append(el);return el;}
    async function load(discard=false) {
      if (busy) return;busy=true;error.textContent='';
      try {const result=await api(endpoint);if(token!==epoch)return;state=result;if(discard){drafts.clear();coreDraft=null;}render();}
      catch(e){if(token===epoch) {host.replaceChildren(error);error.textContent=e.message;button('Try again',()=>load(),host);}}
      finally{busy=false;}
    }
    async function save(data,key) {
      if(busy)return;busy=true;error.textContent='';host.querySelectorAll('button,input,textarea,select').forEach(b=>b.disabled=true);
      try {const result=await api(endpoint,{method:'POST',body:JSON.stringify(data)});if(token!==epoch)return;state=result;if(key==='profile')coreDraft=null;else drafts.delete(key);render();error.textContent='Saved.';}
      catch(e){if(token===epoch)error.textContent=e.message;}
      finally {busy=false;if(token===epoch)host.querySelectorAll('button,input,textarea,select').forEach(b=>b.disabled=false);}
    }
    function memoryForm(row, parent) {
      const key=row?.id||'new', draft=drafts.get(key)||{text:row?.text||'',kind:row?.kind||'fact',pinned:!!row?.pinned,chat_id:row?.chat_id||null};
      const form=make('div',undefined,'memory-form');
      const [wrap,input]=field('Memory',draft.text);form.append(wrap);
      const [kindWrap,unused]=field('Kind','',false), select=make('select');unused.replaceWith(select);
      kinds.forEach(k=>{const option=make('option',k[0].toUpperCase()+k.slice(1));option.value=k;select.append(option);});select.value=draft.kind;form.append(kindWrap);
      const pinLabel=make('label',undefined,'memory-check'),pin=make('input');pin.type='checkbox';pin.checked=draft.pinned;pinLabel.append(pin,document.createTextNode(' Keep at the front of recall'));form.append(pinLabel);
      let scope;
      if(!row && options.chatId){const label=make('label','Use in');scope=make('select');scope.append(new Option('Every conversation',''),new Option('Only this private chat',options.chatId));scope.value=draft.chat_id||'';label.append(scope);form.append(label);}
      const remember=()=>{Object.assign(draft,{text:input.value,kind:select.value,pinned:pin.checked,chat_id:scope?Number(scope.value)||null:draft.chat_id});drafts.set(key,draft);};
      [input,select,pin,scope].filter(Boolean).forEach(el=>el.addEventListener('input',remember));
      const controls=make('div',undefined,'memory-actions');
      button(row?'Save memory':'Add memory',()=>{remember();save({action:row?'update':'add',id:row?.id,revision:row?.revision,...draft},key);},controls);
      if(row)button('Forget',()=>save({action:'delete',id:row.id,revision:row.revision},key),controls);
      form.append(controls);parent.append(form);
    }
    function render() {
      host.replaceChildren();
      host.append(make('h3',item.title+' — memories'),make('p','Only this character’s player and the campaign creator can edit this page. Stable traits apply in every conversation. Private experiences stay in their original conversation.'));
      const core=make('section',undefined,'memory-core');
      const profile=coreDraft||{core:state.profile.core,reminder:state.profile.reminder||'',enabled:!!state.profile.enabled};
      const [coreWrap,coreInput]=field('Character description, personality & roleplay guidelines',profile.core);coreInput.rows=14;coreInput.maxLength=12000;
      core.append(coreWrap,make('small','Use the character’s name in the Visual Description, Personality and Roleplay Behavior Examples headings. Write the five example actions in first person: I, my, I’m. Examples guide portrayal, not remembered history. Keep private events in chat-specific memories.'));
      const [reminderWrap,reminderInput]=field('Character reminder note',profile.reminder);reminderInput.maxLength=1000;reminderInput.rows=2;
      reminderInput.placeholder='A short reminder for every reply: voice, mannerisms, boundaries or writing preferences…';
      core.append(reminderWrap,make('small','Keep this brief—ideally under 100 words. It reinforces the character on every reply.'));
      const label=make('label',undefined,'memory-check'),enabled=make('input');enabled.type='checkbox';enabled.checked=profile.enabled;
      label.append(enabled,document.createTextNode(' Learn memories from conversations automatically'));core.append(label);
      const remember=()=>{coreDraft={core:coreInput.value,reminder:reminderInput.value,enabled:enabled.checked};};coreInput.oninput=remember;reminderInput.oninput=remember;enabled.onchange=remember;
      const ai=make('details',undefined,'memory-entry');ai.append(make('summary','Draft character guidance with AI'));
      const [ideaWrap,idea]=field('What should the AI develop or change?','');idea.maxLength=6000;idea.placeholder='Develop their voice, motivations and mannerisms while keeping their identity…';ai.append(ideaWrap);
      ai.append(make('p','Uses this character’s sheet, your current guidance and the active conversation setting. Review the draft before saving. It does not create memories or another character.'));
      button('Generate guidance draft',async()=>{
        if(busy)return;remember();busy=true;error.textContent='Drafting guidance…';
        host.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=true);
        try{const result=await api(endpoint,{method:'POST',body:JSON.stringify({action:'generate',prompt:idea.value,current:{core:coreDraft.core,reminder:coreDraft.reminder},chat_id:options.chatId||null})});
          if(token!==epoch)return;
          if(!result.draft||typeof result.draft.core!=='string'||typeof result.draft.reminder!=='string')throw Error('The AI returned an incomplete draft.');
          const previous={...coreDraft};coreDraft={...coreDraft,...result.draft};render();error.textContent='Draft ready. Review it, then Save character guidance.';
          button('Restore previous guidance',()=>{coreDraft=previous;render();error.textContent='Previous unsaved guidance restored.';},error);
        }catch(e){if(token===epoch)error.textContent=e.message;}
        finally{busy=false;if(token===epoch)host.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=false);}
      },ai);core.append(ai);
      button('Save character guidance',()=>{remember();save({action:'profile',revision:state.profile.revision,...coreDraft},'profile');},core);
      host.append(core,error);
      if(state.profile.error)host.append(make('p','The last automatic memory update could not finish. Existing memories are safe. It will retry with the next character reply. '+state.profile.error,'memory-error'));
      const tools=make('div',undefined,'memory-actions'),search=make('input');search.type='search';search.placeholder='Search memories';search.setAttribute('aria-label','Search memories');search.value=filter;tools.append(search);
      button('Reload memories',()=>load(true),tools).title='Reload and discard unsaved memory edits';host.append(tools);
      const list=make('div',undefined,'memory-list');host.append(list);
      let limit=50;
      const drawList=()=>{
        list.replaceChildren();let count=0;
        const matches=state.memories.filter(r=>(r.text+' '+r.kind).toLowerCase().includes(filter.toLowerCase()));
        matches.slice(0,limit).forEach(row=>{
          count++;const detail=make('details',undefined,'memory-entry');detail.open=expanded.has(row.id);
          const summary=make('summary',(row.pinned?'★ ':'')+row.kind[0].toUpperCase()+row.kind.slice(1)+' · '+row.text.slice(0,130));detail.append(summary);
          detail.ontoggle=()=>{if(detail.open)expanded.add(row.id);else expanded.delete(row.id);};
          detail.append(make('small',(row.manual?'Player-authored':'Learned from conversation')+' · '+(row.chat_id?'Private conversation':row.restricted?'Restricted audience':'Shared context')+' · '+row.created_at));
          if(row.status==='outdated')detail.append(make('p','Its source was changed or removed. This memory is not used unless you save a correction.','memory-error'));
          if(row.evidence.length){const sources=make('details');sources.append(make('summary','Remembered from'));row.evidence.forEach(e=>sources.append(make('blockquote',(e.speaker?e.speaker+': ':'')+e.quote)));detail.append(sources);}
          memoryForm(row,detail);list.append(detail);
        });
        if(matches.length>limit)button('Show more memories',()=>{limit+=50;drawList();},list);
        if(!count)list.append(make('p','No matching memories yet. Characters learn when they answer, or you can add a memory below.'));
      };
      search.oninput=()=>{filter=search.value;limit=50;drawList();};drawList();
      const add=make('details',undefined,'memory-entry memory-add');add.append(make('summary','Add a memory'));memoryForm(null,add);host.append(add);
    }
    toggle.onclick=()=>{open=!open;front.hidden=open;host.hidden=!open;footer.hidden=open;toggle.textContent=open?'◂ Character sheet':'Memories ▸';toggle.setAttribute('aria-expanded',String(open));if(open&&!state)load();};
  }
  return {mount};
})();
