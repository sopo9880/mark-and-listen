import {EXAMS,audioReady,audioTimeline,phaseDurations,advanceAttempt} from './exam-rules.mjs';
const $=id=>document.getElementById(id),root=$('content');let token,episodes=[],settings,tab='home',stop=false,working=false,dispose=()=>{},selected=null;
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const run=fn=>async()=>{try{$('notice').textContent='';await fn();}catch(e){$('notice').textContent=e.message;}};
const button=(text,fn,primary=false)=>{const e=el('button',primary?'primary':'',text);e.type='button';e.onclick=run(fn);return e;};
const card=(title,...children)=>{const e=el('section','card stack');e.append(el('h2','',title),...children);return e;};
const row=(...nodes)=>{const e=el('div','row');e.append(...nodes);return e;};
const field=(title,input)=>{const l=el('label','',title);l.append(input);return l;};
const input=(type,value='')=>{const e=el('input');e.type=type;e.value=value;if(type==='password'){e.autocomplete='off';e.spellcheck=false;}return e;};
const select=(choices,value)=>{const s=el('select');for(const [id,name]of choices){const o=el('option','',name);o.value=id;s.append(o);}s.value=value;return s;};
async function api(path,body){const r=await fetch('/api/'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Mark-Session':token},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error||'요청 실패');return data;}
const connectionLabels={unset:'미설정',unverified:'확인 전',connected:'연결됨',error:'오류'};
async function updateConnections(data) {
  data??=await api('connections');
  $('connection-status').replaceChildren(...[['codex','Codex'],['gemini','Gemini'],['openai','GPT API']]
    .map(([id,label])=>el('p','connection-'+data[id],label+' · '+connectionLabels[data[id]])));
  return data;
}
async function jpegForPilot(file){
  const picture=await createImageBitmap(file);
  try {
    const factor=Math.min(1,1200/Math.max(picture.width,picture.height));
    const canvas=el('canvas');
    canvas.width=Math.max(1,Math.round(picture.width*factor));canvas.height=Math.max(1,Math.round(picture.height*factor));
    canvas.getContext('2d',{alpha:false}).drawImage(picture,0,0,canvas.width,canvas.height);
    for(const quality of [.85,.7,.55]){
      const data=canvas.toDataURL('image/jpeg',quality).slice('data:image/jpeg;base64,'.length);
      if(data.length<=533336)return data;
    }
    throw Error('사진 크기가 너무 큽니다.');
  }finally{picture.close();}
}
function photoPilotCard(){
  const photos=input('file');photos.multiple=true;photos.accept='image/jpeg';
  const provider=select([['gemini','Gemini API'],['openai','GPT API']],'gemini'),model=input('text');
  return card('Part 1 · 사진 6장 파일럿',
    el('p','muted','ZIP 압축을 푼 뒤 JPEG 6장을 선택하세요. 문제를 생성할 때 사진 픽셀이 아래에서 선택한 API로 전송됩니다.'),
    field('JPEG 사진 6장',photos),field('이미지 입력 공급자',provider),field('이미지 입력 지원 모델 ID',model),
    button('사진을 불러와 회차 만들기',async()=>{
      if(photos.files.length!==6)throw Error('사진을 정확히 6장 선택하세요.');
      if(!model.value.trim())throw Error('이미지 입력 모델 ID를 입력하세요.');
      const images=await Promise.all(Array.from(photos.files,jpegForPilot));
      const e=await api('photo-pilot',{provider:provider.value,model:model.value.trim(),images});
      await detail(e.id);
    },true));
}
async function refresh(){episodes=(await api('library')).episodes;settings=await api('settings');await updateConnections();}
const metrics=e=>{const seg=e.groups.flatMap(g=>g.segments??[]);return {questions:e.groups.reduce((n,g)=>n+g.count,0),done:e.groups.filter(g=>g.status==='ready').length,total:e.groups.length,audio:seg.filter(s=>s.status==='ready').length,segments:seg.length,reviewed:seg.filter(s=>s.reviewed).length};};
const statusText=e=>{const m=metrics(e);return `${m.questions}문항 · 문항 묶음 ${m.done}/${m.total} · 음원 ${m.audio}/${m.segments} · 검수 ${m.reviewed}/${m.segments}`;};
async function show(next){if(working&&next!==tab)throw Error('제작 중지를 누른 뒤 화면을 이동하세요.');dispose();dispose=()=>{};tab=next;await refresh();root.replaceChildren();for(const b of document.querySelectorAll('[data-tab]'))b.classList.toggle('active',b.dataset.tab===tab);$('page-title').textContent=({home:'나의 학습 공간',create:'문제 제작',library:'시험 연습',settings:'설정'})[tab]||'회차';if(tab==='home')home();if(tab==='create')halls();if(tab==='library')library();if(tab==='settings')await preferences();}
function episodeCard(e){return card(e.title,el('p','muted',`${EXAMS[e.exam].name} · Part ${[...new Set(e.groups.map(g=>g.part))].join(', ')} · 응시 ${e.attempts.length}회`),el('p','',statusText(e)),el('span','badge',audioReady(e)?'응시 준비됨':'제작 / 검수 중'),button('회차 열기',()=>detail(e.id)));}
function home(){const active=episodes.find(e=>e.attempts.some(a=>advanceAttempt(a).phase!=='done'));const hero=el('section','hero');hero.append(el('span','pill','YOUR LEARNING SPACE'),el('h1','',active?'오늘의 연습을 이어가세요':'당신의 다음 연습을 만들어 보세요'),el('p','muted',active?active.title:'시험관을 고르고 나만의 회차를 준비하세요. 완성된 음원과 문제는 오프라인에서도 함께합니다.'),row(button('이어서 풀기',()=>active?exam(active.id,active.attempts.find(a=>advanceAttempt(a).phase!=='done')):show('library'),true),button('새 문제 제작',()=>show('create'))));root.append(hero);const grid=el('div','grid');const drafts=episodes.filter(e=>!audioReady(e));grid.append(card('시험관',el('p','count',String(Object.keys(EXAMS).length)),button('TOEIC관 열기',()=>{tab='create';creator();})),card('제작 중인 회차',el('p','count',String(drafts.length)),button('제작 이어가기',()=>drafts[0]?detail(drafts[0].id):show('create'))),card('최근 연습',el('p','count',String(episodes.reduce((n,e)=>n+e.attempts.length,0))),button('기록 보기',()=>show('library'))));root.append(grid);const recent=el('div','grid');episodes.slice(0,3).forEach(e=>recent.append(episodeCard(e)));root.append(recent);}
function halls(){root.replaceChildren(el('h1','','어떤 시험을 준비할까요?'),el('p','muted','시험관마다 파트, 문항 묶음, 시간과 채점 규칙을 따로 관리합니다.'),card('TOEIC관',el('p','','Listening & Reading · Part 1–7'),button('TOEIC관 입장',creator,true)),el('p','muted','다른 시험관은 앞으로 추가됩니다.'))}
function creator(){root.replaceChildren(el('h1','','TOEIC관'),el('p','muted','원점수 기반 연습용 창작 문항입니다. 공식 시험과 무관합니다.'));const title=input('text','나의 TOEIC 회차');const mode=select([['full','전체문항 · LC 100 + RC 100'],['part','파트 문항'],['custom','세부 조정']], 'full');const part=select(Object.keys(EXAMS.toeic.parts).map(p=>[p,'Part '+p]),'2');const controls=el('div','grid');const counts={};for(const[p,spec]of Object.entries(EXAMS.toeic.parts)){const n=input('number',spec.count);n.min='0';n.max=String(spec.count);n.step=String(spec.unit);counts[p]=n;controls.append(field(`Part ${p} · ${spec.unit}개 단위`,n));}const update=()=>{for(const[p,n]of Object.entries(counts)){n.disabled=mode.value!=='custom';n.value=mode.value==='full'||mode.value==='part'&&p===part.value?EXAMS.toeic.parts[p].count:0;}part.disabled=mode.value!=='part';};mode.onchange=update;part.onchange=update;update();root.append(photoPilotCard());const create=async(fixedCounts=null,label='')=>{const values=fixedCounts??Object.fromEntries(Object.entries(counts).map(([p,n])=>[p,Number(n.value)]));const e=await api('episodes',{exam:'toeic',counts:values,title:label||title.value,fixed:!!fixedCounts});await detail(e.id);if(fixedCounts)await produce(e.id,true);};root.append(card('새 회차 제작',field('회차 이름',title),field('제작 범위',mode),field('파트 선택',part),controls,el('p','muted','Part 3·4는 대화/담화당 3문항, Part 6은 지문당 4문항. Part 7은 지문 묶음이 잘리지 않습니다.'),button('회차 만들기',()=>create(),true)),card('단계별 낭독 검증',el('p','muted','먼저 고정 대본 5문항으로 생성 → 검수 → 재시작 → 오프라인 응시를 확인하세요. 샘플 음원은 포함되어 있지 않습니다.'),row(button('Part 2 · 5문항 고정 대본',()=>create({2:5},'Part 2 · 고정 대본 5문항')),button('Part 3 · 화자 전환',()=>create({3:3},'Part 3 · 고정 대본 화자 전환')),button('전체 LC · 100문항',()=>create({1:6,2:25,3:39,4:30},'전체 LC · 고정 대본 100문항')))));}
function library(){root.append(el('h1','','저장된 회차'));if(!episodes.length)root.append(card('첫 회차를 만들어 보세요',button('문제 제작으로',()=>show('create'),true)));const list=el('div','grid');episodes.forEach(e=>list.append(episodeCard(e)));root.append(list);}
async function detail(id){dispose();dispose=()=>{};selected=id;tab='detail';const e=(await api('library')).episodes.find(e=>e.id===id);if(!e)throw Error('회차 없음');root.replaceChildren(el('h1','',e.title));const m=metrics(e),progress=el('progress');progress.max=m.total+m.segments;progress.value=m.done+m.audio;const controls=row(button('목록으로',()=>show('library')),button('문항·음원 생성 / 실패 구간 재시도',()=>produce(id),true),button('제작 중지',()=>{stop=true;}));const start=button('응시 시작',async()=>exam(id,await api('attempt/start',{id})),true);start.disabled=!audioReady(e)||working;controls.append(start);root.append(card('제작 현황',el('p','',statusText(e)),progress,el('p','muted','생성 완료 후 각 문항과 음원을 검수하세요. 제작 완료만으로 시험이 시작되지는 않습니다.'),controls));for(const a of e.attempts)root.append(card(new Date(a.startedAt).toLocaleString(),el('p','',a.summary?`${a.summary.correct}/${a.summary.total} 정답`:'진행 중'),button(a.summary?'복습':'이어서 응시',()=>exam(id,a))));
 for(const g of e.groups){const wrap=el('details','card');wrap.open=e.groups.length<=5;wrap.append(el('summary','',`Part ${g.part} · ${g.id} · ${g.count}문항 · ${g.status==='ready'?'문항 준비됨':'문항 미완성'} ${g.reviewed?'✓':''}`));if(g.error)wrap.append(el('p','diff',g.error));if(g.image||g.graphic){const im=el('img');im.src=g.image||g.graphic;im.alt=g.imageAlt||g.graphicAlt;im.className='review-image';wrap.append(im);}for(const p of g.passages??[])wrap.append(el('h3','',p.title),el('pre','',p.body));for(const q of g.questions??[])wrap.append(el('pre','',`${q.question}\n${q.choices.map((c,i)=>'ABCD'[i]+'. '+c).join('\n')}\n정답 ${'ABCD'[q.answer]} · ${q.explanation}`));if(g.status==='ready')wrap.append(button(g.reviewed?'문항 검수 취소':'문항·정답·지문 확인 완료',async()=>{await api('review',{id,groupId:g.id,approved:!g.reviewed});await detail(id);}));for(const s of g.segments??[]){const block=el('div','segment');block.append(el('small','',`${s.speaker} · ${s.id} · ${s.status}`),el('pre','',s.text));if(s.status==='ready'){const a=el('audio');a.controls=true;a.preload='none';a.src=s.audio;block.append(a,el('p','muted','실제 낭독 전사: '+(s.transcript||'전사 없음 — 직접 청취 필수')),el('p','diff',s.diff?.exact?'문자 비교 일치 · 숫자·발음·화자도 직접 확인하세요.':`빠진 표현: ${(s.diff?.missing??[]).join(' ')} / 추가 표현: ${(s.diff?.added??[]).join(' ')}`),row(button(s.reviewed?'음원 검수 취소':'직접 듣고 대본·숫자 일치 확인',async()=>{await api('review',{id,groupId:g.id,segmentId:s.id,approved:!s.reviewed});await detail(id);}),button('이 구간만 다시 생성',async()=>{await api('produce',{id,retrySegment:s.id});await detail(id);})));}if(s.error)block.append(el('p','diff',s.error));wrap.append(block);}root.append(wrap);}}
async function produce(id,fixed=false){if(working)return;working=true;stop=false;try{while(!stop){const r=await api('produce',{id,fixed});await detail(id);if(!r.more)break;}$('notice').textContent=stop?'제작을 멈췄습니다. 성공한 구간은 저장되어 있습니다.':'생성을 마쳤습니다. 검수 후 응시할 수 있습니다.';}finally{working=false;await detail(id);}}
async function appUpdateCard(){
  const info=await api('app-update');
  const message=el('p','muted','설치 버전 '+info.version);
  const action=button('새 버전 확인',async()=>{
    action.disabled=true;message.textContent='GitHub에서 업데이트를 확인하고 있어요.';
    try{
      const {update}=await api('app-update/check',{});
      if(!update){message.textContent='최신 버전이에요 · '+info.version;return;}
      message.textContent='서명이 확인된 새 버전 '+update.version;
      if(!confirm(update.version+'을 설치할까요? 설치가 끝나면 앱을 다시 엽니다.'))return;
      message.textContent='설치 파일을 다운로드하고 검증하고 있어요.';
      await api('app-update/install',{version:update.version});
      message.textContent='앱을 닫고 설치를 시작해요.';
    }catch(error){message.textContent=error.message;}
    finally{action.disabled=false;}
  });
  action.disabled=!info.enabled;
  if(!info.enabled)message.textContent+=' · 이 빌드는 앱 내 업데이트가 구성되지 않았어요.';
  return card('앱 업데이트',message,action);
}
async function preferences(){root.append(await appUpdateCard());const liveProvider=select([['gemini','Gemini Live'],['openai','OpenAI GPT Live']],settings.liveProvider);const key=input('password');const model=select([['','모델 목록을 새로고침하세요']], '');let models=[];const updateModels=async()=>{await api('settings',{liveProvider:liveProvider.value,liveModel:''});models=(await api('models',{provider:liveProvider.value})).models;model.replaceChildren(...models.map(m=>{const o=el('option','',m.label);o.value=m.id;return o;}));model.value=models.some(m=>m.id===settings.liveModel)?settings.liveModel:models[0]?.id||'';if(!models.length)throw Error('이 키로 조회된 Live 오디오 모델이 없습니다.');};liveProvider.onchange=()=>{model.replaceChildren();key.value='';};const sample=el('div');const script=select([['single','한 문장'],['multi','연속 문장'],['choices','A–D 선택지 전체']],'multi');root.append(card('듣기 음원',field('공급자',liveProvider),field('API 키 · 실행 중 메모리에만 보관',key),button('키 연결 및 모델 목록 갱신',async()=>{if(key.value){await api('settings',{keyProvider:liveProvider.value,apiKey:key.value});key.value='';}try{await updateModels();}finally{await updateConnections();}}),field('텍스트 대본 → Live 오디오 모델',model),field('낭독 테스트 대본',script),row(button('선택 저장',async()=>{if(!model.value)throw Error('모델을 선택하세요.');await api('settings',{liveProvider:liveProvider.value,liveModel:model.value});$('notice').textContent='선택을 저장했습니다. 기존 음원은 유지됩니다.';},true),button('짧은 대본 실제 낭독 테스트',async()=>{await api('settings',{liveProvider:liveProvider.value,liveModel:model.value});sample.replaceChildren();const r=await api('test-live',{script:script.value});const bytes=Uint8Array.from(atob(r.wav),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));const a=el('audio');a.controls=true;a.src=url;sample.replaceChildren(a,el('p','',r.transcript||'전사 없음'));dispose=()=>URL.revokeObjectURL(url);})),sample,el('p','muted','목록은 계정에 표시된 Live 계열 모델입니다. 실제 접근·오디오 출력은 낭독 테스트로 확인하세요. 무료 제공 여부는 계정 할당량에 따르며, 유료 공급자로 자동 전환하지 않습니다. GPT-Live는 무음 구간 후 세션을 종료하므로 누락·추가 발화 검수가 필요합니다.')));
 const provider=select([['codex','Codex · ChatGPT 로그인'],['openai','GPT API'],['gemini','Gemini API']],settings.textProvider),textModel=input('text',settings.textModel),textKey=input('password');root.append(card('문항 생성',field('기본 생성 엔진',provider),field('API 모델 ID · 비우면 공급자 기본값',textModel),field('API 키 · Codex에는 필요 없음',textKey),button('생성 옵션 저장',async()=>{if(provider.value!=='codex'&&textKey.value){await api('settings',{keyProvider:provider.value,apiKey:textKey.value});textKey.value='';await updateConnections();}await api('settings',{textProvider:provider.value,textModel:textModel.value});$('notice').textContent='문항 생성 옵션 저장 완료';},true)));
 const auto=input('checkbox');auto.checked=settings.autoUpdate;auto.onchange=run(()=>api('settings',{autoUpdate:auto.checked}));const login=el('p','muted');root.append(card('Codex 엔진',el('p','',`설치 버전: ${settings.codex.installed||'미설치'} · ${settings.updateBusy?'업데이트 중':settings.codex.supported?'Windows x64':'Windows에서 설치 가능'}`),field('최신 안정판 자동 업데이트',auto),el('p','muted','처음 실행할 때 최신 안정판을 확인합니다. 제작 중 교체하지 않으며 실패 시 기존 동작 버전을 유지합니다.'),el('p','diff',settings.updateError||''),row(button('지금 설치 / 업데이트 확인',async()=>{const r=await api('codex/update',{});if(r.error)throw Error(r.error);await show('settings');}),button('브라우저에서 ChatGPT 로그인',async()=>{
   await updateConnections(await api('codex/browser-login',{}));
   login.textContent='기본 브라우저에서 로그인을 마치세요.';
   let pending=true;
   for(let i=0;i<150&&pending;i++){
     await new Promise(resolve=>setTimeout(resolve,2000));
     const data=await updateConnections();
     pending=data.loginPending;
     if(!pending)login.textContent=data.codex==='connected'?'Codex 연결됨':'로그인이 완료되지 않았습니다.';
   }
 })),login));
 root.append(card('연결 상태 확인',row(...[['codex','Codex'],['gemini','Gemini'],['openai','GPT API']].map(([id,label])=>button(label+' 확인',async()=>{try{await api('connection/check',{provider:id});}finally{await updateConnections();}})))));
 const exportButton=button('현재 브라우저의 이전 기록 백업',()=>{const data={};for(const k of ['mark-listen.preview.v1','mark-listen.full.v1']){const v=localStorage.getItem(k);if(v)data[k]=v;}const blob=new Blob([JSON.stringify(data)],{type:'application/json'});const a=el('a');a.href=URL.createObjectURL(blob);a.download='mark-listen-legacy-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});const upload=input('file');upload.accept='.json';upload.onchange=run(async()=>{const file=upload.files[0];if(file.size>4000000)throw Error('파일 크기 초과');await api('legacy',JSON.parse(await file.text()));$('notice').textContent='이전 기록을 별도 파일로 보존했습니다. 원본도 유지됩니다.';});root.append(card('기록 보존',el('p','muted','이전 Electron 앱과 0.0.0.2 사용자 데이터는 삭제하지 않습니다. 새 Tauri의 브라우저 저장소는 별도입니다. 이전 앱의 기록은 원래 앱에서 계속 볼 수 있고, 내보낸 JSON은 아래에서 별도로 보존할 수 있습니다.'),exportButton,field('이전 기록 JSON 보관',upload)));}
async function exam(id,initial){dispose();tab='exam';const e=(await api('library')).episodes.find(e=>e.id===id);let s=await api('attempt/action',{id,attemptId:initial.id,action:{type:'sync'}}),stopped=false,chain=Promise.resolve(),played=null,armed=false;const timeline=audioTimeline(e),audio=el('audio');audio.hidden=true;const time=el('span','clock'),audioStatus=el('p','muted'),paper=el('section','card paper'),omr=el('section','card omr');const items=e.groups.flatMap(g=>g.questions),audioMap=new Map();
 // Stream saved files from the same local process, with byte-range seeking.
 for(const segment of timeline)audioMap.set(segment.id,segment.audio);
 const stopAudio=()=>{audio.pause();audio.removeAttribute('src');played=null;};
 function review(){root.replaceChildren(el('h1','',e.title+' · 복습'),el('p','count',`${s.summary?.correct??0} / ${items.length}`),el('p','muted','원점수 · 환산 점수 아님'),button('회차 목록',()=>show('library')));for(const[qIndex,q]of items.entries()){const block=card(`${qIndex+1}. ${q.question}`,el('p','',q.choices.map((c,i)=>`${'ABCD'[i]}. ${c}`).join(' / ')),el('p','',`내 답 ${'ABCD'[s.marks[q.id]]||'미응답'} · 정답 ${'ABCD'[q.answer]}`),el('p','',q.explanation));block.classList.add(s.marks[q.id]===q.answer?'review-correct':'review-wrong');root.append(block);}for(const g of e.groups.filter(g=>g.part<=4))for(const seg of g.segments){const a=el('audio');a.controls=true;a.preload='none';a.src=seg.audio;root.append(card(`${g.id} · ${seg.speaker}`,el('p','',seg.text),a));}}
 function paint(){if(stopped)return;if(s.phase==='done'){stopAudio();review();return;}paper.replaceChildren(el('h2','',`${s.phase} 문제지`));omr.replaceChildren(el('h2','','실전 OMR'));let number=0;for(const g of e.groups){if((g.part<=4?'LC':'RC')!==s.phase){number+=g.count;continue;}if(g.image||g.graphic){const image=el('img');image.src=g.image||g.graphic;image.alt=g.imageAlt||g.graphicAlt;paper.append(image);}for(const p of g.passages??[])paper.append(el('h3','',p.title),el('pre','',p.body));for(const q of g.questions){number++;const qv=el('div','question');qv.append(el('h3','',`${number}. ${q.part<=2?'듣고 OMR에 표시하세요.':q.question}`));if(q.part>2)qv.append(el('p','',q.choices.map((c,i)=>`${'ABCD'[i]}. ${c}`).join('\n')));paper.append(qv);const line=row(el('span','number',String(number)));for(let i=0;i<q.choices.length;i++){const b=button('ABCD'[i],()=>action({type:'mark',questionId:q.id,index:s.marks[q.id]===i?null:i}));b.setAttribute('aria-label',`${number}번 ${'ABCD'[i]}`);b.setAttribute('aria-pressed',String(s.marks[q.id]===i));line.append(b);}omr.append(line);}}}
 async function action(a){a={...a,phase:s.phase};chain=chain.then(async()=>{s=await api('attempt/action',{id,attemptId:s.id,action:a});paint();}).catch(err=>{$('notice').textContent=err.message;});await chain;}
 if(s.phase==='done'){review();return;}
 root.replaceChildren(el('h1','',e.title),row(time,button('듣기 시작 / 현재 위치 이어듣기',()=>{armed=true;played=null;tick();},true),button('다음 영역 / 제출',()=>{if(confirm('현재 영역을 종료할까요? 되돌릴 수 없습니다.'))return action({type:'next'});}),button('홈으로 · 타이머는 계속 진행',()=>show('home'))),audioStatus,audio);const two=el('div','two');two.append(paper,omr);root.append(two);paint();let syncing=false;
 function tick(){if(stopped||s.phase==='done')return;const current=advanceAttempt(s);time.textContent=`${current.phase} ${Math.floor(Math.max(0,current.phaseEndsAt-Date.now())/60000).toString().padStart(2,'0')}:${Math.floor(Math.max(0,current.phaseEndsAt-Date.now())/1000%60).toString().padStart(2,'0')}`;if(current.phase!==s.phase&&!syncing){syncing=true;action({type:'sync'}).finally(()=>{syncing=false;});return;}if(s.phase!=='LC'){stopAudio();audioStatus.textContent='RC · 인터넷 연결 없이 저장된 문제로 응시 중';return;}const elapsed=(Date.now()-s.phaseStartedAt)/1000;const seg=timeline.find(t=>elapsed>=t.start&&elapsed<t.end);if(!armed){audioStatus.textContent='듣기 시작을 눌러 현재 시험 시간 위치에서 재생하세요.';return;}if(!seg){audio.pause();audioStatus.textContent='답안 작성 시간';return;}if(played!==seg.id){played=seg.id;audio.src=audioMap.get(seg.id);audio.onloadedmetadata=()=>{audio.currentTime=Math.min(Math.max(0,(Date.now()-s.phaseStartedAt)/1000-seg.start),Math.max(0,audio.duration-.05));};audio.play().catch(()=>{armed=false;audioStatus.textContent='재생을 허용하려면 듣기 시작을 누르세요.';});}audioStatus.textContent=`저장 음원 재생 · ${seg.groupId} · ${seg.speaker}`;}
 const timer=setInterval(tick,250);tick();dispose=()=>{stopped=true;clearInterval(timer);stopAudio();};}
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=run(()=>show(b.dataset.tab));
try {
  const session = await api('session');
  token = session.token;
  await show('home');
  if (session.smoke) await api('smoke', { uiReady: !!root.querySelector('.hero h1') });
} catch (error) {
  $('notice').textContent = error.message;
}
