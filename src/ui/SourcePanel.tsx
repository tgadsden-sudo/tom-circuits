import { useState } from 'react';
import type { EngineState } from '../engine/scopeEngine';
import type { ScopeEngine } from '../engine/scopeEngine';
import { WAVEFORM_LABELS } from '../signal/generator';
import type { DemoWaveform, Measurements } from '../signal/types';
import { detectAudioSupport } from '../audio/support';
import { PLAYBACK_MAX_GAIN } from '../audio/demoPlayback';
import { classifyInputLabel } from '../audio/devices';
import { LevelMeter } from './LevelMeter';

import { TAB_LABELS, type SourceTab } from './sourceTabs';
export type { SourceTab } from './sourceTabs';

interface Props {
  engine: ScopeEngine;
  state: EngineState;
  measurements: Measurements | null;
  tab: SourceTab;
  onTab: (t: SourceTab) => void;
}

const WAVEFORMS: DemoWaveform[] = ['sine', 'square', 'triangle', 'sawtooth', 'noise', 'siren'];

export function SourcePanel({ engine, state, measurements, tab, onTab }: Props) {
  return (
    <section className="panel" aria-labelledby="source-heading">
      <h2 id="source-heading">Signal source</h2>
      <div className="tabs" role="tablist" aria-label="Input mode">
        {(['demo', 'microphone', 'external'] as SourceTab[]).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            id={`tab-${t}`}
            aria-controls={`tabpanel-${t}`}
            className={`tab ${tab === t ? 'is-selected' : ''}`}
            onClick={() => onTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'demo' && <DemoControls engine={engine} state={state} />}
        {tab !== 'demo' && <LiveControls engine={engine} state={state} kind={tab} measurements={measurements} />}
      </div>
    </section>
  );
}

function DemoControls({ engine, state }: { engine: ScopeEngine; state: EngineState }) {
  const d = state.demo;
  const hasFrequency = d.waveform !== 'noise' && d.waveform !== 'siren';
  const support = detectAudioSupport();
  return (
    <div className="stack">
      <p className="hint">Simulated signals generated in software. These controls change the simulation only, not the BrainBox kit.</p>
      <div className="field">
        <label htmlFor="demo-waveform">Waveform</label>
        <select id="demo-waveform" value={d.waveform} onChange={(e) => engine.setDemoParams({ waveform: e.target.value as DemoWaveform })}>
          {WAVEFORMS.map((w) => (
            <option key={w} value={w}>{WAVEFORM_LABELS[w]}</option>
          ))}
        </select>
      </div>
      {hasFrequency && (
        <RangeField id="demo-freq" label="Frequency" value={d.frequency} min={20} max={5000} step={1} unit="Hz" log onChange={(v) => engine.setDemoParams({ frequency: v })} />
      )}
      <RangeField id="demo-amp" label="Amplitude (peak, full scale = 1.0)" value={d.amplitude} min={0} max={1} step={0.01} unit="" onChange={(v) => engine.setDemoParams({ amplitude: v })} />
      {d.waveform === 'square' && (
        <RangeField id="demo-duty" label="Duty cycle" value={d.dutyCycle} min={0.05} max={0.95} step={0.01} unit="" percent onChange={(v) => engine.setDemoParams({ dutyCycle: v })} />
      )}
      {d.waveform === 'siren' && (
        <>
          <RangeField id="demo-siren-low" label="Siren low" value={d.sirenLow} min={50} max={4000} step={1} unit="Hz" log onChange={(v) => engine.setDemoParams({ sirenLow: v })} />
          <RangeField id="demo-siren-high" label="Siren high" value={d.sirenHigh} min={50} max={4000} step={1} unit="Hz" log onChange={(v) => engine.setDemoParams({ sirenHigh: v })} />
          <RangeField id="demo-siren-rate" label="Sweep rate (up-and-down cycles per second)" value={d.sirenRate} min={0.1} max={4} step={0.1} unit="Hz" onChange={(v) => engine.setDemoParams({ sirenRate: v })} />
        </>
      )}
      <p className="hint">
        Square, triangle and sawtooth are band-limited: only harmonics below half the sample rate are synthesised, so nothing aliases. The small ripple at square-wave edges is genuine.
      </p>
      <div className="playback">
        {!state.playback.running ? (
          <button type="button" className="btn" disabled={!support.audioWorklet} onClick={() => void engine.startPlayback()} aria-describedby="playback-hint">
            🔈 Play sound (starts quiet)
          </button>
        ) : (
          <button type="button" className="btn btn-stop" onClick={() => engine.stopPlayback()}>
            ■ Stop sound
          </button>
        )}
        <p id="playback-hint" className="hint">
          {support.audioWorklet
            ? state.playback.running
              ? `Audible playback on at ${state.sampleRate} Hz. The trace shows exactly the samples being sent to the speaker.`
              : 'Off by default. Plays the demo signal through this device\'s speaker at low volume so you can hear what you see.'
            : 'Audible playback needs Web Audio with AudioWorklet, which this browser does not provide.'}
        </p>
        {state.playback.running && (
          <RangeField id="demo-volume" label="Playback volume" value={state.playback.volume} min={0} max={PLAYBACK_MAX_GAIN} step={0.01} unit="" percent onChange={(v) => engine.setPlaybackVolume(v)} />
        )}
      </div>
    </div>
  );
}

function LiveControls({ engine, state, kind, measurements }: { engine: ScopeEngine; state: EngineState; kind: 'microphone' | 'external'; measurements: Measurements | null }) {
  const live = state.live;
  const support = detectAudioSupport();
  const [deviceId, setDeviceId] = useState(live.deviceId);
  const [seenDeviceId, setSeenDeviceId] = useState(live.deviceId);
  if (seenDeviceId !== live.deviceId) {
    // Follow the engine's active device when it changes (derived-state pattern).
    setSeenDeviceId(live.deviceId);
    setDeviceId(live.deviceId);
  }
  const connected = live.status === 'connected' || live.status === 'muted';
  const requesting = live.status === 'requesting';
  const canTry = support.getUserMedia && support.audioWorklet && support.secureContext;
  const policyBlocked = support.microphonePolicyAllowed === false;
  const conn = live.connection;
  const isExternal = kind === 'external';

  return (
    <div className="stack">
      {kind === 'microphone' ? (
        <p className="hint">Captures sound through the air: speech, humming, whistles or the BrainBox speaker. You see the sound after the air and microphone have shaped it, not the circuit's electrical waveform.</p>
      ) : (
        <>
          <p className="hint">
            For a USB audio adapter such as the <strong>Sabrent AU-UCMA</strong> (USB-C, separate 3.5 mm sockets). Use the <strong>pink/purple microphone socket</strong>; the green socket is headphone output and is not an input.
          </p>
          <p className="hint warn">Use the kit's verified oscilloscope wiring and suitable input conditioning. This microphone input is not a general-purpose voltage probe.</p>
          {!connected && (
            <ol className="steps">
              <li>Plug the adapter into the phone <em>before</em> starting capture.</li>
              <li>Open Wave Lab directly in Safari over HTTPS (not inside another app).</li>
              <li>Tap <strong>Connect</strong> and allow microphone access.</li>
              <li>If the browser lists more than one input, pick the USB adapter.</li>
            </ol>
          )}
        </>
      )}
      {!support.getUserMedia && <p className="status status-error">This browser does not provide microphone access (getUserMedia). Demo mode still works.</p>}
      {support.getUserMedia && !support.secureContext && <p className="status status-error">Microphone access requires HTTPS or localhost. This page is not in a secure context.</p>}
      {support.getUserMedia && !support.audioWorklet && <p className="status status-error">This browser lacks AudioWorklet, which Wave Lab needs for live capture.</p>}
      {policyBlocked && <p className="status status-error">The page that embeds Wave Lab does not allow microphone access. Open Wave Lab in its own browser tab.</p>}
      {!policyBlocked && support.embedded && <p className="status status-warn">Wave Lab is running inside another page (an embedded preview or artifact viewer). Browsers usually refuse the microphone here without showing a prompt. Open Wave Lab at its own web address to use live input; demo mode works everywhere.</p>}

      {live.devices.length > 0 && (
        <div className="field">
          <label htmlFor="live-device">Input device</label>
          <select id="live-device" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} disabled={requesting}>
            <option value="">Default input (system-selected)</option>
            {live.devices.map((d) => (
              <option key={d.deviceId || d.label} value={d.deviceId}>
                {d.label}{classifyInputLabel(d.label) === 'external' ? ' — likely USB/external' : ''}
              </option>
            ))}
          </select>
          {isExternal && live.devices.length === 1 && <small>Only one input is exposed. iOS often routes the adapter through this single entry without naming it.</small>}
        </div>
      )}
      {live.devices.length === 0 && isExternal && (
        <p className="hint">Device names appear only after the browser grants permission. Press Connect first.</p>
      )}

      <div className="row">
        {!connected && !requesting && (
          <button type="button" className="btn btn-primary" disabled={!canTry || policyBlocked} onClick={() => void engine.connectLive({ deviceId: deviceId || undefined, preferExternal: isExternal && !deviceId })}>
            {kind === 'microphone' ? '🎤 Connect microphone' : '🔌 Connect USB input'}
          </button>
        )}
        {requesting && (
          <button type="button" className="btn" onClick={() => engine.cancelConnect()}>Cancel</button>
        )}
        {connected && (
          <>
            <button type="button" className="btn btn-stop" onClick={() => engine.disconnectLive()}>Disconnect input</button>
            {deviceId !== live.deviceId && (
              <button type="button" className="btn" onClick={() => void engine.connectLive({ deviceId: deviceId || undefined })}>Switch device</button>
            )}
          </>
        )}
        {(connected || live.status === 'disconnected' || live.status === 'no-device') && (
          <button type="button" className="btn btn-quiet" onClick={() => void engine.reconnectLive(deviceId || undefined)} title="Rescan inputs and reconnect, preferring a USB adapter">
            ↻ Reconnect / rescan
          </button>
        )}
      </div>

      <LiveStatusLine state={state} />

      {connected && conn && (
        <IdentityLine conn={conn} kind={kind} />
      )}

      {connected && state.contextState !== 'running' && state.contextState !== 'none' && (
        <div className="status status-warn">
          Audio processing is {state.contextState === 'interrupted' ? 'interrupted (a call, Siri or another app took the audio session)' : `${state.contextState} by the browser`}.{' '}
          <button type="button" className="btn btn-small" onClick={() => void engine.resumeAudio()}>Resume</button>
        </div>
      )}

      {connected && <LevelMeter m={measurements} active={live.status === 'connected'} />}

      {connected && conn && <Diagnostics conn={conn} state={state} measurements={measurements} />}

      {!connected && (
        <p className="hint">Permission is only requested when you press Connect. Audio never leaves this device and is never routed to the speakers.</p>
      )}
    </div>
  );
}

