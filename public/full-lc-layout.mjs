// Shared, stable ordering for the browser and the local offline audio generator.
import { LC_SOURCE } from './full-lc-source.mjs';

const selectKeys={
  1:[1,3,2,0,3,1],
  2:[2,0,1,2,0,2,1,0,0,2,1,2,1,0,2,0,1,1,2,1,0,2,0,1,2],
  3:[1,3,0,2,3,1,0,0,2,3,1,2,3,2,0,1,3,0,1,3,2,0,2,3,1,2,0,3,2,1,3,1,0,2,0,3,0,2,1],
  4:[0,2,3,2,1,0,3,1,3,1,2,0,1,0,3,2,0,2,0,3,1,2,1,3,0,2,1,2,3,0],
};
const pad=(n,d)=>String(n).padStart(d,'0');

let number=0;
export const LC_LAYOUT=LC_SOURCE.flatMap((groups,index)=>{
  const part=index+1;
  let partIndex=0;
  return groups.map((group,i)=>{
    const id=`p${part}-${pad(i+1,2)}`;
    const {lines=[],questions,image,imageAlt,graphic,graphicAlt}=group;
    return {
      id,part,audio:`/audio/full-lc/${id}.mp3`,lines,
      ...(image?{image,imageAlt}:{}),...(graphic?{graphic,graphicAlt}:{}),
      questions:questions.map(({choices,answer,...rest})=>{
        if(!Number.isInteger(answer)||answer<0||answer>=choices.length)throw Error(`Invalid key for ${id}`);
        const revisedKey=selectKeys[part][partIndex++];
        if(!Number.isInteger(revisedKey)||revisedKey<0||revisedKey>=choices.length)throw Error(`Invalid final key for ${id}`);
        const ordered=choices.filter((_,i)=>i!==answer);
        ordered.splice(revisedKey,0,choices[answer]);
        number+=1;
        return {...rest,id:`lc-full-${pad(number,3)}`,number,choices:ordered,answer:revisedKey};
      }),
    };
  });
});
