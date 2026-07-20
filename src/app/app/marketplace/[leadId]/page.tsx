import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Star,
  UserRound,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { LeadPurchaseActions } from "@/components/lead-purchase-actions";
import { demoLeads } from "@/lib/domain/sample-data";
import {
  LEAD_EXCLUSIVE_PRICE_CENTS,
  LEAD_SHARED_PRICE_CENTS,
  formatPublicStatus,
  getVisibleSharedSlotsAvailable,
  isExclusiveAvailable,
  isSharedAvailable,
  parseLeadDate,
} from "@/lib/domain/lead-state";
import { getPublishedMarketplaceLeadById } from "@/lib/domain/marketplace-leads";

type LeadDetailPageProps = {
  params: Promise<{
    leadId: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({ params }: LeadDetailPageProps) {
  const { leadId } = await params;
  const lead =
    (await getPublishedMarketplaceLeadById(leadId)) ??
    demoLeads.find((item) => item.id === leadId) ??
    demoLeads[0];
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
  const sharedSlotsAvailable = getVisibleSharedSlotsAvailable({
    internalStatus: lead.internalStatus,
    sharedSlotsSold: lead.sharedSlotsSold,
    exclusivePurchaseId: lead.exclusivePurchaseId,
    expiresAt,
  });
  const isExclusiveSold =
    lead.internalStatus === "sold_exclusive" || Boolean(lead.exclusivePurchaseId);

  return (
    <AppShell section="pm" eyebrow="Dettaglio lead" title={lead.title}>
      <div className="mb-5">
        <Link
          href="/app/marketplace"
          className="inline-flex items-center gap-2 text-sm font-semibold text-green"
        >
          <ArrowLeft size={16} />
          Torna al marketplace
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <article className="card p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="section-kicker">
                {lead.region} / {lead.province}
              </p>
              <h2 className="mt-3 text-3xl font-semibold text-ink">
                {lead.propertyType} in zona {lead.district}
              </h2>
              <p className="mt-3 text-muted">
                {lead.city}, {lead.province}
              </p>
              <p className="mt-3 flex items-center gap-2 text-base font-semibold text-ink">
                <MapPin size={18} />
                {lead.address}
              </p>
            </div>
            <span className="rounded-full bg-fog px-3 py-2 text-sm font-bold text-ink">
              {formatPublicStatus(lead.publicStatus)}
            </span>
          </div>

          <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Detail label="Camere" value={String(lead.bedrooms)} />
            <Detail label="Bagni" value={String(lead.bathrooms)} />
            <Detail label="Posti letto" value={String(lead.beds)} />
            <Detail label="Metratura" value={`${lead.areaSqm} mq`} />
            <Detail label="Tempistica" value={lead.timing} />
          </dl>

          <section className="mt-8 border-t border-ink/10 pt-6">
            <h3 className="text-lg font-semibold text-ink">
              Descrizione proprietario
            </h3>
            <p className="mt-3 max-w-3xl leading-8 text-muted">
              {lead.ownerDescription}
            </p>
          </section>

          <section className="mt-8 border-t border-ink/10 pt-6">
            <h3 className="text-lg font-semibold text-ink">Servizi richiesti</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {lead.services.map((service) => (
                <span
                  key={service}
                  className="rounded-full bg-fog px-3 py-1 text-sm font-semibold text-ink"
                >
                  {service}
                </span>
              ))}
            </div>
          </section>

          <section className="mt-8 border-t border-ink/10 pt-6">
            <h3 className="text-lg font-semibold text-ink">Contatti</h3>
            <div className="mt-3 grid gap-3 text-muted sm:grid-cols-2">
              <p className="flex items-center gap-3">
                <UserRound size={18} />
                Nome e cognome proprietario riservati
              </p>
              <p className="flex items-center gap-3">
                <Phone size={18} />
                Telefono riservato
              </p>
              <p className="flex items-center gap-3">
                <Mail size={18} />
                Email riservata
              </p>
            </div>
          </section>
        </article>

        <aside className="card h-fit p-5">
          <p className="section-kicker">Acquisto lead</p>
          <h3 className="mt-3 text-2xl font-semibold text-ink">
            Disponibilita
          </h3>

          <div className="mt-5 grid gap-3">
            <div className="rounded-lg border border-ink/10 bg-paper p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-semibold text-ink">
                  <Users size={18} />
                  Quote disponibili
                </span>
                <span className="text-xl font-bold text-ink">
                  {sharedSlotsAvailable}/2
                </span>
              </div>
              {isExclusiveSold ? <ExclusiveSoldBadge /> : null}
              <p className="mt-2 text-sm leading-6 text-muted">
                {sharedAvailable
                  ? "Ogni lead condiviso puo essere acquistato da massimo 2 Property Manager."
                  : "Le quote condivise non sono piu acquistabili."}
              </p>
            </div>

            <div className="rounded-lg border border-ink/10 bg-paper p-4">
              <div className="flex items-center gap-2 font-semibold text-ink">
                <ShieldCheck size={18} />
                Esclusiva
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">
                {exclusiveAvailable
                  ? "Disponibile solo per lead senza acquisti precedenti."
                  : "Non disponibile dopo un acquisto condiviso, esclusivo o scadenza."}
              </p>
            </div>
          </div>

          <div className="mt-6">
            <LeadPurchaseActions
              leadId={lead.id}
              sharedAvailable={sharedAvailable}
              exclusiveAvailable={exclusiveAvailable}
              sharedPriceCents={lead.sharedPriceCents ?? LEAD_SHARED_PRICE_CENTS}
              exclusivePriceCents={
                lead.exclusivePriceCents ?? LEAD_EXCLUSIVE_PRICE_CENTS
              }
            />
          </div>

          <p className="mt-5 text-xs leading-5 text-muted">
            I contatti vengono sbloccati server-side solo se il wallet ha credito
            sufficiente.
          </p>
        </aside>
      </div>
    </AppShell>
  );
}

function ExclusiveSoldBadge() {
  return (
    <span className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#f2c46d] bg-[#fff7e6] px-3 py-1.5 text-xs font-extrabold uppercase leading-tight text-[#9a5b00] shadow-[0_8px_24px_rgba(183,121,31,0.12)]">
      <Star size={14} fill="currentColor" />
      Acquistato in esclusiva
    </span>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-semibold text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-ink">{value}</dd>
    </div>
  );
}
