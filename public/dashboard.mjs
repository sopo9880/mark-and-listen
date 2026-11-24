import { score } from './core.mjs';
import { LETTERS } from './bank.mjs';
export const HISTORY_LIMIT=80;
export const nameFor=kind=>({bank:'기본 세트',generated:'AI 생성 세트',full:'전체 모의고사'})[kind]??'연습 세트';
export const modeFor=mode=>mode==='strict'?'실전 OMR':'연습 모드';
export function buildRecord({session,items,kind,now=Date.now(),id=globalThis.crypto?.randomUUID?.()??String(now)}){
  const questions=JSON.parse(JSON.stringify(items));
  const saved={...session,marks:{...session.marks},order:[...session.order],submitted:true};
  return {id,at:now,kind,mode:saved.mode,questions,summary:score(saved,questions)};
}
export function restoreHistory(value){
  if(!Array.isArray(value))return [];
  return value.filter(x=>x&&typeof x.id==='string'&&Number.isFinite(x.at)&&['bank','generated','full'].includes(x.kind)
    &&x.summary&&Number.isFinite(x.summary.correct)&&Number.isFinite(x.summary.total)&&Array.isArray(x.summary.rows)
    &&x.summary.rows.length===x.summary.total&&Array.isArray(x.questions)&&x.questions.length===x.summary.total).slice(0,HISTORY_LIMIT);
}
export function summarizeHistory(history){
  const correct=history.reduce((a,b)=>a+b.summary.correct,0);
  const total=history.reduce((a,b)=>a+b.summary.total,0);
  const stats={attempts:history.length,correct,total,accuracy:percentage(correct,total),latest:history[0]??null};
  for(const section of ['LC','RC']){
    const numbers=history.map(r=>r.summary[section]).filter(x=>x&&Number.isFinite(x.total)&&Number.isFinite(x.correct));
    const correct=numbers.reduce((a,b)=>a+b.correct,0),total=numbers.reduce((a,b)=>a+b.total,0);
    stats[section]={correct,total,accuracy:percentage(correct,total)};
  }
  return stats;
}
export function percentage(correct,total){return total?Math.round(100*correct/total):null;}
export function localDate(at){
  return new Intl.DateTimeFormat('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(at);
}
const ui=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
export function renderHistory(container,records,empty,open){
  if(!records.length){container.replaceChildren(ui('p','empty',empty));return;}
  const table=ui('table','activity');
  const thead=ui('thead'),head=ui('tr');
  for(const title of ['세트','원점수','제출 시간','복습']){const th=ui('th',null,title);th.scope='col';head.append(th);}
  thead.append(head);table.append(thead);
  const body=ui('tbody');
  for(const item of records){
    const row=ui('tr');
    const action=ui('button','button light','열기');action.type='button';
    action.setAttribute('aria-label',`${nameFor(item.kind)} ${localDate(item.at)} 복습`);
    action.addEventListener('click',()=>open(item));
    const cell=ui('td');cell.append(action);
    row.append(ui('td',null,nameFor(item.kind)+' · '+modeFor(item.mode)),ui('td',null,`${item.summary.correct}/${item.summary.total}`),ui('td','time',localDate(item.at)),cell);
    body.append(row);
  }
  table.append(body);container.replaceChildren(table);
}
export function renderReview(out,record){
  const s=record.summary;
  out.hidden=false;
  out.replaceChildren(ui('p','eyebrow','REVIEW / RAW SCORE'),ui('h2',null,`${s.correct} / ${s.total} 정답`),
    ui('p','results-summary',`LC ${s.LC.correct}/${s.LC.total} · RC ${s.RC.correct}/${s.RC.total} · 미응답 ${s.unsolved} · 환산 점수 아님`));
  const weakness=new Map();
  record.questions.forEach((q,i)=>{
    const mr=s.rows[i];if(!mr)return;
    const label=`${q.section} Part ${q.part}`;
    const metrics=weakness.get(label)??{right:0,total:0};metrics.total++;if(mr.correct)metrics.right++;weakness.set(label,metrics);
  });
  const breakdown=[...weakness].map(([k,v])=>`${k} ${v.right}/${v.total}`).join(' · ');
  out.append(ui('p','muted',breakdown));
  const weakest=[...weakness].filter(([,v])=>v.total>v.right).sort((a,b)=>a[1].right/a[1].total-b[1].right/b[1].total)[0];
  if(weakest)out.append(ui('p','notice',`다음 연습: ${weakest[0]} · 정답률 ${percentage(weakest[1].right,weakest[1].total)}%`));
  const wrongControl=ui('button','button light wrong-filter','오답·미응답만 보기');
  wrongControl.type='button';wrongControl.setAttribute('aria-pressed','false');out.append(wrongControl);
  const details=[];
  record.questions.forEach((q,i)=>{
    const row=s.rows[i];if(!row)return;
    const detail=ui('details'), title=q.number??i+1;
    detail.append(ui('summary',null,`${title}번 · ${row.mark===null?'미응답':row.correct?'정답':'오답'} · 내 답 ${row.letter??'-'} / 정답 ${LETTERS[q.answer]}`));
    for(const [url,alt] of [[q.image,q.imageAlt],[q.graphic,q.graphicAlt]])if(typeof url==='string'&&url.startsWith('/full-lc-images/')){
      const img=ui('img','exam-visual');img.src=url;img.alt=alt??'시험 자료';img.loading='lazy';detail.append(img);
    }
    for(const passage of q.passages??[]){
      if(passage.title)detail.append(ui('strong',null,passage.title));
      if(passage.text)detail.append(ui('p','exam-passage',passage.text));
    }
    if(q.transcript)detail.append(ui('p','exam-passage','대본: '+q.transcript));
    if(typeof q.audio==='string'&&/^\/audio\/(?:lc[1-6]|full-lc\/p[1-4]-[0-9]{2})\.mp3$/.test(q.audio)){
      let player=null;
      detail.addEventListener('toggle',()=>{
        if(detail.open&&!player){
          player=ui('audio','review-player');player.controls=true;player.preload='none';player.src=q.audio;player.setAttribute('aria-label',title+'번 듣기 복습');
          player.addEventListener('play',()=>{for(const other of out.querySelectorAll('audio'))if(other!==player)other.pause();});
          detail.append(player);
        }else if(!detail.open)player?.pause();
      });
    }
    detail.append(ui('p',null,q.question),ui('p',null,q.choices.map((c,j)=>`${LETTERS[j]}: ${c}`).join(' / ')),ui('p',null,q.explanation));
    details.push({detail,right:row.correct});out.append(detail);
  });
  wrongControl.onclick=()=>{
    const filtered=wrongControl.getAttribute('aria-pressed')!=='true';
    wrongControl.setAttribute('aria-pressed',String(filtered));
    wrongControl.textContent=filtered?'전체 문항 보기':'오답·미응답만 보기';
    details.forEach(({detail,right})=>detail.hidden=filtered&&right);
  };
}
