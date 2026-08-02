import { Info, ShieldCheck, Sparkles } from "lucide-react";

export function VerifiedOwnerBadge() {
  return (
    <span
      className="group relative mt-2 inline-flex max-w-full cursor-help items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold leading-tight text-blue-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
      tabIndex={0}
      role="img"
      aria-label="Lead Premium: richiesta verificata telefonicamente dal team"
      title="Richiesta verificata telefonicamente dal team"
    >
      <Sparkles size={14} strokeWidth={2.4} />
      Lead Premium
      <Info size={13} strokeWidth={2.5} aria-hidden="true" />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-max max-w-[min(18rem,calc(100vw-3rem))] rounded-lg bg-ink px-3 py-2 text-left text-[11px] font-semibold leading-4 text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        Richiesta verificata telefonicamente dal team
      </span>
    </span>
  );
}

export function StandardLeadBadge() {
  return (
    <span className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold leading-tight text-amber-700">
      <ShieldCheck size={14} strokeWidth={2.4} />
      Lead Standard
    </span>
  );
}
