import { useCallback, useEffect, useState } from 'react';
import { useAnalysis, useEngine, useEngineState } from './ui/useEngine';
import { ScopeCanvas } from './ui/ScopeCanvas';
import { SpectrumCanvas } from './ui/SpectrumCanvas';
import { SourceBadge } from './ui/SourceBadge';
import { SourcePanel, type SourceTab } from './ui/SourcePanel';
import { ScopeControls } from './ui/ScopeControls';
import { MeasurementsPanel } from './ui/MeasurementsPanel';
import { ExportPanel } from './ui/ExportPanel';
import { TryThis } from './ui/TryThis';
import { HardwareGuide } from './ui/HardwareGuide';
import { useMediaQuery } from './ui/useMediaQuery';
import { formatTime } from './ui/scopeRenderer';

const SPECTRUM_RANGES = [2000, 5000, 10000, 24000] as const;

function triggerStatusText(state: ReturnType<typeof useEngineState>): string {
  switch (state.triggerState) {
    case 'free-running':
      return 'Free-running';
    case 'triggered':
      return `Triggered (${state.settings.trigger.mode} edge)`;
    case 'waiting':
      return 'Waiting for trigger…';
    case 'no-crossing':
      return `No crossing found at level ${state.settings.trigger.level.toFixed(2)} — showing untriggered signal`;
    case 'armed':
      return 'Single: armed, waiting for trigger…';
    case 'frozen':
      return 'Frozen';
    default:
      return '';
  }
}

export default function App() {
  const engine = useEngine();
  const state = useEngineState();
  const analysis = useAnalysis();
  const narrow = useMediaQuery('(max-width: 900px)');
  const [tab, setTab] = useState<SourceTab>('demo');
  const [view, setView] = useState<'waveform' | 'spectrum'>('waveform');
  const [spectrumMax, setSpectrumMax] = useState<number>(5000);

  const onTab = useCallback(
    (t: SourceTab) => {
      setTab(t);
      if (t === 'demo') engine.selectDemo();
      else engine.selectLiveMode(t);
    },
    [engine],
  );

  // Keyboard shortcuts (not when typing in a control).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(t.tagName)) return;
      if (e.key === ' ') {
        e.preventDefault();
        engine.toggleRun();
      } else if (e.key.toLowerCase() === 's') engine.single();
      else if (e.key.toLowerCase() === 'a') engine.autoScale();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [engine]);

  const m = analysis.measurements;
  const scopeLabel = `Oscilloscope trace of ${state.sourceLabel}, ${formatTime(state.settings.timePerDiv)} per division, gain ${state.settings.gain}`;
  const showWave = !narrow || view === 'waveform';
  const showSpec = !narrow || view === 'spectrum';

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <h1>Wave Lab</h1>
          <p className="tagline">Educational audio oscilloscope. An independent companion for the Cambridge BrainBox Explorer 2 kit, not official Cambridge BrainBox software.</p>
        </div>
        <SourceBadge state={state} />
      </header>

      <main className="layout">
        <div className="plots">
          {narrow && (
            <div className="tabs view-tabs" role="tablist" aria-label="Plot view">
              <button type="button" role="tab" aria-selected={view === 'waveform'} className={`tab ${view === 'waveform' ? 'is-selected' : ''}`} onClick={() => setView('waveform')}>Waveform</button>
              <button type="button" role="tab" aria-selected={view === 'spectrum'} className={`tab ${view === 'spectrum' ? 'is-selected' : ''}`} onClick={() => setView('spectrum')}>Spectrum</button>
            </div>
          )}
          {showWave && (
            <div className="plot-block">
              <div className="plot-bar">
                <span className={`trig-state trig-${state.triggerState}`} role="status" aria-live="polite">{triggerStatusText(state)}</span>
                <span className="plot-info">{formatTime(state.settings.timePerDiv)}/div · gain ×{state.settings.gain} · {state.sampleRate} Hz</span>
              </div>
              <div className="scope-wrap">
                <ScopeCanvas ariaLabel={scopeLabel} />
              </div>
              <div className="plot-bar plot-bar-bottom">
                <span>Time (relative to trigger or window start)</span>
                <span>Vertical: normalized amplitude, full scale ±1.0</span>
              </div>
            </div>
          )}
          {showSpec && (
            <div className="plot-block">
              <div className="plot-bar">
                <span>
                  Spectrum · FFT {analysis.spectrum?.fftSize ?? 4096}, Hann window · bin {analysis.spectrum ? analysis.spectrum.binHz.toFixed(1) : '—'} Hz
                </span>
                <label className="inline-field">
                  Range
                  <select aria-label="Spectrum frequency range" value={spectrumMax} onChange={(e) => setSpectrumMax(Number(e.target.value))}>
                    {SPECTRUM_RANGES.map((r) => (
                      <option key={r} value={r}>{r >= state.sampleRate / 2 ? `to Nyquist (${state.sampleRate / 2} Hz)` : `0–${r / 1000} kHz`}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="spectrum-wrap">
                <SpectrumCanvas maxHz={Math.min(spectrumMax, state.sampleRate / 2)} ariaLabel="Frequency spectrum in dBFS" />
              </div>
              <p className="hint plot-hint">0 dBFS = a full-scale sine. The marked peak is the strongest frequency component, which is not always the fundamental pitch.</p>
            </div>
          )}
        </div>

        <aside className="controls">
          <SourcePanel engine={engine} state={state} tab={tab} onTab={onTab} />
          <ScopeControls engine={engine} state={state} />
          <MeasurementsPanel state={state} m={m} spectrum={analysis.spectrum} />
          <ExportPanel engine={engine} state={state} />
        </aside>
      </main>

      <section className="lower">
        <TryThis engine={engine} onShowSource={setTab} onView={setView} />
        <HardwareGuide />
      </section>

      <footer className="app-footer">
        <p>
          Wave Lab processes all audio locally in your browser. No audio is uploaded, analysed remotely or recorded. Readings are normalized digital amplitude and dBFS; nothing is calibrated to volts.
          Keyboard: Space = run/freeze, S = single, A = auto-scale.
        </p>
      </footer>
    </div>
  );
}
