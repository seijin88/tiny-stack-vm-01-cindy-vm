// Entry for make.fun's tiny-stack-vm-01-run-20261122 bounty: a tiny stack virtual machine.
// The ISA is the kit's program/generator/subject/ISA.md; generator/subject/vm.mjs is the rule
// where the two could be read differently. Written from scratch for this entry.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const IN_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const STEP_MAX = 1_000_000; // executed instructions before trap 10
const OUT_MAX = 65_536;     // written bytes before trap 11

// Opcode metadata, indexed by opcode byte: imm | pops << 4 | pushes << 8, or -1 when no opcode has that byte.
const META = new Int16Array(256).fill(-1);
const TABLE: [number, number, number, number][] = [
  [0x00, 0, 0, 0], [0x01, 1, 0, 1], [0x02, 4, 0, 1], [0x03, 0, 1, 0], [0x04, 0, 1, 2],
  [0x05, 0, 2, 2], [0x06, 0, 2, 3], [0x07, 0, 3, 3],
  [0x10, 0, 2, 1], [0x11, 0, 2, 1], [0x12, 0, 2, 1], [0x13, 0, 2, 1], [0x14, 0, 2, 1],
  [0x15, 0, 2, 1], [0x16, 0, 2, 1], [0x17, 0, 1, 1], [0x18, 0, 2, 1], [0x19, 0, 2, 1],
  [0x1a, 0, 2, 1], [0x1b, 0, 1, 1], [0x1c, 0, 2, 1], [0x1d, 0, 2, 1], [0x1e, 0, 2, 1],
  [0x20, 0, 2, 1], [0x21, 0, 2, 1], [0x22, 0, 2, 1],
  [0x30, 2, 0, 0], [0x31, 2, 1, 0], [0x32, 2, 1, 0], [0x33, 2, 0, 0], [0x34, 0, 0, 0],
  [0x40, 0, 1, 1], [0x41, 0, 2, 0],
  [0x50, 0, 1, 0], [0x51, 0, 1, 0], [0x52, 0, 0, 1], [0x53, 0, 1, 0],
];
for (const [byte, imm, pops, pushes] of TABLE) META[byte] = imm | (pops << 4) | (pushes << 8);

