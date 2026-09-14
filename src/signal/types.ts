/**
 * Core signal types shared by generation, acquisition, analysis and rendering.
 * All amplitudes are normalized digital full-scale units: -1.0 .. +1.0.
 * Nothing in this app is calibrated to volts.
 */

export type SourceKind = 'demo' | 'microphone' | 'external';

export type DemoWaveform = 'sine' | 'square' | 'triangle' | 'sawtooth' | 'noise' | 'siren';

export interface DemoParams {
  waveform: DemoWaveform;
  /** Hz. Ignored for noise; siren uses sirenLow/sirenHigh. */
  frequency: number;
  /** 0..1 peak amplitude (full scale). */
  amplitude: number;
  /** 0.05..0.95 fraction, square wave only. */
  dutyCycle: number;
  /** Siren lower frequency, Hz. */
  sirenLow: number;
  /** Siren upper frequency, Hz. */
  sirenHigh: number;
  /** Siren sweep rate, Hz (full up-and-down cycles per second). */
  sirenRate: number;
}

export interface AcquisitionMeta {
  source: SourceKind;
  /** Human label, e.g. "Demo: sine 440 Hz" or the device label. */
  sourceLabel: string;
  /** Actual sample rate of the samples, Hz. */
  sampleRate: number;
  /** ISO timestamp when the capture was frozen. */
  capturedAt: string;
  /** Notes about processing that may have altered the samples. */
  notes: string[];
}

export type TriggerMode = 'free' | 'rising' | 'falling';

export interface TriggerConfig {
  mode: TriggerMode;
  /** Threshold in normalized units. */
  level: number;
  /** Hysteresis band in normalized units, applied symmetrically around level. */
  hysteresis: number;
}

export type TriggerState = 'free-running' | 'triggered' | 'waiting' | 'no-crossing' | 'armed' | 'frozen';

/**
 * A capture is an immutable snapshot of samples plus a reference index that
 * the display window is positioned against. `samples` is the full bounded
 * history at freeze time so the user can still zoom out on frozen data.
 */
export interface Capture {
  samples: Float32Array;
  sampleRate: number;
  /** Index into samples where the display window starts. */
  windowStart: number;
  /** Number of samples in the display window. */
  windowLength: number;
  /** Index into samples of the trigger point, or -1 when free running. */
  triggerIndex: number;
  meta: AcquisitionMeta;
}

export type FrequencyStatus = 'ok' | 'silent' | 'insufficient' | 'unstable' | 'aperiodic';

export interface FrequencyEstimate {
  status: FrequencyStatus;
  /** Hz, only meaningful when status === 'ok'. */
  hz: number;
  /** 0..1 periodicity clarity from the NSDF peak. */
  clarity: number;
}

export interface Measurements {
  frequency: FrequencyEstimate;
  /** seconds, NaN unless frequency.status === 'ok' */
  periodSeconds: number;
  /** normalized RMS (0..1) */
  rms: number;
  /** normalized dBFS of the RMS value, -Infinity for silence */
  rmsDbfs: number;
  /** normalized peak-to-peak (0..2) */
  peakToPeak: number;
  /** Highest absolute sample value in the analysed block. */
  peakAbs: number;
  /** True when samples sit at/near full scale — the input itself is clipping. */
  inputClipping: boolean;
  sampleRate: number;
  /** Number of samples analysed. */
  blockLength: number;
}

export interface SpectrumResult {
  /** FFT size actually used. */
  fftSize: number;
  sampleRate: number;
  /** Hz per bin. */
  binHz: number;
  /** Magnitude in dBFS for bins 0..fftSize/2. A full-scale sine reads ~0 dBFS. */
  magnitudesDb: Float32Array;
  /** Dominant peak (parabolic-interpolated) or null when below the noise floor. */
  peak: { hz: number; db: number } | null;
  windowName: 'hann';
}
