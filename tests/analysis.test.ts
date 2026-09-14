import { describe, expect, it } from 'vitest';
import { DemoGenerator, Rng } from '../src/signal/generator';
import { detectInputClipping, estimateFrequency, FrequencyStabilizer, measure, SpectrumAnalyzer } from '../src/signal/analysis';

function sine(freq: number, amp: number, sr: number, n: number, phase = 0): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * Math.sin(2 * Math.PI * freq * (i / sr) + phase);
  return x;
}

describe('estimateFrequency (NSDF)', () => {
  it('estimates sine frequency within 0.5% at several frequencies and sample rates', () => {
    for (const sr of [22050, 44100, 48000, 96000]) {
      for (const f of [82.4, 110, 220, 440, 1000, 2500]) {
        const x = sine(f, 0.5, sr, 4096, 0.3);
        const est = estimateFrequency(x, sr);
        expect(est.status, `${f} Hz @ ${sr}`).toBe('ok');
        expect(Math.abs(est.hz - f) / f, `${f} Hz @ ${sr}`).toBeLessThan(0.005);
        expect(est.clarity).toBeGreaterThan(0.95);
      }
    }
  });

  it('finds the fundamental of a square wave (not its strongest harmonic)', () => {
    const g = new DemoGenerator(48000, { waveform: 'square', frequency: 300, amplitude: 0.7, dutyCycle: 0.3, sirenLow: 400, sirenHigh: 1200, sirenRate: 0.5 });
    const x = new Float32Array(4096);
    g.generate(x);
    const est = estimateFrequency(x, 48000);
    expect(est.status).toBe('ok');
    expect(Math.abs(est.hz - 300) / 300).toBeLessThan(0.01);
  });

  it('silence returns no confident frequency', () => {
    const x = new Float32Array(4096);
    expect(estimateFrequency(x, 48000).status).toBe('silent');
    const tiny = sine(440, 0.0005, 48000, 4096); // -66 dBFS
    expect(estimateFrequency(tiny, 48000).status).toBe('silent');
  });

  it('white noise does not routinely receive a confident pitch', () => {
    let confident = 0;
    const rng = new Rng(12345);
    for (let trial = 0; trial < 20; trial++) {
      const x = new Float32Array(4096);
      for (let i = 0; i < x.length; i++) x[i] = (rng.next() * 2 - 1) * 0.5;
      if (estimateFrequency(x, 48000).status === 'ok') confident++;
    }
    expect(confident).toBeLessThanOrEqual(1);
  });

  it('returns insufficient for very short blocks', () => {
    const x = sine(440, 0.5, 48000, 64);
    expect(estimateFrequency(x, 48000).status).toBe('insufficient');
  });
});

describe('measure', () => {
  it('sine RMS ≈ A/√2 and p2p ≈ 2A', () => {
    const x = sine(440, 0.8, 48000, 4096);
    const m = measure(x, 48000);
    expect(m.rms).toBeCloseTo(0.8 / Math.SQRT2, 2);
    expect(m.peakToPeak).toBeCloseTo(1.6, 2);
    expect(m.inputClipping).toBe(false);
    expect(m.periodSeconds).toBeCloseTo(1 / 440, 5);
  });

  it('flags input clipping only for samples pinned at full scale', () => {
    const clipped = sine(440, 1.3, 48000, 4096);
    for (let i = 0; i < clipped.length; i++) clipped[i] = Math.max(-1, Math.min(1, clipped[i]));
    expect(detectInputClipping(clipped)).toBe(true);
    // Full-amplitude but not pinned sine: at most one or two samples near peak → no clip
    const loud = sine(440, 0.98, 48000, 4096);
    expect(detectInputClipping(loud)).toBe(false);
    // Display gain is not part of the samples: a 0.2 sine is never input-clipped even if a ×10 gain pushes it off screen.
    expect(detectInputClipping(sine(440, 0.2, 48000, 4096))).toBe(false);
  });
});

describe('FrequencyStabilizer', () => {
  it('reports unstable while estimates disagree, ok once steady', () => {
    const s = new FrequencyStabilizer(4, 0.04);
    expect(s.apply({ status: 'ok', hz: 400, clarity: 1 }).status).toBe('unstable');
    expect(s.apply({ status: 'ok', hz: 600, clarity: 1 }).status).toBe('unstable');
    expect(s.apply({ status: 'ok', hz: 800, clarity: 1 }).status).toBe('unstable');
    s.reset();
    s.apply({ status: 'ok', hz: 440, clarity: 1 });
    expect(s.apply({ status: 'ok', hz: 441, clarity: 1 }).status).toBe('ok');
  });
});

describe('SpectrumAnalyzer', () => {
  it('maps bins to the correct frequency and normalizes a full-scale sine to ~0 dBFS', () => {
    for (const sr of [44100, 48000]) {
      const an = new SpectrumAnalyzer(4096);
      const binHz = sr / 4096;
      const k = 100;
      const f = k * binHz; // exactly on a bin centre
      const x = sine(f, 1.0, sr, 4096);
      const res = an.analyze(x, sr);
      expect(res.binHz).toBeCloseTo(binHz, 6);
      expect(res.peak).not.toBeNull();
      expect(res.peak!.hz).toBeCloseTo(f, 0);
      expect(res.peak!.db).toBeGreaterThan(-0.5);
      expect(res.peak!.db).toBeLessThan(0.5);
      expect(res.magnitudesDb[k]).toBeGreaterThan(-0.5);
      // Far from the peak the Hann sidelobes must be well down
      expect(res.magnitudesDb[k + 40]).toBeLessThan(-60);
    }
  });

  it('interpolates an off-bin peak frequency', () => {
    const sr = 48000;
    const an = new SpectrumAnalyzer(4096);
    const f = 1234.5;
    const res = an.analyze(sine(f, 0.5, sr, 4096), sr);
    expect(Math.abs(res.peak!.hz - f)).toBeLessThan(sr / 4096 / 4);
    expect(res.peak!.db).toBeCloseTo(-6.02, 0);
  });

  it('reports no peak for silence', () => {
    const an = new SpectrumAnalyzer(1024);
    expect(an.analyze(new Float32Array(1024), 48000).peak).toBeNull();
  });
});