function IdentityLine({ conn, kind }: { conn: NonNullable<EngineState['live']['connection']>; kind: 'microphone' | 'external' }) {
  const id = conn.identity.identity;
  const cls = id === 'recognised-external' ? 'status-ok' : id === 'builtin' ? (kind === 'external' ? 'status-warn' : 'status-ok') : 'status-warn';
  const icon = id === 'recognised-external' ? '✓' : id === 'builtin' ? (kind === 'external' ? '△' : '✓') : '?';
  return (
    <p id="identity-line" className={`status ${cls}`}>
      <strong>{icon} {id === 'recognised-external' ? 'External adapter recognised by label' : id === 'builtin' ? 'Built-in microphone' : 'External adapter not confirmed'}</strong>
      {' — '}
      {conn.identity.reason}
      {kind === 'external' && id !== 'recognised-external' && ' If the adapter was plugged in after capture started, use Reconnect / rescan.'}
    </p>
  );
}

function Diagnostics({ conn, state, measurements }: { conn: NonNullable<EngineState['live']['connection']>; state: EngineState; measurements: Measurements | null }) {
  const s = conn.settings as MediaTrackSettings & Record<string, unknown>;
  const show = (v: unknown) => (v === undefined || v === null || v === '' ? 'not exposed' : String(v));
  const level = measurements && Number.isFinite(measurements.rmsDbfs) ? `${measurements.rmsDbfs.toFixed(1)} dBFS RMS, peak ${measurements.peakAbs.toFixed(3)}` : 'silence / no data';
  return (
    <details className="details" id="diagnostics">
      <summary>Diagnostics</summary>
      <dl className="diag">
        <dt>Input label</dt><dd>{conn.trackLabel || 'not exposed'}</dd>
        <dt>Source identity</dt><dd>{conn.identity.identity === 'recognised-external' ? 'recognised as external by label (model not confirmed)' : conn.identity.identity === 'builtin' ? 'built-in microphone' : 'unverified'}</dd>
        <dt>Device id</dt><dd className="mono">{conn.deviceId ? `${conn.deviceId.slice(0, 12)}…` : 'not exposed'}</dd>
        <dt>Inputs enumerated</dt><dd>{conn.inputCount}</dd>
        <dt>Capture sample rate (track)</dt><dd>{conn.captureSampleRate ? `${conn.captureSampleRate} Hz` : 'not exposed'}</dd>
        <dt>Processing sample rate (AudioContext)</dt><dd>{conn.sampleRate} Hz — analysis uses this</dd>
        <dt>AudioContext state</dt><dd>{state.contextState}</dd>
        <dt>Sample size (track)</dt><dd>{conn.sampleSize ? `${conn.sampleSize}-bit reported; delivered to the app as 32-bit float` : 'not exposed (the adapter\'s advertised 24-bit is not confirmed by the browser)'}</dd>
        <dt>Channel count</dt><dd>{conn.channelCount ?? 'not exposed'}{conn.channelCount ? ' (channel 0 is analysed)' : ''}</dd>
        <dt>Echo cancellation</dt><dd>{show(s.echoCancellation)}</dd>
        <dt>Noise suppression</dt><dd>{show(s.noiseSuppression)}</dd>
        <dt>Auto gain control</dt><dd>{show(s.autoGainControl)}</dd>
        <dt>Latency (track)</dt><dd>{typeof s.latency === 'number' ? `${(s.latency * 1000).toFixed(1)} ms` : 'not exposed'}</dd>
        <dt>Signal level</dt><dd>{level}</dd>
        <dt>Digital clipping</dt><dd>{measurements?.inputClipping ? 'YES — samples at full scale' : 'none detected (advisory: analogue overload can occur earlier)'}</dd>
        <dt>Track status</dt><dd>{state.live.status}</dd>
      </dl>
      <p className="hint">Requested: mono, no echo cancellation, noise suppression or automatic gain. Values above are what the browser reports it applied; unsupported requests are ignored rather than blocking capture. Audio stays on this device.</p>
    </details>
  );
}

