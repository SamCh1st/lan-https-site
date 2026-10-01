/* Small, literal-safe roleplay markup. No message text is inserted as HTML. */
(function () {
  const rules = [
    {mark:'```', cls:'written-block', tag:'span'},
    {mark:'`', cls:'written', tag:'span'},
    {mark:'**', cls:'emphasis', tag:'strong'},
    {mark:'*', cls:'thought', tag:'em'},
    {mark:'#', cls:'scene', tag:'span'},
    {mark:'"', cls:'speech', tag:'span'},
    {mark:'“', end:'”', cls:'speech', tag:'span'},
    {mark:'‘', end:'’', cls:'whisper', tag:'em', quoteBoundary:true},
    {mark:"'", cls:'whisper', tag:'em', quoteBoundary:true}
  ];
  const word = value => !!value && /[\p{L}\p{N}_]/u.test(value);
  function escaped(text, at) {let count=0; while(at>0 && text[--at]==='\\')count++; return count%2===1;}
  function close(text, start, rule, parent='', depth=0) {
    if(depth>8)return -1;
    let at=start;
    while(at<text.length){
      if(escaped(text,at)){at++;continue;}
      const longer=(rule.mark==='*'&&text.startsWith('**',at)&&!(parent==='**'&&text.startsWith('***',at))) || (rule.mark==='`'&&text.startsWith('```',at));
      if(!longer&&text.startsWith(rule.end||rule.mark,at)&&(!rule.quoteBoundary||!word(text[at+1])))return at;
      let skipped=false;
      for(const child of rules){
        if(child.mark===rule.mark||!text.startsWith(child.mark,at)||(child.quoteBoundary&&word(text[at-1])))continue;
        const end=close(text,at+child.mark.length,child,rule.mark,depth+1);
        if(end>at+child.mark.length){at=end+child.mark.length;skipped=true;break;}
      }
      if(!skipped)at++;
    }
    return -1;
  }
  function append(host, text, depth=0, partial=false) {
    let plain='', at=0;
    const flush=()=>{if(plain){host.append(document.createTextNode(plain));plain='';}};
    while(at<text.length){
      if(text[at]==='\\' && /[\\*#`'"<>]/.test(text[at+1]||'')){plain+=text[at+1];at+=2;continue;}
      let found=false;
      if(depth<8)for(const rule of rules){
        if(!text.startsWith(rule.mark,at) || (rule.quoteBoundary&&word(text[at-1])))continue;
        let end=close(text,at+rule.mark.length,rule);
        if(end<=at+rule.mark.length){if(!partial)continue;end=text.length;}
        flush();const node=document.createElement(rule.tag);node.className='chat-style-'+rule.cls;
        const inside=text.slice(at+rule.mark.length,end);
        append(node,inside,depth+1,partial);
        host.append(node);at=end+rule.mark.length;found=true;break;
      }
      if(!found)plain+=text[at++];
    }
    flush();
  }
  function imageMatches(text, options={}) {
    const written=[...text.matchAll(/```[\s\S]*?```|`[^`]*`/g)].filter(m=>!escaped(text,m.index));
    const allowed=at=>!escaped(text,at)&&!written.some(w=>at>=w.index&&at<w.index+w[0].length);
    const matches=[...text.matchAll(/<image>([\s\S]*?)<\/image>/g)].filter(m=>allowed(m.index));
    if(options.incomplete){
      const start=text.lastIndexOf('<image>');
      if(start>=0&&allowed(start)&&!matches.some(m=>start>=m.index&&start<m.index+m[0].length))matches.push({0:text.slice(start),1:'',index:start,incomplete:true});
    }
    if(options.partial){
      const start=text.lastIndexOf('<'),tail=text.slice(start);
      if(start>=0&&/^<(?:i|im|ima|imag|image)$/.test(tail)&&allowed(start)&&!matches.some(m=>start>=m.index&&start<m.index+m[0].length))matches.push({0:tail,1:'',index:start,incomplete:true});
    }
    return matches.sort((a,b)=>a.index-b.index);
  }
  function guide(host, target) {
    const details=document.createElement('details');details.className='chat-format-guide';
    const summary=document.createElement('summary');summary.textContent='Writing styles dictionary';details.append(summary);
    const examples=[['Dialogue','"Hello there."'],['Thought','*I wonder what happened.*'],['Action / scene','#She opens the door.#'],['Whisper',"'Keep your voice down.'"],['Emphasis','**Remember this.**'],['Message / book text','`Meet me at sunrise.`']];
    for(const [label,sample] of examples){
      const row=document.createElement('div');row.className='chat-format-example';
      const button=document.createElement('button');button.type='button';button.textContent=sample;button.title='Insert '+label.toLowerCase();
      button.onclick=()=>{const field=document.querySelector(target);if(!field)return;field.setRangeText(sample,field.selectionStart,field.selectionEnd,'end');field.dispatchEvent(new Event('input',{bubbles:true}));field.focus();};
      const name=document.createElement('span');name.textContent=label;const preview=document.createElement('span');append(preview,sample);
      row.append(button,name,preview);details.append(row);
    }
    const nested=document.createElement('div');nested.className='chat-format-example';
    const syntax=document.createElement('code');syntax.textContent='`The note says: *I miss you.* Come **home**.`';
    const preview=document.createElement('span');append(preview,syntax.textContent);nested.append(syntax,preview);details.append(nested);
    const note=document.createElement('p');note.textContent='Click an example to insert it. Styles can nest: the inner style stands out and all formatting markers disappear. Triple backticks frame a longer written passage. Text-message replies use backticks too; emojis can be included naturally. All styles are visible to readers. Use <image>description</image> outside backticks to draw at that point in the message. Ellipses (…) remain ordinary pauses.';details.append(note);host.append(details);
  }
  window.ChatFormat={append,imageMatches,guide};
})();
