"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  r: number;
  a: number;
  tw: number;
  vx: number;
};

const NeuralSvg = () => (
  <svg viewBox="0 0 480 240" className="h-full w-full">
    <defs>
      <linearGradient id="neural" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#74f0da" stopOpacity="0.5" />
        <stop offset="100%" stopColor="#7aa8ff" stopOpacity="0.2" />
      </linearGradient>
    </defs>
    <g stroke="url(#neural)" strokeWidth="1.1" fill="none">
      <path d="M20 160 C120 20, 240 20, 460 120" />
      <path d="M10 120 C140 240, 300 240, 470 80" />
      <path d="M30 200 C160 90, 260 120, 450 30" />
    </g>
    {Array.from({ length: 10 }).map((_, i) => (
      <circle
        key={i}
        cx={40 + i * 40}
        cy={60 + (i % 3) * 40}
        r={3}
        fill="rgba(255,255,255,0.6)"
      />
    ))}
  </svg>
);

export default function HeroVisual() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const starsRef = useRef<Star[]>([]);
  const mouseRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      const count = Math.floor((rect.width * rect.height) / 2400);
      starsRef.current = Array.from({ length: count }).map(() => ({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        r: Math.random() * 1.6 + 0.3,
        a: Math.random() * 0.6 + 0.2,
        tw: Math.random() * 2 * Math.PI,
        vx: Math.random() * 0.08 + 0.03,
      }));
    };

    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    const animate = () => {
      const rect = container.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      const stars = starsRef.current;
      for (const s of stars) {
        s.tw += 0.02;
        const alpha = s.a + Math.sin(s.tw) * 0.2;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        s.x += s.vx;
        if (s.x > rect.width + 10) {
          s.x = -10;
          s.y = Math.random() * rect.height;
        }
      }

      const mouse = mouseRef.current;
      mouse.x += (mouse.tx - mouse.x) * 0.06;
      mouse.y += (mouse.ty - mouse.y) * 0.06;
      container.style.setProperty("--px", mouse.x.toFixed(3));
      container.style.setProperty("--py", mouse.y.toFixed(3));

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    const onMove = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      mouseRef.current.tx = Math.max(-0.6, Math.min(0.6, x));
      mouseRef.current.ty = Math.max(-0.6, Math.min(0.6, y));
    };

    container.addEventListener("mousemove", onMove);

    return () => {
      ro.disconnect();
      container.removeEventListener("mousemove", onMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative h-[380px] w-full overflow-hidden mask-fade">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full mask-fade" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(116,240,218,0.15),transparent_60%)] mask-fade" />
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 animate-[orbit_28s_linear_infinite] opacity-60">
        <svg viewBox="0 0 240 240" className="h-full w-full">
          <circle cx="120" cy="120" r="88" stroke="rgba(122,168,255,0.55)" strokeWidth="1.2" fill="none" />
          <circle cx="120" cy="120" r="40" stroke="rgba(116,240,218,0.5)" strokeWidth="1.2" fill="none" />
        </svg>
      </div>
      <div className="pointer-events-none absolute left-12 top-10 h-24 w-24 animate-[floaty_6s_ease-in-out_infinite] rounded-full border border-white/10 bg-white/5" />
      <div
        className="absolute inset-0 mask-fade"
        style={{
          transform: "translate3d(calc(var(--px,0) * 14px), calc(var(--py,0) * 14px), 0)",
        }}
      >
        <Image
          src="/space-hero.svg"
          alt="Space AI visual"
          fill
          className="object-cover opacity-75"
          priority
        />
      </div>
      <div className="pointer-events-none absolute left-10 top-1/2 h-28 w-56 -translate-y-1/2 opacity-60">
        <NeuralSvg />
      </div>
      <div className="pointer-events-none absolute right-6 bottom-8 h-32 w-48 opacity-70">
        <NeuralSvg />
      </div>
      <div className="pointer-events-none absolute left-1/2 top-0 h-28 w-1 bg-gradient-to-b from-x-accent/40 to-transparent animate-[scan_6s_linear_infinite]" />
    </div>
  );
}
