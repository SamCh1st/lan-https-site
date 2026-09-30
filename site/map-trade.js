/* Shared character wallets and merchant inventories. Values travel as integer copper. */
(function(){
 const people=['shop','npc','encounter'];
 const cp=v=>{const n=Number(String(v).replace(',','.')),c=Math.round(n*10000);if(!Number.isFinite(n)||n<0||c>1e12||Math.abs(n*10000-c)>.0001)throw Error('Enter gold with up to four decimal places.');return c;};
 const denominations=[['cp','Copper',1],['sp','Silver',100],['gp','Gold',10000]];
 const split=v=>({cp:Number(v||0)%100,sp:Math.floor(Number(v||0)/100)%100,gp:Math.floor(Number(v||0)/10000)});
 const gold=v=>(Number(v||0)/10000).toLocaleString(undefined,{maximumFractionDigits:4})+' gp';
 const displayUnit=v=>denominations[Number(v)>=10000?2:Number(v)>=100?1:0];
 const money=v=>{const [unit,,rate]=displayUnit(v);return (Number(v||0)/rate).toLocaleString(undefined,{maximumFractionDigits:4})+' '+unit;};
 function coinSummary(total){const box=document.createElement('span');box.className='coin-balance';const [unit,name]=displayUnit(total),coin=document.createElement('span');coin.className='coin-amount';const img=document.createElement('img');img.src='/assets/coins/two-coins.svg';img.className='coin-image coin-'+unit;img.alt=name;coin.append(img,document.createTextNode(money(total)));box.append(coin);return box;}
 function coinInputs(total,title){const box=document.createElement('div');box.className='coin-inputs';const fields={},parts=split(total);for(const [unit,name] of denominations){const label=document.createElement('label'),img=document.createElement('img');img.src='/assets/coins/two-coins.svg';img.className='coin-image coin-'+unit;img.alt='';label.append(img,document.createTextNode(name));const field=document.createElement('input');field.type='number';field.min=0;field.step=1;field.max=1e12;field.value=parts[unit];field.setAttribute('aria-label',title+' '+name.toLowerCase());fields[unit]=field;label.append(field);box.append(label);}return {element:box,read(){let total=0;for(const [unit,,rate] of denominations){const value=Number(fields[unit].value);if(!Number.isSafeInteger(value)||value<0)throw Error('Enter whole, nonnegative coins.');total+=value*rate;}if(!Number.isSafeInteger(total)||total>1e12)throw Error('This coin total is too large.');return total;}};}
 function value(record){const t=record?.content?.tabletop||{};if(Number.isSafeInteger(t.value_cp))return t.value_cp;const m=String(t.value||'').match(/^\s*([\d,]+(?:\.\d+)?)\s*(cp|sp|ep|gp|pp)\s*$/i);if(m)return Math.round(Number(m[1].replaceAll(',',''))*({cp:1,sp:100,ep:5000,gp:10000,pp:100000}[m[2].toLowerCase()]));const c=record?.content||{};return c.category==='item'?({'Common':100,'Uncommon':400,'Rare':4000,'Very Rare':40000,'Legendary':200000}[c.rarity]||0)*(c.item_type==='Potion'?5000:10000):0;}
 let target=null,mode='choose',recipientId=null;
 function reset(){target=null;mode='choose';recipientId=null;}
 function render(n,options,list){
  if(target!==n.id){target=n.id;mode='choose';recipientId=null;}
  const person=people.includes(n.type),records=options.getRecords?.()||[],characters=records.filter(r=>['character','npc'].includes(r.content.category)&&r.id!==n.card_id&&(options.dm||r.content.category==='character'&&Number(r.content.owner_user_id)===Number(options.viewerId)));
  const character=characters.find(c=>c.id===recipientId)||characters[0];recipientId=character?.id;
  const add=(tag,text,parent=list)=>{const e=document.createElement(tag);if(text)e.textContent=text;parent.append(e);return e;};
  const label=add('label',person?'Act as':'Take as'),select=add('select','',label);select.setAttribute('aria-label','Take as character');characters.forEach(c=>select.add(new Option(c.title,c.id)));select.value=recipientId||'';select.onchange=()=>{recipientId=Number(select.value);list.replaceChildren();render(n,options,list);};
  if(person){const choice=add('section');choice.setAttribute('aria-label','Trade or steal');list.prepend(choice);add('h4','Trade or steal?',choice);const switcher=add('div','',choice);switcher.className='map-trade-switch';switcher.setAttribute('role','group');switcher.setAttribute('aria-label','Choose Trade or Steal');for(const m of ['trade','steal']){const b=add('button',m==='trade'?'Trade':'Steal',switcher);b.type='button';b.setAttribute('aria-pressed',String(mode===m));b.onclick=()=>{mode=m;list.replaceChildren();render(n,options,list);};}}
  if(person&&mode==='choose'){add('p','Choose Trade to buy and sell, or Steal to take goods without payment. Stealing requirements still apply.');return;}
  const status=add('p');status.setAttribute('role','status');const reach=options.interactionRange?.(character)||{allowed:true};if(!reach.allowed)status.textContent=reach.message;
  async function run(data,button){button.disabled=true;status.textContent='Saving…';try{await options.onTrade({...data,node_id:n.id,character_id:recipientId});}catch(e){status.textContent=e.message;button.disabled=false;}}
  function wallet(title,amount,which){
   const row=add('div');row.className='map-trade-wallet';add('strong',title,row);row.append(coinSummary(amount));
   if(options.dm){const editor=add('details','',row);editor.className='map-wallet-editor';add('summary','Edit balance',editor);const fields=coinInputs(amount,title);editor.append(fields.element);const save=add('button','Set money',editor);save.type='button';save.onclick=()=>{try{const data={action:'set_money',amount_cp:fields.read(),node_id:which==='part'?n.id:null,character_id:recipientId};save.disabled=true;options.onTrade(data).catch(e=>{status.textContent=e.message;save.disabled=false;});}catch(e){status.textContent=e.message;}};}
  }
  wallet(person?'Merchant holds':'Coins inside',n.money_cp||0,'part');
  if(character)wallet(character.title+' holds',character.content.tabletop?.money_cp||0,'character');
  if(mode==='steal'&&person)add('p','Steal transfers the selected quantity without payment. Required items and dice checks are verified first.');
  if((!person||mode==='steal')&&(n.money_cp||0)>0){const row=add('div');row.className='map-trade-wallet';const amount=coinInputs(n.money_cp,'Coins to take');row.append(amount.element);const take=add('button',person?'Steal coins':'Take coins',row);take.type='button';take.disabled=!character||!reach.allowed;take.onclick=()=>{try{run({action:person?'steal_money':'take_money',amount_cp:amount.read()},take);}catch(e){status.textContent=e.message;}};}
  add('h4',person&&mode==='trade'?'Buy':'Contents');
  if(!(n.contents||[]).length)add('p',person&&mode==='trade'?'Nothing for sale.':'This container is empty.');
  for(const entry of n.contents||[]){
   const record=records.find(r=>r.id===entry.record_id),price=entry.price_cp??value(record),row=add('div');row.className='map2-loot-row';
   const buying=person&&mode==='trade',shown=record||{id:entry.record_id,title:entry.title||'Item',content:{category:entry.category||'item'}};
   const name=RecordCards.create(shown,{onOpen:record&&options.onOpenRecord?()=>options.onOpenRecord(record):null,description:buying?entry.quantity+' in stock':'Quantity '+entry.quantity});row.append(name);
   if(buying){const priceLine=document.createElement('span');priceLine.className='record-card-price';priceLine.append(coinSummary(price),document.createTextNode(' each'));name.querySelector('strong').append(priceLine);}
   const actions=add('div','',row);actions.className='map-trade-actions';
   const b=add('button',person?(buying?'Buy':'Steal'):'Take',actions);b.type='button';
   if(person){
    const quantity=add('input','',actions);quantity.type='number';quantity.min=1;quantity.max=shown.content.category==='item'?entry.quantity:1;quantity.step=1;quantity.value=1;
    quantity.setAttribute('aria-label','Quantity to '+(buying?'buy':'steal')+' of '+shown.title);quantity.title=buying?'Quantity to buy':'Quantity to steal';
    quantity.dataset.tradeQuantity=(buying?'buy-':'steal-')+entry.record_id;
    const update=()=>{const count=Number(quantity.value);b.disabled=!character||!reach.allowed||!quantity.validity.valid||!Number.isSafeInteger(count)||count<1||(buying&&(character.content.tabletop?.money_cp||0)<price*count);b.title=b.disabled?'Choose an available quantity your character can afford':(buying?'Buy '+count+' for '+money(price*count):'Steal '+count);};
    quantity.addEventListener('input',update);update();
    b.onclick=async()=>{if(b.disabled||!quantity.reportValidity())return;quantity.disabled=true;await run({action:buying?'buy':'steal',record_id:entry.record_id,quantity:Number(quantity.value)},b);quantity.disabled=false;};
   }else{
    b.disabled=!character||!reach.allowed;
    b.onclick=async()=>{if(b.disabled)return;b.disabled=true;try{if(person)await run({action:'steal',record_id:entry.record_id},b);else await options.onTake(n.id,entry.record_id,recipientId);}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};
   }
  }
  if(person&&mode==='trade'&&character){
   add('h4','Sell');
   const owned=records.filter(r=>r.content.category==='item'&&!r.content.reference_only&&r.content.owner_ids?.length===1&&r.content.owner_ids[0]===character.id&&(r.content.quantity??1)>0);
   if(!owned.length)add('p','No items held exclusively by this character to sell.');
   for(const item of owned){
    const price=value(item),row=add('div');row.className='map2-loot-row';
    const name=RecordCards.create(item,{onOpen:options.onOpenRecord?()=>options.onOpenRecord(item):null});row.append(name);
    const priceLine=add('span','',name.querySelector('strong'));priceLine.className='record-card-price';priceLine.append(coinSummary(price),document.createTextNode(' each'));
    const actions=add('div','',row);actions.className='map-trade-actions';
    const b=add('button','Sell',actions);b.type='button';
    const quantity=add('input','',actions);quantity.type='number';quantity.min=1;quantity.max=item.content.quantity??1;quantity.step=1;quantity.value=1;
    quantity.setAttribute('aria-label','Quantity to sell of '+item.title);quantity.title='Quantity to sell';quantity.dataset.tradeQuantity='sell-'+item.id;
    const update=()=>{const count=Number(quantity.value);b.disabled=!reach.allowed||!quantity.validity.valid||!Number.isSafeInteger(count)||count<1||(n.money_cp||0)<price*count;b.title=!reach.allowed?reach.message:b.disabled?'Choose a quantity you hold that the merchant can afford':'Sell '+count+' for '+money(price*count);};
    quantity.addEventListener('input',update);update();
    b.onclick=async()=>{if(b.disabled||!quantity.reportValidity())return;quantity.disabled=true;await run({action:'sell',record_id:item.id,quantity:Number(quantity.value)},b);quantity.disabled=false;};
   }
  }
  if(!character)add('p','Create a character before trading or taking items.');
 }
 window.MapTrade={render,reset,value,cp,money,people,coinSummary,coinInputs,denominations,split,gold};
})();
