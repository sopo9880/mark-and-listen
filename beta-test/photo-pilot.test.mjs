import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildBetaServer} from '../src/beta-server.mjs';
import {verifiedNarration,transcriptDiff} from '../src/narration.mjs';
import {generateWithProvider} from '../src/providers.mjs';
import {wavFromPcm} from '../src/gemini-live.mjs';

const complete='A. The woman is arranging books. B. The window is closed. C. Three chairs are by the door. D. The table is not empty.';
const statements=['The woman is arranging books.','The window is closed.','Three chairs are by the door.','The table is not empty.'];
const bad=[
  complete.replace(' The window is closed.',''),
  complete.replace('A. The woman is arranging books. B. The window is closed.','B. The window is closed. A. The woman is arranging books.'),
  complete.split(' D.')[0],
  'Please provide the language-test listening script you would like me to read.',
  complete.replace('Three','Four'),
  complete.replace('not empty','empty'),
];
test('multisentence and A–D transcript validator preserves full order, numbers and negation',()=>{
  assert.equal(transcriptDiff(complete,complete.toUpperCase().replace('THREE','3')).exact,true);
  assert.equal(transcriptDiff('The meeting starts at ten fifteen. Bring three copies.','The meeting starts at 10:15. Bring 3 copies!').exact,true);
  assert.equal(transcriptDiff('Do not open the door.',"Don't open the door.").exact,true);
  assert.equal(transcriptDiff('It is twelve dollars.','It is 12 dollars!').exact,true);
  for(const actual of bad)assert.equal(transcriptDiff(complete,actual).exact,false,actual);
});
test('only the failed segment is sent again to the same provider and model, at most twice',async()=>{
  let calls=0;const args={provider:'gemini',model:'gemini-3.8-live',prompt:complete};
  const result=await verifiedNarration(async receive=>{
    assert.equal(receive,args);
    return {transcript:++calls===3?complete:bad[calls-1]};
  },args);
  assert.equal(result.attempts,3);
  calls=0;
  await assert.rejects(verifiedNarration(async()=>({transcript:bad[calls++]}),args),{code:'NARRATION_MISMATCH'});
  assert.equal(calls,3);
});
test('both selected image endpoints transmit the JPEG bytes, with no filenames',async()=>{
  const image=Buffer.from('pixel fixture');
  for(const provider of ['gemini','openai']){
    const result=await generateWithProvider({provider,apiKey:'MOCK-KEY',model:'mock-vision',prompt:'Use the image.',images:[image],
      fetchImpl:async (url,options)=>{
        assert.equal(new URL(url).hostname,provider==='gemini'?'generativelanguage.googleapis.com':'api.openai.com');
        const body=JSON.parse(options.body);
        const payload=provider==='gemini'?body.contents[0].parts[1].inlineData.data:body.input[0].content[1].image_url.split(',')[1];
        assert.deepEqual(Buffer.from(payload,'base64'),image);
        return Response.json(provider==='gemini'?{candidates:[{content:{parts:[{text:'valid'}]}}]}:{output_text:'valid'});
      }});
    assert.equal(result,'valid');
  }
});
test('six-photo pilot imports, independently rejects bad questions, retries audio, then scores offline',async t=>{
  const dir=process.env.MARK_PRIVATE_PILOT;
  const jpgs=dir?await Promise.all((await readdir(dir)).filter(n=>n.endsWith('.jpg')).sort().map(n=>readFile(join(dir,n)))):
    Array.from({length:6},(_,i)=>Buffer.from([255,216,...Buffer.alloc(20,i+1),255,217]));
  assert.equal(jpgs.length,6);
  const root=await mkdtemp(join(tmpdir(),'mark-photo-test-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  let verdict='ambiguous',pictures=0,voiceCalls=0,offline=false,failAudio=false,modelError=false;
  const updater={executable:async()=>null,status:async()=>({supported:false})};
  const deps={root,updater,autoUpdate:false,models:async()=>{if(modelError)throw Error('secret');return [{id:'mock-live'}];},
    generate:async args=>{
      assert.equal(offline,false);assert.equal(args.model,'mock-image');
      assert.ok(jpgs.some(j=>j.equals(args.images[0])));
      assert.equal(args.prompt.includes('.jpg'),false);pictures++;
      if(pictures%2)return JSON.stringify({choices:statements,answer:0});
      return JSON.stringify({labels:verdict==='multiple'?['true','true','false','false']:['true','false','false','false'],ambiguous:verdict==='ambiguous',duplicate:verdict==='duplicate',evidence:'모의 검증'});
    },
    live:async args=>{
      assert.equal(offline,false); assert.equal(args.provider,'gemini');assert.equal(args.model,'mock-live');voiceCalls++;
      assert.equal(transcriptDiff(complete,args.prompt).exact,true);
      return {wav:wavFromPcm([Buffer.alloc(4800,1)],4800,24000),transcript:failAudio||voiceCalls===1?bad[3]:complete};
    },
  };
  async function listen(){
    const {server,store}=await buildBetaServer(deps);
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const base='http://127.0.0.1:'+server.address().port;
    const token=(await(await fetch(base+'/api/session')).json()).token;
    const close=async()=>{if(!server.listening)return;server.closeAllConnections();await new Promise(r=>server.close(r));};
    t.after(close);
    async function request(path,body){
      const response=await fetch(base+'/api/'+path,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json','x-mark-session':token},body:JSON.stringify(body)});
      return {status:response.status,data:await response.json()};
    }
    return {store,request,base,close};
  }
  let {store,request,base,close}=await listen();
  await request('settings',{keyProvider:'gemini',apiKey:'MOCK-KEY',liveProvider:'gemini',liveModel:'mock-live'});
  assert.equal((await request('connections')).data.gemini,'unverified');
  modelError=true;
  assert.equal((await request('models',{provider:'gemini'})).status,502);
  assert.equal((await request('connections')).data.gemini,'error');
  modelError=false;
  await request('models',{provider:'gemini'});
  assert.equal((await request('connections')).data.gemini,'connected');
  const images=jpgs.map(j=>j.toString('base64'));
  assert.equal((await request('photo-pilot',{images:images.map(()=>images[0]),provider:'gemini',model:'mock-image'})).status,400);
  const created=await request('photo-pilot',{images,provider:'gemini',model:'mock-image'});
  assert.equal(created.status,200);
  const {id}=created.data;
  for(const invalid of ['ambiguous','multiple','duplicate']){
    verdict=invalid;
    assert.equal((await request('produce',{id})).status,502);
    assert.equal((await store.read(id)).groups[0].status,'failed');
  }
  verdict='ok';
  for(let i=0;i<6;i++)assert.equal((await request('produce',{id})).status,200);
  assert.equal((await request('attempt/start',{id})).status,409);
  assert.equal((await request('test-live',{script:'choices'})).status,200);
  assert.equal(voiceCalls,2);
  assert.equal((await request('produce',{id})).status,200);
  failAudio=true;
  const before=voiceCalls;
  assert.equal((await request('produce',{id})).status,502);
  assert.equal(voiceCalls-before,3);
  assert.equal((await store.read(id)).groups[0].segments[0].status,'ready');
  assert.equal((await store.read(id)).groups[1].segments[0].status,'failed');
  failAudio=false;
  for(let i=0;i<5;i++)assert.equal((await request('produce',{id})).status,200);
  let e=await store.read(id);
  for(const group of e.groups){
    await request('review',{id,groupId:group.id,approved:true});
    await request('review',{id,groupId:group.id,segmentId:group.segments[0].id,approved:true});
  }
  await close();
  ({store,request,base}=await listen());offline=true;
  e=await store.read(id);
  for(const [i,g] of e.groups.entries()){
    assert.deepEqual(Buffer.from(await(await fetch(base+g.image)).arrayBuffer()),jpgs[i]);
    assert.equal((await fetch(base+g.segments[0].audio,{headers:{range:'bytes=0-43'}})).status,206);
  }
  const attempt=await request('attempt/start',{id});
  assert.equal(attempt.status,200);
  for(const g of e.groups)await request('attempt/action',{id,attemptId:attempt.data.id,action:{type:'mark',phase:'LC',questionId:g.questions[0].id,index:0}});
  const result=await request('attempt/action',{id,attemptId:attempt.data.id,action:{type:'next',phase:'LC'}});
  assert.equal(result.data.summary.correct,6);
});
