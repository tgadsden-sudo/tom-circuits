import { useEffect, useRef } from 'react';
import { useEngine } from './useEngine';
import { drawScope, makeEnvelope } from './scopeRenderer';
import { useMediaQuery } from './useMediaQuery';

/**
 * The waveform display. Runs its own requestAnimationFrame loop and never
 * touches React state: the engine hands it a DisplayFrame every frame.
 */
export function ScopeCanvas({ ariaLabel }: { ariaLabel: string }) {
  const engine = useEngine();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let env = makeEnvelope(4096);
    let refEnv = makeEnvelope(4096);
    let lastDraw = 0;
    const minInterval = reducedMotion ? 1000 / 12 : 0;
    let cssW = 0;
    let cssH = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      cssW = Math.max(1, Math.round(rect.width));
      cssH = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (env.min.length < cssW) {
        env = makeEnvelope(cssW);
        refEnv = makeEnvelope(cssW);
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      if (now - lastDraw < minInterval) {
        engine.frame(now); // keep acquisition/trigger logic ticking even when we skip drawing
        return;
      }
      lastDraw = now;
      const frame = engine.frame(now);
      drawScope(ctx, frame, cssW, cssH, env, refEnv);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [engine, reducedMotion]);

  return <canvas ref={canvasRef} className="scope-canvas" role="img" aria-label={ariaLabel} />;
}
