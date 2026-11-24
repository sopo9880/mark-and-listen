import { LETTERS } from './bank.mjs';

export function newSession(mode, items) {
  if (!['practice','strict'].includes(mode)) throw Error('Invalid mode');
  return {mode, order:items.map(q=>q.id), entry:{}, marks:{}, index:0, submitted:false};
}
export function choose(session, items, id, value, source) {
  if (session.submitted || (source==='question' && session.mode==='strict')) return session;
  const q=items.find(q=>q.id===id);
  if(!q || !session.order.includes(id) || !['question','omr'].includes(source)) return session;
  if(value !== null && (!Number.isInteger(value)||value<0||value>=q.choices.length)) return session;
  const marks={...session.marks}, entry={...session.entry};
  if(value===null){ delete marks[id]; delete entry[id]; }
  else { marks[id]=value; entry[id]=source; }
  return {...session, marks, entry};
}
export function score(session, items) {
  const ids = new Map(items.map(i=>[i.id,i]));
  const rows = session.order.map(id=>ids.get(id)).filter(Boolean).map(q=>{
    const mark=Object.hasOwn(session.marks,q.id)?session.marks[q.id]:null;
    return { id:q.id, section:q.section, mark, letter:LETTERS[mark]??null, correct:mark===q.answer };
  });
  const summarize=items=>({correct:items.filter(r=>r.correct).length,unsolved:items.filter(r=>r.mark==null).length,total:items.length});
  return {...summarize(rows),LC:summarize(rows.filter(r=>r.section==='LC')),RC:summarize(rows.filter(r=>r.section==='RC')),rows};
}
function parseCandidate(raw) {
  try { return JSON.parse(raw.trim()); }
  catch {
    const fenced=raw.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if(fenced) return JSON.parse(fenced[1]);
    throw Error('AI가 규격에 맞는 JSON을 반환하지 않았어요. 다시 시도해 주세요.');
  }
}
export function parseGenerated(raw) {
  if(typeof raw!=='string') throw Error('AI 응답이 비어 있어요.');
  const list=parseCandidate(raw);
  const valid=(s,min,max)=>typeof s==='string'&&s.trim().length>=min&&s.trim().length<=max;
  if(!Array.isArray(list)||list.length!==3) throw Error('AI가 문항 3개를 반환하지 않았어요.');
  const seen=new Set();
  return list.map((q,i)=>{
    if(!q||!valid(q.question,10,500)||!q.question.includes('_____')||
       !Array.isArray(q.choices)||q.choices.length!==4||q.choices.some(c=>!valid(c,1,120))||
       new Set(q.choices.map(c=>c.trim().toLowerCase())).size!==4||
       !Number.isInteger(q.answer)||q.answer<0||q.answer>3||!valid(q.explanation,8,800)||
       seen.has(q.question.trim().toLowerCase())) throw Error(`AI가 만든 ${i+1}번 문항이 형식 검사를 통과하지 못했어요.`);
    seen.add(q.question.trim().toLowerCase());
    return {id:`ai${i+1}`,section:'RC',part:5,question:q.question.trim(),choices:q.choices.map(c=>c.trim()),answer:q.answer,explanation:q.explanation.trim()};
  });
}
export const GENERATION_PROMPT = `Generate exactly three original TOEIC-style Part 5 (incomplete sentence) practice questions for a Korean adult studying English. Use a range of common workplace contexts and grammar challenges. Each sentence must contain one blank indicated by exactly five consecutive underscores. Provide four distinct multiple-choice options and exactly one clearly defensible correct answer. Write the explanation in clear Korean and explain why the answer is appropriate. Do not copy actual exam items. Return only a JSON array of three objects with these keys: {"question":"sentence with _____","choices":["A text","B text","C text","D text"],"answer":0,"explanation":"한국어 해설"}. answer must be a number 0 through 3 denoting the correct option index. No markdown, no file/tool use.`;
