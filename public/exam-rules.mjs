// Independent exam registry. Raw scores only; no proprietary scaled-score claims.
export const EXAMS={toeic:{id:'toeic',name:'TOEIC관',parts:{1:{count:6,unit:1},2:{count:25,unit:1},3:{count:39,unit:3},4:{count:30,unit:3},5:{count:30,unit:1},6:{count:16,unit:4},7:{count:54,unit:1}},lcSeconds:2700,rcSeconds:4500}};
export function blueprint(examId,counts){
 const exam=EXAMS[examId];if(!exam)throw Error('지원하지 않는 시험관입니다.');
 const result=[];
 for(const [key,raw] of Object.entries(counts??{})){
  const part=Number(key),spec=exam.parts[part],n=Number(raw);
  if(!spec||!Number.isInteger(n)||n<0||n>spec.count||n%spec.unit||part===7&&n===1)throw Error('문항 수와 묶음 크기를 확인하세요. Part 3·4는 3개, Part 6은 4개 단위입니다. Part 7은 2개 이상입니다.');
  let sizes=Array(n/spec.unit).fill(spec.unit);
  if(part===7){sizes=n===54?[...Array(9).fill(3),2,5,5,5,5,5]:[];let left=n===54?0:n;while(left){let size=left<=5?left: left===6?3:5;sizes.push(size);left-=size;}}
  sizes.forEach((count,i)=>result.push({id:`p${part}-${i+1}`,part,count,documents:part===7?(n===54?(i<10?1:i<12?2:3):count>=5?2:1):part===6?1:0,status:'pending'}));
 }
 if(!result.length)throw Error('문항을 선택하세요.');return result;
}
export function phaseDurations(episode){const counts={LC:0,RC:0};for(const g of episode.groups)counts[g.part<=4?'LC':'RC']+=g.count;return {LC:Math.ceil(EXAMS[episode.exam].lcSeconds*counts.LC/100)*1000,RC:Math.ceil(EXAMS[episode.exam].rcSeconds*counts.RC/100)*1000};}
export function audioReady(e){return e.groups.every(g=>g.status==='ready'&&g.reviewed&& (g.part>4||g.segments.length>0&&g.segments.every(s=>s.status==='ready'&&s.reviewed&&s.duration>0)));}
export function audioTimeline(e){let at=0;const list=[];for(const g of e.groups.filter(g=>g.part<=4)){for(const s of g.segments){list.push({...s,groupId:g.id,start:at,end:at+s.duration});at+=s.duration+.35;}at+=g.count*5;}return list;}
export function startAttempt(e,now=Date.now()){
 if(!audioReady(e))throw Error('모든 문항과 필수 음원의 검수를 완료하세요.');
 const durations=phaseDurations(e);const timeline=audioTimeline(e);if(timeline.at(-1)?.end>durations.LC/1000)throw Error('음원이 LC 제한 시간을 넘습니다. 대본과 음원을 검토하세요.');
 const phase=durations.LC?'LC':'RC';return {id:globalThis.crypto.randomUUID(),episodeId:e.id,phase,startedAt:now,phaseStartedAt:now,phaseEndsAt:now+durations[phase],durations,marks:{},submittedAt:null};
}
export function advanceAttempt(s,now=Date.now()){
 if(s.phase==='LC'&&now>=s.phaseEndsAt){const at=s.phaseEndsAt;s={...s,phase:s.durations.RC?'RC':'done',phaseStartedAt:at,phaseEndsAt:at+s.durations.RC};}
 if(s.phase==='RC'&&now>=s.phaseEndsAt)s={...s,phase:'done',phaseStartedAt:s.phaseEndsAt};
 return s.phase==='done'?{...s,submittedAt:s.submittedAt??s.phaseEndsAt}:s;
}
export function markAttempt(s,e,id,index,now=Date.now()){
 const next=advanceAttempt(s,now),q=e.groups.flatMap(g=>g.questions??[]).find(q=>q.id===id);
 if(next.phase!==s.phase||next.phase==='done'||!q||q.section!==next.phase||index!==null&&(!Number.isInteger(index)||index<0||index>=q.choices.length))return next;
 const marks={...next.marks};if(index===null)delete marks[id];else marks[id]=index;return {...next,marks};
}
export function finishPhase(s,now=Date.now()){const next=advanceAttempt(s,now);if(next.phase!==s.phase||next.phase==='done')return next;return advanceAttempt({...next,phaseEndsAt:now},now);}
