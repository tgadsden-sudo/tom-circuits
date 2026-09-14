import { EXPERIMENTS, type Experiment } from '../content/experiments';
import type { ScopeEngine } from '../engine/scopeEngine';
import type { SourceTab } from './SourcePanel';

export function TryThis({ engine, onShowSource, onView }: { engine: ScopeEngine; onShowSource: (t: SourceTab) => void; onView: (v: 'waveform' | 'spectrum') => void }) {
  const apply = (x: Experiment) => {
    const s = x.setup;
    if (!s) return;
    if (s.showSource === 'demo') {
      engine.selectDemo();
      if (s.demo) engine.setDemoParams(s.demo);
    } else if (s.showSource === 'microphone') {
      // Only shows the tab; the user must press Connect themselves.
      engine.selectLiveMode('microphone');
    }
    if (s.timePerDiv) engine.setTimePerDiv(s.timePerDiv);
    if (s.gain) engine.setGain(s.gain);
    if (s.triggerMode) engine.setTrigger({ mode: s.triggerMode });
    if (s.showSource) onShowSource(s.showSource);
    if (s.view) onView(s.view);
    engine.run();
  };
  return (
    <section className="panel" aria-labelledby="try-heading">
      <h2 id="try-heading">Try this</h2>
      <ol className="experiments">
        {EXPERIMENTS.map((x) => (
          <li key={x.id}>
            <details>
              <summary>{x.title}</summary>
              <p><strong>Do:</strong> {x.action}</p>
              <p><strong>Look for:</strong> {x.lookFor}</p>
              <p><strong>Why:</strong> {x.why}</p>
              {x.setup && <button type="button" className="btn btn-small" onClick={() => apply(x)}>{x.buttonLabel}</button>}
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}
