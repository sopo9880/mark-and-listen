import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { buildServer } from '../src/server.mjs';
import { score } from '../public/core.mjs';
import { normalizeFullData, buildListeningSchedule, listeningAt } from '../public/full-exam.mjs';
import { FULL_LC_MS, FULL_RC_MS, createFullSession, advanceFullSession, markFullSession } from '../public/full-session.mjs';
import { FULL_LC, FULL_LC_GROUPS } from '../public/full-lc.mjs';
import { rcQuestions } from '../public/full-rc.mjs';

const parts = { 1: 6, 2: 25, 3: 39, 4: 30, 5: 30, 6: 16, 7: 54 };
const partGroups = { 1: 6, 2: 25, 3: 13, 4: 10 };
const items = normalizeFullData(FULL_LC, rcQuestions);
const text = x => typeof x === 'string' && x.trim().length > 0;
const normalized = x => x.trim().toLowerCase().replace(/\s+/g, ' ');

test('the same manifest registered by the UI contains 200 ordered, valid LC/RC questions', () => {
  assert.equal(items.length, 200);
  assert.equal(new Set(items.map(q => q.id)).size, items.length);
  assert.deepEqual(Object.fromEntries(Object.keys(parts).map(p => [p, items.filter(q => q.part===+p).length])), parts);
  for (const [n,q] of items.entries()) {
    assert.equal(q.number, n+1);
    assert.equal(q.section, n<100?'LC':'RC');
    assert.equal(q.id, `${q.section.toLowerCase()}-full-${String(n+1).padStart(3, '0')}`);
    assert.ok(text(q.question), `Missing prompt: ${q.id}`);
    assert.ok(text(q.explanation), `Missing explanation: ${q.id}`);
    assert.equal(q.choices.length, q.part===2?3:4, q.id);
    assert.ok(q.choices.every(text), q.id);
    assert.equal(new Set(q.choices.map(normalized)).size, q.choices.length, `Duplicate choices: ${q.id}`);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length, `Invalid answer: ${q.id}`);
    if(q.part===1) assert.ok(text(q.image) && text(q.imageAlt), q.id);
    if(q.part>=6){
      assert.ok(text(q.groupId) && q.passages.length && q.passages.every(p=>text(p.title)&&text(p.text)), `Missing passage: ${q.id}`);
    }
  }
});

test('the answer key cannot be solved by a short repeating pattern', ()=>{
  for(let part=2;part<=7;part++){
    const keys=items.filter(q=>q.part===part).map(q=>q.answer);
    for(let period=1;period<=8 && period*2<=keys.length;period++){
      let hits=0;
      for(let offset=0;offset<period;offset++){
        const counts=[0,0,0,0];
        for(let j=offset;j<keys.length;j+=period) counts[keys[j]]++;
        hits+=Math.max(...counts);
      }
      assert.ok(hits/keys.length<0.83,`Part ${part}: period-${period} guess solves ${hits}/${keys.length}`);
    }
  }
});

test('every LC group appears once, with ordered complete cues and consistent transcript and media', () => {
  assert.deepEqual(Object.fromEntries(Object.keys(partGroups).map(p=>[p,FULL_LC_GROUPS.filter(g=>g.part===+p).length])),partGroups);
  assert.equal(FULL_LC_GROUPS.length, 54);
  assert.equal(new Set(FULL_LC_GROUPS.map(g=>g.id)).size, 54);
  assert.equal(new Set(FULL_LC_GROUPS.map(g=>g.audio)).size, 54);
  assert.deepEqual(FULL_LC_GROUPS.flatMap(g=>g.questionIds), FULL_LC.map(q=>q.id));
  const ids = new Map(FULL_LC.map(q=>[q.id,q]));
  for(const g of FULL_LC_GROUPS){
    assert.ok(/^\/audio\/full-lc\/p[1-4]-\d{2}\.mp3$/.test(g.audio), `Not a bundled LC source: ${g.audio}`);
    assert.equal(g.questionIds.length, g.part >= 3 ? 3 : 1);
    assert.deepEqual(g.cues.map(c=>c.id), g.questionIds);
    assert.ok(Number.isFinite(g.duration) && g.duration>0, g.id);
    assert.ok(text(g.transcript) || (Array.isArray(g.transcript) && g.transcript.length>0), `Missing transcript: ${g.id}`);
    for(const [n,c] of g.cues.entries()){
      assert.ok(Number.isFinite(c.start) && Number.isFinite(c.end), c.id);
      assert.ok(c.start >= 0 && c.start < c.end && c.end <= g.duration+0.02, c.id);
      if(n>0) assert.ok(c.start >= g.cues[n-1].end-0.02, `Overlap: ${c.id}`);
      const q=ids.get(c.id);
      assert.equal(q.groupId,g.id);
      assert.equal(q.part,g.part);
      assert.equal(q.audio,g.audio);
      assert.ok(Math.abs(q.audioStart-c.start)<0.02 && Math.abs(q.audioEnd-c.end)<0.02, q.id);
      if(g.image) assert.equal(q.image,g.image);
      if(g.graphic) assert.equal(q.graphic,g.graphic);
    }
  }
  const schedule=buildListeningSchedule(FULL_LC_GROUPS);
  assert.equal(listeningAt(schedule,0).it.id,FULL_LC_GROUPS[0].id);
  for(const [i,g] of schedule.entries()){
    assert.ok(g.start<g.audioEnd && g.audioEnd<g.end,g.id);
    if(i>0) assert.equal(g.start,schedule[i-1].end);
    assert.equal(listeningAt(schedule,g.audioEnd-0.001).playing,true);
    assert.equal(listeningAt(schedule,g.audioEnd).playing,false);
  }
  assert.ok(Math.abs(schedule.at(-1).end-2700)<1e-8);
});

