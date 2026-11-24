import {APP_VERSION,createAppUpdater} from './app-update.mjs';
import {UPDATE_PUBLIC_KEY} from './update-trust.mjs';
import {attachPhotos,checkedPhoto,createPhotoQuestion,decodePack,photoPath} from './photo-pilot.mjs';
import {verifiedNarration} from './narration.mjs';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir,stat,rename} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {join,extname} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {EpisodeStore} from './episode-store.mjs';
import {groupPrompt,parseGroup,fixedGroup} from './episode-content.mjs';
import {createCodexUpdater} from './codex-updater.mjs';
import {generateWithCodex,codexLoginStatus,codexBrowserLogin} from './codex-engine.mjs';
import {generateWithProvider} from './providers.mjs';
import {listLiveModels,credentials} from './live-models.mjs';
import {auditionWithGeminiLive} from './gemini-live.mjs';
import {auditionWithOpenAILive} from './openai-live.mjs';
export const VERSION=APP_VERSION;
const PUBLIC=fileURLToPath(new URL('../public/',import.meta.url));
const dataRoot=()=>process.env.MARK_LISTEN_DATA||join(process.platform==='win32'?(process.env.LOCALAPPDATA||homedir()):join(homedir(),'.local','share'),'mark-and-listen');
const fail=(status,message)=>Object.assign(Error(message),{status});
const json=async req=>{if(!req.headers['content-type']?.startsWith('application/json'))throw fail(415,'JSON 필요');let size=0;const parts=[];for await(const chunk of req){size+=chunk.length;if(size>4_000_000)throw fail(413,'요청 크기 초과');parts.push(chunk);}try{return JSON.parse(Buffer.concat(parts));}catch{throw fail(400,'JSON 오류');}};
export async function buildBetaServer({root=dataRoot(),updater,generate=generateWithProvider,codex=generateWithCodex,live,models=listLiveModels,autoUpdate=true,smoke=false}={}){
 const appUpdate=createAppUpdater({publicKey:UPDATE_PUBLIC_KEY});
 let appUpdating=false;
 const store=await new EpisodeStore(join(root,'episodes')).init();updater??=createCodexUpdater({root:join(root,'codex')});
 let settings={autoUpdate:true,liveProvider:'gemini',liveModel:'',textProvider:'codex',textModel:''};try{settings={...settings,...JSON.parse(await readFile(join(root,'settings.json'),'utf8'))};}catch(e){if(e.code!=='ENOENT')throw e;}
 const keys={};const connections={};let loginTask=null;let uiReady=false,busy=false,updateBusy=false,lastUpdate=0,updateError='',cooldown=0;const modelCache=new Map();const token=randomBytes(32).toString('hex');
 const persist=async()=>{await writeFile(join(root,'settings.tmp'),JSON.stringify(settings),{mode:0o600});await rename(join(root,'settings.tmp'),join(root,'settings.json'));};
 const performUpdate=async()=>{if(busy||updateBusy||loginTask)return;updateBusy=true;try{if((await store.list()).some(e=>e.attempts.some(a=>a.phase!=='done'&&a.phaseEndsAt>Date.now())))return;lastUpdate=Date.now();if((await updater.status()).supported)await updater.install('latest');updateError='';}catch{updateError='업데이트 실패 · 기존 엔진을 유지합니다.';}finally{updateBusy=false;}};
 const speak=live??(args=>args.provider==='gemini'?auditionWithGeminiLive(args):auditionWithOpenAILive(args));
 const getKey=p=>keys[p]||process.env[p==='gemini'?'GEMINI_API_KEY':'OPENAI_API_KEY'];
 async function connectionStates(){
   const installed=await updater.executable();
   return {codex:installed?(connections.codex??'unverified'):'unset',gemini:getKey('gemini')?(connections.gemini??'unverified'):'unset',openai:getKey('openai')?(connections.openai??'unverified'):'unset',loginPending:!!loginTask};
 }
 async function checkedModels(provider){
   if(!['gemini','openai'].includes(provider))throw fail(400,'API 공급자를 선택하세요.');
   if(!getKey(provider))throw fail(400,'설정에서 API 키를 연결하세요.');
   try{const apiKey=getKey(provider);const list=await models({provider,apiKey});if(getKey(provider)!==apiKey)throw Error('API 키가 변경되었습니다.');modelCache.set(provider,list);connections[provider]='connected';return list;}
   catch{connections[provider]='error';throw fail(502,'API 연결을 확인하지 못했습니다. 키, 권한과 네트워크를 확인하세요.');}
 }

 async function liveArgs(){const provider=settings.liveProvider,apiKey=getKey(provider),model=settings.liveModel;credentials(provider,apiKey);const cached=modelCache.get(provider);if(!model||!cached?.some(m=>m.id===model))throw fail(400,'설정에서 모델 목록을 갱신하고 Live 모델을 선택하세요.');return {provider,apiKey,model};}
 const send=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 async function stream(req,res,file,type){const {size}=await stat(file);let start=0,end=size-1;const range=req.headers.range;if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||!m[1]&&!m[2])throw fail(416,'범위 오류');start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));end=m[1]&&m[2]?Math.min(size-1,Number(m[2])):size-1;if(!Number.isSafeInteger(start)||start<0||start>=size||end<start)throw fail(416,'범위 오류');res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);}res.writeHead(range?206:200,{'Content-Type':type,'Content-Length':end-start+1,'Accept-Ranges':'bytes'});if(req.method==='HEAD')res.end();else createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);}
 const server=createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
 try{const port=server.address()?.port;if(req.headers.host!==`127.0.0.1:${port}`||req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${port}`||req.headers['sec-fetch-site']==='cross-site')throw fail(403,'다른 사이트의 요청은 허용하지 않습니다.');const path=new URL(req.url,'http://localhost').pathname;
 if(req.method==='GET'&&path==='/api/session'){send(res,{token,build:VERSION,...(smoke?{smoke:true}:{})});return;}
 if(smoke&&req.method==='GET'&&path==='/api/smoke'){send(res,{uiReady});return;}
 if(req.method==='GET'&&path==='/api/library'){send(res,{episodes:await store.list()});return;}
 if(req.method==='GET'&&path==='/api/app-update'){send(res,{enabled:appUpdate.enabled&&process.platform==='win32'&&process.env.MARK_LISTEN_PARENT_PIPE==='1',version:VERSION});return;}
 if(req.method==='GET'&&path==='/api/connections'){send(res,await connectionStates());return;}
 if(req.method==='GET'&&path==='/api/settings'){send(res,{...settings,keys:{gemini:!!getKey('gemini'),openai:!!getKey('openai')},codex:await updater.status(),updateBusy,updateError});return;}
 const photo=/^\/api\/photo\/([0-9a-f-]{36})\/(p1-[1-6])$/.exec(path);
 if(photo&&['GET','HEAD'].includes(req.method)){await stream(req,res,photoPath(store.root,photo[1],photo[2]),'image/jpeg');return;}
 const media=/^\/api\/media\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9-]+)$/.exec(path);if(media&&['GET','HEAD'].includes(req.method)){await stream(req,res,await store.audio(media[1],media[2]),'audio/wav');return;}
 if(req.method==='POST'&&path.startsWith('/api/')){if(req.headers['x-mark-session']!==token)throw fail(403,'앱을 새로고침하세요.');const b=await json(req);
 if(smoke&&path==='/api/smoke'){uiReady=b.uiReady===true;send(res,{uiReady});return;}
 if(path==='/api/settings'){if(busy||updateBusy)throw fail(409,'현재 작업이 끝난 후 설정을 바꾸세요.');if(b.keyProvider){credentials(b.keyProvider,b.apiKey);keys[b.keyProvider]=b.apiKey;connections[b.keyProvider]='unverified';modelCache.delete(b.keyProvider);}for(const k of ['liveProvider','textProvider'])if(b[k]!==undefined){const allowed=k==='liveProvider'?['gemini','openai']:['codex','gemini','openai'];if(!allowed.includes(b[k]))throw fail(400,'공급자 오류');settings[k]=b[k];}for(const k of ['liveModel','textModel'])if(b[k]!==undefined){if(typeof b[k]!=='string'||b[k].length>160||!/^[a-zA-Z0-9_.:-]*$/.test(b[k]))throw fail(400,'모델 ID 오류');settings[k]=b[k];}if(typeof b.autoUpdate==='boolean')settings.autoUpdate=b.autoUpdate;await persist();send(res,{ok:true});return;}

 if(path==='/api/app-update/check'){
   if(appUpdating)throw fail(409,'앱 업데이트가 진행 중입니다.');
   try{send(res,{update:await appUpdate.check()});}catch(e){throw fail(502,e.message);}
   return;
 }
 if(path==='/api/app-update/install'){
   if(busy||updateBusy||loginTask||appUpdating)throw fail(409,'진행 중인 작업을 마친 뒤 설치하세요.');
   if(process.platform!=='win32'||process.env.MARK_LISTEN_PARENT_PIPE!=='1')throw fail(400,'Windows 데스크톱 앱에서 설치하세요.');
   appUpdating=true;busy=true;
   try{
     if((await store.list()).some(e=>e.attempts.some(a=>a.phase!=='done'&&(a.phaseEndsAt+(a.phase==='LC'?(a.durations?.RC??0):0))>Date.now())))throw fail(409,'진행 중인 시험을 마친 뒤 설치하세요.');
     await appUpdate.install(b.version);
     res.once('finish',()=>setTimeout(()=>console.log('MARK_INSTALL_READY'),300));
     send(res,{installing:true});
   }catch(e){appUpdating=false;busy=false;throw fail(e.status||502,e.message);}
   return;
 }
 if(path==='/api/models'){send(res,{models:await checkedModels(b.provider)});return;}
 if(path==='/api/connection/check'){
   if(b.provider==='codex'){
     const exe=await updater.executable();
     if(exe&&!loginTask){try{connections.codex=await codexLoginStatus(exe);}catch{connections.codex='error';}}
   }else await checkedModels(b.provider);
   send(res,await connectionStates());return;
 }
 if(path==='/api/codex/update'){if(busy||updateBusy||loginTask)throw fail(409,'작업 중에는 교체하지 않습니다.');await performUpdate();send(res,{status:await updater.status(),error:updateError});return;}
 if(path==='/api/codex/browser-login'){
   if(busy||updateBusy||loginTask)throw fail(409,'진행 중인 작업이 있습니다.');
   const exe=await updater.executable();
   if(!exe)throw fail(400,'Codex 엔진을 먼저 설치하세요.');
   connections.codex='unverified';
   const controller=new AbortController();
   const abortLogin=()=>controller.abort();
   server.once('close',abortLogin);
   loginTask=codexBrowserLogin(exe,AbortSignal.any([controller.signal,AbortSignal.timeout(300000)]))
     .then(status=>{connections.codex=status;},()=>{connections.codex='error';})
     .finally(()=>{server.removeListener('close',abortLogin);loginTask=null;});
   send(res,await connectionStates());return;
 }
 if(path==='/api/photo-pilot'){
   const {provider,model}=b;
   if(!['gemini','openai'].includes(provider)||typeof model!=='string'||!/^[a-z0-9][a-z0-9_.-]{0,100}$/i.test(model))throw fail(400,'이미지 입력을 지원하는 공급자와 모델 ID를 지정하세요.');
   if(!getKey(provider))throw fail(400,'설정에서 선택한 이미지 공급자의 API 키를 연결하세요.');
   let photos;
   try{photos=decodePack(b.images);}catch(e){throw fail(400,e.message);}
   const episode=await store.create({counts:{1:6},title:'Part 1 · 사진 6장 파일럿'});
   episode.photoPilot={provider,model};
   send(res,await attachPhotos(store,episode,photos));return;
 }
 if(path==='/api/episodes'){send(res,await store.create(b));return;}
 if(path==='/api/attempt/start'){if(busy)throw fail(409,'제작 작업 종료 후 응시하세요.');busy=true;try{send(res,await store.begin(b.id));}catch(e){throw fail(409,e.code==='ENOENT'?'저장된 음원이 없습니다.':e.message);}finally{busy=false;}return;}
 if(path==='/api/attempt/action'){send(res,await store.attempt(b.id,b.attemptId,b.action));return;}
 if(path==='/api/legacy'){await writeFile(join(root,'legacy-'+Date.now()+'.json'),JSON.stringify(b),{mode:0o600});send(res,{ok:true});return;}
 if(['/api/produce','/api/review','/api/test-live'].includes(path)){
 if(busy||updateBusy)throw fail(409,'다른 제작 또는 업데이트가 진행 중입니다.');if(Date.now()<cooldown)throw fail(429,'사용량 한도 이후 잠시 기다려 주세요.');busy=true;const abort=new AbortController();const close=()=>abort.abort();res.once('close',close);
 try{const signal=AbortSignal.any([abort.signal,AbortSignal.timeout(120000)]);
 if(path==='/api/test-live'){const args=await liveArgs();const r=await verifiedNarration(speak,{...args,prompt:b.script==='choices'?'A. The woman is arranging books. B. The window is closed. C. Three chairs are by the door. D. The table is not empty.':b.script==='single'?'The meeting starts at ten fifteen.':'The meeting starts at ten fifteen. Please bring three copies.',voice:args.provider==='gemini'?'Kore':'marin',signal}).catch(e=>{if(e.code==='NARRATION_MISMATCH')throw fail(422,e.message);throw e;});send(res,{wav:r.wav.toString('base64'),transcript:r.transcript});return;}
 const e=await store.read(b.id);if(e.attempts.length)throw fail(409,'응시한 회차는 변경할 수 없습니다. 새 회차를 만드세요.');
 if(path==='/api/review'){const g=e.groups.find(g=>g.id===b.groupId);if(!g||g.status!=='ready')throw fail(400,'문항 없음');if(b.segmentId){const s=g.segments.find(s=>s.id===b.segmentId);if(!s||s.status!=='ready')throw fail(400,'음원 없음');s.reviewed=b.approved===true;}else g.reviewed=b.approved===true;await store.write(e);send(res,e);return;}
 let g=e.groups.find(g=>g.status!=='ready');
 if(g){try{const provider=settings.textProvider;
 if(e.photoPilot){
   const {provider,model}=e.photoPilot;
   if(!getKey(provider))throw fail(400,'설정에서 이미지 공급자의 API 키를 다시 연결하세요.');
   Object.assign(g,await createPhotoQuestion({store,episode:e,group:g,modelCall:({images,prompt})=>generate({provider,model,images,prompt,apiKey:getKey(provider),signal})}));
 }else if(e.fixed||b.fixed===true){Object.assign(g,fixedGroup(g));}else{const prompt=groupPrompt(g);const raw=provider==='codex'?await codex({executable:await updater.executable()??'codex',prompt,signal}):await generate({provider,apiKey:getKey(provider),model:settings.textModel||undefined,prompt,signal});Object.assign(g,parseGroup(raw,g));}await store.write(e);}catch(err){g.status='failed';g.error=err.status===400?err.message:e.photoPilot?'사진 문항 생성 또는 독립 검증 실패. 이미지 입력 모델·키·할당량과 사진의 명확성 및 중복 여부를 확인하세요.':'문항 생성 또는 검증 실패. 엔진·로그인·모델 설정을 확인하고 재시도하세요.';await store.write(e);throw fail(502,g.error);}send(res,{episode:e,more:true});return;}
 let s;for(const group of e.groups){const candidate=group.segments.find(s=>b.retrySegment?s.id===b.retrySegment:s.status!=='ready');if(candidate){g=group;s=candidate;break;}}
 if(!s){send(res,{episode:e,more:false});return;}
 try{const args=await liveArgs();const voice=args.provider==='gemini'?(s.speaker==='B'?'Puck':s.speaker==='C'?'Charon':'Kore'):(s.speaker==='B'?'cedar':'marin');const result=await verifiedNarration(speak,{...args,prompt:s.text,voice,signal});await store.saveAudio(e,s,result);s.provider=args.provider;s.model=args.model;s.voice=voice;s.diff=result.diff;await store.write(e);}catch(err){if(s.status!=='ready')s.status='failed';s.error=err.code==='NARRATION_MISMATCH'?err.message:'Live 생성 실패. 키·모델·할당량을 확인하세요. 다른 공급자로 전환하지 않았습니다.';await store.write(e);if(err.status===429||err.code==='GEMINI_LIVE_RATE_LIMIT'){cooldown=Date.now()+15000;throw fail(429,s.error);}throw fail(502,s.error);}send(res,{episode:e,more:true});return;
 }finally{busy=false;res.removeListener('close',close);}}
 throw fail(404,'API 없음');}
 if(!['GET','HEAD'].includes(req.method))throw fail(404,'파일 없음');const name=path==='/'?'beta.html':path.slice(1);if(!/^(?:[a-zA-Z0-9-]+\.(?:html|mjs|css|png)|full-lc-images\/[a-z0-9-]+\.svg)$/.test(name)||name==='index.html'||name==='app.mjs')throw fail(404,'파일 없음');const type={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[extname(name)];await stream(req,res,join(PUBLIC,name),type);
 }catch(e){if(!res.destroyed&&!res.headersSent)send(res,{error:e.status?e.message:e.code==='ENOENT'?'저장된 파일을 찾을 수 없습니다.':'작업을 완료하지 못했습니다. 설정과 저장 공간을 확인하세요.'},e.status||500);}});
 const interval=setInterval(()=>{if(autoUpdate&&settings.autoUpdate&&Date.now()-lastUpdate>24*3600000)void performUpdate();},60000);interval.unref();server.once('close',()=>clearInterval(interval));server.once('listening',()=>{if(autoUpdate&&settings.autoUpdate)void performUpdate();});server.requestTimeout=130000;return {server,store};
}
