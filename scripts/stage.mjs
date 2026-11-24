import {mkdir,cp,readdir,writeFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
const base='staging';await mkdir(base+'/app/public',{recursive:true});await mkdir(base+'/app/src',{recursive:true});await mkdir(base+'/ui',{recursive:true});
for(const name of ['beta.html','beta.css','beta.mjs','exam-rules.mjs','core.mjs','bank.mjs','full-lc-layout.mjs','full-lc-source.mjs','logo.png'])await cp('public/'+name,base+'/app/public/'+name);
await cp('public/full-lc-images',base+'/app/public/full-lc-images',{recursive:true});
for(const name of ['start-beta.mjs','app-update.mjs','update-trust.mjs','narration.mjs','photo-pilot.mjs','beta-server.mjs','episode-store.mjs','episode-content.mjs','live-models.mjs','gemini-live.mjs','openai-live.mjs','codex-engine.mjs','codex-updater.mjs','providers.mjs'])await cp('src/'+name,base+'/app/src/'+name);
await cp('public/beta.html',base+'/ui/index.html');
let size=0;async function walk(path){for(const item of await readdir(path,{withFileTypes:true})){const name=join(path,item.name);if(item.isDirectory())await walk(name);else{if(/\.(mp3|wav|ogg)$/i.test(name)||/electron|codex\.exe/i.test(name))throw Error('Forbidden bundled payload: '+name);size+=(await stat(name)).size;}}}await walk(base+'/app');console.log('Staged app bytes (no Electron, audio, or Codex): '+size);

const trust=process.env.MARK_UPDATE_PUBLIC_KEY;
if(trust){if(!/^[A-Za-z0-9+/]{59}=$/.test(trust))throw Error('Invalid update public key encoding');await writeFile(base+'/app/src/update-trust.mjs','export const UPDATE_PUBLIC_KEY='+JSON.stringify(trust)+';\n');}
