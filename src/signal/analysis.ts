import { fft, hannWindow } from './fft';
import type { FrequencyEstimate, Measurements, SpectrumResult } from './types';

export const SILENCE_DBFS = -60;
export const CLIP_LEVEL = 0.985;
export const CLIP_RUN = 3;
export const MIN_CLARITY = 0.9;
export const PITCH_MIN_HZ = 40;
export const PITCH_MAX_HZ = 5000;

export function dbfs(x: number): number {
  return x <= 0 ? -Infinity : 20 * Math.log10(x);
}

export function rms(block: Float32Array): number {
  let acc = 0;
  for (let i = 0; i < block.length; i++) acc += block[i] * block[i];
  return Math.sqrt(acc / Math.max(1, block.length));
}

export function peakToPeak(block: Float32Array): { p2p: number; peakAbs: number } {
  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i < block.length; i++) {
    const v = block[i];
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  if (!Number.isFinite(mn)) return { p2p: 0, peakAbs: 0 };
  return { p2p: mx - mn, peakAbs: Math.max(Math.abs(mn), Math.abs(mx)) };
}

/**
 * Input clipping means the samples themselves sit at (or beyond) full scale for
 * several consecutive samples — the converter or source ran out of range.
 * This is different from the trace merely leaving the visible plot because
 * display gain is high.
 */
export function detectInputClipping(block: Float32Array, level = CLIP_LEVEL, run = CLIP_RUN): boolean {
  let streak = 0;
  for (let i = 0; i < block.length; i++) {
    if (Math.abs(block[i]) >= level) {
      streak++;
      if (streak >= run) return true;
    } else streak = 0;
  }
  return false;
}

/**
 * Fundamental-frequency estimate using the McLeod Pitch Method's normalized
 * square difference function (NSDF) — a periodicity method, NOT "largest FFT
 * peak". A confident estimate requires a clear NSDF peak above MIN_CLARITY.
 */
export function estimateFrequency(block: Float32Array, sampleRate: number): FrequencyEstimate {
  const n = block.length;
  if (n < 256) return { status: 'insufficient', hz: NaN, clarity: 0 };
  const level = rms(block);
  if (dbfs(level) < SILENCE_DBFS) return { status: 'silent', hz: NaN, clarity: 0 };
  const maxLag = Math.min(Math.floor(sampleRate / PITCH_MIN_HZ), Math.floor(n / 2));
  const minLag = Math.max(2, Math.floor(sampleRate / PITCH_MAX_HZ));
  if (maxLag <= minLag + 2) return { status: 'insufficient', hz: NaN, clarity: 0 };

  // Remove DC so a constant offset does not look like periodicity.
  let mean = 0;
  for (let i = 0; i < n; i++) mean += block[i];
  mean /= n;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = block[i] - mean;

  // NSDF: nsdf[tau] = 2*sum(x[i]x[i+tau]) / sum(x[i]^2 + x[i+tau]^2)
  const nsdf = new Float32Array(maxLag + 1);
  for (let tau = 0; tau <= maxLag; tau++) {
    let acf = 0;
    let m = 0;
    const lim = n - tau;
    for (let i = 0; i < lim; i++) {
      const a = x[i];
      const b = x[i + tau];
      acf += a * b;
      m += a * a + b * b;
    }
    nsdf[tau] = m > 0 ? (2 * acf) / m : 0;
  }

  // Peak picking: find positive-going zero crossings after lag 0, take the
  // highest local max within each positive region; choose the first peak
  // that is above k * (global max) to avoid octave errors.
  const peaks: { tau: number; val: number }[] = [];
  let tau = 1;
  while (tau < maxLag && nsdf[tau] > 0) tau++; // skip initial lobe
  while (tau < maxLag) {
    while (tau < maxLag && nsdf[tau] <= 0) tau++;
    let best = -1;
    let bestVal = -Infinity;
    while (tau < maxLag && nsdf[tau] > 0) {
      if (nsdf[tau] > bestVal) {
        bestVal = nsdf[tau];
        best = tau;
      }
      tau++;
    }
    if (best >= minLag) peaks.push({ tau: best, val: bestVal });
  }
  if (peaks.length === 0) return { status: 'aperiodic', hz: NaN, clarity: 0 };
  let globalMax = -Infinity;
  for (const p of peaks) if (p.val > globalMax) globalMax = p.val;
  const threshold = 0.93 * globalMax;
  const chosen = peaks.find((p) => p.val >= threshold) ?? peaks[0];
  const clarity = chosen.val;
  if (clarity < MIN_CLARITY) return { status: 'aperiodic', hz: NaN, clarity };
  // Parabolic interpolation around the chosen lag.
  const t = chosen.tau;
  let refined = t;
  if (t > 0 && t < maxLag) {
    const a = nsdf[t - 1];
    const b = nsdf[t];
    const c = nsdf[t + 1];
    const denom = a - 2 * b + c;
    if (denom !== 0) refined = t + (0.5 * (a - c)) / denom;
  }
  const hz = sampleRate / refined;
  if (!Number.isFinite(hz) || hz < PITCH_MIN_HZ || hz > PITCH_MAX_HZ) {
    return { status: 'aperiodic', hz: NaN, clarity };
  }
  return { status: 'ok', hz, clarity };
}

