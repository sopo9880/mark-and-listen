import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function run(executable, args, {cwd, stdin, signal} = {}) {
  return new Promise((resolve,reject)=>{
    const env={...process.env};
    for (const key of ['OPENAI_API_KEY','CODEX_API_KEY','OPENAI_BASE_URL','OPENAI_API_BASE','GEMINI_API_KEY','GOOGLE_API_KEY']) delete env[key];
    const child=spawn(executable,args,{cwd,env,signal,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
    let stdout='', stderr='';
    child.stdout.setEncoding('utf8').on('data',s=>{
      stdout+=s;
      if(stdout.length>400000){ child.kill(); reject(Error('Codex 응답이 너무 깁니다.')); }
    });
    child.stderr.setEncoding('utf8').on('data',s=>{ stderr=(stderr+s).slice(-16000); });
    child.stdin.on('error',()=>{});
    child.stdin.end(stdin);
    child.on('error',reject);
    child.on('close',code=>resolve({code,stdout,stderr}));
  });
}

export async function generateWithCodex({executable,prompt,signal,runCommand=run}) {
  let scratch;
  try {
    scratch=await mkdtemp(join(tmpdir(),'mark-listen-codex-'));
    const auth=await runCommand(executable,['login','status'],{cwd:scratch,signal});
    if(auth.code!==0 || !/logged in (?:with|using) ChatGPT/i.test(auth.stdout+' '+auth.stderr)) {
      throw Error('Codex에 ChatGPT 계정으로 로그인한 뒤 다시 시도해 주세요. API 키 모드로는 자동 전환하지 않습니다.');
    }
    const args=['exec','--ignore-user-config','--ignore-rules','--ephemeral','--skip-git-repo-check','--sandbox','read-only','-c','approval_policy="never"','-c','model_provider="openai"','--json','-'];
    const result=await runCommand(executable,args,{cwd:scratch,stdin:prompt,signal});
    if(result.code!==0) throw Error('Codex가 생성을 완료하지 못했어요. 로그인과 사용량, 설치 버전을 확인해 주세요.');
    let text;
    let completed=false;
    for(const line of result.stdout.split(/\r?\n/)){
      let event;
      try { event=JSON.parse(line); } catch { continue; }
      if(event.type==='item.completed' && event.item?.type==='agent_message')text=event.item.text;
      if(event.type==='turn.completed')completed=true;
    }
    if(!text||!completed) throw Error('Codex가 완료된 문항을 반환하지 않았어요.');
    return text;
  } catch(e) {
    if(e.code==='ENOENT') throw Error('Codex CLI를 찾지 못했어요. 엔진 설정에서 설치하거나 PATH에 추가한 뒤 로그인해 주세요.');
    if(e.name==='AbortError') throw Error('Codex 요청이 취소됐거나 시간이 초과됐어요.');
    throw e;
  } finally {
    if(scratch) await rm(scratch,{recursive:true,force:true}).catch(()=>{});
  }
}
