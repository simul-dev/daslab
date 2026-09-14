/** FNV-1a plus final avalanche. It is stable across browsers and Node. */
function hash(seed: number, key: string) {
  let value = (2166136261 ^ (seed >>> 0)) >>> 0;
  for (let index = 0; index < key.length; index++) {
    value ^= key.charCodeAt(index);
    value = Math.imul(value, 16777619) >>> 0;
  }
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return value >>> 0;
}

/** A keyed draw prevents one scenario's extra events from shifting unrelated draws. */
export function keyedRandom(seed: number, ...parts: (string | number)[]) {
  let value = hash(seed, parts.join(':'));
  value += 0x6d2b79f5;
  let result = value;
  result = Math.imul(result ^ (result >>> 15), result | 1);
  result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
  return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
}

export function keyedExponential(mean: number, seed: number, ...parts: (string | number)[]) {
  const draw = Math.max(Number.EPSILON, 1 - keyedRandom(seed, ...parts));
  return -Math.log(draw) * mean;
}

/** Symmetric triangular factor in [0.9, 1.1], centred on 1. */
export function keyedDurationFactor(seed: number, ...parts: (string | number)[]) {
  const first = keyedRandom(seed, ...parts, 'a');
  const second = keyedRandom(seed, ...parts, 'b');
  return 0.9 + 0.1 * (first + second);
}

