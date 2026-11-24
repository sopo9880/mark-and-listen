import {checkedPhoto} from './photo-pilot.mjs';
import {mkdir,readFile,writeFile,rename,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {blueprint,audioReady,startAttempt,advanceAttempt,markAttempt,finishPhase} from '../public/exam-rules.mjs';
import {score} from '../public/core.mjs';
const valid=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,90}$/.test(id);
export class EpisodeStore{
 constructor(root){this.root=root;this.queue=Promise.resolve();}
 async init(){await mkdir(this.root,{recursive:true});return this;}
 file(id){if(!valid(id))throw Error('잘못된 저장 ID');return join(this.root,id+'.json');}
 async read(id){return JSON.parse(await readFile(this.file(id),'utf8'));}
 async write(e){const file=this.file(e.id),temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(e),{mode:0o600});await rename(temp,file);return e;}
 async locked(fn){const pending=this.queue.then(fn);this.queue=pending.catch(()=>{});return pending;}
 async list(){await this.init();const out=[];for(const name of await readdir(this.root)){if(!/^[a-zA-Z0-9-]+\.json$/.test(name))continue;const e=await this.read(name.slice(0,-5));if(e.kind==='episode')out.push(e);}return out.sort((a,b)=>b.createdAt-a.createdAt);}
 async create({exam='toeic',counts,title,fixed=false}){const groups=blueprint(exam,counts);if(fixed===true&&groups.some(g=>g.part>4))throw Error('고정 대본 검증은 LC만 지원합니다.');return this.write({id:randomUUID(),kind:'episode',schema:1,exam,fixed:fixed===true,title:String(title||'새 회차').slice(0,100),createdAt:Date.now(),groups,attempts:[]});}
 async audio(eid,sid){if(!valid(eid)||!valid(sid))throw Error('잘못된 음원 ID');return join(this.root,eid,sid+'.wav');}
 async saveAudio(e,s,result){const wav=result.wav;if(!Buffer.isBuffer(wav)||wav.length<46||wav.length>12_000_000||wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,16)!=='WAVEfmt '||wav.readUInt16LE(20)!==1||wav.readUInt16LE(22)!==1||wav.readUInt16LE(34)!==16||wav.readUInt32LE(40)!==wav.length-44||wav.readUInt32LE(4)!==wav.length-8)throw Error('잘못된 WAV');const rate=wav.readUInt32LE(24);if(rate<8000||rate>48000||wav.readUInt32LE(28)!==rate*2)throw Error('잘못된 WAV 속도');const dir=join(this.root,e.id);await mkdir(dir,{recursive:true});const dest=await this.audio(e.id,s.id),tmp=dest+'.tmp';await writeFile(tmp,wav);await rename(tmp,dest);Object.assign(s,{status:'ready',duration:(wav.length-44)/(rate*2),transcript:result.transcript||'',reviewed:false,sha256:createHash('sha256').update(wav).digest('hex'),audio:`/api/media/${e.id}/${s.id}`,error:null});}
 async verifyAudio(e){for(const g of e.groups)for(const s of g.segments??[]){if(s.status!=='ready')continue;const b=await readFile(await this.audio(e.id,s.id));if(createHash('sha256').update(b).digest('hex')!==s.sha256)throw Error('저장된 음원이 손상되었습니다. 다시 생성하세요.');}}
 async begin(id){return this.locked(async()=>{const e=await this.read(id);if(e.photoPilot)for(const group of e.groups)await checkedPhoto(this,e.id,group);await this.verifyAudio(e);const unfinished=e.attempts.find(a=>advanceAttempt(a).phase!=='done');if(unfinished)return unfinished;const s=startAttempt(e);e.attempts.unshift(s);await this.write(e);return s;});}
 async attempt(id,aid,action){return this.locked(async()=>{const e=await this.read(id),i=e.attempts.findIndex(a=>a.id===aid);if(i<0)throw Error('응시 기록 없음');let s=e.attempts[i];s=action?.phase&&action.phase!==s.phase?advanceAttempt(s):action?.type==='mark'?markAttempt(s,e,action.questionId,action.index):action?.type==='next'?finishPhase(s):advanceAttempt(s);if(s.phase==='done'){const items=e.groups.flatMap(g=>g.questions);s.summary=score({order:items.map(q=>q.id),marks:s.marks},items);}e.attempts[i]=s;await this.write(e);return s;});}
}
export { transcriptDiff } from './narration.mjs';
