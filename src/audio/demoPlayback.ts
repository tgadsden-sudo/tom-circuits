import type { DemoParams } from '../signal/types';
import { ensureWorklets, getAudioContext } from './context';

export const PLAYBACK_START_GAIN = 0.08;
export const PLAYBACK_MAX_GAIN = 0.5;

/**
 * Audible demo playback. The DemoProcessor worklet generates the samples that
 * are both heard (via a GainNode) and posted back for display, so the trace
 * and the sound are the same signal. Off by default; started only from a
 * user gesture.
 */
export class DemoPlayback {
  private node: AudioWorkletNode | null = null;
  private gain: GainNode | null = null;
  private context: AudioContext | null = null;
  private stateListener: (() => void) | null = null;
  private _volume = PLAYBACK_START_GAIN;

  private onBlock: (block: Float32Array) => void;
  private onContextState: (s: AudioContextState) => void;

  constructor(onBlock: (block: Float32Array) => void, onContextState: (s: AudioContextState) => void) {
    this.onBlock = onBlock;
    this.onContextState = onContextState;
  }

  get running(): boolean {
    return !!this.node;
  }

  get sampleRate(): number {
    return this.context?.sampleRate ?? 0;
  }

  get volume(): number {
    return this._volume;
  }

  async start(params: DemoParams): Promise<number> {
    if (this.node) return this.context!.sampleRate;
    const context = await getAudioContext();
    await ensureWorklets(context);
    const node = new AudioWorkletNode(context, 'wavelab-demo', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { params },
    });
    const gain = context.createGain();
    gain.gain.value = this._volume;
    node.connect(gain);
    gain.connect(context.destination);
    node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (this.node === node) this.onBlock(e.data);
    };
    this.node = node;
    this.gain = gain;
    this.context = context;
    this.stateListener = () => this.onContextState(context.state);
    context.addEventListener('statechange', this.stateListener);
    this.onContextState(context.state);
    return context.sampleRate;
  }

  setParams(params: Partial<DemoParams>): void {
    this.node?.port.postMessage({ type: 'params', params });
  }

  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(PLAYBACK_MAX_GAIN, v));
    if (this.gain && this.context) {
      this.gain.gain.setTargetAtTime(this._volume, this.context.currentTime, 0.02);
    }
  }

  async resumeContext(): Promise<void> {
    if (this.context && this.context.state !== 'running') await this.context.resume();
  }

  stop(): void {
    if (this.node) {
      this.node.port.onmessage = null;
      try {
        this.node.disconnect();
      } catch { /* ignore */ }
      this.node = null;
    }
    if (this.gain) {
      try {
        this.gain.disconnect();
      } catch { /* ignore */ }
      this.gain = null;
    }
    if (this.context && this.stateListener) {
      this.context.removeEventListener('statechange', this.stateListener);
      this.stateListener = null;
    }
    this.context = null;
  }
}
