import { LETTERS } from './bank.mjs';
import { buildRecord, renderReview } from './dashboard.mjs';
import { FULL_LC_MS, FULL_RC_MS, createFullSession, advanceFullSession, markFullSession, transitionFullSession } from './full-session.mjs';
const STORE='mark-listen.full.v1';
const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;};
const btn=(label,action,cls='button light')=>{const x=el('button',cls,label);x.type='button';x.addEventListener('click',action);return x;};
export function normalizeFullData(lc,rc){
  const reading=rc.map(q=>({id:`rc-full-${q.id}`,number:q.id,section:'RC',part:q.part,question:q.prompt,choices:q.options,answer:q.answer,explanation:q.rationale,groupId:q.passageId,passages:q.passages}));
  const full=[...lc,...reading];const distinct=new Set(full.map(q=>q.id));
  if(lc.length!==100||reading.length!==100||distinct.size!==200||full.some((q,i)=>q.number!==i+1))throw Error('200문항 구성이 완료되지 않았어요.');
  return full;
}
export function buildListeningSchedule(groups, length=FULL_LC_MS/1000){
  if(!groups.length||groups.some(g=>!Number.isFinite(g.duration)||g.duration<=0||!Array.isArray(g.questionIds)||!g.questionIds.length))throw Error('듣기 음원 순서를 확인할 수 없어요.');
  const playback=groups.reduce((a,g)=>a+g.duration+.25,0), records=groups.reduce((a,g)=>a+g.questionIds.length,0);
  if(playback>=length)throw Error('음원 전체가 듣기 제한 시간을 넘었어요.');
  let start=0;
  const pass=(length-playback)/records;
  return groups.map(g=>{
    const audioEnd=start+g.duration, end=audioEnd+.25+g.questionIds.length*pass;
    const result={...g,start,audioEnd,end};start=end;return result;
  });
}
export function listeningAt(schedule, elapsed){
  const it=schedule.find(g=>elapsed<g.end);
  return it?{it,offset:Math.max(0,elapsed-it.start),playing:elapsed<it.audioEnd}:null;
}
const remainingAt=(s,now)=>Math.max(0,Math.ceil((s.phaseEndsAt-now)/1000));
const clockText=t=>String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');
function getSaved(){
  try {
    const {session,selected,carried,cleared}=JSON.parse(localStorage.getItem(STORE)??'{}');
    if(!session||session.version!==1||!['LC','RC','done'].includes(session.phase)||!Number.isSafeInteger(session.startedAt)||!Number.isSafeInteger(session.phaseStartedAt)||!Number.isSafeInteger(session.phaseEndsAt)||!session.answers||typeof session.answers!=='object')return {};
    return {session,selected:Number.isInteger(selected)&&selected>=1&&selected<=200?selected:undefined,carried:carried===true,cleared:cleared===true};
  }catch{return {};}
}
function writeSaved(session,selected,carried,cleared){
  try{localStorage.setItem(STORE,JSON.stringify({session,selected,carried,cleared}));}catch{}
}

