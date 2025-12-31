export default function PageBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 grid-overlay opacity-20" />
      <div className="absolute -top-48 right-[-120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(122,168,255,0.35),transparent_60%)] blur-3xl" />
      <div className="absolute -left-40 top-40 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(116,240,218,0.32),transparent_60%)] blur-3xl" />
      <div className="absolute left-20 top-24 h-2 w-2 animate-[twinkle_4s_ease-in-out_infinite] rounded-full bg-white/70" />
      <div className="absolute right-40 top-64 h-1.5 w-1.5 animate-[twinkle_5s_ease-in-out_infinite] rounded-full bg-white/70" />
    </div>
  );
}