// Runs one program on one input; answers with the bytes it wrote and its exit code.
function execute(prog: Uint8Array, feed: Uint8Array): { bytes: Uint8Array; code: number } {
  const len = prog.length;
  const stack = new Int32Array(256);
  let sp = 0;
  const frames = new Int32Array(64);
  let fp = 0;
  const mem = new Int32Array(256);
  const out = new Uint8Array(OUT_MAX);
  let olen = 0;
  let ipos = 0;
  let pc = 0;
  let steps = 0;
  const end = (code: number) => ({ bytes: out.subarray(0, olen), code });

  for (;;) {
    if (steps === STEP_MAX) return end(10);              // step limit
    if (pc < 0 || pc >= len) return end(9);              // pc outside the program
    const op = prog[pc];
    const meta = META[op];
    if (meta < 0) return end(5);                         // unknown opcode
    const imm = meta & 15;
    if (pc + imm >= len) return end(9);                  // immediate cut off by the end
    steps++;
    const next = pc + 1 + imm;
    const pops = (meta >> 4) & 15;
    const pushes = meta >> 8;
    if (sp < pops) return end(2);                        // underflow
    if (sp - pops + pushes > 256) return end(3);         // overflow
    pc = next;

    switch (op) {
      case 0x00: return end(0);                                          // HALT
      case 0x01: stack[sp++] = (prog[next - 1] << 24) >> 24; break;      // PUSH8, sign-extended
      case 0x02: stack[sp++] = prog[next - 4] | prog[next - 3] << 8 | prog[next - 2] << 16 | prog[next - 1] << 24; break; // PUSH32, little-endian
      case 0x03: sp--; break;                                            // POP
      case 0x04: stack[sp] = stack[sp - 1]; sp++; break;                 // DUP
      case 0x05: { const t = stack[sp - 1]; stack[sp - 1] = stack[sp - 2]; stack[sp - 2] = t; break; } // SWAP
      case 0x06: stack[sp] = stack[sp - 2]; sp++; break;                 // OVER
      case 0x07: { const t = stack[sp - 3]; stack[sp - 3] = stack[sp - 2]; stack[sp - 2] = stack[sp - 1]; stack[sp - 1] = t; break; } // ROT
      case 0x10: { const b = stack[sp - 1], a = stack[sp - 2]; sp -= 2; stack[sp++] = (a + b) | 0; break; } // ADD
      case 0x11: { const b = stack[sp - 1], a = stack[sp - 2]; sp -= 2; stack[sp++] = (a - b) | 0; break; } // SUB
      case 0x12: { const b = stack[sp - 1], a = stack[sp - 2]; sp -= 2; stack[sp++] = Math.imul(a, b); break; } // MUL, low 32 bits
      case 0x13: { const b = stack[sp - 1], a = stack[sp - 2]; if (b === 0) return end(4); sp -= 2; stack[sp++] = a === -2147483648 && b === -1 ? a : (a / b) | 0; break; } // DIV
      case 0x14: { const b = stack[sp - 1], a = stack[sp - 2]; if (b === 0) return end(4); sp -= 2; stack[sp++] = b === -1 ? 0 : (a % b) | 0; break; } // MOD
      case 0x15: { const b = stack[sp - 1], a = stack[sp - 2]; if (b === 0) return end(4); sp -= 2; stack[sp++] = Math.floor((a >>> 0) / (b >>> 0)) | 0; break; } // DIVU
      case 0x16: { const b = stack[sp - 1], a = stack[sp - 2]; if (b === 0) return end(4); sp -= 2; stack[sp++] = ((a >>> 0) % (b >>> 0)) | 0; break; } // MODU
      case 0x17: stack[sp - 1] = (-stack[sp - 1]) | 0; break;             // NEG
      case 0x18: { const b = stack[sp - 1], a = stack[sp - 2]; sp -= 2; stack[sp++] = a & b; break; } // AND
      case 0x19: { const b = stack[sp - 1], a = stack[sp - 2]; sp -= 2; stack[sp++] = a | b; break; } // OR
      case 0x1a: { const b = stack[sp - 1], a = stack[sp - 2]; sp -= 2; stack[sp++] = a ^ b; break; } // XOR
      case 0x1b: stack[sp - 1] = ~stack[sp - 1]; break;                  // NOT
      case 0x1c: { const b = stack[sp - 1], a = stack[sp - 2]; sp -= 2; stack[sp++] = a << (b & 31); break; } // SHL
      case 0x1d: { const b = stack[sp - 1], a = stack[sp - 2]; sp -= 2; stack[sp++] = a >> (b & 31); break; } // SHR, arithmetic
      case 0x1e: { const b = stack[sp - 1], a = stack[sp - 2]; sp -= 2; stack[sp++] = (a >>> (b & 31)) | 0; break; } // SHRU, logical
      case 0x20: { const b = stack[sp - 1], a = stack[sp - 2]; sp -= 2; stack[sp++] = a === b ? 1 : 0; break; } // EQ
      case 0x21: { const b = stack[sp - 1], a = stack[sp - 2]; sp -= 2; stack[sp++] = a < b ? 1 : 0; break; }   // LT, signed
      case 0x22: { const b = stack[sp - 1], a = stack[sp - 2]; sp -= 2; stack[sp++] = (a >>> 0) < (b >>> 0) ? 1 : 0; break; } // LTU
      case 0x30: { const off = ((prog[next - 2] | prog[next - 1] << 8) << 16) >> 16; pc = next + off; break; } // JMP
      case 0x31: { const off = ((prog[next - 2] | prog[next - 1] << 8) << 16) >> 16; const v = stack[--sp]; if (v === 0) pc = next + off; break; } // JZ
      case 0x32: { const off = ((prog[next - 2] | prog[next - 1] << 8) << 16) >> 16; const v = stack[--sp]; if (v !== 0) pc = next + off; break; } // JNZ
      case 0x33: { if (fp === 64) return end(7); frames[fp++] = next; pc = prog[next - 2] | (prog[next - 1] << 8); break; } // CALL
      case 0x34: { if (fp === 0) return end(8); pc = frames[--fp]; break; }  // RET
      case 0x40: { const ad = stack[sp - 1]; if (ad < 0 || ad > 255) return end(6); stack[sp - 1] = mem[ad]; break; } // LOAD
      case 0x41: { const ad = stack[sp - 1], v = stack[sp - 2]; if (ad < 0 || ad > 255) return end(6); sp -= 2; mem[ad] = v; break; } // STORE
      case 0x50: {                                                        // PRINT, decimal ASCII
        const v = stack[sp - 1];
        let x = v < 0 ? -v : v;
        let nd = 1;
        for (let q = x; q >= 10; q = Math.floor(q / 10)) nd++;
        const width = nd + (v < 0 ? 1 : 0);
        if (olen + width > OUT_MAX) return end(11);
        sp--;
        const base = olen;
        if (v < 0) out[olen++] = 45;
        let p = olen + nd;
        do { out[--p] = 48 + (x % 10); x = Math.floor(x / 10); } while (x > 0);
        olen = base + width;
        break;
      }
      case 0x51: { if (olen + 1 > OUT_MAX) return end(11); out[olen++] = stack[--sp] & 255; break; } // PUTC
      case 0x52: stack[sp++] = ipos < feed.length ? feed[ipos++] : -1; break; // IN
      case 0x53: return end(stack[--sp] & 255);                            // EXIT
    }
  }
}

for (const id of readdirSync(IN_DIR).sort()) {
  if (!statSync(join(IN_DIR, id)).isDirectory()) continue;
  const prog = readFileSync(join(IN_DIR, id, 'program.bin'));
  const feed = readFileSync(join(IN_DIR, id, 'input.bin'));
  const r = execute(prog, feed);
  const od = join(OUT_DIR, id);
  mkdirSync(od, { recursive: true });
  writeFileSync(join(od, 'stdout.bin'), r.bytes);
  writeFileSync(join(od, 'exit.txt'), r.code + '\n');
}