export function measure(block: Float32Array, sampleRate: number): Measurements {
  const level = rms(block);
  const { p2p, peakAbs } = peakToPeak(block);
  const frequency = block.length >= 256 ? estimateFrequency(block, sampleRate) : { status: 'insufficient' as const, hz: NaN, clarity: 0 };
  return {
    frequency,
    periodSeconds: frequency.status === 'ok' ? 1 / frequency.hz : NaN,
    rms: level,
    rmsDbfs: dbfs(level),
    peakToPeak: p2p,
    peakAbs,
    inputClipping: detectInputClipping(block),
    sampleRate,
    blockLength: block.length,
  };
}

/**
 * Tracks successive frequency estimates and reports 'unstable' when recent
 * confident estimates disagree by more than `tolerance` (fraction).
 */
export class FrequencyStabilizer {
  private history: number[] = [];
  private depth: number;
  private tolerance: number;
  constructor(depth = 4, tolerance = 0.04) {
    this.depth = depth;
    this.tolerance = tolerance;
  }
  reset(): void {
    this.history = [];
  }
  apply(est: FrequencyEstimate): FrequencyEstimate {
    if (est.status !== 'ok') {
      this.history = [];
      return est;
    }
    this.history.push(est.hz);
    if (this.history.length > this.depth) this.history.shift();
    if (this.history.length < 2) return { ...est, status: 'unstable' };
    let mn = Infinity;
    let mx = -Infinity;
    for (const h of this.history) {
      mn = Math.min(mn, h);
      mx = Math.max(mx, h);
    }
    if ((mx - mn) / mn > this.tolerance) return { ...est, status: 'unstable' };
    return est;
  }
}

/* ------------------------------------------------------------------ */
/* Spectrum                                                            */
/* ------------------------------------------------------------------ */

export const DEFAULT_FFT_SIZE = 4096;

export class SpectrumAnalyzer {
  readonly fftSize: number;
  private re: Float32Array;
  private im: Float32Array;
  private window: Float32Array;
  /** Coherent gain of the window (sum(w)/N). */
  private coherentGain: number;
  private mags: Float32Array;

  constructor(fftSize = DEFAULT_FFT_SIZE) {
    this.fftSize = fftSize;
    this.re = new Float32Array(fftSize);
    this.im = new Float32Array(fftSize);
    this.window = hannWindow(fftSize);
    let s = 0;
    for (let i = 0; i < fftSize; i++) s += this.window[i];
    this.coherentGain = s / fftSize;
    this.mags = new Float32Array(fftSize / 2 + 1);
  }

  /**
   * Compute a single-sided magnitude spectrum in dBFS. Normalization: a
   * full-scale sine (peak 1.0) at a bin centre reads 0 dBFS. That is,
   * mag = 2 * |X[k]| / (N * coherentGain).
   */
  analyze(block: Float32Array, sampleRate: number): SpectrumResult {
    const n = this.fftSize;
    const re = this.re;
    const im = this.im;
    const offset = Math.max(0, block.length - n);
    for (let i = 0; i < n; i++) {
      const v = i + offset < block.length ? block[i + offset] : 0;
      re[i] = v * this.window[i];
      im[i] = 0;
    }
    fft(re, im);
    const half = n / 2;
    const scale = 2 / (n * this.coherentGain);
    const mags = this.mags;
    let peakBin = -1;
    let peakMag = 0;
    for (let k = 0; k <= half; k++) {
      let m = Math.hypot(re[k], im[k]) * scale;
      if (k === 0 || k === half) m *= 0.5; // DC and Nyquist are not doubled
      mags[k] = m <= 0 ? -160 : Math.max(-160, 20 * Math.log10(m));
      if (k > 0 && k < half && m > peakMag) {
        peakMag = m;
        peakBin = k;
      }
    }
    const binHz = sampleRate / n;
    let peak: SpectrumResult['peak'] = null;
    if (peakBin > 0 && mags[peakBin] > -70) {
      // Parabolic interpolation in dB domain for sub-bin accuracy.
      const a = mags[peakBin - 1];
      const b = mags[peakBin];
      const c = mags[peakBin + 1];
      const denom = a - 2 * b + c;
      const delta = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
      peak = { hz: (peakBin + delta) * binHz, db: b - 0.25 * (a - c) * delta };
    }
    return { fftSize: n, sampleRate, binHz, magnitudesDb: mags, peak, windowName: 'hann' };
  }
}
