import { useState } from 'react';
import type { EngineState, ScopeEngine } from '../engine/scopeEngine';
import { captureToCsv } from '../signal/exportCsv';
import { downloadBlob, renderScopePng } from './exportPng';

export function ExportPanel({ engine, state }: { engine: ScopeEngine; state: EngineState }) {
  const frozen = state.frozen;
  const [busy, setBusy] = useState(false);
  const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  const exportCsv = () => {
    if (!frozen) return;
    const csv = captureToCsv(frozen, state.settings.trigger, { app: 'Wave Lab', display_gain: `${state.settings.gain}` });
    downloadBlob(new Blob([csv], { type: 'text/csv' }), `wavelab-${frozen.meta.source}-${stamp()}.csv`);
  };
  const exportPng = async () => {
    if (!frozen) return;
    setBusy(true);
    try {
      const blob = await renderScopePng(
        {
          samples: frozen.samples,
          start: frozen.windowStart,
          length: frozen.windowLength,
          triggerIndex: frozen.triggerIndex,
          sampleRate: frozen.sampleRate,
          timePerDiv: state.settings.timePerDiv,
          gain: state.settings.gain,
          trigger: state.settings.trigger,
          triggerState: 'frozen',
          frozen: true,
          filling: false,
          sourceLabel: frozen.meta.sourceLabel,
          reference: state.reference,
          inputClipping: false,
        },
        frozen.meta.capturedAt,
      );
      downloadBlob(blob, `wavelab-${frozen.meta.source}-${stamp()}.png`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="export-heading">
      <h2 id="export-heading">Capture &amp; export</h2>
      <div className="row">
        <button type="button" className="btn" disabled={!frozen} onClick={exportCsv}>⬇ CSV</button>
        <button type="button" className="btn" disabled={!frozen || busy} onClick={() => void exportPng()}>⬇ PNG</button>
        <button type="button" className="btn" onClick={() => engine.keepReference()}>Keep as reference</button>
        {state.reference && <button type="button" className="btn btn-quiet" onClick={() => engine.clearReference()}>Clear reference</button>}
      </div>
      <p className="hint">
        {frozen
          ? `Frozen: ${frozen.meta.sourceLabel} at ${frozen.sampleRate} Hz, ${frozen.windowLength} samples shown. CSV contains the displayed window with metadata; PNG shows the trace with labels.`
          : 'Freeze (or Single) first, then export the frozen capture. Exports always contain the actual captured samples.'}
      </p>
      {state.reference && <p className="hint">Reference trace (amber) is drawn behind the live trace for comparison.</p>}
    </section>
  );
}
