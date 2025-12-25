"use client";

import { useEffect, useRef } from "react";

export default function Waveform() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const phaseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const { width, height } = rect;
      ctx.clearRect(0, 0, width, height);
      const mid = height / 2;
      ctx.strokeStyle = "rgba(116,240,218,0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const phase = phaseRef.current;
      for (let x = 0; x <= width; x += 4) {
        const t = (x / width) * Math.PI * 2;
        const y =
          mid +
          Math.sin(t * 2 + phase) * 12 +
          Math.sin(t * 5 + phase * 1.4) * 6;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      phaseRef.current += 0.02;
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return <canvas ref={canvasRef} className="h-16 w-full" aria-hidden />;
}
