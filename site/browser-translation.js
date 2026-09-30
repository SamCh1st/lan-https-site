/* Local interface translation. Saved content and API values remain unchanged. */
(() => {
  'use strict';
  const nativeFetch=window.fetch.bind(window), dictionaries={}, textState=new WeakMap(), attrState=new WeakMap();
  const ignored='script,style,code,pre,textarea,svg,canvas,[contenteditable="true"],[data-i18n-ignore],.ai-message-copy,.ai-message-head strong,.party-card strong,.work-card h3,.work-card .card-copy p,.campaign-row-copy strong,#accountButton span,#mapDetailsTitle,#campaignRigNpcSelect option,#characterTemplateSelect option,.community-face,.connection-chip,#detailFacts strong,.saved-character-card strong,#currentUsername,#activeCampaignName,#detailTitle,#detailDescription,#detailNotes,.community-tooltip';
  let preference='auto',tag='en',dictionary={},pending=false;
  const roots=new Set();
  function browserLanguage(){return (navigator.languages?.[0]||navigator.language||'en').replace(/_/g,'-');}
  function language(){return preference==='auto'?browserLanguage():preference;}
  function translate(value){
    if(tag.split('-')[0].toLowerCase()!=='fr')return value;
    const source=value.trim();
    let replacement=dictionary[source];
    if(!replacement){
      const plain=source.replace(/^[＋+←▶✦♙]+\s*/,''),prefix=source.slice(0,source.length-plain.length);
      if(dictionary[plain])replacement=prefix+dictionary[plain];
    }
    if(!replacement && source===source.toUpperCase()){
      const key=Object.keys(dictionary).find(k=>k.toUpperCase()===source);
      if(key)replacement=dictionary[key].toUpperCase();
    }
    if(!replacement){
      const match=source.match(/^(Add|Edit|Open|Save|Delete) (.+)$/);
      if(match&&dictionary[match[1]]&&dictionary[match[2]])replacement=dictionary[match[1]]+' '+dictionary[match[2]];
    }
    return replacement?value.replace(source,replacement):value;
  }
  function skip(element){return !element||!!element.closest(ignored);}
  function text(node){
    if(skip(node.parentElement)||!node.nodeValue.trim())return;
    // Options without explicit values derive their API value from displayed text.
    const option=node.parentElement;
    if(option.tagName==='OPTION'&&!option.hasAttribute('value'))option.value=option.textContent;
    const old=textState.get(node),source=old&&node.nodeValue===old.output?old.source:node.nodeValue;
    const output=translate(source);textState.set(node,{source,output});
    if(node.nodeValue!==output)node.nodeValue=output;
  }
  function attributes(element){
    if(skip(element))return;
    let saved=attrState.get(element);if(!saved){saved=new Map();attrState.set(element,saved);}
    for(const name of ['placeholder','title','aria-label']){
      if(!element.hasAttribute(name))continue;
      const value=element.getAttribute(name),old=saved.get(name),source=old&&value===old.output?old.source:value,output=translate(source);
      saved.set(name,{source,output});if(value!==output)element.setAttribute(name,output);
    }
  }
  function walk(root){
    if(root.nodeType===Node.TEXT_NODE){text(root);return;}
    if(root.nodeType!==Node.ELEMENT_NODE||skip(root))return;
    attributes(root);
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{acceptNode:n=>n.nodeType===Node.ELEMENT_NODE&&skip(n)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
    for(let node=walker.nextNode();node;node=walker.nextNode())node.nodeType===Node.TEXT_NODE?text(node):attributes(node);
  }
  function queue(root){
    if(!root)return;roots.add(root);if(pending)return;pending=true;
    setTimeout(()=>{pending=false;const batch=[...roots];roots.clear();for(const root of batch)if(root.isConnected)walk(root);},0);
  }
  async function setLanguage(value){
    preference=['auto','en','fr'].includes(value)?value:'auto';tag=language();
    const base=tag.split('-')[0].toLowerCase();
    if(base==='fr'&&!dictionaries.fr){
      try{const response=await nativeFetch('/i18n/fr.json');if(!response.ok)throw Error('Translation catalog unavailable');dictionaries.fr=await response.json();}
      catch(error){console.warn(error.message);}
    }
    dictionary=tag.split('-')[0].toLowerCase()==='fr'?(dictionaries.fr||{}):{};
    document.documentElement.lang=Object.keys(dictionary).length?'fr':'en';
    document.documentElement.setAttribute('translate','yes');document.documentElement.classList.remove('notranslate');
    document.querySelectorAll('meta[name="google"][content="notranslate"]').forEach(meta=>meta.remove());
    queue(document.documentElement);
  }
  // Include the selected language on all same-site AI/API calls, including streamed fetches.
  window.fetch=(input,init)=>{
    const url=new URL(input instanceof Request?input.url:String(input),location.href);
    if(url.origin===location.origin&&url.pathname.startsWith('/api/')){
      const headers=new Headers(init?.headers||(input instanceof Request?input.headers:undefined));
      headers.set('X-Site-Language',tag);
      init={...init,headers};
    }
    return nativeFetch(input,init);
  };
  window.SiteI18n={setLanguage,translate,get language(){return tag;},get preference(){return preference;}};
  window.applyBrowserTranslation=user=>setLanguage(user?.ui_language||'auto');
  new MutationObserver(changes=>{
    for(const change of changes){
      if(change.type==='childList')change.addedNodes.forEach(queue);
      else queue(change.target);
    }
  }).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label']});
  setLanguage('auto');
  window.addEventListener('languagechange',()=>{if(preference==='auto')setLanguage('auto');});
  if(!document.getElementById('settingsForm'))window.fetch('/api/me',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>window.applyBrowserTranslation(data?.user)).catch(()=>{});
})();
