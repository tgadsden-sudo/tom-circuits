import type { EngineState } from '../engine/scopeEngine';

export function SourceBadge({ state }: { state: EngineState }) {
  const kind = state.source;
  const liveConnected = kind !== 'demo' && (state.live.status === 'connected' || state.live.status === 'muted');
  const icon = kind === 'demo' ? '◐' : kind === 'microphone' ? '🎤' : '🔌';
  const kindLabel = kind === 'demo' ? 'SIMULATED' : kind === 'microphone' ? 'MICROPHONE' : 'USB AUDIO';
  const identity = state.live.connection?.identity.identity;
  const status =
    kind === 'demo'
      ? state.playback.running ? 'audible' : 'silent'
      : state.live.status === 'muted'
        ? 'paused'
        : liveConnected
          ? identity === 'recognised-external' ? 'live · external' : identity === 'builtin' ? 'live · built-in' : 'live · unverified'
          : state.live.status === 'requesting'
            ? 'requesting…'
            : 'not connected';
  return (
    <div className={`source-badge source-${kind} ${liveConnected || kind === 'demo' ? 'is-active' : 'is-inactive'}`} role="status" aria-live="polite">
      <span className="source-icon" aria-hidden="true">{icon}</span>
      <span className="source-kind">{kindLabel}</span>
      <span className="source-name">{state.sourceLabel}</span>
      <span className="source-status">{status}</span>
    </div>
  );
}
