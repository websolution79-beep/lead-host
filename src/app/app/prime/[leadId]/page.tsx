import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Bath,
  BedDouble,
  Crown,
  Mail,
  MapPin,
  Phone,
  Ruler,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { LeadPurchaseActions } from "@/components/lead-purchase-actions";
import { PrimeCountdown } from "@/components/prime-countdown";
import { SublettingAvailableBadge } from "@/components/subletting-available-badge";
import {
  StandardLeadBadge,
  VerifiedOwnerBadge,
} from "@/components/verified-owner-badge";
import { LEAD_EXCLUSIVE_PRICE_CENTS } from "@/lib/domain/lead-state";
import { getServerSessionProfile } from "@/lib/auth/server-session";
import { getPrimeZoneLeadByIdForProfile } from "@/lib/domain/marketplace-leads";
import { getPrimeAccessState } from "@/lib/prime/access";

type PrimeLeadDetailPageProps = {
  params: Promise<{ leadId: string }>;
};

export const dynamic = "force-dynamic";

export default async function PrimeLeadDetailPage({
  params,
}: PrimeLeadDetailPageProps) {
  const session = await getServerSessionProfile();

  if (!session) redirect("/login?redirect=/app/prime");

  const primeAccess = await getPrimeAccessState(session.profile.id);

  if (!primeAccess.hasAccess) redirect("/app/marketplace");

  const { leadId } = await params;
  const lead = await getPrimeZoneLeadByIdForProfile(session.profile.id, leadId);

  if (!lead) notFound();

  return (
    <AppShell section="pm" eyebrow="Prime Zone" title={lead.title}>
      <Link className="btn btn-secondary mb-5 w-fit" href="/app/prime">
        <ArrowLeft size={17} />
        Torna alla Prime Zone
      </Link>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <article className="card overflow-hidden border-amber-300 p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1 text-xs font-extrabold uppercase text-slate-950">
              <Crown size={14} fill="currentColor" />
              PRIME
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">
              <ShieldCheck size={14} />
              Riservato a te
            </span>
          </div>

          <p className="section-kicker mt-6">{lead.region} / {lead.province}</p>
          <h2 className="mt-3 text-3xl font-semibold text-ink">
            {lead.propertyType} in zona {lead.district}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {lead.ownerVerified ? <VerifiedOwnerBadge /> : <StandardLeadBadge />}
            {lead.sublettingAvailable ? <SublettingAvailableBadge /> : null}
          </div>
          <p className="mt-4 flex items-center gap-2 font-semibold text-ink">
            <MapPin size={18} />
            {lead.address}
          </p>

          <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Detail icon={BedDouble} label="Camere" value={String(lead.bedrooms)} />
            <Detail icon={Bath} label="Bagni" value={String(lead.bathrooms)} />
            {lead.beds !== null ? (
              <Detail icon={BedDouble} label="Posti letto" value={String(lead.beds)} />
            ) : null}
            <Detail icon={Ruler} label="Metratura" value={`${lead.areaSqm} mq`} />
            <Detail label="Tempistica" value={lead.timing} />
          </dl>

          <section className="mt-8 border-t border-ink/10 pt-6">
            <h3 className="text-lg font-semibold text-ink">Descrizione proprietario</h3>
            <p className="mt-3 leading-8 text-muted">{lead.ownerDescription}</p>
          </section>

          <section className="mt-8 border-t border-ink/10 pt-6">
            <h3 className="text-lg font-semibold text-ink">Servizi richiesti</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {lead.services.map((service) => (
                <span key={service} className="rounded-full bg-fog px-3 py-1 text-sm font-semibold text-ink">
                  {service}
                </span>
              ))}
            </div>
          </section>

          <section className="mt-8 border-t border-ink/10 pt-6">
            <h3 className="text-lg font-semibold text-ink">Contatti</h3>
            <div className="mt-3 grid gap-3 text-muted sm:grid-cols-2">
              <p className="flex items-center gap-3"><UserRound size={18} /> Nome e cognome riservati</p>
              <p className="flex items-center gap-3"><Phone size={18} /> Telefono riservato</p>
              <p className="flex items-center gap-3"><Mail size={18} /> Email riservata</p>
            </div>
          </section>
        </article>

        <aside className="card h-fit border-amber-300 p-5">
          <PrimeCountdown expiresAt={lead.primeAccessUntil} />
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm leading-6 text-amber-950">
            Questa opportunità è stata riservata in anteprima alla tua Prime Zone.
            Se non verrà acquistata entro la scadenza, potrà essere pubblicata nel
            Marketplace Lead Host e diventare disponibile agli altri Property Manager.
          </div>
          <div className="mt-5">
            <p className="section-kicker">Acquisto esclusivo</p>
            <p className="mt-2 text-3xl font-bold text-ink">
              {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(
                (lead.exclusivePriceCents ?? LEAD_EXCLUSIVE_PRICE_CENTS) / 100,
              )}
            </p>
          </div>
          <div className="mt-5">
            <LeadPurchaseActions
              leadId={lead.id}
              leadTitle={lead.title}
              sharedAvailable={false}
              exclusiveAvailable
              sharedPriceCents={0}
              exclusivePriceCents={lead.exclusivePriceCents ?? LEAD_EXCLUSIVE_PRICE_CENTS}
              refreshAfterPurchase={false}
            />
          </div>
          <p className="mt-5 text-xs leading-5 text-muted">
            I contatti vengono sbloccati server-side soltanto dopo la conferma atomica
            dell&apos;acquisto tramite Wallet.
          </p>
        </aside>
      </div>
    </AppShell>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon?: typeof BedDouble;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-2 text-sm font-semibold text-muted">
        {Icon ? <Icon size={16} /> : null}
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold text-ink">{value}</dd>
    </div>
  );
}
