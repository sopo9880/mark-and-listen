import { BANK, LETTERS } from './bank.mjs';
import { newSession, choose, parseGenerated } from './core.mjs';
import { HISTORY_LIMIT, nameFor, modeFor, buildRecord, restoreHistory, summarizeHistory, renderHistory, renderReview } from './dashboard.mjs';
import { mountAudition, useSavedAudition } from './audition.mjs';

const $=id=>document.getElementById(id);
const STORE='mark-listen.preview.v1';
const ui=(tag,cls,text)=>{const a=document.createElement(tag);if(cls)a.className=cls;if(text!==undefined)a.textContent=text;return a;};
const button=(cls,text,call)=>{const b=ui('button',cls,text);b.type='button';b.addEventListener('click',call);return b;};
let generated=[],pending=[],active='bank',session=newSession('practice',BANK),sessionToken,engineBusy=false,history=[],reviewId=null;
let route='home', fullView=null, fullLoad=null, draftEpoch=0;
try{
  const x=JSON.parse(localStorage.getItem(STORE)||'{}');
  history=restoreHistory(x.history);
  if(Array.isArray(x.pending)&&x.pending.length) pending=parseGenerated(JSON.stringify(x.pending));
  if(Array.isArray(x.generated)&&x.generated.length) generated=parseGenerated(JSON.stringify(x.generated));
  const saved=x.session;
  active=x.active==='generated'&&generated.length?'generated':'bank';
  const expected=items();
  if(saved&&['practice','strict'].includes(saved.mode)&&Array.isArray(saved.order)&&saved.order.join(',')===expected.map(q=>q.id).join(',')){
    session=newSession(saved.mode,expected);
    session.index=Number.isInteger(saved.index)?Math.min(Math.max(saved.index,0),expected.length-1):0;
    for(const q of expected) if(Object.hasOwn(saved.marks??{},q.id)) session=choose(session,expected,q.id,saved.marks[q.id],saved.mode==='strict'?'omr':saved.entry?.[q.id]??'omr');
    session.submitted=saved.submitted===true;
  }else session=newSession('practice',expected);
}catch{generated=[];active='bank';session=newSession('practice',BANK);}
function items(){return active==='bank'?BANK:generated;}
function save(){
  try {
    let packed=JSON.stringify({active,session,generated,pending,history});
    while(packed.length>1400000&&history.length>1){history.pop();packed=JSON.stringify({active,session,generated,pending,history});}
    localStorage.setItem(STORE,packed);
  } catch {}
}
function press(b,state){b.setAttribute('aria-pressed',String(state));}
function updateSelection(){
  const total=session.order.length,count=Object.keys(session.marks).length;
  $('answered').textContent=`${count} / ${total}`;
  $('progress').value=count;
  for(const b of document.querySelectorAll('[data-option-id]')) press(b,session.marks[b.dataset.optionId]===Number(b.dataset.option));
}
function applyChoice(q,value,source){
  const input=session.marks[q.id]===value?null:value;
  const next=choose(session,items(),q.id,input,source);
  if(next!==session){session=next;save();updateSelection();}
}
function jump(i,focus=false){
  if(i===session.index)return;
  session.index=i;save();render();
  if(focus)document.querySelector('.question h2')?.focus({preventScroll:true});
}
function render(){
  const list=items(), q=list[session.index], total=list.length, mode=session.mode;
  $('session-label').textContent=active==='bank'?'기본 세트 · LC Part 2 / RC Part 5':'AI 생성 세트 · RC Part 5 (검수 전)';
  press($('practice-mode'),mode==='practice');press($('strict-mode'),mode==='strict');
  $('activate-bank').hidden=active==='bank';
  $('activate-generated').hidden=!(pending.length||active==='bank'&&generated.length);
  $('export-set').disabled=!(pending.length||generated.length);
  const panel=$('question');
  const head=ui('div','question-head');
  head.append(ui('span','chip',`${q.section} / PART ${q.part}`),ui('span','counter',`Q ${String(session.index+1).padStart(2,'0')} / ${total}`));
  const title=ui('h2',q.audio?'':'en',q.audio?'가장 알맞은 응답을 골라 주세요.':q.question);
  title.tabIndex=-1;
  const helper=ui('p','prompt-helper',q.audio?'질문과 세 응답이 차례대로 나옵니다.':'빈칸에 가장 알맞은 단어나 표현을 골라 주세요.');
  panel.replaceChildren(head,title,helper);
  if(q.audio){
    const audioBox=ui('div','audio-box');
    audioBox.append(ui('p',null,'LISTENING TRACK · 영어 합성 음성'));
    const audio=ui('audio');audio.controls=true;audio.preload='metadata';audio.src=q.audio;audio.setAttribute('aria-label',`${session.index+1}번 듣기 음원`);
    audioBox.append(audio);panel.append(audioBox);void useSavedAudition(audio,q.id);
  }
  const answers=ui('div','answers');
  q.choices.forEach((choice,i)=>{
    const available=mode==='practice'&&!session.submitted;
    const result=available?button('choice','',()=>applyChoice(q,i,'question')):ui('div','choice');
    result.append(ui('span','letter',LETTERS[i]),ui('span',null,q.audio&&!session.submitted?`응답 ${LETTERS[i]}`:choice));
    if(available){result.dataset.optionId=q.id;result.dataset.option=i;}
    else if(session.marks[q.id]===i)result.classList.add('selected');
    answers.append(result);
  });
  panel.append(answers,ui('p','notice',session.submitted?(q.audio?('질문: '+q.question):'해설은 채점 결과에서 확인할 수 있어요.'):(mode==='strict'?'실전 모드에서는 오른쪽 OMR 답안지에서만 마킹할 수 있어요.':'문제 보기에서 고르면 OMR 답안지에도 표시됩니다.')));
  const nav=ui('div','question-actions');
  const prev=button('button light','‹ 이전',()=>jump(session.index-1,true));
  const next=button('button light','다음 ›',()=>jump(session.index+1,true));
  prev.disabled=session.index===0;next.disabled=session.index===total-1;
  nav.append(prev,next);panel.append(nav);

  const sheet=$('sheet'), sheetHead=ui('div','sheet-head'), count=ui('span','counter');
  count.id='answered';sheetHead.append(ui('h2',null,'OMR 답안지'),count);
  const progress=ui('progress','progress');progress.id='progress';progress.max=total;progress.setAttribute('aria-label','답안 마킹 진행률');
  sheet.replaceChildren(sheetHead,progress);
  for(const section of ['LC','RC']){
    const listThisSection=list.filter(v=>v.section===section);
    if(!listThisSection.length)continue;
    const group=ui('section','omr-group');group.append(ui('h3',null,section==='LC'?'LC · 듣기':'RC · 읽기'));
    listThisSection.forEach(a=>{
      const num=list.indexOf(a)+1, row=ui('div',a.id===q.id?'omr-row current':'omr-row');
      const label=button('omr-jump',String(num).padStart(2,'0'),()=>jump(num-1,true));
      label.setAttribute('aria-label',`${num}번 문제로 이동`);
      if(a.id===q.id)label.setAttribute('aria-current','true');
      row.append(label);
      a.choices.forEach((_,i)=>{
        let cls='bubble';
        if(session.submitted&&a.answer===i)cls+=' correct';
        if(session.submitted&&session.marks[a.id]===i&&a.answer!==i)cls+=' wrong';
        const b=button(cls,LETTERS[i],()=>applyChoice(a,i,'omr'));b.disabled=session.submitted;
        b.setAttribute('aria-label',`${num}번 ${LETTERS[i]} 마킹`);b.dataset.optionId=a.id;b.dataset.option=i;row.append(b);
      });
      group.append(row);
    });
    sheet.append(group);
  }
  const submit=button('button primary submit',session.submitted?'채점 결과 보기':'답안 제출 · 채점',()=>{
    if(!session.submitted){
      const open=total-Object.keys(session.marks).length;
      if(open&&!confirm(`미응답 ${open}문항이 있어요. 그대로 제출하고 채점할까요?`))return;
      session={...session,submitted:true};addHistory(buildRecord({session,items:list,kind:active}));save();render();
    }
    $('results').scrollIntoView({behavior:'smooth',block:'start'});
  });
  sheet.append(submit);
  updateSelection();
  renderResults(list);
}
function renderResults(list){
  const out=$('results');
  if(!session.submitted){out.hidden=true;out.replaceChildren();return;}
  renderReview(out,buildRecord({session,items:list,kind:active}));
}
function addHistory(record){
  if(history.some(r=>r.id===record.id))return;
  history=[record,...history].sort((a,b)=>b.at-a.at).slice(0,HISTORY_LIMIT);
  save();renderOverview();renderPast();
}
function openPast(record){
  reviewId=record.id;
  if(route!=='history')location.hash='history';
  else{renderPast();$('history-review').scrollIntoView({behavior:'smooth',block:'start'});}
}
function renderPast(){
  const filter=$('history-filter').value, list=filter==='all'?history:history.filter(r=>r.kind===filter);
  renderHistory($('history-list'),list,'표시할 제출 기록이 없어요.',openPast);
  const current=history.find(x=>x.id===reviewId);
  if(current)renderReview($('history-review'),current);
  else{$('history-review').hidden=true;$('history-review').replaceChildren();}
}
function renderOverview(){
  const stats=summarizeHistory(history);
  const list=[
    ['제출한 세트',String(stats.attempts),'채점을 완료한 학습 기록'],
    ['누적 정답률',stats.accuracy===null?'—':stats.accuracy+'%',stats.total?('총 '+stats.total+'문항 기준'):'첫 제출 후 표시'],
    ['최근 원점수',stats.latest?(stats.latest.summary.correct+'/'+stats.latest.summary.total):'—','공식 환산 점수 아님']
  ];
  $('dashboard-metrics').replaceChildren(...list.map(([name,value,desc])=>{
    const card=ui('article','surface metric');card.append(ui('h2','name',name),ui('strong','value',value),ui('p','metric-note',desc));return card;
  }));
  $('active-mode').textContent=modeFor(session.mode);
  $('active-name').textContent=nameFor(active)+(active==='bank'?' · 16문항':' · 3문항');
  const count=Object.keys(session.marks).length;
  $('active-description').textContent=session.submitted?'채점 완료 · 답안과 해설을 볼 수 있어요.':`${count} / ${items().length} 문항 마킹`;
  $('active-progress').max=items().length;$('active-progress').value=count;
  const next=session.submitted?'채점 결과 보기':count||session.index?'시험 이어 풀기':'시험 연습 시작';
  $('continue-exam').textContent=next;$('main-exam-link').textContent=next;
  $('dashboard-accuracy').replaceChildren(...['LC','RC'].map(key=>{
    const {correct,total,accuracy}=stats[key], line=ui('div','stat-line'), bar=ui('progress','progress');
    bar.max=total||1;bar.value=correct;bar.setAttribute('aria-label',`${key} 정답률${total?'':' 미측정'}`);
    line.append(ui('span',null,key),bar,ui('span',null,accuracy===null?'—':accuracy+'%'));return line;
  }));
  renderHistory($('dashboard-recent'),history.slice(0,3),'아직 제출한 세트가 없어요. 첫 시험을 채점하면 여기에 표시됩니다.',openPast);
}
function reset(mode=session.mode,newActive=active,replacement){
  if(!session.submitted&&Object.keys(session.marks).length&&!confirm('진행 중인 마킹이 지워져요. 새로 시작할까요?'))return false;
  if(replacement){generated=replacement;pending=[];}
  active=newActive;session=newSession(mode,items());save();render();return true;
}
$('practice-mode').onclick=()=>{if(session.mode!=='practice')reset('practice');};
$('strict-mode').onclick=()=>{if(session.mode!=='strict')reset('strict');};
$('reset').onclick=()=>reset();
const hints={
  codex:'로컬 Codex CLI에서 ChatGPT에 직접 로그인해야 해요. 사용량은 그 계정에 반영되며, API 키로 자동 전환하지 않습니다.',
  openai:'OpenAI API 키를 통한 별도 API 과금입니다. ChatGPT 구독과는 다른 결제 경로예요.',
  gemini:'Google Gemini API를 호출합니다. 사용량과 과금은 키가 속한 Google 프로젝트의 설정을 따릅니다.'
};
function fields(){
  const val=$('provider').value;
  $('provider-hint').textContent=hints[val];$('api-fields').hidden=val==='codex';
  $('api-key').value='';$('model').value='';
}
async function api(path,data){
  const opts=data===undefined?{}:{method:'POST',headers:{'content-type':'application/json','x-mark-session':sessionToken??''},body:JSON.stringify(data)};
  const result=await fetch('/api/'+path,opts);
  const v=await result.json();
  if(!result.ok)throw Error(v.error||'연결할 수 없어요.');
  return v;
}
function message(text,error=false,target='engine-message'){$(target).textContent=text;$(target).classList.toggle('error',error);}
async function status(){
  const s=await api('codex/status');
  $('codex-status').textContent=s.supported?`관리형 런타임: ${s.installed??'설치 안 됨'} · 지정 버전: ${s.pinned??'-'}`:'이 환경에서는 관리형 설치를 제공하지 않아요. PATH의 Codex CLI는 별도로 쓸 수 있어요.';
  $('codex-login').textContent='로그인 명령 (Windows PowerShell): '+(s.loginCommand??'codex login');
  $('install-pinned').hidden=!s.supported;$('check-version').hidden=!s.supported;$('rollback').hidden=!s.previous;
}
function lock(state){engineBusy=state;for(const id of ['generate','provider','install-pinned','check-version','install-latest','rollback'])$(id).disabled=state;}
async function doEngine(action,target='engine-message'){
  if(engineBusy)return;
  lock(true);
  try{await action();}catch(e){message(e.message||'요청에 실패했어요.',true,target);}finally{lock(false);}
}
$('provider').onchange=()=>{fields();message('');};
$('generate').onclick=()=>doEngine(async()=>{
  const provider=$('provider').value, apiKey=$('api-key').value, model=$('model').value;
  if(provider!=='codex'&&!apiKey.trim())throw Error('API 키를 입력해 주세요.');
  const request=++draftEpoch;
  if(!sessionToken)sessionToken=(await api('session')).token;
  $('api-key').value='';
  message('문항 3개를 만드는 중이에요. 현재 세트는 유지됩니다.');
  const data=await api('generate',{provider,apiKey,model});
  if(request!==draftEpoch)return;
  pending=parseGenerated(JSON.stringify(data.questions));save();$('export-set').disabled=false;
  $('activate-generated').hidden=false;
  message('검수 전 문항 3개를 만들었어요. 현재 세트는 바뀌지 않았습니다.');
});
$('activate-generated').onclick=()=>{if((pending.length||generated.length)&&reset(session.mode,'generated',pending.length?pending:undefined))location.hash='exam';};
$('activate-bank').onclick=()=>{if(reset(session.mode,'bank'))location.hash='exam';};
$('import-set').onclick=()=>$('import-file').click();
$('import-file').onchange=async()=>{
  const input=$('import-file'),file=input.files[0];input.value='';
  if(!file)return;
  const request=++draftEpoch;
  try{
    if(file.size>32000)throw Error('32KB 이하의 RC 세트 JSON을 선택해 주세요.');
    const next=parseGenerated(await file.text());
    if(request!==draftEpoch)return;
    pending=next;
    $('activate-generated').hidden=false;$('export-set').disabled=false;save();
    message('RC 3문항을 가져왔어요. 새 문제 열기를 눌러 시작하세요.');
  }catch(e){message(e.message||'JSON을 읽을 수 없어요.',true);}
};
$('export-set').onclick=()=>{
  const set=pending.length?pending:generated;
  if(!set.length)return;
  const data=set.map(({question,choices,answer,explanation})=>({question,choices,answer,explanation}));
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='mark-listen-rc-part5.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};

const runtime=(text,error=false)=>message(text,error,'runtime-message');
$('check-version').onclick=()=>doEngine(async()=>{
  runtime('새 버전을 확인 중이에요.');
  const s=await api('codex/check',{});
  $('install-latest').hidden=!s.newer;
  runtime(s.newer?`최신 버전: ${s.latest}. 설치할지 선택할 수 있어요.`:`새 버전이 없습니다. (${s.latest})`);
},'runtime-message');
for(const [id,target] of [['install-pinned','pinned'],['install-latest','latest']]){
  $(id).onclick=()=>doEngine(async()=>{
    runtime('공식 배포 파일을 확인하고 설치 중이에요.');
    await api('codex/install',{target});
    $('install-latest').hidden=true;
    await status();runtime('설치됐어요. 위 로그인 명령으로 본인의 ChatGPT 계정에 연결하세요.');
  },'runtime-message');
}
$('rollback').onclick=()=>doEngine(async()=>{runtime('직전 버전을 복원하는 중이에요.');await api('codex/rollback',{});await status();runtime('직전 버전으로 복원했어요.');},'runtime-message');
$('history-filter').onchange=renderPast;
$('quick-strict').onclick=()=>{if(reset('strict'))location.hash='exam';};
$('clear-history').onclick=()=>{
  if(!history.length){$('data-message').textContent='삭제할 제출 기록이 없어요.';return;}
  if(!confirm('모든 제출 기록을 삭제할까요? 현재 세트의 답안은 유지됩니다.'))return;
  history=[];reviewId=null;fullView?.discardRecord();save();renderOverview();renderPast();$('data-message').textContent='제출 기록을 삭제했어요.';
};
const routes={home:'대시보드',exam:'시험 연습',generate:'문제 제작',history:'기록 · 복습',settings:'설정',full:'전체 모의고사'};
async function navigate(){
  const target=location.hash.slice(1);
  route=Object.hasOwn(routes,target)?target:'home';
  document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!=='view-'+route);
  document.querySelectorAll('.nav a').forEach(v=>{if(v.dataset.route===route||(route==='full'&&v.dataset.route==='exam'))v.setAttribute('aria-current','page');else v.removeAttribute('aria-current');});
  $('top-route').textContent=routes[route];
  if(route!=='generate')$('api-key').value='';
  document.querySelectorAll('#question audio,#results audio').forEach(a=>{if(route!=='exam')a.pause();});
  document.querySelectorAll('#history-review audio').forEach(a=>{if(route!=='history')a.pause();});
  document.querySelectorAll('#full-exam-mount .results audio').forEach(a=>{if(route!=='full')a.pause();});
  fullView?.setVisible(route==='full');
  if(route==='home')renderOverview();
  if(route==='history')renderPast();
  if(route==='exam')render();
  if(route==='generate'||route==='settings'){
    if(!sessionToken){try{sessionToken=(await api('session')).token;}catch(e){(route==='settings'?runtime:message)(e.message,true);}}
    if(route==='settings'){try{await status();}catch(e){runtime(e.message,true);}}
  }
  let existingFull=false;
  try{existingFull=Boolean(JSON.parse(localStorage.getItem('mark-listen.full.v1')??'{}').session);}catch{}
  if((route==='full'||existingFull)&&!fullView){
    try {
      if(!fullLoad)fullLoad=import('./full-exam.mjs').then(({mountFullExam})=>mountFullExam($('full-exam-mount'),{onResult:addHistory,onReview:openPast}));
      fullView=await fullLoad;
      fullView.setVisible(route==='full');
    }catch(e){fullLoad=null;const mount=$('full-exam-mount');if(mount)mount.textContent='전체 세트를 불러오지 못했어요. 앱 파일을 확인해 주세요.';console.error(e);}
  }
  window.scrollTo(0,0);
}
mountAudition($('audition-mount'));
fields();render();renderOverview();renderPast();
window.addEventListener('hashchange',navigate);navigate();
