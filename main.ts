// make.fun tiny-stack-vm-01-run-20261122 entry: a tiny stack VM written from scratch in this session.
// Semantics: the kit's ISA.md, with generator/subject/vm.mjs the rule on ambiguity. Plain JS, CJS require.
const{mkdirSync,readdirSync,readFileSync,statSync,writeFileSync}=require('node:fs'),{join}=require('node:path');
const I=process.env.MAKEFUN_INPUT_DIR??'/input',O=process.env.MAKEFUN_OUTPUT_DIR??'/output';
const T=new Int16Array(256).fill(-1),set=(a,b,v)=>{for(let o=a;o<=b;o++)T[o]=v}; // opcode byte -> imm|pops<<4|pushes<<8
set(0,7,0);T[1]=1|1<<8;T[2]=4|1<<8;T[3]=1<<4;T[4]=1<<4|2<<8;T[5]=2<<4|2<<8;T[6]=2<<4|3<<8;T[7]=3<<4|3<<8;
set(16,34,2<<4|1<<8);T[23]=1<<4|1<<8;T[27]=1<<4|1<<8;
T[48]=2;T[49]=2|1<<4;T[50]=2|1<<4;T[51]=2;T[52]=0;
T[64]=1<<4|1<<8;T[65]=2<<4;
set(80,81,1<<4);T[82]=1<<8;T[83]=1<<4;
function R(P,F){const n=P.length,S=new Int32Array(256),C=new Int32Array(64),W=new Int32Array(256),U=new Uint8Array(65536);let sp=0,cp=0,ol=0,ip=0,pc=0,k=0;const E=c=>({bytes:U.subarray(0,ol),code:c});
for(;;){if(k===1e6)return E(10);if(pc<0||pc>=n)return E(9);const o=P[pc],m=T[o];if(m<0)return E(5);const im=m&15;if(pc+im>=n)return E(9);k++;const nx=pc+1+im,po=m>>4&15,pu=m>>8;if(sp<po)return E(2);if(sp-po+pu>256)return E(3);pc=nx;
switch(o){
case 0:return E(0);
case 1:S[sp++]=(P[nx-1]<<24)>>24;break;
case 2:S[sp++]=P[nx-4]|P[nx-3]<<8|P[nx-2]<<16|P[nx-1]<<24;break;
case 3:sp--;break;
case 4:S[sp]=S[sp-1];sp++;break;
case 5:{const t=S[sp-1];S[sp-1]=S[sp-2];S[sp-2]=t;break}
case 6:S[sp]=S[sp-2];sp++;break;
case 7:{const t=S[sp-3];S[sp-3]=S[sp-2];S[sp-2]=S[sp-1];S[sp-1]=t;break}
case 16:{const b=S[sp-1],a=S[sp-2];sp-=2;S[sp++]=(a+b)|0;break}
case 17:{const b=S[sp-1],a=S[sp-2];sp-=2;S[sp++]=(a-b)|0;break}
case 18:{const b=S[sp-1],a=S[sp-2];sp-=2;S[sp++]=Math.imul(a,b);break}
case 19:case 20:case 21:case 22:{const b=S[sp-1],a=S[sp-2];if(!b)return E(4);sp-=2;S[sp++]=o===19?a===-2147483648&&b===-1?a:(a/b)|0:o===20?b===-1?0:(a%b)|0:o===21?Math.floor((a>>>0)/(b>>>0))|0:((a>>>0)%(b>>>0))|0;break}
case 23:S[sp-1]=-S[sp-1]|0;break;
case 24:case 25:case 26:{const b=S[sp-1],a=S[sp-2];sp-=2;S[sp++]=[a&b,a|b,a^b][o-24];break}
case 27:S[sp-1]=~S[sp-1];break;
case 28:case 29:case 30:{const b=S[sp-1],a=S[sp-2];sp-=2;S[sp++]=[a<<(b&31),a>>(b&31),(a>>>(b&31))|0][o-28];break}
case 32:case 33:case 34:{const b=S[sp-1],a=S[sp-2];sp-=2;S[sp++]=[a===b?1:0,a<b?1:0,(a>>>0)<(b>>>0)?1:0][o-32];break}
case 48:{pc=nx+(P[nx-2]|P[nx-1]<<8)<<16>>16;break}
case 49:{const f=(P[nx-2]|P[nx-1]<<8)<<16>>16;if(S[--sp]===0)pc=nx+f;break}
case 50:{const f=(P[nx-2]|P[nx-1]<<8)<<16>>16;if(S[--sp]!==0)pc=nx+f;break}
case 51:{if(cp===64)return E(7);C[cp++]=nx;pc=P[nx-2]|P[nx-1]<<8;break}
case 52:{if(cp===0)return E(8);pc=C[--cp];break}
case 64:{const a=S[sp-1];if(a<0||a>255)return E(6);S[sp-1]=W[a];break}
case 65:{const a=S[sp-1],v=S[sp-2];if(a<0||a>255)return E(6);sp-=2;W[a]=v;break}
case 80:{const v=S[sp-1];let x=v<0?-v:v,d=1;for(let q=x;q>=10;q=Math.floor(q/10))d++;const w=d+(v<0?1:0);if(ol+w>65536)return E(11);sp--;const bs=ol;if(v<0)U[ol++]=45;let p=ol+d;do U[--p]=48+x%10,x=Math.floor(x/10);while(x>0);ol=bs+w;break}
case 81:{if(ol+1>65536)return E(11);U[ol++]=S[--sp]&255;break}
case 82:S[sp++]=ip<F.length?F[ip++]:-1;break;
case 83:return E(S[--sp]&255);
}}}
for(const id of readdirSync(I).sort()){const d=join(I,id);if(!statSync(d).isDirectory())continue;const r=R(readFileSync(join(d,'program.bin')),readFileSync(join(d,'input.bin')));mkdirSync(join(O,id),{recursive:true});writeFileSync(join(O,id,'stdout.bin'),r.bytes);writeFileSync(join(O,id,'exit.txt'),r.code+'\n')}