export async function mountFullExam(root,{onResult,onReview}){
  const [{FULL_LC,FULL_LC_GROUPS},{rcQuestions}]=await Promise.all([import('./full-lc.mjs'),import('./full-rc.mjs')]);
  const full=normalizeFullData(FULL_LC,rcQuestions);
  const schedule=buildListeningSchedule(FULL_LC_GROUPS);
  const sortedIds=full.map(q=>q.id);
  let {session,selected,carried,cleared}=getSaved();
  let visible=false, armed=false, mediaGroup=null, wallGroup=null, lastPhase=null, canPlayBlocked=false, mediaRev=0;
  let timer=null, audioLabel=null, audioRetry=null, material=null, sheet=null, sheetCount=null, activeReview=null, blockedMessage='';
  const audio=el('audio');audio.hidden=true;audio.preload='auto';audio.setAttribute('aria-hidden','true');
  const content=el('div');root.replaceChildren(audio,content);
  function save(){writeSaved(session,selected,carried,cleared);}
  function applyPhase(next){
    const prev=session?.phase;
    session=next;
    if(session.phase!==prev||descriptorPhase(selected)!==session.phase)selected=session.phase==='LC'?1:session.phase==='RC'?101:null;
    if(session.phase!=='LC')stopAudio();
    if(session.phase==='done')archive();
    save();
  }
  function descriptorPhase(number){return Number.isInteger(number)?(number<=100?'LC':'RC'):null;}
  function archive(){
    const model={mode:'strict',order:sortedIds,marks:session.answers,submitted:true};
    activeReview=buildRecord({session:model,items:full,kind:'full',now:session.submittedAt,id:'full-'+session.startedAt});
    if(!carried&&!cleared){onResult?.(activeReview);carried=true;}
  }
  function stopAudio(){
    if(!mediaGroup&&!armed)return;
    mediaRev++;mediaGroup=null;wallGroup=null;armed=false;audio.pause();audio.removeAttribute('src');audio.load();
  }
  function startAudioAt(it,offset){
    const thisRev=++mediaRev;
    mediaGroup=it.id;canPlayBlocked=false;blockedMessage='';
    audio.src=it.audio;
    const seek=()=>{
      if(thisRev!==mediaRev)return;
      const actual=Date.now()-session.phaseStartedAt;
      const liveOffset=Math.max(offset,actual/1000-it.start);
      if(liveOffset>0.2 && liveOffset<audio.duration-0.1)audio.currentTime=liveOffset;
    };
    audio.addEventListener('loadedmetadata',seek,{once:true});
    audio.play().then(()=>{if(thisRev===mediaRev){canPlayBlocked=false;paintAudio();}}).catch(()=>{
      if(thisRev!==mediaRev)return;
      canPlayBlocked=true;blockedMessage='음원을 자동으로 시작하지 못했어요. 듣기를 눌러 현재 위치에서 이어가세요.';paintAudio();
    });
  }
  audio.addEventListener('error',()=>{
    if(!mediaGroup)return;
    canPlayBlocked=true;blockedMessage='현재 음원을 열지 못했어요. 앱에 음원이 포함되었는지 확인하세요.';paintAudio();
  });
  function paintAudio(text){
    if(!audioLabel||!audioRetry)return;
    if(text!==undefined)audioLabel.dataset.state=text;
    const next=blockedMessage||audioLabel.dataset.state||'';
    if(audioLabel.textContent!==next)audioLabel.textContent=next;
    audioRetry.hidden=armed&&!canPlayBlocked;
  }
  function syncAudio(now){
    if(session?.phase!=='LC')return;
    const current=listeningAt(schedule,(now-session.phaseStartedAt)/1000);
    if(!current)return;
    const {it,offset,playing}=current;
    if(it.id!==wallGroup){
      wallGroup=it.id;
      const first=full.find(q=>q.id===it.questionIds[0]);
      if(first){selected=first.number;save();paintMaterial(true);}
    }
    if(!armed){paintAudio('듣기를 누르면 시험 시간에 맞는 위치에서 재생됩니다.');return;}
    if(playing){
      if(mediaGroup!==it.id)startAudioAt(it,offset);
      paintAudio(`음원 진행 중 · Part ${it.part} · ${it.questionIds.map(id=>Number(id.slice(-3))).join(', ')}번`);
    }else{
      if(!audio.paused)audio.pause();
      paintAudio('다음 음원 전 답안 작성 시간이에요.');
    }
  }
  function arm(){
    armed=true;canPlayBlocked=false;blockedMessage='';mediaGroup=null;
    syncAudio(Date.now());
  }
  function setSelection(number,{focus=false}={}){
    if(descriptorPhase(number)!==session?.phase)return;
    selected=number;save();paintMaterial(true);
    if(focus)material?.querySelector('h2')?.focus({preventScroll:true});
  }
  function marked(q,i){
    const latest=markFullSession(session,{id:q.id,index:session.answers[q.id]===i?null:i,phase:q.section,now:Date.now()});
    if(latest.phase!==session.phase){applyPhase(latest);render();return;}
    if(latest!==session){session=latest;save();updateMarks();}
  }
  function paintMaterial(scrollSheet=false){
    if(!material||!Number.isInteger(selected))return;
    const q=full[selected-1];
    const siblings=q.groupId?full.filter(other=>other.groupId===q.groupId&&other.section===q.section):[q];
    const head=el('div','question-head');head.append(el('span','chip',`${q.section} / PART ${q.part}`),el('span','counter',`Q ${q.number} / 200`));
    const heading=el('h2',null,q.section==='LC'&&q.part<=2?(q.part===1?'삽화와 일치하는 설명을 고르세요.':'질문에 알맞은 응답을 고르세요.'):(q.section==='LC'?'음원을 듣고 답하세요.':'가장 알맞은 답을 고르세요.'));
    heading.tabIndex=-1;
    material.replaceChildren(head,heading);
    const visual=q.image??q.graphic;
    if(visual){const image=el('img','exam-visual');image.src=visual;image.alt=q.imageAlt??q.graphicAlt??'문제의 참고 그림';material.append(image);}
    if(q.passages?.length){
      const block=el('div','group-box');
      for(const p of q.passages){const section=el('section');section.append(el('h3',null,p.title),el('p','exam-passage',p.text));block.append(section);}
      material.append(block);
    }
    const group=el('div','group-questions');
    for(const v of siblings){
      const card=el('article',v.number===selected?'focus-question':null);
      if(v.section!=='LC'||v.part>=3)card.append(el('p',null,`${v.number}. ${v.question}`));
      const options=el('div','answers');
      v.choices.forEach((choice,i)=>{
        const line=el('div','choice');
        line.append(el('span','letter',LETTERS[i]),el('span',null,v.section==='LC'&&v.part<=2?`응답 ${LETTERS[i]}`:choice));
        options.append(line);
      });
      card.append(options);group.append(card);
    }
    const first=session.phase==='LC'?1:101,last=session.phase==='LC'?100:200;
    const nav=el('div','full-nav');
    const left=btn('‹ 이전 문항',()=>setSelection(q.number-1,{focus:true})),right=btn('다음 문항 ›',()=>setSelection(q.number+1,{focus:true}));
    left.disabled=q.number===first;right.disabled=q.number===last;nav.append(left,right);
    material.append(group,el('p','notice','정답은 오른쪽 OMR에 직접 마킹하세요. 마킹한 버블을 다시 누르면 지워집니다.'),nav);
    for(const row of sheet?.querySelectorAll('.omr-row')??[]){
      row.classList.toggle('current',+row.dataset.number===q.number);
      const jump=row.querySelector('.omr-jump');
      if(+row.dataset.number===q.number){jump.setAttribute('aria-current','true');if(scrollSheet){const box=row.parentElement;box.scrollTop=Math.max(0,row.offsetTop-box.offsetTop-65);}}
      else jump.removeAttribute('aria-current');
    }
  }
  function updateMarks(){
    if(!sheet||!sheetCount)return;
    const qs=full.filter(q=>q.section===session.phase);
    sheetCount.textContent=`${qs.filter(q=>Object.hasOwn(session.answers,q.id)).length} / ${qs.length}`;
    for(const b of sheet.querySelectorAll('.bubble'))b.setAttribute('aria-pressed',String(session.answers[b.dataset.qid]===+b.dataset.option));
  }
  function render(){
    timer=material=sheet=sheetCount=audioLabel=audioRetry=null;
    lastPhase=session?.phase??null;
    if(!session){
      const intro=el('div','surface dash-card full-summary');
      intro.append(el('p','eyebrow','OFFLINE / FULL TEST'),el('h2',null,'정규 구성 모의고사'),el('p',null,'듣기 100문항과 읽기 100문항을 한 세트로 풉니다. LC 음원은 재생 순서가 고정되며 RC에 들어가면 LC 답안은 잠깁니다. 창을 닫거나 다른 화면에 있어도 제한 시간은 계속 흐릅니다.'),el('p',null,'연습용 삽화와 영어 합성 음성을 사용하며 공식 시험과 같은 환산 점수는 제공하지 않습니다.'));
      intro.append(btn('LC 시작',()=>{
        session=createFullSession();selected=1;carried=cleared=false;save();render();arm();
      },'button primary'));
      content.replaceChildren(intro);return;
    }
    if(session.phase==='done'){
      if(!activeReview)archive();
      const out=el('section','results'), actions=el('div','dashboard-actions');
      actions.append(btn('새 전체 모의고사',()=>{
        if(!confirm('전체 모의고사를 처음부터 다시 풀까요? 이전 제출 기록은 지우지 않습니다.'))return;
        session=null;activeReview=null;carried=cleared=false;selected=null;save();render();
      }));
      if(carried)actions.append(btn('복습 기록 열기',()=>onReview?.(activeReview)));
      content.replaceChildren(actions,out);renderReview(out,activeReview);return;
    }
    const top=el('div','surface full-header'), phase=el('span','chip',session.phase==='LC'?'01 · LISTENING':'02 · READING');
    timer=el('time','full-timer');timer.setAttribute('aria-label',session.phase+' 남은 시간');
    const phaseAction=btn(session.phase==='LC'?'LC 마치고 RC로':'제출 · 채점',()=>{
      const source=session.phase;
      if(!confirm(source==='LC'?'LC를 끝내고 RC로 이동할까요? LC 답안은 더 수정할 수 없어요.':'답안을 제출하고 원점수를 확인할까요?'))return;
      applyPhase(transitionFullSession(session,{to:source==='LC'?'RC':'done'}));render();
    },'button primary');
    top.append(phase,timer,phaseAction);
    const columns=el('div','full-columns');
    material=el('section','question surface full-material');
    sheet=el('aside','surface full-sheet');sheet.setAttribute('aria-label','전체 모의고사 OMR 답안지');
    const title=el('div','full-sheet-head');sheetCount=el('span','counter');title.append(el('h2',null,'OMR 답안지'),sheetCount);
    const qs=full.filter(q=>q.section===session.phase), partJumps=el('div','full-part-jumps'), rows=el('div','full-rows');
    for(const p of [...new Set(qs.map(q=>q.part))]){
      const first=qs.find(q=>q.part===p);partJumps.append(btn('Part '+p,()=>setSelection(first.number,{focus:true})));
    }
    for(const q of qs){
      const row=el('div','omr-row');row.dataset.number=q.number;
      const jump=btn(String(q.number),()=>setSelection(q.number,{focus:true}),'omr-jump');jump.setAttribute('aria-label',`${q.number}번 문제로 이동`);row.append(jump);
      q.choices.forEach((_,i)=>{const b=btn(LETTERS[i],()=>marked(q,i),'bubble');b.dataset.qid=q.id;b.dataset.option=i;b.setAttribute('aria-label',`${q.number}번 ${LETTERS[i]} 마킹`);row.append(b);});
      rows.append(row);
    }
    sheet.append(title,partJumps,rows);columns.append(material,sheet);content.replaceChildren(top);
    if(session.phase==='LC'){
      const audioBox=el('div','audio-box');audioLabel=el('p',null);audioLabel.setAttribute('aria-live','polite');audioRetry=btn('듣기 이어서 재생',arm);
      audioBox.append(audioLabel,audioRetry);content.append(audioBox);
    }
    content.append(columns);paintMaterial();updateMarks();tick();
  }
  function tick(){
    if(!session||session.phase==='done')return;
    const now=Date.now(), next=advanceFullSession(session,now);
    if(next!==session){applyPhase(next);render();return;}
    if(timer){const time=remainingAt(session,now);timer.textContent=clockText(time);timer.classList.toggle('urgent',time<5*60);}
    if(session.phase==='LC'&&(armed||visible))syncAudio(now);
  }
  if(session){applyPhase(advanceFullSession(session));if(session.phase==='done'&&!carried)archive();}
  render();
  const refresh=window.setInterval(tick,250);
  window.addEventListener('pagehide',()=>clearInterval(refresh),{once:true});
  return {
    setVisible(state){
      visible=state;
      if(visible){if(session?.phase!==lastPhase)render();tick();}
      else if(armed){canPlayBlocked=false;blockedMessage='';stopAudio();}
    },
    discardRecord(){if(session?.phase==='done'){cleared=true;save();}}
  };
}
