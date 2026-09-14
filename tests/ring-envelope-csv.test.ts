import { describe, expect, it } from 'vitest';
import { RingBuffer } from '../src/signal/ring';
import { computeEnvelope, makeEnvelope } from '../src/signal/envelope';
import { captureToCsv } from '../src/signal/exportCsv';
import type { Capture } from '../src/signal/types';

describe('RingBuffer', () => {
  it('keeps the newest samples in order across wrap-around', () => {
    const r = new RingBuffer(10);
    r.push(new Float32Array([1, 2, 3, 4, 5, 6, 7]));
    r.push(new Float32Array([8, 9, 10, 11, 12]));
    expect(r.length).toBe(10);
    const out = new Float32Array(4);
    expect(r.latest(4, out)).toBe(4);
    expect(Array.from(out)).toEqual([9, 10, 11, 12]);
    expect(Array.from(r.snapshot())).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
  it('zero-pads when fewer samples than requested and handles oversized blocks', () => {
    const r = new RingBuffer(5);
    r.push(new Float32Array([1, 2]));
    const out = new Float32Array(4);
    expect(r.latest(4, out)).toBe(2);
    expect(Array.from(out)).toEqual([0, 0, 1, 2]);
    r.push(new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(Array.from(r.snapshot())).toEqual([4, 5, 6, 7, 8]);
  });
});

describe('computeEnvelope', () => {
  it('preserves short peaks that a naive decimation would drop', () => {
    const x = new Float32Array(1000);
    x[503] = 0.9; // one-sample spike
    x[250] = -0.7;
    const env = computeEnvelope(x, 0, 1000, 10, makeEnvelope(10));
    expect(env.columns).toBe(10);
    expect(env.max[5]).toBeCloseTo(0.9);
    expect(env.min[2]).toBeCloseTo(-0.7);
    expect(env.max[0]).toBe(0);
  });
});

describe('captureToCsv', () => {
  it('writes metadata and correctly timed rows for the displayed window only', () => {
    const samples = new Float32Array(100);
    for (let i = 0; i < 100; i++) samples[i] = i / 100;
    const cap: Capture = {
      samples,
      sampleRate: 1000,
      windowStart: 40,
      windowLength: 5,
      triggerIndex: 42,
      meta: { source: 'demo', sourceLabel: 'Demo: sine 440 Hz', sampleRate: 1000, capturedAt: '2026-01-01T00:00:00.000Z', notes: ['note A'] },
    };
    const csv = captureToCsv(cap, { mode: 'rising', level: 0.1, hysteresis: 0.02 });
    const lines = csv.trim().split('\n');
    expect(lines).toContain('# source: demo');
    expect(lines).toContain('# sample_rate_hz: 1000');
    expect(lines).toContain('# samples: 5');
    expect(lines).toContain('# trigger_sample_index: 2');
    expect(lines).toContain('# note: note A');
    const header = lines.indexOf('time_s,amplitude');
    const rows = lines.slice(header + 1);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toBe('0.000000000,0.400000');
    expect(rows[1].split(',')[0]).toBe('0.001000000');
    expect(rows[4]).toBe('0.004000000,0.440000');
  });
});
