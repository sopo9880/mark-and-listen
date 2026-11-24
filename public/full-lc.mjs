// Whole original LC section, stable per-question cues and exported physical clip metadata.
import { LC_LAYOUT } from './full-lc-layout.mjs';
import { LC_TIMINGS } from './full-lc-timings.mjs';

const LETTERS=['A','B','C','D'];

export const FULL_LC_GROUPS=LC_LAYOUT.map(({id,part,audio,lines,questions,...media})=>{
  const clock=LC_TIMINGS[id];
  if(!clock||clock.cues.length!==questions.length)throw Error(`Missing/invalid built-in audio cues for ${id}`);
  const passage=lines.map(([voice,line])=>part===3?`${voice==='slt'?'Woman':'Man'}: ${line}`:line).join('\n');
  const transcript=part>=3?passage:part===2
    ?[questions[0].question,...questions[0].choices.map((c,i)=>`${LETTERS[i]}. ${c}`)].join('\n')
    :questions[0].choices.map((c,i)=>`${LETTERS[i]}. ${c}`).join('\n');
  return {
    id,part,audio,...media, duration:clock.duration,
    transcript,transcription:transcript, questionIds:questions.map(q=>q.id),
    cues:clock.cues.map(([start,end],i)=>({id:questions[i].id,start,end})),
  };
});

export const FULL_LC=LC_LAYOUT.flatMap((group,i)=>{
  const {id:groupId,part,audio,duration,transcript,cues,...metadata}=FULL_LC_GROUPS[i];
  return group.questions.map((q,j)=>({
    ...q,groupId,part,section:'LC',audio,transcript,
    audioStart:cues[j].start,audioEnd:cues[j].end,
    ...(metadata.image?{image:metadata.image,imageAlt:metadata.imageAlt}:{}),
    ...(metadata.graphic?{graphic:metadata.graphic,graphicAlt:metadata.graphicAlt}:{}),
  }));
});
