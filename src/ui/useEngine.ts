import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { ScopeEngine, type AnalysisSnapshot, type EngineState } from '../engine/scopeEngine';

let engine: ScopeEngine | null = null;
export function getEngine(): ScopeEngine {
  if (!engine) engine = new ScopeEngine();
  return engine;
}

export function useEngine(): ScopeEngine {
  const e = useMemo(() => getEngine(), []);
  useEffect(() => {
    const onUnload = () => e.dispose();
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, [e]);
  return e;
}

export function useEngineState(): EngineState {
  const e = getEngine();
  return useSyncExternalStore(
    (l) => e.subscribe(l),
    () => e.getState(),
    () => e.getState(),
  );
}

export function useAnalysis(): AnalysisSnapshot {
  const e = getEngine();
  return useSyncExternalStore(
    (l) => e.subscribeAnalysis(l),
    () => e.getAnalysis(),
    () => e.getAnalysis(),
  );
}
