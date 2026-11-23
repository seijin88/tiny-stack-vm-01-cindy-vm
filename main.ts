// Entry for make.fun's tiny-stack-vm-01-run-20261122 bounty: a tiny stack VM, written from scratch.
// Semantics follow the kit's ISA.md with generator/subject/vm.mjs as the rule on ambiguity.
// Plain JavaScript (runs as node main.ts on Node 22); CJS require keeps the module kind fixed.
const { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const IN = process.env.MAKEFUN_INPUT_DIR ?? '/input', OUT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Opcode table, indexed by opcode byte: imm | pops<<4 | pushes<<8, -1 = no such opcode.
const META = new Int16Array(256).fill(-1);
for (const [b, imm, pops, pushes] of [
  [0, 0, 0, 0], [1, 1, 0, 1], [2, 4, 0, 1], [3, 0, 1, 0], [4, 0, 1, 2], [5, 0, 2, 2], [6, 0, 2, 3], [7, 0, 3, 3],
  [16, 0, 2, 1], [17, 0, 2, 1], [18, 0, 2, 1], [19, 0, 2, 1], [20, 0, 2, 1], [21, 0, 2, 1], [22, 0, 2, 1],
  [23, 0, 1, 1], [24, 0, 2, 1], [25, 0, 2, 1], [26, 0, 2, 1], [27, 0, 1, 1], [28, 0, 2, 1], [29, 0, 2, 1],
  [30, 0, 2, 1], [32, 0, 2, 1], [33, 0, 2, 1], [34, 0, 2, 1],
  [48, 2, 0, 0], [49, 2, 1, 0], [50, 2, 1, 0], [51, 2, 0, 0], [52, 0, 0, 0],
  [64, 0, 1, 1], [65, 0, 2, 0],
  [80, 0, 1, 0], [81, 0, 1, 0], [82, 0, 0, 1], [83, 0, 1, 0],
]) META[b] = imm | (pops << 4) | (pushes << 8);

// Runs one program on one input stream; answers with the bytes written and the exit code.
function run(P, F) {
  const n = P.length, S = new Int32Array(256), C = new Int32Array(64), W = new Int32Array(256), U = new Uint8Array(65536);
  let sp = 0, cp = 0, ol = 0, ip = 0, pc = 0, k = 0;
  const end = (c) => ({ bytes: U.subarray(0, ol), code: c });
  for (;;) {
    if (k === 1e6) return end(10);                 // step limit
    if (pc < 0 || pc >= n) return end(9);         // pc outside the program
    const op = P[pc], m = META[op];
    if (m < 0) return end(5);                      // unknown opcode
    const imm = m & 15;
    if (pc + imm >= n) return end(9);             // immediate cut off by the end
    k++;
    const nx = pc + 1 + imm, po = (m >> 4) & 15, pu = m >> 8;
    if (sp < po) return end(2);                   // stack underflow
    if (sp - po + pu > 256) return end(3);        // stack overflow
    pc = nx;
    switch (op) {
      case 0: return end(0);                                        // HALT
      case 1: S[sp++] = (P[nx - 1] << 24) >> 24; break;             // PUSH8, sign-extended
      case 2: S[sp++] = P[nx - 4] | P[nx - 3] << 8 | P[nx - 2] << 16 | P[nx - 1] << 24; break; // PUSH32 LE
      case 3: sp--; break;                                          // POP
      case 4: S[sp] = S[sp - 1]; sp++; break;                       // DUP
      case 5: { const t = S[sp - 1]; S[sp - 1] = S[sp - 2]; S[sp - 2] = t; break; } // SWAP
      case 6: S[sp] = S[sp - 2]; sp++; break;                       // OVER
      case 7: { const t = S[sp - 3]; S[sp - 3] = S[sp - 2]; S[sp - 2] = S[sp - 1]; S[sp - 1] = t; break; } // ROT
      case 16: { const b = S[sp - 1], a = S[sp - 2]; sp -= 2; S[sp++] = (a + b) | 0; break; } // ADD
      case 17: { const b = S[sp - 1], a = S[sp - 2]; sp -= 2; S[sp++] = (a - b) | 0; break; } // SUB
      case 18: { const b = S[sp - 1], a = S[sp - 2]; sp -= 2; S[sp++] = Math.imul(a, b); break; } // MUL
      case 19: { const b = S[sp - 1], a = S[sp - 2]; if (!b) return end(4); sp -= 2; S[sp++] = a === -2147483648 && b === -1 ? a : (a / b) | 0; break; } // DIV
      case 20: { const b = S[sp - 1], a = S[sp - 2]; if (!b) return end(4); sp -= 2; S[sp++] = b === -1 ? 0 : (a % b) | 0; break; } // MOD
      case 21: { const b = S[sp - 1], a = S[sp - 2]; if (!b) return end(4); sp -= 2; S[sp++] = Math.floor((a >>> 0) / (b >>> 0)) | 0; break; } // DIVU
      case 22: { const b = S[sp - 1], a = S[sp - 2]; if (!b) return end(4); sp -= 2; S[sp++] = ((a >>> 0) % (b >>> 0)) | 0; break; } // MODU
      case 23: S[sp - 1] = (-S[sp - 1]) | 0; break;                  // NEG
      case 24: { const b = S[sp - 1], a = S[sp - 2]; sp -= 2; S[sp++] = a & b; break; } // AND
      case 25: { const b = S[sp - 1], a = S[sp - 2]; sp -= 2; S[sp++] = a | b; break; } // OR
      case 26: { const b = S[sp - 1], a = S[sp - 2]; sp -= 2; S[sp++] = a ^ b; break; } // XOR
      case 27: S[sp - 1] = ~S[sp - 1]; break;                       // NOT
      case 28: { const b = S[sp - 1], a = S[sp - 2]; sp -= 2; S[sp++] = a << (b & 31); break; } // SHL
      case 29: { const b = S[sp - 1], a = S[sp - 2]; sp -= 2; S[sp++] = a >> (b & 31); break; } // SHR arithmetic
      case 30: { const b = S[sp - 1], a = S[sp - 2]; sp -= 2; S[sp++] = (a >>> (b & 31)) | 0; break; } // SHRU logical
      case 32: { const b = S[sp - 1], a = S[sp - 2]; sp -= 2; S[sp++] = a === b ? 1 : 0; break; } // EQ
      case 33: { const b = S[sp - 1], a = S[sp - 2]; sp -= 2; S[sp++] = a < b ? 1 : 0; break; }   // LT signed
      case 34: { const b = S[sp - 1], a = S[sp - 2]; sp -= 2; S[sp++] = (a >>> 0) < (b >>> 0) ? 1 : 0; break; } // LTU
      case 48: { const f = (P[nx - 2] | P[nx - 1] << 8) << 16 >> 16; pc = nx + f; break; } // JMP
      case 49: { const f = (P[nx - 2] | P[nx - 1] << 8) << 16 >> 16; const v = S[--sp]; if (v === 0) pc = nx + f; break; } // JZ
      case 50: { const f = (P[nx - 2] | P[nx - 1] << 8) << 16 >> 16; const v = S[--sp]; if (v !== 0) pc = nx + f; break; } // JNZ
      case 51: { if (cp === 64) return end(7); C[cp++] = nx; pc = P[nx - 2] | (P[nx - 1] << 8); break; } // CALL
      case 52: { if (cp === 0) return end(8); pc = C[--cp]; break; } // RET
      case 64: { const a = S[sp - 1]; if (a < 0 || a > 255) return end(6); S[sp - 1] = W[a]; break; } // LOAD
      case 65: { const a = S[sp - 1], v = S[sp - 2]; if (a < 0 || a > 255) return end(6); sp -= 2; W[a] = v; break; } // STORE
      case 80: {                                                     // PRINT, decimal ASCII
        const v = S[sp - 1];
        let x = v < 0 ? -v : v, d = 1;
        for (let q = x; q >= 10; q = Math.floor(q / 10)) d++;
        const w = d + (v < 0 ? 1 : 0);
        if (ol + w > 65536) return end(11);
        sp--;
        const base = ol;
        if (v < 0) U[ol++] = 45;
        let p = ol + d;
        do { U[--p] = 48 + (x % 10); x = Math.floor(x / 10); } while (x > 0);
        ol = base + w;
        break;
      }
      case 81: { if (ol + 1 > 65536) return end(11); U[ol++] = S[--sp] & 255; break; } // PUTC
      case 82: S[sp++] = ip < F.length ? F[ip++] : -1; break;       // IN
      case 83: return end(S[--sp] & 255);                            // EXIT
    }
  }
}

for (const id of readdirSync(IN).sort()) {
  if (!statSync(join(IN, id)).isDirectory()) continue;
  const r = run(readFileSync(join(IN, id, 'program.bin')), readFileSync(join(IN, id, 'input.bin')));
  const d = join(OUT, id);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'stdout.bin'), r.bytes);
  writeFileSync(join(d, 'exit.txt'), r.code + '\n');
}
