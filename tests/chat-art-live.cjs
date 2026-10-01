// Run only against tests/chat_art_preview.py with CHAT_ART_FAKE=0 and CHAT_ART_PORT=8771.
const {request}=require(process.env.TABLETOP_PLAYWRIGHT||'C:/Users/eric_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const c=await request.newContext({ignoreHTTPSErrors:true}),base='https://127.0.0.1:8771';
 try{
  assert.equal((await c.post(base+'/api/login',{data:{username:'Player',password:'Test password 12345'}})).status(),200);
  const response=await c.post(base+'/api/campaign/1/ai/message',{data:{persona_type:'dm',message:'Here is the cup. <image>A small teal ceramic cup on a wooden table, watercolor illustration, warm morning light</image> It is ready for tea.',addressed_to_ai:true}});
  assert.equal(response.status(),201);const mid=(await response.json()).message.id;
  async function wait(){
    const start=Date.now();let last='';
    while(Date.now()-start<600000){
      const state=await(await c.get(base+'/api/campaign/1/ai')).json(),art=state.messages.find(m=>m.id===mid)?.art[0];
      if(art?.status!==last){last=art?.status;console.log(last||'preparing');}
      if(art?.status==='error')throw Error(art.error);
      if(art?.status==='complete')return art;
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
    throw Error('Local image engine did not finish within ten minutes');
  }
  const original=await wait();assert(original.image_id);
  fs.writeFileSync('tests/artifacts/chat-art-live-original.png',await(await c.get(base+'/api/uploads/'+original.image_id)).body());
  const edit=await c.post(base+'/api/campaign/1/ai/art/'+original.id,{data:{action:'edit',revision:original.revision,prompt:'Add a small gold star painted on the front of the teal cup. Keep the cup, table, composition, and watercolor style.'}});assert.equal(edit.status(),202,await edit.text());
  const changed=await wait();assert.notEqual(changed.image_id,original.image_id);
  fs.writeFileSync('tests/artifacts/chat-art-live-edited.png',await(await c.get(base+'/api/uploads/'+changed.image_id)).body());
  console.log('PASS: real local generation and source-image editing completed through the chat endpoints.');
 }finally{await c.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});
