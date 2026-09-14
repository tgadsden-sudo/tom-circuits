import { HARDWARE_MODES, SAFETY_WARNING } from '../content/hardware';

export function HardwareGuide() {
  return (
    <section className="panel" aria-labelledby="hw-heading" id="hardware">
      <h2 id="hw-heading">Hardware &amp; connection guide</h2>
      <p className="status status-error"><strong>⚠ {SAFETY_WARNING}</strong></p>
      <div className="hw-grid">
        {HARDWARE_MODES.map((m) => (
          <article key={m.title} className={`hw-mode hw-${m.supported}`}>
            <h3>
              <span className="tag">{m.supported === 'yes' ? '✓ supported' : m.supported === 'conditional' ? '△ conditional' : '✕ not supported'}</span> {m.title}
            </h3>
            <p><strong>Needs:</strong></p>
            <ul>{m.needs.map((n) => <li key={n}>{n}</li>)}</ul>
            <ul className="notes">{m.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </article>
        ))}
      </div>
      <p className="hint">
        What is known about the original "Cambridge BrainBox — Oscilloscope Programme": the manufacturer describes software that turns a computer into an oscilloscope to explore the waveforms produced by the kit's circuits. Its exact features, input connection, cable specification and electrical protection were not verified and are not reproduced here. See HARDWARE.md and RESEARCH.md in the source for details and sources.
      </p>
    </section>
  );
}
