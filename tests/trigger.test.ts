import { describe, expect, it } from 'vitest';
import { findTrigger } from '../src/signal/trigger';

function sine(freq: number, amp: number, sr: number, n: number): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * Math.sin(2 * Math.PI * freq * (i / sr));
  return x;
}

describe('findTrigger', () => {
  const sr = 48000;
  const x = sine(1000, 0.5, sr, 4800); // 100 cycles, 48 samples per cycle

  it('finds a rising crossing where the previous sample is below and current is at/above level', () => {
    const r = findTrigger(x, { mode: 'rising', level: 0, hysteresis: 0.02 }, 480, 48);
    expect(r.index).toBeGreaterThan(0);
    expect(x[r.index - 1]).toBeLessThan(0);
    expect(x[r.index]).toBeGreaterThanOrEqual(0);
    // window must fit
    expect(r.index - 48 + 480).toBeLessThanOrEqual(x.length);
    // it is the LAST such crossing that fits
    expect(x.length - (r.index - 48 + 480)).toBeLessThan(48);
  });

  it('finds a falling crossing', () => {
    const r = findTrigger(x, { mode: 'falling', level: 0.2, hysteresis: 0.02 }, 480, 48);
    expect(r.index).toBeGreaterThan(0);
    expect(x[r.index - 1]).toBeGreaterThan(0.2);
    expect(x[r.index]).toBeLessThanOrEqual(0.2);
  });

  it('returns -1 when the level is never crossed', () => {
    expect(findTrigger(x, { mode: 'rising', level: 0.9, hysteresis: 0.02 }, 480, 48).index).toBe(-1);
    expect(findTrigger(x, { mode: 'falling', level: -0.9, hysteresis: 0.02 }, 480, 48).index).toBe(-1);
  });

  it('returns -1 for DC / silence and for free-running mode', () => {
    const flat = new Float32Array(1000);
    expect(findTrigger(flat, { mode: 'rising', level: 0, hysteresis: 0.02 }, 100, 10).index).toBe(-1);
    expect(findTrigger(x, { mode: 'free', level: 0, hysteresis: 0.02 }, 100, 10).index).toBe(-1);
  });

  it('ignores tiny noise that never leaves the hysteresis band', () => {
    const noisy = new Float32Array(2000);
    for (let i = 0; i < noisy.length; i++) noisy[i] = 0.005 * Math.sin(i * 0.7);
    expect(findTrigger(noisy, { mode: 'rising', level: 0, hysteresis: 0.02 }, 200, 20).index).toBe(-1);
    expect(findTrigger(noisy, { mode: 'rising', level: 0, hysteresis: 0 }, 200, 20).index).toBeGreaterThan(0);
  });

  it('returns -1 when the buffer is shorter than the window', () => {
    expect(findTrigger(x.subarray(0, 100), { mode: 'rising', level: 0, hysteresis: 0.02 }, 480, 48).index).toBe(-1);
  });
});
