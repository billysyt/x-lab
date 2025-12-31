import Link from "next/link";
import NeuralNet from "./NeuralNet";

export default function ContactCTA({
  label,
  title,
  desc,
  cta,
  contactPath,
}: {
  label: string;
  title: string;
  desc: string;
  cta: string;
  contactPath: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-x-line bg-x-surface p-5 sm:rounded-[28px] sm:p-6 md:rounded-[32px] md:p-8">
      <NeuralNet />
      <div className="relative z-10 flex flex-col items-start justify-between gap-5 sm:gap-6 md:flex-row md:items-center">
        <div>
          <div className="text-xs uppercase tracking-[0.35em] text-x-soft">{label}</div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight sm:mt-3 sm:text-2xl md:text-3xl">
            {title}
          </h2>
          <p className="mt-2 text-xs text-x-muted sm:mt-3 sm:text-sm">{desc}</p>
        </div>
        <div className="flex flex-col gap-3">
          <Link className="btn-primary" href={contactPath}>
            {cta}
          </Link>
        </div>
      </div>
    </div>
  );
}
