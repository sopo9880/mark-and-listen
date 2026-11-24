import test from 'node:test';
import assert from 'node:assert/strict';
import {BANK} from '../public/bank.mjs';
import {choose,newSession} from '../public/core.mjs';
import {buildRecord,restoreHistory,summarizeHistory} from '../public/dashboard.mjs';
import {buildListeningSchedule,listeningAt,normalizeFullData} from '../public/full-exam.mjs';
import {FULL_LC_MS} from '../public/full-session.mjs';
import {rcQuestions} from '../public/full-rc.mjs';
import {readFile} from 'node:fs/promises';

test('dashboard averages across total tested items, keeps immutable question and marking snapshot',()=>{
  let s=newSession('strict',BANK);
  s=choose(s,BANK,'lc1',0,'omr');
  s=choose(s,BANK,'rc1',1,'omr');
  const a=buildRecord({session:s,items:BANK,kind:'bank',now:44,id:'a'});
  const tiny=[{...BANK[6],choices:[...BANK[6].choices]}];
  let t=choose(newSession('practice',tiny),tiny,'rc1',0,'question');
  const b=buildRecord({session:t,items:tiny,kind:'generated',now:45,id:'b'});
  t.marks['rc1']=1;t.order.pop();tiny[0].choices[0]='changed later';
  const r=restoreHistory(JSON.parse(JSON.stringify([b,a])));
  const stats=summarizeHistory(r);
  assert.equal(stats.attempts,2);assert.equal(stats.latest.id,'b');
  assert.equal(stats.total,17);assert.equal(stats.correct,2);assert.equal(stats.accuracy,12);
  assert.equal(stats.RC.total,11);assert.equal(stats.RC.correct,1);
  assert.equal(r[0].questions[0].choices[0],BANK[6].choices[0]);
  assert.equal(r[0].summary.correct,1);
  assert.deepEqual(restoreHistory([{},null,{id:'broken',summary:{}}]),[]);
});

test('full audio schedule respects wall-clock resume, group order and fixed 45-minute boundary',()=>{
  const schedule=buildListeningSchedule([
    {id:'a',duration:14,questionIds:['lc-full-001']},
    {id:'b',duration:22,questionIds:['lc-full-002','lc-full-003','lc-full-004']}
  ]);
  assert.equal(schedule[0].start,0);
  assert.equal(listeningAt(schedule,9).offset,9);
  assert.equal(listeningAt(schedule,15).playing,false);
  assert.equal(listeningAt(schedule,schedule[1].start).it.id,'b');
  assert.equal(listeningAt(schedule,schedule[1].start).offset,0);
  assert.ok(Math.abs(schedule[1].end-FULL_LC_MS/1000)<1e-6);
  assert.equal(listeningAt(schedule,FULL_LC_MS/1000+.001),null);
  assert.throws(()=>buildListeningSchedule([{id:'a',duration:2701,questionIds:['x']}]),/제한 시간/);
});

test('full exam normalizes RC passage groups and refuses an incomplete bank',()=>{
  const lc=Array.from({length:100},(_,i)=>({id:`lc-full-${String(i+1).padStart(3,'0')}`,number:i+1,part:1,section:'LC'}));
  assert.throws(()=>normalizeFullData(lc.slice(1),rcQuestions),/200문항/);
  const all=normalizeFullData(lc,rcQuestions);
  assert.equal(all[100].id,'rc-full-101');
  assert.equal(all[199].id,'rc-full-200');
  assert.ok(all[130].passages[0].text.length>40);
  assert.equal(all[130].groupId,all[131].groupId);
});

test('front-end dashboard route and selector contract is internally complete',async()=>{
  const input=name=>readFile(new URL('../public/'+name,import.meta.url),'utf8');
  const [html,app]=await Promise.all(['index.html','app.mjs'].map(input));
  const ids=[...html.matchAll(/ id="([^"]+)"/g)].map(r=>r[1]);
  assert.equal(ids.length,new Set(ids).size);
  const dynamic=new Set(['answered','progress']);
  for(const m of app.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(m[1])||dynamic.has(m[1]),`missing id ${m[1]}`);
  for(const route of ['home','exam','full','generate','history','settings'])assert.ok(ids.includes('view-'+route));
});
