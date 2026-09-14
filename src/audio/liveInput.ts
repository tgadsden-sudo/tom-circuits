import { ensureWorklets, getAudioContext } from './context';

export type LiveStatus =
  | 'idle'
  | 'requesting'
  | 'connected'
  | 'denied'
  | 'no-device'
  | 'disconnected'
  | 'error'
  | 'cancelled';

export interface LiveDevice {
  deviceId: string;
  label: string;
}

export interface LiveInputEvents {
  onBlock: (block: Float32Array) => void;
  onStatus: (status: LiveStatus, detail: string) => void;
  onDevices: (devices: LiveDevice[]) => void;
  onContextState: (state: AudioContextState) => void;
}

export interface LiveConnection {
  sampleRate: number;
  deviceLabel: string;
  deviceId: string;
  settings: MediaTrackSettings;
  /** What the browser reports it applied for the processing constraints. */
  processingNotes: string[];
}

/**
 * Owns exactly one microphone/line stream at a time. Handles cancellation of
 * a pending getUserMedia (the stream is stopped if it resolves after cancel),
 * device changes, track ending, and tidy teardown of nodes.
 */
export class LiveInputController {
  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private muteNode: GainNode | null = null;
  private attempt = 0;
  private context: AudioContext | null = null;
  private stateListener: (() => void) | null = null;
  private deviceListener: (() => void) | null = null;

  private events: LiveInputEvents;

  constructor(events: LiveInputEvents) {
    this.events = events;
  }

  get connected(): boolean {
    return !!this.stream;
  }

  async listDevices(): Promise<LiveDevice[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const all = await navigator.mediaDevices.enumerateDevices();
    const devices = all
      .filter((d) => d.kind === 'audioinput')
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Audio input ${i + 1}` }));
    this.events.onDevices(devices);
    return devices;
  }

  /**
   * Connect to a device. Resolves with connection details or null when the
   * attempt was cancelled. Errors are reported via onStatus and thrown.
   */
  async connect(deviceId?: string): Promise<LiveConnection | null> {
    const myAttempt = ++this.attempt;
    this.disconnect(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      this.events.onStatus('error', 'This browser does not expose getUserMedia, so live input is unavailable.');
      throw new Error('getUserMedia unavailable');
    }
    this.events.onStatus('requesting', 'Waiting for permission…');
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
      video: false,
    };
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      if (myAttempt !== this.attempt) return null;
      const e = err as DOMException;
      const name = e?.name || 'Error';
      if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
        this.events.onStatus('denied', describeDenied(e));
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
        this.events.onStatus('no-device', name === 'OverconstrainedError' ? 'The selected input is no longer available.' : 'No audio input device was found.');
      } else if (name === 'NotReadableError' || name === 'AbortError') {
        this.events.onStatus('error', 'The input device is busy or could not be started (another app may be using it).');
      } else {
        this.events.onStatus('error', `${name}: ${e?.message || 'unknown error'}`);
      }
      throw err;
    }
    if (myAttempt !== this.attempt) {
      // Cancelled while the permission prompt was open — release immediately.
      stream.getTracks().forEach((t) => t.stop());
      return null;
    }
    try {
      const context = await getAudioContext();
      await ensureWorklets(context);
      if (myAttempt !== this.attempt) {
        stream.getTracks().forEach((t) => t.stop());
        return null;
      }
      this.context = context;
      this.stream = stream;
      const source = context.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(context, 'wavelab-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      // Gain 0 to destination keeps the graph alive without any audio reaching
      // the speakers (the worklet also outputs silence).
      const mute = context.createGain();
      mute.gain.value = 0;
      source.connect(worklet);
      worklet.connect(mute);
      mute.connect(context.destination);
      worklet.port.onmessage = (e: MessageEvent<Float32Array>) => {
        if (this.workletNode === worklet) this.events.onBlock(e.data);
      };
      this.sourceNode = source;
      this.workletNode = worklet;
      this.muteNode = mute;

      const track = stream.getAudioTracks()[0];
      const settings = track?.getSettings?.() ?? {};
      const notes: string[] = [];
      const s = settings as MediaTrackSettings & Record<string, unknown>;
      for (const key of ['echoCancellation', 'noiseSuppression', 'autoGainControl'] as const) {
        if (typeof s[key] === 'boolean') notes.push(`${key}: ${s[key] ? 'ON (browser kept it enabled)' : 'off'}`);
        else notes.push(`${key}: not reported by browser`);
      }
      track?.addEventListener('ended', () => {
        if (this.stream === stream) {
          this.disconnect(false);
          this.events.onStatus('disconnected', 'The input device was disconnected or the track ended.');
        }
      });
      this.stateListener = () => this.events.onContextState(context.state);
      context.addEventListener('statechange', this.stateListener);
      this.events.onContextState(context.state);
      if (navigator.mediaDevices?.addEventListener) {
        this.deviceListener = () => {
          void this.listDevices();
        };
        navigator.mediaDevices.addEventListener('devicechange', this.deviceListener);
      }
      const devices = await this.listDevices();
      const label = track?.label || devices.find((d) => d.deviceId === settings.deviceId)?.label || 'Audio input';
      this.events.onStatus('connected', label);
      return {
        sampleRate: context.sampleRate,
        deviceLabel: label,
        deviceId: settings.deviceId ?? deviceId ?? '',
        settings,
        processingNotes: notes,
      };
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      this.disconnect(false);
      const e = err as Error;
      this.events.onStatus('error', e?.message || 'Could not start audio processing.');
      throw err;
    }
  }

  /** Cancel a pending connection attempt (no-op if none). */
  cancel(): void {
    this.attempt++;
    this.events.onStatus('cancelled', 'Connection attempt cancelled.');
  }

  async resumeContext(): Promise<void> {
    if (this.context && this.context.state !== 'running') {
      await this.context.resume();
    }
  }

  /** Stop tracks and tear down nodes. */
  disconnect(report = true): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      try {
        this.workletNode.disconnect();
      } catch { /* already disconnected */ }
      this.workletNode = null;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch { /* ignore */ }
      this.sourceNode = null;
    }
    if (this.muteNode) {
      try {
        this.muteNode.disconnect();
      } catch { /* ignore */ }
      this.muteNode = null;
    }
    if (this.context && this.stateListener) {
      this.context.removeEventListener('statechange', this.stateListener);
      this.stateListener = null;
    }
    if (this.deviceListener && navigator.mediaDevices?.removeEventListener) {
      navigator.mediaDevices.removeEventListener('devicechange', this.deviceListener);
      this.deviceListener = null;
    }
    this.context = null;
    if (report) this.events.onStatus('idle', 'Input released.');
  }
}

function describeDenied(e: DOMException): string {
  const msg = (e?.message || '').toLowerCase();
  if (msg.includes('permissions policy') || msg.includes('permission policy') || msg.includes('feature policy')) {
    return 'Microphone access is blocked by the embedding page. Open Wave Lab in its own browser tab.';
  }
  return 'Microphone permission was denied. Allow microphone access for this site in the browser address bar, then try again.';
}
