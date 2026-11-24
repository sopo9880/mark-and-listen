import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {test} from 'node:test';
import {LC_SOURCE} from '../public/full-lc-source.mjs';
import {FULL_LC,FULL_LC_GROUPS} from '../public/full-lc.mjs';

test('full built-in LC consecutive numbering, exercise distribution and original source alignment',()=>{
  assert.equal(FULL_LC.length,100);
  for(const [i,q] of FULL_LC.entries()){
    assert.equal(q.number,i+1);
    assert.equal(q.id,`lc-full-${String(i+1).padStart(3,'0')}`);
    assert.equal(q.section,'LC');
    assert.equal(q.choices.length,q.part===2?3:4);
    assert.equal(new Set(q.choices).size,q.choices.length);
    assert.ok(/[가-힣]/.test(q.explanation),q.id);
  }
  assert.deepEqual([1,2,3,4].map(part=>FULL_LC.filter(q=>q.part===part).length),[6,25,39,30]);
  let pos=0;
  for(const groups of LC_SOURCE) for(const group of groups) for(const written of group.questions){
    const rendered=FULL_LC[pos++];
    assert.equal(rendered.question,written.question);
    assert.deepEqual(new Set(rendered.choices),new Set(written.choices));
    assert.equal(rendered.choices[rendered.answer],written.choices[written.answer]);
  }
  const part2=FULL_LC.filter(q=>q.part===2);
  for(let period=1;period<=4;period++){
    const success=Math.max(...Array.from({length:3**period},(_,template)=>{
      const key=template.toString(3).padStart(period,'0');
      return part2.filter((q,i)=>q.answer===Number(key[i%period])).length;
    }));
    assert.ok(success<18,`Part 2 is guessable from a period-${period} pattern: ${success}/25`);
  }
});

test('all built-in LC asset files and actual UI clip cues are linked to their group',()=>{
  assert.deepEqual([1,2,3,4].map(part=>FULL_LC_GROUPS.filter(g=>g.part===part).length),[6,25,13,10]);
  const toFile=(path)=>new URL(`../public${path}`,import.meta.url);
  assert.equal(readdirSync(toFile('/audio/full-lc/')).length,FULL_LC_GROUPS.length);
  for(const g of FULL_LC_GROUPS){
    assert.equal(g.cues.length,g.part>=3?3:1);
    assert.deepEqual(g.cues.map(v=>v.id),g.questionIds);
    assert.ok(g.cues[0].start>=0);
    assert.ok(g.part>=3?g.cues[0].start>10:g.cues[0].start===0,g.id);
    assert.equal(g.cues.at(-1).end,g.duration);
    assert.match(g.audio,/^\/audio\/full-lc\/p[1-4]-\d\d\.mp3$/);
    const clip=readFileSync(toFile(g.audio));
    assert.ok(clip.length>40_000);
    assert.equal(clip.subarray(0,3).toString(),'ID3');
    for(const [i,c] of g.cues.entries()){
      if(i>0)assert.equal(c.start,g.cues[i-1].end);
      assert.ok(c.end-c.start>4);
      const q=FULL_LC.find(v=>v.id===c.id);
      assert.equal(q.audio,g.audio);
      assert.equal(q.audioStart,c.start);
      assert.equal(q.audioEnd,c.end);
      assert.equal(q.transcript,g.transcript);
      for(const key of ['image','graphic']) if(g[key]){
        assert.equal(q[key],g[key]);
        assert.ok(existsSync(toFile(q[key])));
        assert.match(readFileSync(toFile(q[key]),'utf8'),/^<svg [\s\S]+<\/svg>\s*$/);
      }
    }
  }
  assert.equal(FULL_LC_GROUPS.filter(g=>g.image).length,6);
  assert.equal(FULL_LC_GROUPS.filter(g=>g.graphic).length,5);
});
