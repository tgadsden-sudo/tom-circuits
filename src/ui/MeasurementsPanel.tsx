import type { EngineState } from '../engine/scopeEngine';
import { formatHz } from '../signal/generator';
import type { Measurements, SpectrumResult } from '../signal/types';
import { formatTime } from './scopeRenderer';

const DASH = '—';

function freqText(m: Measurements): { value: string; note: string } {
  const f = m.frequency;
  switch (f.status) {
    case 'ok':
      return { value: formatHz(f.hz), note: `periodic, clarity ${(f.clarity * 100).toFixed(0)}%` };
    case 'silent':
      return { value: DASH, note: 'insufficient signal (below −60 dBFS)' };
    case 'insufficient':
      return { value: DASH, note: 'insufficient samples' };
    case 'unstable':
      return { value: 'unstable', note: 'pitch is changing or not yet steady' };
    case 'aperiodic':
    default:
      return { value: DASH, note: 'no clear repeating pattern (noise or complex sound)' };
  }
}

export function MeasurementsPanel({ state, m, spectrum }: { state: EngineState; m: Measurements | null; spectrum: SpectrumResult | null }) {
  const f = m ? freqText(m) : { value: DASH, note: 'waiting for data' };
  const frozen = state.runMode === 'frozen';
  return (
    <section className="panel" aria-labelledby="meas-heading">
      <h2 id="meas-heading">Measurements {frozen && <span className="tag">frozen capture</span>}</h2>
      <dl className="measurements">
        <div>
          <dt>Frequency (fundamental)</dt>
          <dd className="big">{f.value}</dd>
          <dd className="note">{f.note}</dd>
        </div>
        <div>
          <dt>Period</dt>
          <dd className="big">{m && m.frequency.status === 'ok' ? formatTime(m.periodSeconds) : DASH}</dd>
        </div>
        <div>
          <dt>RMS amplitude</dt>
          <dd className="big">{m ? m.rms.toFixed(3) : DASH}</dd>
          <dd className="note">{m && Number.isFinite(m.rmsDbfs) ? `${m.rmsDbfs.toFixed(1)} dBFS` : 'silence'}</dd>
        </div>
        <div>
          <dt>Peak-to-peak</dt>
          <dd className="big">{m ? m.peakToPeak.toFixed(3) : DASH}</dd>
          <dd className="note">normalized full scale (max 2.0)</dd>
        </div>
        <div>
          <dt>Dominant spectral peak</dt>
          <dd className="big">{spectrum?.peak ? formatHz(spectrum.peak.hz) : DASH}</dd>
          <dd className="note">{spectrum?.peak ? `${spectrum.peak.db.toFixed(0)} dBFS — strongest component, not necessarily the pitch` : 'below −70 dBFS'}</dd>
        </div>
        <div>
          <dt>Sample rate</dt>
          <dd className="big">{state.sampleRate} Hz</dd>
          <dd className="note">{m ? `${m.blockLength}-sample analysis block` : ''}</dd>
        </div>
        <div>
          <dt>Input clipping</dt>
          <dd className={`big ${m?.inputClipping ? 'is-bad' : ''}`}>{m ? (m.inputClipping ? '▲ YES' : 'no') : DASH}</dd>
          <dd className="note">samples at full scale (not the same as the trace leaving the screen)</dd>
        </div>
      </dl>
      <p className="hint">Amplitudes are normalized digital values (1.0 = full scale), not volts or sound-pressure decibels. Frequency uses a periodicity method (NSDF) with confidence gating.</p>
    </section>
  );
}
