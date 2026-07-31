import { ShieldCheck } from "lucide-react";

export function VerifiedOwnerBadge() {
  return (
    <span className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold leading-tight text-blue-700">
      <ShieldCheck size={14} strokeWidth={2.4} />
      Proprietario verificato
    </span>
  );
}
