import { describe, expect, it } from 'vitest';
import { DemoGenerator, bandLimitedSquare } from '../src/signal/generator';
import { rms, peakToPeak } from '../src/signal/analysis';

function gen(waveform: 'sine' | 'square' | 'triangle' | 'sawtooth' | 'noise' | 'siren', frequency: number, amplitude: number, sr: number, n: number, extra: Record<string, number> = {}) {
  const g = new DemoGenerator(sr, { waveform, frequency, amplitude, dutyCycle: 0.5, sirenLow: 400, sirenHigh: 1200, sirenRate: 0.5, ...extra });
  const out = new Float32Array(n);
  g.generate(out);
  return out;
}

describe('DemoGenerator', () => {
  it('sine RMS ≈ amplitude/√2 and p2p ≈ 2×amplitude', () => {
    for (const sr of [44100, 48000, 96000]) {
      const a = 0.6;
      const x = gen('sine', 440, a, sr, sr); // one full second → integer-ish cycles
      expect(rms(x)).toBeCloseTo(a / Math.SQRT2, 2);
      expect(peakToPeak(x).p2p).toBeCloseTo(2 * a, 2);
    }
  });

  it('square wave stays within ±1.2 (Gibbs) and has ~unit RMS at 50% duty', () => {
    const x = gen('square', 200, 1, 48000, 48000);
    const { peakAbs } = peakToPeak(x);
    expect(peakAbs).toBeLessThan(1.2);
    expect(rms(x)).toBeGreaterThan(0.95);
  });

  it('band-limited square has no harmonics above Nyquist (high harmonic count is capped)', () => {
    // at f=10 kHz with sr=48k only harmonics 1 and 2 (below 23.5k) exist → essentially a sine + small 2nd? For duty 0.5 even harmonics vanish, so it is a pure sine.
    const sr = 48000;
    const v: number[] = [];
    for (let i = 0; i < 100; i++) v.push(bandLimitedSquare(i / 100, 0.5, 10000, sr / 2));
    const ideal = v.map((_, i) => (4 / Math.PI) * Math.cos(2 * Math.PI * (i / 100 - 0.25)) / 1);
    for (let i = 0; i < 100; i++) expect(v[i]).toBeCloseTo(ideal[i] / 0.5 / 2, 5);
  });

  it('triangle and sawtooth peak near ±amplitude', () => {
    const t = gen('triangle', 300, 0.8, 48000, 48000);
    expect(peakToPeak(t).p2p).toBeGreaterThan(1.5);
    expect(peakToPeak(t).p2p).toBeLessThan(1.65);
    const s = gen('sawtooth', 300, 0.8, 48000, 48000);
    expect(peakToPeak(s).p2p).toBeGreaterThan(1.5);
    expect(peakToPeak(s).p2p).toBeLessThan(1.9);
  });

  it('noise is bounded by amplitude and has non-trivial RMS', () => {
    const x = gen('noise', 0, 0.5, 48000, 48000);
    expect(peakToPeak(x).peakAbs).toBeLessThanOrEqual(0.5);
    expect(rms(x)).toBeGreaterThan(0.2);
  });

  it('siren instantaneous frequency stays within its range', () => {
    // Count zero crossings in short chunks and verify the rate is within [low, high].
    const sr = 48000;
    const x = gen('siren', 0, 1, sr, sr * 2, { sirenLow: 400, sirenHigh: 1200, sirenRate: 0.5 });
    const chunk = 4800; // 100 ms
    for (let c = 0; c + chunk <= x.length; c += chunk) {
      let crossings = 0;
      for (let i = c + 1; i < c + chunk; i++) if (x[i - 1] < 0 && x[i] >= 0) crossings++;
      const f = crossings / 0.1;
      expect(f).toBeGreaterThanOrEqual(380);
      expect(f).toBeLessThanOrEqual(1230);
    }
  });

  it('generation is continuous across calls (no phase jumps)', () => {
    const g = new DemoGenerator(48000, { waveform: 'sine', frequency: 1000, amplitude: 1, dutyCycle: 0.5, sirenLow: 400, sirenHigh: 1200, sirenRate: 0.5 });
    const a = new Float32Array(100);
    const b = new Float32Array(100);
    g.generate(a);
    g.generate(b);
    const whole = new Float32Array(200);
    new DemoGenerator(48000, g.params).generate(whole);
    for (let i = 0; i < 100; i++) {
      expect(a[i]).toBeCloseTo(whole[i], 6);
      expect(b[i]).toBeCloseTo(whole[100 + i], 6);
    }
  });
});
