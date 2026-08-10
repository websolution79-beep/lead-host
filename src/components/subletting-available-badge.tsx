import { KeyRound } from "lucide-react";

export function SublettingAvailableBadge() {
  return (
    <span className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border border-violet-300 bg-violet-50 px-2.5 py-1 text-xs font-extrabold uppercase leading-tight text-violet-800">
      <KeyRound size={14} strokeWidth={2.4} />
      Sublocazione disponibile
    </span>
  );
}
