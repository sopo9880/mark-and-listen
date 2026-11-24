import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {BANK} from '../public/bank.mjs';
import {choose,newSession,score,parseGenerated} from '../public/core.mjs';
import {buildServer} from '../src/server.mjs';
import {generateWithCodex} from '../src/codex-engine.mjs';

const output=JSON.stringify([1,2,3].map(n=>({question:`Our local team ${n} will _____ tomorrow.`,choices:['work','works','worked','working'],answer:0,explanation:'will 뒤에 동사원형 work가 옵니다.'})));
test('strict answers affect grade exclusively via manual OMR; correct index zero is not blank',()=>{
  let s=newSession('strict',BANK);
  assert.strictEqual(choose(s,BANK,'lc1',0,'question'),s);
  assert.strictEqual(choose(s,BANK,'lc1',3,'omr'),s);
  s=choose(s,BANK,'lc1',0,'omr');
  s=choose(s,BANK,'lc2',0,'omr');
  assert.deepEqual(score(s,BANK).LC,{total:6,correct:1,unsolved:4});
  s=choose(s,BANK,'lc2',null,'omr');
  assert.equal(score(s,BANK).unsolved,15);
  s.submitted=true;
  assert.strictEqual(choose(s,BANK,'lc1',1,'omr'),s);
});
test('generated parser validates quantity, structure, answer and duplicates',()=>{
  assert.equal(parseGenerated(output).length,3);
  const v=JSON.parse(output); v[2].question=v[1].question;
  assert.throws(()=>parseGenerated(JSON.stringify(v)),/형식 검사/);
  v[2].question='Something valid will _____ tomorrow and next week.'; v[0].answer=-1;
  assert.throws(()=>parseGenerated(JSON.stringify(v)),/형식 검사/);
});
test('Codex path refuses API-mode login, ignores user config, and requires complete terminal event',async()=>{
  const calls=[];
  const mockAuth=(exe,args,opts)=>{calls.push([exe,args,opts]);return {code:0,stdout:'Logged in using an API key',stderr:''};};
  await assert.rejects(generateWithCodex({executable:'fake',prompt:'test',runCommand:mockAuth}),/ChatGPT/);
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0][1],['login','status']);
  const authOutput={code:0,stdout:'Logged in using ChatGPT',stderr:''};
  const evt=JSON.stringify({type:'item.completed',item:{type:'agent_message',text:output}});
  const runCommand=async(_exe,args,opts)=>{
    if(args[0]==='login')return authOutput;
    assert.ok(args.includes('--ignore-user-config'));
    assert.equal(opts.stdin,'test');
    return {code:0,stdout:evt,stderr:''};
  };
  await assert.rejects(generateWithCodex({executable:'fake',prompt:'test',runCommand}),/완료된 문항/);
  assert.equal(await generateWithCodex({executable:'fake',prompt:'test',runCommand:async(...args)=>{
    const got=await runCommand(...args);if(args[1][0]==='exec')got.stdout+='\n{"type":"turn.completed"}';return got;
  }}),output);
});
test('localhost API enforces origin, session token, known engine and explicit updater action; serves real MP3',async t=>{
  const calls=[],updater={status:async()=>({supported:true}),executable:async()=>'/controlled/codex',install:async target=>{calls.push(target);return {installed:'0.1.0'};}};
  const server=await buildServer({updater,generate:async p=>{calls.push(p.provider);return output;},
    codex:async p=>{assert.equal(p.executable,'/controlled/codex');calls.push('codex');return output;}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>server.close());
  const base='http://127.0.0.1:'+server.address().port;
  const boot=await fetch(base+'/api/session');
  assert.equal(boot.status,200);
  const {token,build}=await boot.json();assert.equal(build,'0.0.0.2');
  assert.equal((await fetch(base+'/api/session',{headers:{origin:'https://example.com'}})).status,403);
  const post=(path,data,tok=token)=>fetch(base+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json','x-mark-session':tok},body:JSON.stringify(data)});
  assert.equal((await post('generate',{provider:'codex'},'fake')).status,403);
  assert.equal((await post('generate',{provider:'other'})).status,400);
  assert.equal((await post('generate',{provider:'gemini'})).status,400);
  assert.equal(calls.length,0);
  assert.equal((await post('generate',{provider:'codex'}).then(r=>r.json())).questions.length,3);
  assert.equal((await post('generate',{provider:'gemini',apiKey:'mock-token'}).then(r=>r.json())).questions.length,3);
  assert.equal((await post('codex/install',{target:'../../other'})).status,400);
  assert.equal((await post('codex/install',{target:'latest'})).status,200);
  assert.deepEqual(calls,['codex','gemini','latest']);
  const audio=await fetch(base+'/audio/lc1.mp3');
  assert.equal(audio.status,200);assert.equal(audio.headers.get('content-type'),'audio/mpeg');assert.ok((await audio.arrayBuffer()).byteLength>10000);
  assert.equal((await fetch(base+'/README.md')).status,404);
});
