const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('site/app.js','utf8');
const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const state=id=>({chat:{id},messages:[],world:{}});
function harness(api){
  const text=new Map(),renders=[];
  const $=selector=>({text(value){if(value===undefined)return text.get(selector)||'';text.set(selector,value);return this;},empty(){return this;},append(){return this;},0:{scrollIntoView(){}}});
  const ctx=vm.createContext({api,$,AbortController,Map,Number,JSON,setInterval:()=>1,clearInterval(){},
    window:{},messageEditors:new Map(),chatAttachments:{clear(){}},clearAiUndo(){},renderWork(){},setRealmMenu(){},isAiCampaign:()=>true,
    renderAiState:()=>renders.push(ctx.snapshot().state.chat.id),renderAiPersonas(){},renderAiMessages(){},loadWork:async()=>{},
    loadAiStatus:()=>new Promise(()=>{})});
  vm.runInContext(`let activeCampaignId=1,activeAiChatId=null,aiSyncBusy=false,aiSyncController=null,aiScopeVersion=0,aiReplyBusy=false,aiState=null,aiMessageSignature='',aiUndoDeletion=null,aiSyncTimer=null,activeSection=null,activeAiReplyPersona=null;const aiReplyRequests=new Map();
    ${extract('  async function requestAiResponse(', '  function renderAiAudience(')}
    ${extract('  async function loadAiCampaign(', '  function isMapLibrary(')}
    this.load=loadAiCampaign;this.reply=requestAiResponse;
    this.switchTo=id=>{activeAiChatId=id;resetAiRequests();aiState=null;aiMessageSignature='';};
    this.snapshot=()=>({state:aiState,loading:aiSyncBusy,replying:aiReplyBusy,pending:aiReplyRequests.size});`,ctx);
  return {ctx,text,renders};
}
(async()=>{
  const first=deferred(),second=deferred();let calls=0,oldSignal;
  const {ctx,renders}=harness((path,options)=>{if(++calls===1){oldSignal=options.signal;return first.promise;}return second.promise;});
  const load1=ctx.load(false);ctx.switchTo(2);assert(oldSignal.aborted);
  const load2=ctx.load(false);first.resolve(state(1));await load1;
  assert(ctx.snapshot().loading,'old request must not unlock a newer request');
  second.resolve(state(2));await load2;
  assert.equal(ctx.snapshot().state.chat.id,2);assert.deepEqual(renders,[2]);
  assert.equal(ctx.snapshot().loading,false,'unavailable Ollama status must not block conversation loading');

  let failed=true;
  const retry=harness(async()=>{if(failed)throw new Error('network stalled');return state(3);});
  await retry.ctx.load(true);assert.equal(retry.ctx.snapshot().loading,false);
  assert.match(retry.text.get('#aiChatError'),/Retrying automatically/);
  failed=false;await retry.ctx.load(true);assert.equal(retry.ctx.snapshot().state.chat.id,3);
  assert.equal(retry.text.get('#aiChatError'),'');

  const reply1=deferred(),reply2=deferred();let posts=0;
  const responses=harness((path,options)=>options?.method==='POST'?(++posts===1?reply1.promise:reply2.promise):Promise.resolve(state(4)));
  const r1=responses.ctx.reply({type:'character',id:5,name:'First'});
  responses.ctx.switchTo(4);const r2=responses.ctx.reply({type:'character',id:6,name:'Second'});
  reply1.resolve({});await r1;assert(responses.ctx.snapshot().replying,'old reply must not unlock the new chat reply');
  reply2.resolve({});await r2;assert.equal(responses.ctx.snapshot().pending,0);assert.equal(responses.ctx.snapshot().replying,false);

  const timers=[];const timeout=new AbortController();
  const apiCtx=vm.createContext({AbortSignal:{timeout:ms=>{timers.push(ms);return timeout.signal;},any:AbortSignal.any},fetch:(_path,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}))});
  vm.runInContext(extract('  async function api(', '  async function uploadImage(')+'\nthis.api=api;',apiCtx);
  const blocked=apiCtx.api('/api/campaign/1/ai');timeout.abort(new Error('timeout'));
  await assert.rejects(blocked,/timeout/);assert.equal(timers[0],15000);
  console.log('PASS: aborted and stale loads, stalled status, automatic recovery, chat-scoped reply locks, finite API timeout.');
})().catch(error=>{console.error(error);process.exitCode=1;});
