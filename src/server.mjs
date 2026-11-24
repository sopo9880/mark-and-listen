import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { GENERATION_PROMPT, parseGenerated } from '../public/core.mjs';
import { generateWithCodex } from './codex-engine.mjs';
import { auditionWithGeminiLive } from './gemini-live.mjs';

const PUBLIC=fileURLToPath(new URL('../public',import.meta.url));
const BUILD='0.0.0.2';
const STATIC=new Map([['/','index.html'],['/index.html','index.html'],['/styles.css','styles.css'],['/app.mjs','app.mjs'],['/bank.mjs','bank.mjs'],['/core.mjs','core.mjs'],['/audition.mjs','audition.mjs']]);
const MIME={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',mjs:'text/javascript; charset=utf-8',mp3:'audio/mpeg',svg:'image/svg+xml'};
for(const file of ['dashboard.mjs','full-exam.mjs','full-session.mjs','full-lc.mjs','full-lc-layout.mjs','full-lc-timings.mjs','full-lc-source.mjs','full-rc.mjs']) STATIC.set('/'+file,file);
const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",'Cache-Control':'no-store'};
const fail=(status,message)=>Object.assign(Error(message),{status});
const invalidAuditionWav=Symbol('invalidAuditionWav');
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
async function json(req){
  if((req.headers['content-type']??'').split(';')[0]!=='application/json') throw fail(415,'JSON 요청이 필요합니다.');
  let len=0;const parts=[];
  for await (const data of req){ len+=data.length;if(len>8000) throw fail(413,'요청이 너무 큽니다.');parts.push(data);}
  try {const v=JSON.parse(Buffer.concat(parts).toString('utf8')); if(!v||typeof v!=='object'||Array.isArray(v))throw Error();return v;}
  catch {throw fail(400,'JSON 요청 형식을 확인해 주세요.');}
}
function codexDirectory(){
  const base=process.platform==='win32'?(process.env.LOCALAPPDATA || homedir()):join(homedir(),'.local','share');
  return join(base,'mark-and-listen','codex');
}
export async function buildServer({generate,codex=generateWithCodex,updater,audition=auditionWithGeminiLive}={}){
  if(!updater) {
    try { const {createCodexUpdater}=await import('./codex-updater.mjs'); updater=createCodexUpdater({root:codexDirectory()}); }
    catch(e) { if(e.code!=='ERR_MODULE_NOT_FOUND')throw e; }
  }
  if(!generate) generate=async args=>(await import('./providers.mjs')).generateWithProvider(args);
  const token=randomBytes(32).toString('hex');
  let generationBusy=false;
  let auditionBusy=false;
  let auditionRetryUntil=0;
  const server=createServer(async(req,res)=>{
    for(const [k,v] of Object.entries(headers))res.setHeader(k,v);
    const port=server.address()?.port;
    const host=req.headers.host;
    if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host)
       || (req.headers.origin && req.headers.origin!==`http://${host}`) || req.headers['sec-fetch-site']==='cross-site'){
      send(res,403,{error:'이 로컬 앱에서는 다른 사이트의 요청을 받지 않아요.'});return;
    }
    try {
      const url=new URL(req.url,'http://'+host);
      const path=url.pathname;
      if(req.method==='GET'&&path==='/api/session'){send(res,200,{token,build:BUILD});return;}
      if(req.method==='GET'&&path==='/api/codex/status'){
        const s=updater ? await updater.status():{supported:false};
        const exe=s.installed?await updater?.executable?.():null;
        const quoted=exe ? (process.platform==='win32' ? "'"+exe.replaceAll("'","''")+"'" : "'"+exe.replaceAll("'","'\\''")+"'") : '';
        const loginCommand=exe?(process.platform==='win32'?'& ':'')+quoted+' login':'codex login';
        send(res,200,{...s,loginCommand}); return;
      }
      if(req.method==='POST'&&path.startsWith('/api/')){
        if(req.headers['x-mark-session']!==token)throw fail(403,'페이지를 새로고침해 주세요.');
        const body=await json(req);
        if(path==='/api/audition'){
          const prompt=typeof body.prompt==='string'?body.prompt.trim():'';
          const apiKey=typeof body.apiKey==='string'?body.apiKey.trim():undefined;
          const model=typeof body.model==='string'?body.model.trim():undefined;
          if(!prompt||prompt.length>1200)throw fail(400,'듣기 대본을 1~1,200자로 입력해 주세요.');
          if((body.apiKey!==undefined&&typeof body.apiKey!=='string')||apiKey&&(!/^[\x21-\x7E]{8,1024}$/.test(apiKey)))throw fail(400,'Gemini API 키를 확인해 주세요.');
          if(!apiKey&&!process.env.GEMINI_API_KEY?.trim())throw fail(400,'Gemini API 키를 입력하거나 GEMINI_API_KEY를 설정해 주세요.');
          if((body.model!==undefined&&typeof body.model!=='string')||model&&!/^gemini-[A-Za-z0-9.-]{1,100}$/.test(model))throw fail(400,'Gemini Live 모델 ID를 확인해 주세요.');
          if(auditionBusy)throw fail(409,'한 번에 하나의 듣기 음원만 만들 수 있어요.');
          const remaining=auditionRetryUntil-Date.now();
          if(remaining>0){
            res.setHeader('Retry-After',Math.ceil(remaining/1000));
            throw fail(429,'Gemini Live 사용량 한도에 도달했어요. 잠시 뒤 다시 시도하거나 Google AI Studio에서 할당량을 확인해 주세요.');
          }
          auditionBusy=true;
          const abort=new AbortController();
          const abortOnClose=()=>abort.abort();
          res.once('close',abortOnClose);
          if(res.destroyed)abort.abort();
          try {
            const {wav}=await audition({apiKey:apiKey||undefined,model:model||undefined,prompt,signal:abort.signal});
            if(abort.signal.aborted||res.destroyed)return;
            if(!Buffer.isBuffer(wav)||wav.length<46||wav.length>4_500_000||
               wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,16)!=='WAVEfmt '||
               wav.readUInt32LE(4)!==wav.length-8||wav.toString('ascii',36,40)!=='data'||
               wav.readUInt32LE(40)!==wav.length-44)throw invalidAuditionWav;
            res.writeHead(200,{'Content-Type':'audio/wav','Content-Length':wav.length});
            res.end(wav);
          } catch(e) {
            if(abort.signal.aborted||res.destroyed)return;
            if(e?.code==='GEMINI_LIVE_RATE_LIMIT'){
              auditionRetryUntil=Date.now()+15_000;
              res.setHeader('Retry-After','15');
              throw fail(429,'Gemini Live 사용량 한도에 도달했어요. 잠시 뒤 다시 시도하거나 Google AI Studio에서 할당량을 확인해 주세요.');
            }
            if(e?.code==='GEMINI_LIVE_ACCESS')throw fail(403,'Gemini API 키와 Live 모델 접근 권한을 확인해 주세요.');
            if(e?.code==='GEMINI_LIVE_TIMEOUT')throw fail(504,'Gemini Live 응답이 늦어졌어요. 대본을 줄인 뒤 다시 시도해 주세요.');
            if(e===invalidAuditionWav)throw fail(502,'Gemini Live가 재생 가능한 WAV를 반환하지 않았어요.');
            // Never forward arbitrary provider responses, transport errors, or key fragments.
            throw fail(502,'Gemini Live 낭독을 받아오지 못했어요. API 키, 네트워크, 모델 권한을 확인해 주세요. 다른 엔진으로 전환하지 않았어요.');
          } finally {
            res.removeListener('close',abortOnClose);
            auditionBusy=false;
          }
          return;
        }
        if(path==='/api/generate'){
          if(generationBusy)throw fail(409,'한 번에 한 세트만 만들 수 있어요.');
          const {provider}=body;
          if(!['codex','openai','gemini'].includes(provider))throw fail(400,'AI 엔진을 선택해 주세요.');
          let apiKey,model;
          if(provider!=='codex'){
            apiKey=typeof body.apiKey==='string'?body.apiKey.trim():'';
            if(apiKey.length<8||apiKey.length>1024||/[\r\n]/.test(apiKey))throw fail(400,'API 키를 입력해 주세요.');
            model=typeof body.model==='string'?body.model.trim():'';
            if(model&&!/^[a-z0-9][a-z0-9_.-]{0,79}$/i.test(model))throw fail(400,'모델 ID를 확인해 주세요.');
          }
          generationBusy=true;
          const abort=new AbortController();
          res.once('close',()=>abort.abort());
          const signal=AbortSignal.any([abort.signal,AbortSignal.timeout(120000)]);
          try {
            const text=provider==='codex'
              ? await codex({executable:await updater?.executable?.()??'codex',prompt:GENERATION_PROMPT,signal})
              : await generate({provider,apiKey,model:model||undefined,prompt:GENERATION_PROMPT,signal});
            send(res,200,{questions:parseGenerated(text),provider});
          } finally {generationBusy=false;}
          return;
        }
        if(['/api/codex/check','/api/codex/install','/api/codex/rollback'].includes(path)){
          if(!updater)throw fail(501,'이 빌드에서는 자동 설치 도구가 연결되지 않았어요.');
          if(path.endsWith('/check'))send(res,200,await updater.check());
          else if(path.endsWith('/rollback'))send(res,200,await updater.rollback());
          else {
            if(generationBusy)throw fail(409,'문항 생성이 끝난 뒤 다시 시도해 주세요.');
            if(!['pinned','latest'].includes(body.target))throw fail(400,'설치 버전 선택을 확인해 주세요.');
            send(res,200,await updater.install(body.target));
          }
          return;
        }
      }
      const file=STATIC.get(path)??(/^\/(?:audio\/(?:lc[1-6]|full-lc\/p[1-4]-[0-9]{2})\.mp3|full-lc-images\/[a-z0-9-]+\.svg)$/.test(path)?path.slice(1):null);
      if(!file||!['GET','HEAD'].includes(req.method))throw fail(404,'파일을 찾을 수 없어요.');
      const disk=join(PUBLIC,file);
      const {size}=await stat(disk);
      const type=MIME[basename(disk).split('.').at(-1)];
      if(type==='audio/mpeg'){
        res.setHeader('Accept-Ranges','bytes');
        const raw=req.headers.range;
        if(raw){
          const match=/^bytes=(\d*)-(\d*)$/.exec(raw);
          const first=match?.[1],last=match?.[2];
          let start=first?Number(first):Math.max(0,size-Number(last)),end=first&&last?Math.min(size-1,Number(last)):size-1;
          if(!match||(!first&&!last)||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start){
            res.writeHead(416,{'Content-Range':'bytes */'+size});res.end();return;
          }
          res.writeHead(206,{'Content-Type':type,'Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${size}`});
          if(req.method==='HEAD')res.end();else createReadStream(disk,{start,end}).on('error',()=>res.destroy()).pipe(res);
          return;
        }
      }
      res.writeHead(200,{'Content-Type':type,'Content-Length':size});
      if(req.method==='HEAD')res.end();else createReadStream(disk).on('error',()=>res.destroy()).pipe(res);
    }catch(e){
      if(res.destroyed||res.writableEnded)return;
      const secret=(e instanceof Error ? e.message : '').replace(/(sk[-_][a-zA-Z0-9_-]+|AIza[a-zA-Z0-9_-]+)/g,'[키 숨김]');
      send(res,e.status??(e.code==='ENOENT'?404:502),secret?{error:secret.slice(0,400)}:{error:'요청을 완료하지 못했어요.'});
    }
  });
  server.requestTimeout=130000;
  return server;
}

if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  const port=process.env.PORT===undefined?4173:Number(process.env.PORT);
  const server=await buildServer();
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'포트 사용 중: set PORT=4174 후 다시 실행하세요.':e.message); process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>{
    const origin=`http://127.0.0.1:${server.address().port}`;
    console.log(`Mark & Listen ${BUILD}: ${origin}`);
    if(process.argv.includes('--open')&&process.platform==='win32'){
      spawn('explorer.exe',[origin],{windowsHide:true,stdio:'ignore'}).on('error',()=>{});
    }
  });
}
