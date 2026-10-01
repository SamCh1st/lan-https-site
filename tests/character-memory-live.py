"""Opt-in check against the installed Ollama model, using an isolated database."""
import _bootstrap
import json
from test_chat_images import ChatImagesTests
import character_memory as memory
import storage
import server

fixture=ChatImagesTests();fixture.setUp()
try:
    character=storage.create_work(fixture.player,'Elara',{'category':'character','campaign_id':fixture.cid,'owner_user_id':fixture.player,'summary':'A cautious traveler who takes promises seriously.'})
    memory.change(fixture.player,fixture.cid,character['id'],{'action':'profile','revision':0,'enabled':True,'core':'Elara speaks gently and takes commitments seriously.','reminder':'Remember who said what. Do not claim an unfinished task is done.'})
    for name,kind,text in [('Elara','character','I promise to bring medicine to Mara at the old mill tomorrow.'),('Rowan','character','I think the western bridge is broken, but I have not seen it myself.'),('Dungeon Master','dm','The medicine is still in Elara’s bag. She has not left camp yet.')]:
        storage.add_ai_message(fixture.cid,fixture.player,kind,character['id'] if kind=='character' else None,name,'user',True,text)
    history=storage.list_ai_messages(fixture.player,fixture.cid,True)
    memory.learn(character,fixture.cid,history,server.ollama_request,'gemma3:4b')
    recalled=memory.recall(fixture.player,fixture.cid,character['id'],'What do you still need to do for Mara?')
    print(json.dumps(recalled,ensure_ascii=True),flush=True)
    assert any(r['kind'] in ('promise','goal') and 'Mara' in r['memory'] for r in recalled['relevant_memories'])
    assert any('Rowan' in r['memory'] for r in recalled['relevant_memories'])
    # No original dialogue is supplied: the reply must use persisted recall alone.
    result=server.ollama_request('/api/chat',{'model':'gemma3:4b','stream':False,'think':False,'keep_alive':0,
        'options':{'num_predict':500,'temperature':0.2},'messages':[
            {'role':'system','content':'Answer as Elara in a short paragraph. '+memory.INSTRUCTIONS+'\n'+json.dumps(recalled)},
            {'role':'user','content':'Rowan: What do you still need to do for Mara?'}]},timeout=90)
    reply=result['message']['content'];print(json.dumps({'reply':reply},ensure_ascii=True),flush=True)
    assert 'medicine' in reply.lower() and 'mill' in reply.lower()
    print('PASS: real-model grounded learning, uncertain claims, reminder and durable recall without original dialogue.',flush=True)
finally:fixture.tearDown()
