import Link from "next/link";
import {
  ArrowRight,
  Bath,
  BedDouble,
  Crown,
  MapPin,
  Ruler,
  ShieldCheck,
} from "lucide-react";
import { PrimeCountdown } from "@/components/prime-countdown";
import { SublettingAvailableBadge } from "@/components/subletting-available-badge";
import {
  StandardLeadBadge,
  VerifiedOwnerBadge,
} from "@/components/verified-owner-badge";
import { formatCents } from "@/lib/config/commercial";
import { LEAD_EXCLUSIVE_PRICE_CENTS } from "@/lib/domain/lead-state";
import type { PrimeZoneLead } from "@/lib/domain/marketplace-leads";

export function PrimeLeadCard({
  lead,
  detailHref,
  reservedLabel = "Riservato a te",
  onOpen,
}: {
  lead: PrimeZoneLead;
  detailHref?: string;
  reservedLabel?: string;
  onOpen?: () => void;
}) {
  const resolvedDetailHref = detailHref ?? (!onOpen ? `/app/prime/${lead.id}` : undefined);

  return (
    <article className="flex min-h-[390px] min-w-0 flex-col overflow-hidden rounded-lg border border-amber-300 bg-white p-5 shadow-[0_18px_45px_rgba(146,94,13,0.10)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1 text-xs font-extrabold uppercase text-slate-950">
            <Crown size={14} fill="currentColor" />
            PRIME
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">
            <ShieldCheck size={14} />
            {reservedLabel}
          </span>
        </div>
        <PrimeCountdown compact expiresAt={lead.primeAccessUntil} />
      </div>

      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-green">
        {lead.propertyType}
      </p>
      {resolvedDetailHref ? <Link className="mt-2 block" href={resolvedDetailHref}>
        <h2 className="break-words text-xl font-semibold leading-tight text-ink transition hover:text-green">
          {lead.title}
        </h2>
      </Link> : (
        <button className="mt-2 block text-left" type="button" onClick={onOpen}>
          <h2 className="break-words text-xl font-semibold leading-tight text-ink transition hover:text-green">
            {lead.title}
          </h2>
        </button>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {lead.ownerVerified ? <VerifiedOwnerBadge /> : <StandardLeadBadge />}
        {lead.sublettingAvailable ? <SublettingAvailableBadge /> : null}
      </div>
      <p className="mt-4 flex min-w-0 items-center gap-2 text-sm text-muted">
        <MapPin className="shrink-0" size={16} />
        <span className="truncate">{lead.address}</span>
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm text-muted">
        <div className="flex items-center gap-2">
          <BedDouble size={16} />
          <span>{lead.bedrooms} camere</span>
        </div>
        <div className="flex items-center gap-2">
          <Bath size={16} />
          <span>{lead.bathrooms} bagni</span>
        </div>
        <div className="flex items-center gap-2">
          <Ruler size={16} />
          <span>{lead.areaSqm} mq</span>
        </div>
      </dl>

      <div className="mt-auto pt-5">
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-800">
            Acquisto esclusivo
          </p>
          <p className="mt-1 text-xl font-bold text-ink">
            {formatCents(lead.exclusivePriceCents ?? LEAD_EXCLUSIVE_PRICE_CENTS)}
          </p>
        </div>
        {resolvedDetailHref ? (
          <Link className="btn btn-primary mt-4 w-full" href={resolvedDetailHref}>
            Vedi opportunità
            <ArrowRight size={17} />
          </Link>
        ) : (
          <button className="btn btn-primary mt-4 w-full" type="button" onClick={onOpen}>
            Vedi opportunità
            <ArrowRight size={17} />
          </button>
        )}
      </div>
    </article>
  );
}