test('all referenced LC media and loaded modules are served offline by the same loopback app', async t=>{
  const server=await buildServer({updater:{}});
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});
  const base='http://127.0.0.1:'+server.address().port;
  const assetPaths=new Set(items.flatMap(q=>[q.image,q.graphic]).filter(Boolean));
  for(const path of ['/','/app.mjs','/full-exam.mjs','/full-session.mjs','/full-lc.mjs','/full-rc.mjs']){
    const res=await fetch(base+path,{method:'HEAD'});
    assert.equal(res.status,200,path);
  }
  const seen=new Set();
  const verifyModule=async path=>{
    if(seen.has(path))return;
    seen.add(path);
    const res=await fetch(base+path);
    assert.equal(res.status,200,path);
    const code=await res.text();
    for(const m of code.matchAll(/(?:\bfrom\s*|\bimport\(\s*)['"](\.\/[^'"]+\.mjs)['"]/g)){
      await verifyModule(new URL(m[1],base+path).pathname);
    }
  };
  await verifyModule('/app.mjs');
  assert.ok(seen.has('/full-lc-timings.mjs')&&seen.has('/full-lc-source.mjs'));
  for(const path of assetPaths){
    assert.ok(/^\/full-lc-images\/[a-z0-9-]+\.svg$/.test(path),path);
    const res=await fetch(base+path);
    assert.equal(res.status,200,path);
    assert.match(res.headers.get('content-type'),/^image\/svg\+xml/);
    assert.match(await res.text(),/<svg\b/,path);
  }
  for(const g of FULL_LC_GROUPS){
    const res=await fetch(base+g.audio);
    assert.equal(res.status,200,g.audio);
    assert.match(res.headers.get('content-type'),/^audio\/mpeg/);
    const bytes=Buffer.from(await res.arrayBuffer());
    assert.ok(bytes.length>4096,g.audio);
    assert.equal(Number(res.headers.get('content-length')),bytes.length,g.audio);
    assert.ok(bytes.subarray(0,3).toString('ascii')==='ID3' || (bytes[0]===0xff && (bytes[1]&0xe0)===0xe0),g.audio);
  }
  const longTrack=base+FULL_LC_GROUPS.find(g=>g.part===4).audio;
  const original=Buffer.from(await (await fetch(longTrack)).arrayBuffer());
  const partial=await fetch(longTrack,{headers:{range:'bytes=1024-2047'}});
  assert.equal(partial.status,206);
  assert.equal(partial.headers.get('accept-ranges'),'bytes');
  assert.equal(partial.headers.get('content-range'),`bytes 1024-2047/${original.length}`);
  assert.deepEqual(Buffer.from(await partial.arrayBuffer()),original.subarray(1024,2048));
  const openEnded=await fetch(longTrack,{headers:{range:'bytes=0-'},method:'HEAD'});
  assert.equal(openEnded.status,206);
  assert.equal(Number(openEnded.headers.get('content-length')),original.length);
  const suffix=await fetch(longTrack,{headers:{range:'bytes=-32'}});
  assert.equal(suffix.status,206);
  assert.deepEqual(Buffer.from(await suffix.arrayBuffer()),original.subarray(-32));
  const outOfBounds=await fetch(longTrack,{headers:{range:`bytes=${original.length}-`}});
  assert.equal(outOfBounds.status,416);
  assert.equal(outOfBounds.headers.get('content-range'),`bytes */${original.length}`);
});

test('score uses all 200 release IDs and exact phase locks; correct choice zero is not unanswered', ()=>{
  const start=1_700_000_000_000;
  let state=createFullSession(start);
  for(const q of items.slice(0,100)) state=markFullSession(state,{id:q.id,index:q.answer,phase:'LC',now:start+1000});
  state=advanceFullSession(JSON.parse(JSON.stringify(state)),start+FULL_LC_MS);
  for(const q of items.slice(100)) state=markFullSession(state,{id:q.id,index:q.answer,phase:'RC',now:start+FULL_LC_MS+1000});
  assert.equal(state.phase,'RC');
  state=advanceFullSession(JSON.parse(JSON.stringify(state)),start+FULL_LC_MS+FULL_RC_MS);
  assert.equal(state.phase,'done');
  const result=score({order:items.map(q=>q.id),marks:state.answers},items);
  assert.equal(result.correct,200);
  assert.equal(result.unsolved,0);
  assert.deepEqual(result.LC,{total:100,correct:100,unsolved:0});
  assert.deepEqual(result.RC,{total:100,correct:100,unsolved:0});
});