function LiveStatusLine({ state }: { state: EngineState }) {
  const { status, detail } = state.live;
  const map: Record<string, { cls: string; text: string }> = {
    idle: { cls: 'status-idle', text: detail || 'Not connected.' },
    requesting: { cls: 'status-warn', text: 'Requesting access… (waiting for the browser permission prompt)' },
    connected: { cls: 'status-ok', text: `Connected: ${detail}` },
    muted: { cls: 'status-warn', text: `Paused: ${detail}` },
    denied: { cls: 'status-error', text: detail },
    'no-device': { cls: 'status-error', text: detail },
    disconnected: { cls: 'status-error', text: detail },
    error: { cls: 'status-error', text: `Could not connect: ${detail}` },
    cancelled: { cls: 'status-idle', text: 'Connection cancelled. Nothing is capturing.' },
  };
  const m = map[status] ?? map.idle;
  return <p id="live-status" className={`status ${m.cls}`} role="status" aria-live="polite">{m.text}</p>;
}

export function RangeField({
  id, label, value, min, max, step, unit, onChange, log, percent,
}: {
  id: string; label: string; value: number; min: number; max: number; step: number; unit: string;
  onChange: (v: number) => void; log?: boolean; percent?: boolean;
}) {
  // Log sliders map 0..1000 to min..max exponentially.
  const toSlider = (v: number) => (log ? (1000 * Math.log(v / min)) / Math.log(max / min) : v);
  const fromSlider = (s: number) => (log ? min * Math.pow(max / min, s / 1000) : s);
  const shown = percent ? `${Math.round(value * 100)}%` : `${log ? Math.round(value) : value}${unit ? ` ${unit}` : ''}`;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} <output htmlFor={id}>{shown}</output>
      </label>
      <div className="range-row">
        <input
          id={id}
          type="range"
          min={log ? 0 : min}
          max={log ? 1000 : max}
          step={log ? 1 : step}
          value={toSlider(value)}
          onChange={(e) => onChange(Math.round(fromSlider(Number(e.target.value)) * 1000) / 1000)}
        />
        {log && (
          <input
            type="number"
            aria-label={`${label} value`}
            min={min}
            max={max}
            step={step}
            value={Math.round(value)}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= min && v <= max) onChange(v);
            }}
          />
        )}
      </div>
    </div>
  );
}
