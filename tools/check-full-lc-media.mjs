// Optional release QA: decodes every bundled question and scene. FFmpeg is
// only required by this release check, not by the offline Windows app.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {FULL_LC_GROUPS} from '../public/full-lc.mjs';

const base=(url)=>fileURLToPath(new URL('../public'+url,import.meta.url));
const ffmpeg=(args)=>execFileSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-threads','1',...args],{maxBuffer:4*1024*1024});
const avgRms=(pcm,start,end)=>{
  const i0=Math.round(8000*start),i1=Math.min(Math.round(8000*end),pcm.length/2);
  let sum=0;
  for(let i=i0;i<i1;i++)sum+=pcm.readInt16LE(i*2)**2;
  return Math.sqrt(sum/(i1-i0));
};
let duration=0,questionCues=0,images=0,worstMismatch=0;
for(const g of FULL_LC_GROUPS){
  const pcm=ffmpeg(['-i',base(g.audio),'-ac','1','-ar','8000','-f','s16le','pipe:1']);
  const s=pcm.length/16000;
  worstMismatch=Math.max(worstMismatch,Math.abs(g.duration-s));
  assert.ok(Math.abs(g.duration-s)<0.06,`${g.id} duration mismatch: ${g.duration} vs ${s}`);
  duration+=s;
  if(g.part>=3)assert.ok(avgRms(pcm,0,g.cues[0].start)>100,`${g.id} passage is silent`);
  for(const cue of g.cues){
    assert.ok(avgRms(pcm,cue.start,cue.end-2.5)>100,`${cue.id} cue is silent`);
    assert.ok(avgRms(pcm,cue.end-1.1,cue.end-0.1)<20,`${cue.id} is missing response space`);
    questionCues++;
  }
  for(const url of [g.image,g.graphic].filter(Boolean)){
    const rgb=ffmpeg(['-i',base(url),'-vf','scale=480:-1','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1']);
    assert.ok(rgb.length>400*160*3&&new Set(rgb).size>32,`Blank/unreadable graphic: ${url}`);
    images++;
  }
}
console.log(`Verified ${FULL_LC_GROUPS.length} decoded clips, ${questionCues} cues, ${images} rendered SVGs, ${duration.toFixed(1)} seconds, maximum timing mismatch ${worstMismatch.toFixed(4)} seconds.`);
