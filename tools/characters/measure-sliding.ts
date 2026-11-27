/** Foot-sliding measurement (ankle drift while a foot is planted), with and without the IK lock.
 *   npx tsx tools/characters/measure-sliding.ts [--nolock]   (results in docs/CHARACTERS_PROGRESS.md) */
import fs from 'node:fs';
import { BodyModel } from '../../src/characters/body/BodyModel.ts';
import { AnimLibrary } from '../../src/characters/anim/AnimLibrary.ts';
import { registerAuthored } from '../../src/characters/anim/authored.ts';
import { Character } from '../../src/characters/Character.ts';
const rd=(f:string)=>{const b=fs.readFileSync(f);return b.buffer.slice(b.byteOffset,b.byteOffset+b.length);};
const body=new BodyModel(rd('public/characters/body.bin'));const lib=new AnimLibrary();lib.addContainer(rd('public/characters/anims.bin'));registerAuthored(lib);
const lockOff=process.argv.includes('--nolock');
for(const seed of [12345,777,4242]){
const ch=new Character(body,lib,{seed},{lod:3});
if(!lockOff) ch.setGround(()=>({y:0,surface:'asphalt'}));
for(const v of [0.8,1.3,1.75]){let x=0;const dt=1/60;const s:any={l:{last:null,d:0,t:0,sx:0},r:{last:null,d:0,t:0,sx:0}};
for(let i=0;i<600;i++){x+=v*dt;ch.object.position.set(0,0,x);ch.setLocomotion({velocity:[0,0,v],grounded:true,heading:0,mode:'walk'});ch.update(dt);
 if(i<120)continue;for(const side of ['l','r']){const p=ch.jointWorld(`foot_${side}`);const st=s[side];if((ch.animator as any).planted[side]){if(st.last){st.d+=Math.hypot(p.x-st.last.x,p.z-st.last.z);st.sx+=p.z-st.last.z;st.t+=dt;}st.last=p.clone();}else st.last=null;}}
console.log(seed,v,'drift mm/s L',(s.l.d/s.l.t*1000).toFixed(0),'signed',(s.l.sx/s.l.t*1000).toFixed(0),'R',(s.r.d/s.r.t*1000).toFixed(0),'signed',(s.r.sx/s.r.t*1000).toFixed(0));}}
