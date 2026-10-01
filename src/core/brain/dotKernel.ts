/**
 * Dot products between rows of a VectorSet. Linking 5,000 cards takes 12.5 million dot
 * products of 384 dimensions; plain JavaScript needs several seconds for that, a tiny
 * WebAssembly SIMD kernel about a sixth of it. The JS kernel is the fallback (no SIMD).
 */

export interface VectorMatrix {
  /** Number of rows. */
  count: number;
  dim: number;
  matrix: Float32Array;
}

export interface DotKernel {
  /** out[t] = dot(row, from + t) for every t in [0, to - from). */
  dotRange(row: number, from: number, to: number, out: Float32Array): void;
  dot(row: number, other: number): number;
}

export function createJsKernel({ dim, matrix }: VectorMatrix): DotKernel {
  const dot = (row: number, other: number) => {
    const a = row * dim;
    const b = other * dim;
    let s0 = 0;
    let s1 = 0;
    let s2 = 0;
    let s3 = 0;
    let k = 0;
    // Four accumulators: noticeably faster than a single running sum.
    for (; k + 3 < dim; k += 4) {
      s0 += (matrix[a + k] as number) * (matrix[b + k] as number);
      s1 += (matrix[a + k + 1] as number) * (matrix[b + k + 1] as number);
      s2 += (matrix[a + k + 2] as number) * (matrix[b + k + 2] as number);
      s3 += (matrix[a + k + 3] as number) * (matrix[b + k + 3] as number);
    }
    for (; k < dim; k += 1) s0 += (matrix[a + k] as number) * (matrix[b + k] as number);
    // Rounded to float32 like dotRange's output, so both paths give identical weights.
    return Math.fround(s0 + s1 + s2 + s3);
  };
  return {
    dot,
    dotRange(row, from, to, out) {
      for (let other = from; other < to; other += 1) out[other - from] = dot(row, other);
    },
  };
}

function leb128(value: number): number[] {
  const bytes: number[] = [];
  let rest = value >>> 0;
  do {
    let byte = rest & 0x7f;
    rest >>>= 7;
    if (rest !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (rest !== 0);
  return bytes;
}

function name(text: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(text));
  return [...leb128(bytes.length), ...bytes];
}

function section(id: number, bytes: number[]): number[] {
  return [id, ...leb128(bytes.length), ...bytes];
}

/*
 * (func $dots (param $a i32) (param $b i32) (param $count i32) (param $dimBytes i32)
 *             (param $out i32) (local $k i32) (local $acc v128)
 *   For $count rows starting at $b: acc = Σ a[k..k+4] * b[k..k+4] (f32x4), store the
 *   horizontal sum at $out, advance $out by 4 and $b by $dimBytes. Requires dim % 4 = 0.
 */
const LOCAL_GET = 0x20;
const LOCAL_SET = 0x21;
const LOCAL_TEE = 0x22;
const I32_CONST = 0x41;
const SIMD = 0xfd;
// prettier-ignore
const DOTS_BODY = [
  0x02, 0x40, // block
  0x03, 0x40, // loop (rows)
  LOCAL_GET, 2, 0x45, 0x0d, 1, // br_if done (count == 0)
  SIMD, 0x0c, ...new Array<number>(16).fill(0), LOCAL_SET, 6, // acc = v128.const 0
  I32_CONST, 0, LOCAL_SET, 5, // k = 0
  0x03, 0x40, // loop (k)
  LOCAL_GET, 6,
  LOCAL_GET, 0, LOCAL_GET, 5, 0x6a, SIMD, 0x00, 2, 0, // v128.load a + k
  LOCAL_GET, 1, LOCAL_GET, 5, 0x6a, SIMD, 0x00, 2, 0, // v128.load b + k
  SIMD, 0xe6, 0x01, SIMD, 0xe4, 0x01, LOCAL_SET, 6, // acc += a * b (f32x4.mul, f32x4.add)
  LOCAL_GET, 5, I32_CONST, 16, 0x6a, LOCAL_TEE, 5, LOCAL_GET, 3, 0x49, 0x0d, 0, // k += 16; k < dimBytes
  0x0b, // end loop (k)
  LOCAL_GET, 4,
  LOCAL_GET, 6, SIMD, 0x1f, 0,
  LOCAL_GET, 6, SIMD, 0x1f, 1, 0x92,
  LOCAL_GET, 6, SIMD, 0x1f, 2, 0x92,
  LOCAL_GET, 6, SIMD, 0x1f, 3, 0x92,
  0x38, 2, 0, // f32.store out
  LOCAL_GET, 4, I32_CONST, 4, 0x6a, LOCAL_SET, 4, // out += 4
  LOCAL_GET, 1, LOCAL_GET, 3, 0x6a, LOCAL_SET, 1, // b += dimBytes
  LOCAL_GET, 2, I32_CONST, 1, 0x6b, LOCAL_SET, 2, // count -= 1
  0x0c, 0, // br rows
  0x0b, // end loop (rows)
  0x0b, // end block
  0x0b, // end func
];

const FUNC = [2, 1, 0x7f, 1, 0x7b, ...DOTS_BODY];

// prettier-ignore
const MODULE_BYTES = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  ...section(1, [1, 0x60, 5, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0]),
  ...section(2, [1, ...name('env'), ...name('memory'), 0x02, 0x00, 1]),
  ...section(3, [1, 0]),
  ...section(7, [1, ...name('dots'), 0x00, 0]),
  ...section(10, [1, ...leb128(FUNC.length), ...FUNC]),
]);

let compiled: WebAssembly.Module | null | undefined;

function simdModule(): WebAssembly.Module | null {
  if (compiled !== undefined) return compiled;
  try {
    compiled =
      typeof WebAssembly === 'object' && WebAssembly.validate(MODULE_BYTES)
        ? new WebAssembly.Module(MODULE_BYTES)
        : null;
  } catch {
    // No SIMD support or WebAssembly blocked by the CSP.
    compiled = null;
  }
  return compiled;
}

const PAGE = 65536;

/** SIMD kernel, or null when unsupported (dim not a multiple of 4, no WebAssembly SIMD). */
export function createSimdKernel({ count, dim, matrix }: VectorMatrix): DotKernel | null {
  const module = dim > 0 && dim % 4 === 0 ? simdModule() : null;
  if (!module) return null;
  const matrixBytes = count * dim * 4;
  const outBytes = Math.max(1, count) * 4;
  const memory = new WebAssembly.Memory({
    initial: Math.max(1, Math.ceil((matrixBytes + outBytes) / PAGE)),
  });
  const instance = new WebAssembly.Instance(module, { env: { memory } });
  const dots = instance.exports.dots as (
    a: number,
    b: number,
    count: number,
    dimBytes: number,
    out: number,
  ) => void;
  new Float32Array(memory.buffer, 0, count * dim).set(matrix.subarray(0, count * dim));
  const out = new Float32Array(memory.buffer, matrixBytes, Math.max(1, count));
  const rowBytes = dim * 4;
  return {
    dot(row, other) {
      dots(row * rowBytes, other * rowBytes, 1, rowBytes, matrixBytes);
      return out[0] as number;
    },
    dotRange(row, from, to, target) {
      if (to <= from) return;
      dots(row * rowBytes, from * rowBytes, to - from, rowBytes, matrixBytes);
      target.set(out.subarray(0, to - from));
    },
  };
}

/** Fastest available kernel. */
export function createKernel(vectors: VectorMatrix): DotKernel {
  return createSimdKernel(vectors) ?? createJsKernel(vectors);
}
