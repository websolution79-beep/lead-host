import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  Bath,
  BedDouble,
  CalendarClock,
  Mail,
  MapPin,
  Phone,
  Ruler,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getPurchasedLead } from "@/lib/domain/purchased-leads";

type MyLeadDetailPageProps = {
  params: Promise<{
    leadId: string;
  }>;
};

export default async function MyLeadDetailPage({
  params,
}: MyLeadDetailPageProps) {
  const { leadId } = await params;
  const purchasedLead = getPurchasedLead(leadId);

  if (!purchasedLead) {
    return (
      <AppShell section="pm" eyebrow="I miei lead" title="Lead non trovato">
        <div className="card p-8 text-center">
          <h2 className="text-2xl font-semibold text-ink">
            Questo lead non risulta acquistato
          </h2>
          <Link className="btn btn-secondary mt-5" href="/app/i-miei-lead">
            Torna ai miei lead
          </Link>
        </div>
      </AppShell>
    );
  }

  const { lead, ownerContact } = purchasedLead;

  return (
    <AppShell section="pm" eyebrow="I miei lead" title={lead.title}>
      <div className="mb-5">
        <Link
          href="/app/i-miei-lead"
          className="inline-flex items-center gap-2 text-sm font-semibold text-green"
        >
          <ArrowLeft size={16} />
          Torna ai miei lead
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
              <p className="mt-3 flex items-center gap-2 text-muted">
                <MapPin size={18} />
                {lead.address}
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-mint px-3 py-2 text-sm font-bold text-green">
              <ShieldCheck size={16} />
              Contatti sbloccati
            </span>
          </div>

          <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Detail icon={<BedDouble size={18} />} label="Camere" value={String(lead.bedrooms)} />
            <Detail icon={<Bath size={18} />} label="Bagni" value={String(lead.bathrooms)} />
            <Detail label="Posti letto" value={String(lead.beds)} />
            <Detail icon={<Ruler size={18} />} label="Metratura" value={`${lead.areaSqm} mq`} />
            <Detail
              icon={<CalendarClock size={18} />}
              label="Tempistica"
              value={lead.timing}
            />
          </dl>

          <section className="mt-8 border-t border-slate-200 pt-6">
            <h3 className="text-lg font-semibold text-ink">
              Descrizione proprietario
            </h3>
            <p className="mt-3 max-w-3xl leading-8 text-muted">
              {lead.ownerDescription}
            </p>
          </section>

          <section className="mt-8 border-t border-slate-200 pt-6">
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
        </article>

        <aside className="card h-fit p-5">
          <p className="section-kicker">Contatto proprietario</p>
          <h3 className="mt-3 text-2xl font-semibold text-ink">
            {ownerContact.firstName} {ownerContact.lastName}
          </h3>

          <div className="mt-5 grid gap-3">
            <div className="rounded-lg border border-slate-200 bg-fog p-4">
              <span className="text-sm font-semibold text-muted">
                Tipo contatto
              </span>
              <p className="mt-1 text-lg font-semibold text-ink">
                {purchasedLead.purchaseMode === "exclusive"
                  ? "Contatto in esclusiva"
                  : "Contatto condiviso"}
              </p>
            </div>

            <a
              className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-green/40 hover:bg-mint/40"
              href={`tel:${ownerContact.phone.replaceAll(" ", "")}`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-muted">
                <Phone size={17} className="text-green" />
                Telefono
              </span>
              <span className="mt-2 block text-lg font-semibold text-ink">
                {ownerContact.phone}
              </span>
            </a>

            <a
              className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-green/40 hover:bg-mint/40"
              href={`mailto:${ownerContact.email}`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-muted">
                <Mail size={17} className="text-green" />
                Email
              </span>
              <span className="mt-2 block break-all text-lg font-semibold text-ink">
                {ownerContact.email}
              </span>
            </a>
          </div>

          <div className="mt-5 rounded-lg bg-fog p-4 text-sm leading-6 text-muted">
            <p className="flex items-center gap-2 font-semibold text-ink">
              <UserRound size={16} />
              Accesso autorizzato
            </p>
            <p className="mt-2">
              Questo contatto resta disponibile anche se il lead non e piu
              visibile o acquistabile nel marketplace.
            </p>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-2 text-sm font-semibold text-muted">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold text-ink">{value}</dd>
    </div>
  );
}
