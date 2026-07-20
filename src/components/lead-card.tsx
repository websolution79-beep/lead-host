import Link from "next/link";
import {
  ArrowRight,
  Bath,
  BedDouble,
  CalendarClock,
  MapPin,
  Ruler,
  Users,
} from "lucide-react";
import type { MarketplaceLead } from "@/lib/domain/sample-data";
import {
  formatPublicStatus,
  getSharedSlotsAvailable,
  isExclusiveAvailable,
  isSharedAvailable,
  parseLeadDate,
} from "@/lib/domain/lead-state";
import { formatCents } from "@/lib/config/commercial";

type LeadCardProps = {
  lead: MarketplaceLead;
};

export function LeadCard({ lead }: LeadCardProps) {
  const detailHref = `/app/marketplace/${lead.id}`;
  const statusStyle = getStatusStyle(lead.publicStatus);
  const expiresAt = parseLeadDate(lead.expiresAt);
  const sharedAvailable = isSharedAvailable({
    internalStatus: lead.internalStatus,
    sharedSlotsSold: lead.sharedSlotsSold,
    exclusivePurchaseId: lead.exclusivePurchaseId,
    expiresAt,
  });
  const exclusiveAvailable = isExclusiveAvailable({
    internalStatus: lead.internalStatus,
    sharedSlotsSold: lead.sharedSlotsSold,
    exclusivePurchaseId: lead.exclusivePurchaseId,
    expiresAt,
  });
  const slotsAvailable = getSharedSlotsAvailable(lead.sharedSlotsSold);

  return (
    <article
      className={`card flex min-h-[360px] flex-col p-4 ${statusStyle.cardBorder}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 max-w-full flex-1 text-xs font-semibold uppercase tracking-[0.14em] text-green">
          {lead.propertyType}
        </p>
        <span className={statusStyle.badgeClassName}>
          {formatPublicStatus(lead.publicStatus)}
        </span>
      </div>

      <Link href={detailHref} className="mt-3 block">
        <h3 className="text-xl font-semibold leading-tight text-ink hover:text-green">
          {lead.title}
        </h3>
      </Link>
      <p className="mt-3 flex items-center gap-2 text-sm text-muted">
        <MapPin size={16} />
        {lead.city}, {lead.district}
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
        <div className="flex items-center gap-2">
          <CalendarClock size={16} />
          <span>{lead.timing}</span>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap gap-2">
        {lead.services.slice(0, 3).map((service) => (
          <span
            key={service}
            className="rounded-full bg-fog px-3 py-1 text-xs font-semibold text-ink"
          >
            {service}
          </span>
        ))}
      </div>

      <div className="mt-auto pt-5">
        <div className="rounded-lg border border-ink/10 bg-paper p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 font-semibold text-ink">
              <Users size={16} />
              Quote condivise
            </span>
            <span className="font-bold text-ink">{slotsAvailable}/2</span>
          </div>
          <p className="mt-2 text-muted">
            {sharedAvailable
              ? `Condiviso ${formatCents(2900)}`
              : "Condivisione non disponibile"}
          </p>
          <p className="mt-1 text-muted">
            {exclusiveAvailable
              ? `Esclusiva ${formatCents(5000)} disponibile`
              : "Esclusiva non disponibile"}
          </p>
        </div>

        <Link className="btn btn-secondary mt-4 w-full" href={detailHref}>
          Vedi dettaglio
          <ArrowRight size={17} />
        </Link>
      </div>
    </article>
  );
}

function getStatusStyle(status: MarketplaceLead["publicStatus"]) {
  const base =
    "inline-flex min-h-7 max-w-full shrink items-center justify-center rounded-full px-2.5 text-center text-xs font-bold leading-tight whitespace-normal break-words";

  if (status === "available") {
    return {
      cardBorder: "lead-card-available",
      badgeClassName: `${base} bg-mint text-green`,
    };
  }

  if (status === "last_availability") {
    return {
      cardBorder: "lead-card-last",
      badgeClassName: `${base} bg-blue-100 text-blue-700`,
    };
  }

  return {
    cardBorder: "lead-card-unavailable",
    badgeClassName: `${base} bg-red-100 text-red-700`,
  };
}
