import { useState } from 'react';
import type { EngineState } from '../engine/scopeEngine';
import type { ScopeEngine } from '../engine/scopeEngine';
import { WAVEFORM_LABELS } from '../signal/generator';
import type { DemoWaveform } from '../signal/types';
import { detectAudioSupport } from '../audio/support';
import { PLAYBACK_MAX_GAIN } from '../audio/demoPlayback';

export type SourceTab = 'demo' | 'microphone' | 'external';

interface Props {
  engine: ScopeEngine;
  state: EngineState;
  tab: SourceTab;
  onTab: (t: SourceTab) => void;
}

const WAVEFORMS: DemoWaveform[] = ['sine', 'square', 'triangle', 'sawtooth', 'noise', 'siren'];

export function SourcePanel({ engine, state, tab, onTab }: Props) {
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
            {t === 'demo' ? 'Demo signals' : t === 'microphone' ? 'Microphone' : 'External input'}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'demo' && <DemoControls engine={engine} state={state} />}
        {tab !== 'demo' && <LiveControls engine={engine} state={state} kind={tab} />}
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

function LiveControls({ engine, state, kind }: { engine: ScopeEngine; state: EngineState; kind: 'microphone' | 'external' }) {
  const live = state.live;
  const support = detectAudioSupport();
  const [deviceId, setDeviceId] = useState(live.deviceId);
  const [seenDeviceId, setSeenDeviceId] = useState(live.deviceId);
  if (seenDeviceId !== live.deviceId) {
    // Follow the engine's active device when it changes (derived-state pattern).
    setSeenDeviceId(live.deviceId);
    setDeviceId(live.deviceId);
  }
  const connected = live.status === 'connected';
  const requesting = live.status === 'requesting';
  const canTry = support.getUserMedia && support.audioWorklet && support.secureContext;
  const policyBlocked = support.microphonePolicyAllowed === false;

  return (
    <div className="stack">
      {kind === 'microphone' ? (
        <p className="hint">Captures sound through the air: speech, humming, whistles or the BrainBox speaker. You see the sound after the air and microphone have shaped it, not the circuit's electrical waveform.</p>
      ) : (
        <p className="hint warn">
          Selects an audio interface the browser exposes (for example a USB audio interface with a line input). <strong>Only connect circuit terminals through a verified, protected and attenuated interface.</strong> Never plug kit terminals straight into a phone or computer socket. See the Hardware guide below.
        </p>
      )}
      {!support.getUserMedia && <p className="status status-error">This browser does not provide microphone access (getUserMedia). Demo mode still works.</p>}
      {support.getUserMedia && !support.secureContext && <p className="status status-error">Microphone access requires HTTPS or localhost. This page is not in a secure context.</p>}
      {support.getUserMedia && !support.audioWorklet && <p className="status status-error">This browser lacks AudioWorklet, which Wave Lab needs for live capture.</p>}
      {policyBlocked && <p className="status status-error">The page that embeds Wave Lab does not allow microphone access. Open Wave Lab in its own browser tab.</p>}
      {!policyBlocked && support.embedded && <p className="hint">Wave Lab appears to be inside an embedded preview. If the permission prompt never appears, open the app in its own browser tab.</p>}

      {live.devices.length > 0 && (
        <div className="field">
          <label htmlFor="live-device">Input device</label>
          <select id="live-device" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} disabled={requesting}>
            <option value="">Default input</option>
            {live.devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
            ))}
          </select>
        </div>
      )}
      {live.devices.length === 0 && kind === 'external' && (
        <p className="hint">Device names appear after the browser grants permission once. Press Connect, then choose the interface.</p>
      )}

      <div className="row">
        {!connected && !requesting && (
          <button type="button" className="btn btn-primary" disabled={!canTry || policyBlocked} onClick={() => void engine.connectLive(deviceId || undefined)}>
            {kind === 'microphone' ? '🎤 Connect microphone' : '🔌 Connect input'}
          </button>
        )}
        {requesting && (
          <button type="button" className="btn" onClick={() => engine.cancelConnect()}>Cancel</button>
        )}
        {connected && (
          <>
            <button type="button" className="btn btn-stop" onClick={() => engine.disconnectLive()}>Disconnect input</button>
            {live.devices.length > 1 && deviceId !== live.deviceId && (
              <button type="button" className="btn" onClick={() => void engine.connectLive(deviceId || undefined)}>Switch device</button>
            )}
          </>
        )}
        {connected && <button type="button" className="btn btn-quiet" onClick={() => void engine.refreshDevices()}>Refresh devices</button>}
      </div>

      <LiveStatusLine state={state} />

      {connected && state.contextState === 'suspended' && (
        <div className="status status-warn">
          Audio processing is paused by the browser.{' '}
          <button type="button" className="btn btn-small" onClick={() => void engine.resumeAudio()}>Resume</button>
        </div>
      )}
      {connected && live.connection && (
        <details className="details">
          <summary>Capture details</summary>
          <ul className="plain">
            <li>Sample rate: {live.connection.sampleRate} Hz</li>
            {live.connection.processingNotes.map((n) => <li key={n}>{n}</li>)}
            <li>Wave Lab requests these off, but the browser or operating system may still process the audio.</li>
            <li>Audio stays on this device. Nothing is uploaded or recorded.</li>
          </ul>
        </details>
      )}
      {!connected && (
        <p className="hint">Permission is only requested when you press Connect. Audio never leaves this device and is never routed to the speakers.</p>
      )}
    </div>
  );
}

function LiveStatusLine({ state }: { state: EngineState }) {
  const { status, detail } = state.live;
  const map: Record<string, { cls: string; text: string }> = {
    idle: { cls: 'status-idle', text: detail || 'Not connected.' },
    requesting: { cls: 'status-warn', text: 'Requesting access… (waiting for the browser permission prompt)' },
    connected: { cls: 'status-ok', text: `Connected: ${detail}` },
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
