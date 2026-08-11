import { notFound } from "next/navigation";
import {
  BadgePercent,
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
import { getServerSessionProfile } from "@/lib/auth/server-session";
import { hasAdminPermission } from "@/lib/admin/permissions";
import {
  StandardLeadBadge,
  VerifiedOwnerBadge,
} from "@/components/verified-owner-badge";
import { MarketplaceBackLink } from "@/components/marketplace-back-link";
import { SublettingAvailableBadge } from "@/components/subletting-available-badge";
import { fetchCommercialSettings } from "@/lib/config/commercial-settings";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

type LeadDetailPageProps = {
  params: Promise<{
    leadId: string;
  }>;
  adminMarketplaceView?: boolean;
};

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
  adminMarketplaceView = false,
}: LeadDetailPageProps) {
  const { leadId } = await params;
  const supabase = createServiceSupabaseClient();
  const [session, lead, { settings }] = await Promise.all([
    getServerSessionProfile(),
    getPublishedMarketplaceLeadById(leadId),
    fetchCommercialSettings(supabase),
  ]);

  if (!lead) {
    notFound();
  }

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
  const isTeamMarketplaceReader =
    Boolean(session?.roles.includes("team_member")) &&
    !session?.isSuperAdmin &&
    hasAdminPermission(session?.teamAccess?.permissions ?? {}, "marketplace");
  const sharedPurchasesVisible = settings.sharedPurchasesEnabled;

  return (
    <AppShell
      section={adminMarketplaceView ? "admin" : "pm"}
      eyebrow="Dettaglio lead"
      title={lead.title}
    >
      <div className="mb-5">
        <MarketplaceBackLink />
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
              <div className="flex flex-wrap gap-2">
                {lead.ownerVerified ? <VerifiedOwnerBadge /> : <StandardLeadBadge />}
                {lead.sublettingAvailable ? <SublettingAvailableBadge /> : null}
              </div>
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

          <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Camere" value={String(lead.bedrooms)} />
            <Detail label="Bagni" value={String(lead.bathrooms)} />
            {lead.beds !== null ? (
              <Detail label="Posti letto" value={String(lead.beds)} />
            ) : null}
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
            {sharedPurchasesVisible ? (
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
            ) : isExclusiveSold ? (
              <ExclusiveSoldBadge />
            ) : null}

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
            {lead.promotionId ? (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <p className="flex items-center gap-2 font-bold">
                  <BadgePercent size={18} />
                  {lead.promotionName ?? "Promozione Marketplace"}
                </p>
                <div className="mt-2 grid gap-1">
                  {sharedPurchasesVisible &&
                  lead.baseSharedPriceCents !== undefined &&
                  lead.sharedPriceCents !== undefined &&
                  lead.baseSharedPriceCents > lead.sharedPriceCents ? (
                    <PromotionPriceLine
                      label="Condiviso"
                      baseCents={lead.baseSharedPriceCents}
                      priceCents={lead.sharedPriceCents}
                    />
                  ) : null}
                  {lead.baseExclusivePriceCents !== undefined &&
                  lead.exclusivePriceCents !== undefined &&
                  lead.baseExclusivePriceCents > lead.exclusivePriceCents ? (
                    <PromotionPriceLine
                      label="Esclusiva"
                      baseCents={lead.baseExclusivePriceCents}
                      priceCents={lead.exclusivePriceCents}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
            {isTeamMarketplaceReader ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                <p className="font-semibold">Marketplace in sola lettura</p>
                <p className="mt-1">
                  Puoi consultare le opportunità, ma gli acquisti sono riservati ai
                  Property Manager autorizzati.
                </p>
              </div>
            ) : (
              <LeadPurchaseActions
                leadId={lead.id}
                leadTitle={lead.title}
                sharedAvailable={sharedPurchasesVisible && sharedAvailable}
                exclusiveAvailable={exclusiveAvailable}
                sharedPriceCents={lead.sharedPriceCents ?? LEAD_SHARED_PRICE_CENTS}
                exclusivePriceCents={
                  lead.exclusivePriceCents ?? LEAD_EXCLUSIVE_PRICE_CENTS
                }
              />
            )}
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

function PromotionPriceLine({
  label,
  baseCents,
  priceCents,
}: {
  label: string;
  baseCents: number;
  priceCents: number;
}) {
  const formatter = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  });

  return (
    <p className="flex flex-wrap items-center gap-2">
      <span>{label}:</span>
      <span className="line-through opacity-60">{formatter.format(baseCents / 100)}</span>
      <strong>{formatter.format(priceCents / 100)}</strong>
    </p>
  );
}

function ExclusiveSoldBadge() {
  return (
    <span
      className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold uppercase leading-tight shadow-[0_8px_24px_rgba(183,121,31,0.16)]"
      style={{
        border: "1px solid #e8a923",
        backgroundColor: "#fff3c4",
        color: "#7a3f00",
      }}
    >
      <Star size={14} fill="#f5b301" color="#f5b301" />
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
