import { GAIN_OPTIONS, TIME_PER_DIV_OPTIONS, type EngineState, type ScopeEngine } from '../engine/scopeEngine';
import type { TriggerMode } from '../signal/types';
import { formatTime } from './scopeRenderer';

export function ScopeControls({ engine, state }: { engine: ScopeEngine; state: EngineState }) {
  const s = state.settings;
  const frozen = state.runMode === 'frozen';
  return (
    <section className="panel" aria-labelledby="scope-heading">
      <h2 id="scope-heading">Oscilloscope</h2>
      <div className="row">
        <button type="button" className={`btn ${frozen ? 'btn-primary' : ''}`} onClick={() => engine.toggleRun()} aria-pressed={!frozen}>
          {frozen ? '▶ Run' : '⏸ Freeze'}
        </button>
        <button type="button" className={`btn ${state.runMode === 'single' ? 'btn-armed' : ''}`} onClick={() => engine.single()} aria-pressed={state.runMode === 'single'}>
          ◎ Single
        </button>
        <button type="button" className="btn" onClick={() => engine.autoScale()}>Auto-scale</button>
        <button type="button" className="btn btn-quiet" onClick={() => engine.resetDefaults()}>Reset</button>
      </div>
      <p className="hint">Single arms a capture that freezes on the next qualifying trigger (or the next full window when free-running).</p>
      <div className="grid2">
        <div className="field">
          <label htmlFor="time-div">Time / division</label>
          <select id="time-div" value={s.timePerDiv} onChange={(e) => engine.setTimePerDiv(Number(e.target.value))}>
            {TIME_PER_DIV_OPTIONS.map((t) => (
              <option key={t} value={t}>{formatTime(t)}</option>
            ))}
          </select>
          <small>Window: {formatTime(s.timePerDiv * 10)} = {Math.round(s.timePerDiv * 10 * state.sampleRate)} samples at {state.sampleRate} Hz</small>
        </div>
        <div className="field">
          <label htmlFor="gain">Display gain</label>
          <select id="gain" value={s.gain} onChange={(e) => engine.setGain(Number(e.target.value))}>
            {GAIN_OPTIONS.map((g) => (
              <option key={g} value={g}>×{g} (±{(1 / g).toPrecision(2)} full scale)</option>
            ))}
          </select>
          <small>{(0.25 / s.gain).toPrecision(2)} per division. Changes the view only, never the samples or readings.</small>
        </div>
        <div className="field">
          <label htmlFor="trigger-mode">Trigger</label>
          <select id="trigger-mode" value={s.trigger.mode} onChange={(e) => engine.setTrigger({ mode: e.target.value as TriggerMode })}>
            <option value="free">Free-running</option>
            <option value="rising">Rising edge</option>
            <option value="falling">Falling edge</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="trigger-level">
            Trigger level <output htmlFor="trigger-level">{s.trigger.level.toFixed(2)}</output>
          </label>
          <input
            id="trigger-level"
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={s.trigger.level}
            disabled={s.trigger.mode === 'free'}
            onChange={(e) => engine.setTrigger({ level: Number(e.target.value) })}
          />
          <small>Normalized units. Hysteresis ±{s.trigger.hysteresis}.</small>
        </div>
      </div>
    </section>
  );
}
