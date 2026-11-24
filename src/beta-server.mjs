import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir,stat,rename} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {join,resolve,extname} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {EpisodeStore,transcriptDiff} from './episode-store.mjs';
import {groupPrompt,parseGroup,fixedGroup} from './episode-content.mjs';
import {createCodexUpdater} from './codex-updater.mjs';
import {generateWithCodex} from './codex-engine.mjs';
import {generateWithProvider} from './providers.mjs';
import {listLiveModels,credentials} from './live-models.mjs';
import {auditionWithGeminiLive} from './gemini-live.mjs';
import {auditionWithOpenAILive} from './openai-live.mjs';
export const VERSION='0.1.0.0';
const PUBLIC=fileURLToPath(new URL('../public/',import.meta.url));
const dataRoot=()=>process.env.MARK_LISTEN_DATA||join(process.platform==='win32'?(process.env.LOCALAPPDATA||homedir()):join(homedir(),'.local','share'),'mark-and-listen');
const fail=(status,message)=>Object.assign(Error(message),{status});
const json=async req=>{if(!req.headers['content-type']?.startsWith('application/json'))throw fail(415,'JSON 필요');let size=0;const parts=[];for await(const chunk of req){size+=chunk.length;if(size>4_000_000)throw fail(413,'요청 크기 초과');parts.push(chunk);}try{return JSON.parse(Buffer.concat(parts));}catch{throw fail(400,'JSON 오류');}};
export async function buildBetaServer({root=dataRoot(),updater,generate=generateWithProvider,codex=generateWithCodex,live,models=listLiveModels,autoUpdate=true}={}){
 const store=await new EpisodeStore(join(root,'episodes')).init();updater??=createCodexUpdater({root:join(root,'codex')});
 let settings={autoUpdate:true,liveProvider:'gemini',liveModel:'',textProvider:'codex',textModel:''};try{settings={...settings,...JSON.parse(await readFile(join(root,'settings.json'),'utf8'))};}catch(e){if(e.code!=='ENOENT')throw e;}
 const keys={};let busy=false,updateBusy=false,lastUpdate=0,updateError='',cooldown=0;const modelCache=new Map();const token=randomBytes(32).toString('hex');
 const persist=async()=>{await writeFile(join(root,'settings.tmp'),JSON.stringify(settings),{mode:0o600});await rename(join(root,'settings.tmp'),join(root,'settings.json'));};
 const performUpdate=async()=>{if(busy||updateBusy)return;updateBusy=true;try{if((await store.list()).some(e=>e.attempts.some(a=>a.phase!=='done'&&a.phaseEndsAt>Date.now())))return;lastUpdate=Date.now();if((await updater.status()).supported)await updater.install('latest');updateError='';}catch{updateError='업데이트 실패 · 기존 엔진을 유지합니다.';}finally{updateBusy=false;}};
 const speak=live??(args=>args.provider==='gemini'?auditionWithGeminiLive(args):auditionWithOpenAILive(args));
 const getKey=p=>keys[p]||process.env[p==='gemini'?'GEMINI_API_KEY':'OPENAI_API_KEY'];
 async function liveArgs(){const provider=settings.liveProvider,apiKey=getKey(provider),model=settings.liveModel;credentials(provider,apiKey);const cached=modelCache.get(provider);if(!model||!cached?.some(m=>m.id===model))throw fail(400,'설정에서 모델 목록을 갱신하고 Live 모델을 선택하세요.');return {provider,apiKey,model};}
 const send=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 async function stream(req,res,file,type){const {size}=await stat(file);let start=0,end=size-1;const range=req.headers.range;if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||!m[1]&&!m[2])throw fail(416,'범위 오류');start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));end=m[1]&&m[2]?Math.min(size-1,Number(m[2])):size-1;if(!Number.isSafeInteger(start)||start<0||start>=size||end<start)throw fail(416,'범위 오류');res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);}res.writeHead(range?206:200,{'Content-Type':type,'Content-Length':end-start+1,'Accept-Ranges':'bytes'});if(req.method==='HEAD')res.end();else createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);}
 const server=createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
 try{const port=server.address()?.port;if(req.headers.host!==`127.0.0.1:${port}`||req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${port}`||req.headers['sec-fetch-site']==='cross-site')throw fail(403,'다른 사이트의 요청은 허용하지 않습니다.');const path=new URL(req.url,'http://localhost').pathname;
 if(req.method==='GET'&&path==='/api/session'){send(res,{token,build:VERSION});return;}
 if(req.method==='GET'&&path==='/api/library'){send(res,{episodes:await store.list()});return;}
 if(req.method==='GET'&&path==='/api/settings'){send(res,{...settings,keys:{gemini:!!getKey('gemini'),openai:!!getKey('openai')},codex:await updater.status(),updateBusy,updateError});return;}
 const media=/^\/api\/media\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9-]+)$/.exec(path);if(media&&['GET','HEAD'].includes(req.method)){await stream(req,res,await store.audio(media[1],media[2]),'audio/wav');return;}
 if(req.method==='POST'&&path.startsWith('/api/')){if(req.headers['x-mark-session']!==token)throw fail(403,'앱을 새로고침하세요.');const b=await json(req);
 if(path==='/api/settings'){if(busy||updateBusy)throw fail(409,'현재 작업이 끝난 후 설정을 바꾸세요.');if(b.keyProvider){credentials(b.keyProvider,b.apiKey);keys[b.keyProvider]=b.apiKey;modelCache.delete(b.keyProvider);}for(const k of ['liveProvider','textProvider'])if(b[k]!==undefined){const allowed=k==='liveProvider'?['gemini','openai']:['codex','gemini','openai'];if(!allowed.includes(b[k]))throw fail(400,'공급자 오류');settings[k]=b[k];}for(const k of ['liveModel','textModel'])if(b[k]!==undefined){if(typeof b[k]!=='string'||b[k].length>160||!/^[a-zA-Z0-9_.:-]*$/.test(b[k]))throw fail(400,'모델 ID 오류');settings[k]=b[k];}if(typeof b.autoUpdate==='boolean')settings.autoUpdate=b.autoUpdate;await persist();send(res,{ok:true});return;}
 if(path==='/api/models'){const provider=b.provider;const list=await models({provider,apiKey:getKey(provider)});modelCache.set(provider,list);send(res,{models:list});return;}
 if(path==='/api/codex/update'){if(busy||updateBusy)throw fail(409,'작업 중에는 교체하지 않습니다.');await performUpdate();send(res,{status:await updater.status(),error:updateError});return;}
 if(path==='/api/codex/login-command'){const exe=await updater.executable();send(res,{command:exe?`& '${exe.replaceAll("'","''")}' login`:'엔진을 먼저 설치하세요.'});return;}
 if(path==='/api/episodes'){send(res,await store.create(b));return;}
 if(path==='/api/attempt/start'){if(busy)throw fail(409,'제작 작업 종료 후 응시하세요.');busy=true;try{send(res,await store.begin(b.id));}catch(e){throw fail(409,e.code==='ENOENT'?'저장된 음원이 없습니다.':e.message);}finally{busy=false;}return;}
 if(path==='/api/attempt/action'){send(res,await store.attempt(b.id,b.attemptId,b.action));return;}
 if(path==='/api/legacy'){await writeFile(join(root,'legacy-'+Date.now()+'.json'),JSON.stringify(b),{mode:0o600});send(res,{ok:true});return;}
 if(['/api/produce','/api/review','/api/test-live'].includes(path)){
 if(busy||updateBusy)throw fail(409,'다른 제작 또는 업데이트가 진행 중입니다.');if(Date.now()<cooldown)throw fail(429,'사용량 한도 이후 잠시 기다려 주세요.');busy=true;const abort=new AbortController();const close=()=>abort.abort();res.once('close',close);
 try{const signal=AbortSignal.any([abort.signal,AbortSignal.timeout(120000)]);
 if(path==='/api/test-live'){const args=await liveArgs();const r=await speak({...args,prompt:'The meeting starts at ten fifteen. Please bring three copies.',voice:args.provider==='gemini'?'Kore':'marin',signal});send(res,{wav:r.wav.toString('base64'),transcript:r.transcript});return;}
 const e=await store.read(b.id);if(e.attempts.length)throw fail(409,'응시한 회차는 변경할 수 없습니다. 새 회차를 만드세요.');
 if(path==='/api/review'){const g=e.groups.find(g=>g.id===b.groupId);if(!g||g.status!=='ready')throw fail(400,'문항 없음');if(b.segmentId){const s=g.segments.find(s=>s.id===b.segmentId);if(!s||s.status!=='ready')throw fail(400,'음원 없음');s.reviewed=b.approved===true;}else g.reviewed=b.approved===true;await store.write(e);send(res,e);return;}
 let g=e.groups.find(g=>g.status!=='ready');
 if(g){try{const provider=settings.textProvider;if(e.fixed||b.fixed===true){Object.assign(g,fixedGroup(g));}else{const prompt=groupPrompt(g);const raw=provider==='codex'?await codex({executable:await updater.executable()??'codex',prompt,signal}):await generate({provider,apiKey:getKey(provider),model:settings.textModel||undefined,prompt,signal});Object.assign(g,parseGroup(raw,g));}await store.write(e);}catch(err){g.status='failed';g.error='문항 생성 또는 검증 실패. 엔진·로그인·모델 설정을 확인하고 재시도하세요.';await store.write(e);throw fail(502,g.error);}send(res,{episode:e,more:true});return;}
 let s;for(const group of e.groups){const candidate=group.segments.find(s=>b.retrySegment?s.id===b.retrySegment:s.status!=='ready');if(candidate){g=group;s=candidate;break;}}
 if(!s){send(res,{episode:e,more:false});return;}
 try{const args=await liveArgs();const voice=args.provider==='gemini'?(s.speaker==='B'?'Puck':s.speaker==='C'?'Charon':'Kore'):(s.speaker==='B'?'cedar':'marin');const result=await speak({...args,prompt:s.text,voice,signal});await store.saveAudio(e,s,result);s.provider=args.provider;s.model=args.model;s.voice=voice;s.diff=transcriptDiff(s.text,result.transcript);await store.write(e);}catch(err){if(s.status!=='ready')s.status='failed';s.error='Live 생성 실패. 키·모델·할당량을 확인하세요. 다른 공급자로 전환하지 않았습니다.';await store.write(e);if(err.status===429||err.code==='GEMINI_LIVE_RATE_LIMIT'){cooldown=Date.now()+15000;throw fail(429,s.error);}throw fail(502,s.error);}send(res,{episode:e,more:true});return;
 }finally{busy=false;res.removeListener('close',close);}}
 throw fail(404,'API 없음');}
 if(!['GET','HEAD'].includes(req.method))throw fail(404,'파일 없음');const name=path==='/'?'beta.html':path.slice(1);if(!/^(?:[a-zA-Z0-9-]+\.(?:html|mjs|css|png)|full-lc-images\/[a-z0-9-]+\.svg)$/.test(name)||name==='index.html'||name==='app.mjs')throw fail(404,'파일 없음');const type={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[extname(name)];await stream(req,res,join(PUBLIC,name),type);
 }catch(e){if(!res.destroyed&&!res.headersSent)send(res,{error:e.status?e.message:e.code==='ENOENT'?'저장된 파일을 찾을 수 없습니다.':'작업을 완료하지 못했습니다. 설정과 저장 공간을 확인하세요.'},e.status||500);}});
 const interval=setInterval(()=>{if(autoUpdate&&settings.autoUpdate&&Date.now()-lastUpdate>24*3600000)void performUpdate();},60000);interval.unref();server.once('close',()=>clearInterval(interval));server.once('listening',()=>{if(autoUpdate&&settings.autoUpdate)void performUpdate();});server.requestTimeout=130000;return {server,store};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const {server}=await buildBetaServer({autoUpdate:process.env.MARK_LISTEN_SMOKE!=='1'});server.listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log('MARK_READY:'+server.address().port));process.stdin.resume();process.stdin.once('end',()=>{server.closeAllConnections();server.close();process.exit(0);});}
