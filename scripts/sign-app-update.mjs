import {createHash,createPrivateKey,createPublicKey,sign} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {APP_VERSION,REPOSITORY,installerName,verifyManifest} from '../src/app-update.mjs';

const publicKey=process.env.MARK_UPDATE_PUBLIC_KEY;
const encodedPrivateKey=process.env.MARK_UPDATE_PRIVATE_KEY;
if(!publicKey||!encodedPrivateKey)throw Error('Configure MARK_UPDATE_PUBLIC_KEY and MARK_UPDATE_PRIVATE_KEY before publishing.');
let privateKey;
try {
  privateKey=createPrivateKey({key:Buffer.from(encodedPrivateKey,'base64'),format:'der',type:'pkcs8'});
}catch {
  throw Error('The signing secret is not an Ed25519 PKCS#8 DER key.');
}
if(privateKey.asymmetricKeyType!=='ed25519'||createPublicKey(privateKey).export({type:'spki',format:'der'}).toString('base64')!==publicKey)
  throw Error('The release signing key does not match the trusted public key.');
const folder=process.argv[2];
const file=installerName(APP_VERSION),exe=await readFile(join(folder,file));
const sha256=createHash('sha256').update(exe).digest('hex');
const raw=Buffer.from(JSON.stringify({schema:1,repository:REPOSITORY,platform:'windows-x64',version:APP_VERSION,file,size:exe.length,sha256})+'\n');
const signature=sign(null,raw,privateKey).toString('base64');
verifyManifest(raw,signature,publicKey,APP_VERSION);
await writeFile(join(folder,'update.json'),raw);
await writeFile(join(folder,'update.json.sig'),signature+'\n');
