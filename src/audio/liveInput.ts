import { ensureWorklets, getAudioContext } from './context';
import { describeIdentity, pickPreferredExternal, type IdentityResult } from './devices';

export type LiveStatus =
  | 'idle'
  | 'requesting'
  | 'connected'
  | 'muted'
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
  onContextState: (state: string) => void;
}

export interface LiveConnection {
  /** Processing (AudioContext) sample rate — analysis uses this. */
  sampleRate: number;
  /** Capture sample rate reported by the track, or null when not exposed. */
  captureSampleRate: number | null;
  /** Bits per sample reported by the track, or null when not exposed. */
  sampleSize: number | null;
  channelCount: number | null;
  deviceLabel: string;
  /** Raw label from the MediaStreamTrack ('' when the browser hides it). */
  trackLabel: string;
  deviceId: string;
  settings: MediaTrackSettings;
  /** What the browser reports it applied for the processing constraints. */
  processingNotes: string[];
  identity: IdentityResult;
  /** Number of audio inputs the browser enumerated after permission. */
  inputCount: number;
}

export interface ConnectOptions {
  deviceId?: string;
  /** After connecting, look for a likely USB/external device and switch to it if the active one is not. */
  preferExternal?: boolean;
}

/**
 * Owns exactly one microphone/line stream at a time. Handles cancellation of
 * a pending getUserMedia (the stream is stopped if it resolves after cancel),
 * device changes, muted/ended tracks, interrupted audio sessions and tidy
 * teardown of nodes.
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
  private lastDevices: LiveDevice[] = [];
  private muted = false;
  private events: LiveInputEvents;

  constructor(events: LiveInputEvents) {
    this.events = events;
  }

  get connected(): boolean {
    return !!this.stream;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  async listDevices(): Promise<LiveDevice[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const all = await navigator.mediaDevices.enumerateDevices();
    const devices = all
      .filter((d) => d.kind === 'audioinput')
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Audio input ${i + 1} (label not exposed)` }));
    this.lastDevices = devices;
    this.events.onDevices(devices);
    return devices;
  }

  /**
   * Connect to a device. Resolves with connection details or null when the
   * attempt was cancelled. Errors are reported via onStatus and thrown.
   */
  async connect(opts: ConnectOptions = {}): Promise<LiveConnection | null> {
    const myAttempt = ++this.attempt;
    this.disconnect(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      this.events.onStatus('error', 'This browser does not expose getUserMedia, so live input is unavailable.');
      throw new Error('getUserMedia unavailable');
    }
    this.events.onStatus('requesting', 'Waiting for permission…');
    const stream = await this.openStream(opts.deviceId, myAttempt);
    if (!stream) return null;
    let conn: LiveConnection;
    try {
      conn = await this.attach(stream, myAttempt, opts.deviceId);
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      this.disconnect(false);
      const e = err as Error;
      this.events.onStatus('error', e?.message || 'Could not start audio processing.');
      throw err;
    }
    if (opts.preferExternal && conn.identity.identity !== 'recognised-external') {
      const preferred = pickPreferredExternal(this.lastDevices);
      if (preferred && preferred.deviceId && preferred.deviceId !== conn.deviceId) {
        // Permission is granted now, so labels are visible: switch to the likely adapter.
        if (myAttempt !== this.attempt) return null;
        this.disconnect(false);
        const s2 = await this.openStream(preferred.deviceId, myAttempt);
        if (!s2) return null;
        try {
          conn = await this.attach(s2, myAttempt, preferred.deviceId);
        } catch (err) {
          s2.getTracks().forEach((t) => t.stop());
          this.disconnect(false);
          this.events.onStatus('error', `Could not switch to ${preferred.label}: ${(err as Error)?.message ?? 'unknown error'}`);
          throw err;
        }
      }
    }
    if (myAttempt !== this.attempt) return null;
    this.events.onStatus('connected', conn.identity.label);
    return conn;
  }

  /** Re-enumerate devices and reconnect, preferring a likely external adapter. */
  async reconnect(deviceId?: string): Promise<LiveConnection | null> {
    return this.connect({ deviceId, preferExternal: !deviceId });
  }

  private async openStream(deviceId: string | undefined, myAttempt: number): Promise<MediaStream | null> {
    const constraints: MediaStreamConstraints = {
      audio: {
        // Requested, not guaranteed: browsers ignore what they cannot honour.
        channelCount: { ideal: 1 },
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
        this.events.onStatus('no-device', name === 'OverconstrainedError' ? 'The selected input is no longer available. Reconnect to rescan.' : 'No audio input device was found. Connect the adapter first, then try again.');
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
    return stream;
  }

  private async attach(stream: MediaStream, myAttempt: number, requestedDeviceId?: string): Promise<LiveConnection> {
    const context = await getAudioContext();
    await ensureWorklets(context);
    if (myAttempt !== this.attempt) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('cancelled');
    }
    this.context = context;
    this.stream = stream;
    this.muted = false;
    const source = context.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(context, 'wavelab-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    // Gain 0 to destination keeps the graph alive without any audio reaching
    // the speakers (the worklet also outputs silence). Never monitor the input.
    const mute = context.createGain();
    mute.gain.value = 0;
    source.connect(worklet);
    worklet.connect(mute);
    mute.connect(context.destination);
    worklet.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (this.workletNode === worklet && !this.muted) this.events.onBlock(e.data);
    };
    this.sourceNode = source;
    this.workletNode = worklet;
    this.muteNode = mute;

    const track = stream.getAudioTracks()[0];
    const settings = (track?.getSettings?.() ?? {}) as MediaTrackSettings & Record<string, unknown>;
    const notes: string[] = [];
    for (const key of ['echoCancellation', 'noiseSuppression', 'autoGainControl'] as const) {
      if (typeof settings[key] === 'boolean') notes.push(`${key}: ${settings[key] ? 'ON (browser kept it enabled)' : 'off'}`);
      else notes.push(`${key}: not reported by browser`);
    }
    if (track) {
      track.addEventListener('ended', () => {
        if (this.stream === stream) {
          this.disconnect(false);
          this.events.onStatus('disconnected', 'The input ended — the adapter was unplugged or the system took the device. Reconnect to resume.');
        }
      });
      track.addEventListener('mute', () => {
        if (this.stream === stream) {
          this.muted = true;
          this.events.onStatus('muted', 'The input is muted by the system (device removed, audio session interrupted, or another app took it). Capture is paused; no samples are being shown.');
        }
      });
      track.addEventListener('unmute', () => {
        if (this.stream === stream) {
          this.muted = false;
          this.events.onStatus('connected', this.currentIdentityLabel ?? '');
        }
      });
      if (track.muted) {
        this.muted = true;
      }
    }
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
    const deviceId = settings.deviceId ?? requestedDeviceId ?? '';
    const listed = devices.find((d) => d.deviceId === deviceId)?.label ?? '';
    const trackLabel = track?.label ?? '';
    const identity = describeIdentity(trackLabel, listed.includes('label not exposed') ? '' : listed, devices.length);
    this.currentIdentityLabel = identity.label;
    if (this.muted) {
      this.events.onStatus('muted', 'The input is currently muted by the system. Waiting for audio…');
    }
    return {
      sampleRate: context.sampleRate,
      captureSampleRate: typeof settings.sampleRate === 'number' ? settings.sampleRate : null,
      sampleSize: typeof settings.sampleSize === 'number' ? settings.sampleSize : null,
      channelCount: typeof settings.channelCount === 'number' ? settings.channelCount : null,
      deviceLabel: identity.label,
      trackLabel,
      deviceId,
      settings,
      processingNotes: notes,
      identity,
      inputCount: devices.length,
    };
  }

  private currentIdentityLabel: string | null = null;

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
    this.muted = false;
    this.currentIdentityLabel = null;
    if (report) this.events.onStatus('idle', 'Input released.');
  }
}

function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function describeDenied(e: DOMException): string {
  const msg = (e?.message || '').toLowerCase();
  if (msg.includes('permissions policy') || msg.includes('permission policy') || msg.includes('feature policy')) {
    return 'Microphone access is blocked by the embedding page. Open Wave Lab at its own web address in a browser tab.';
  }
  if (isEmbedded()) {
    return 'Microphone permission was denied without a prompt because Wave Lab is embedded inside another page (for example a preview or artifact viewer). Browsers only allow the microphone in an embedded page if the host page permits it, and this one does not. Open Wave Lab at its own web address (see the README for GitHub Pages hosting) and try again.';
  }
  return 'Microphone permission was denied. Allow the microphone for this site (iOS Safari: tap "aA" in the address bar → Website Settings → Microphone → Allow, and check Settings → Safari → Microphone is not "Deny"), then try again.';
}
