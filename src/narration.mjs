const small = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const tens = 'twenty thirty forty fifty sixty seventy eighty ninety'.split(' ');
const numeric = new Map([...small.map((n,i)=>[n,i]),...tens.map((n,i)=>[n,(i+2)*10])]);
const contractions = {
  "can't":"can not", "cannot":"can not", "won't":"will not", "don't":"do not", "doesn't":"does not",
  "didn't":"did not", "isn't":"is not", "aren't":"are not", "wasn't":"was not", "weren't":"were not",
  "haven't":"have not", "hasn't":"has not", "hadn't":"had not", "couldn't":"could not",
  "wouldn't":"would not", "shouldn't":"should not", "mustn't":"must not",
};
export function narrationTokens(value='') {
  const normalized=String(value).normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'")
    .replace(/\b[a-z]+(?:'[a-z]+)?\b/g,w=>contractions[w]??w)
    .replace(/(?<=\d),(?=\d{3}(?:\D|$))/g,'')
    .replace(/(^|\s)[-−](?=\d)/g,'$1minus ')
    .replace(/\b\d+[.:]\d+\b/g,n=>n.includes('.')?n.replace('.',' point '):n.replace(':',' '));
  const words=normalized.match(/[\p{L}]+(?:'[\p{L}]+)?|[0-9]+|[$€£%]/gu)??[];
  const out=[];
  for(let i=0;i<words.length;i++){
    const word=words[i];
    if(!numeric.has(word)){out.push(/^\d+$/.test(word)?String(BigInt(word)):word);continue;}
    let n=numeric.get(word);
    if(n>=20&&n%10===0&&numeric.has(words[i+1])&&numeric.get(words[i+1])<10)n+=numeric.get(words[++i]);
    if(n>=1&&n<=9&&words[i+1]==='hundred'){
      n*=100;i++;
      if(words[i+1]==='and'&&numeric.has(words[i+2]))i++;
      if(numeric.has(words[i+1])){
        let remainder=numeric.get(words[++i]);
        if(remainder>=20&&remainder%10===0&&numeric.has(words[i+1])&&numeric.get(words[i+1])<10)remainder+=numeric.get(words[++i]);
        n+=remainder;
      }
    }
    out.push(String(n));
  }
  return out;
}
export function transcriptDiff(expected,actual){
  const a=narrationTokens(expected),b=narrationTokens(actual);
  let first=0;while(first<a.length&&first<b.length&&a[first]===b[first])first++;
  let endA=a.length,endB=b.length;
  while(endA>first&&endB>first&&a[endA-1]===b[endB-1]){endA--;endB--;}
  const missing=a.slice(first,endA),added=b.slice(first,endB);
  return {exact:a.length>0&&!missing.length&&!added.length,missing,added};
}
export async function verifiedNarration(speak,args){
  for(let attempt=0;attempt<3;attempt++){
    args.signal?.throwIfAborted();
    const take=await speak(args);
    const diff=transcriptDiff(args.prompt,take.transcript);
    if(diff.exact)return {...take,diff,attempts:attempt+1};
  }
  throw Object.assign(Error('대본과 전사가 세 번 일치하지 않았습니다. 해당 구간만 다시 생성하세요.'),{code:'NARRATION_MISMATCH'});
}
