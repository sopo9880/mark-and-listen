import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BANK, LETTERS } from '../public/bank.mjs';
const out=fileURLToPath(new URL('../public/audio/',import.meta.url));
const dir=mkdtempSync(join(tmpdir(),'mark-audio-'));
try {
  for(const q of BANK.filter(q=>q.audio)) {
    const text=[q.question,...q.choices.map((c,i)=>`${LETTERS[i]}. ${c}`)];
    const wavs=text.map((s,i)=>{
      const source=join(dir,`line-${i}.txt`), dest=join(dir,`line-${i}.wav`);
      writeFileSync(source,s);
      execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i',`flite=textfile=${source}:voice=${i===0?(q.id.endsWith('2')||q.id.endsWith('4')?'slt':'rms'):'slt'}`,'-af','apad=pad_dur=0.85','-ar','22050',dest]);
      return dest;
    });
    const list=join(dir,'concat.txt');
    writeFileSync(list,wavs.map(f=>`file '${f}'`).join('\n'));
    execFileSync('ffmpeg',['-v','error','-y','-f','concat','-safe','0','-i',list,'-codec:a','libmp3lame','-b:a','48k',join(out,`${q.id}.mp3`)]);
  }
} finally { rmSync(dir,{recursive:true,force:true}); }
