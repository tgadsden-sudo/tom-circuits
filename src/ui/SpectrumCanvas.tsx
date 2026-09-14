import { useEffect, useRef } from 'react';
import { useAnalysis } from './useEngine';
import { drawSpectrum } from './spectrumRenderer';

export function SpectrumCanvas({ maxHz, ariaLabel }: { maxHz: number; ariaLabel: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analysis = useAnalysis();
  const specRef = useRef(analysis.spectrum);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let cssW = 0;
    let cssH = 0;
    const draw = () => drawSpectrum(ctx, specRef.current, cssW, cssH, maxHz);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      cssW = Math.max(1, Math.round(rect.width));
      cssH = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    return () => ro.disconnect();
  }, [maxHz]);

  // Redraw whenever a new spectrum arrives (~10 Hz), not every animation frame.
  useEffect(() => {
    specRef.current = analysis.spectrum;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    drawSpectrum(ctx, analysis.spectrum, Math.round(rect.width), Math.round(rect.height), maxHz);
  }, [analysis.version, analysis.spectrum, maxHz]);

  return <canvas ref={canvasRef} className="spectrum-canvas" role="img" aria-label={ariaLabel} />;
}
