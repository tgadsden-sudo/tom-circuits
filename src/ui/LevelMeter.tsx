import type { Measurements } from '../signal/types';

const MIN_DB = -60;

/**
 * Input level meter driven by the ~10 Hz analysis results (RMS in dBFS,
 * peak, and the advisory digital-clipping flag). No per-frame React state.
 */
export function LevelMeter({ m, active }: { m: Measurements | null; active: boolean }) {
  const rmsDb = m && Number.isFinite(m.rmsDbfs) ? m.rmsDbfs : MIN_DB;
  const peakDb = m && m.peakAbs > 0 ? 20 * Math.log10(m.peakAbs) : MIN_DB;
  const pct = (db: number) => Math.max(0, Math.min(100, ((db - MIN_DB) / -MIN_DB) * 100));
  const clipping = !!m?.inputClipping;
  const hot = peakDb > -3;
  return (
    <div className="meter" role="group" aria-label="Input level">
      <div className="meter-row">
        <span className="meter-label">Level</span>
        <div
          className={`meter-bar ${clipping ? 'is-clip' : hot ? 'is-hot' : ''}`}
          role="meter"
          aria-valuemin={MIN_DB}
          aria-valuemax={0}
          aria-valuenow={active ? Math.round(rmsDb) : MIN_DB}
          aria-valuetext={active ? `${rmsDb.toFixed(1)} dBFS RMS` : 'no input'}
        >
          <div className="meter-fill" style={{ width: `${active ? pct(rmsDb) : 0}%` }} />
          <div className="meter-peak" style={{ left: `${active ? pct(peakDb) : 0}%` }} />
        </div>
        <span className="meter-value">{active && m ? `${rmsDb <= MIN_DB ? '< −60' : rmsDb.toFixed(1)} dBFS` : '—'}</span>
      </div>
      <div className="meter-scale" aria-hidden="true">
        <span>−60</span><span>−40</span><span>−20</span><span>0 dBFS</span>
      </div>
      {clipping && <p className="status status-error">▲ Digital clipping: samples at full scale. Reduce the signal at the source; software gain cannot undo it.</p>}
      {!clipping && active && <p className="hint">Clipping shown here is advisory: analogue overload in the adapter or lead can occur before digitisation without samples reaching full scale.</p>}
    </div>
  );
}
