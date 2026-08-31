"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bath,
  BedDouble,
  CalendarClock,
  ChevronDown,
  Crown,
  MapPin,
  Ruler,
  UserRound,
  X,
} from "lucide-react";
import { PrimeLeadCard } from "@/components/prime-lead-card";
import { MarketplaceLeadFinancialEstimate } from "@/components/marketplace-lead-financial-estimate";
import { PrimeCountdown } from "@/components/prime-countdown";
import { SublettingAvailableBadge } from "@/components/subletting-available-badge";
import { StandardLeadBadge, VerifiedOwnerBadge } from "@/components/verified-owner-badge";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import type { PrimeZoneLead } from "@/lib/domain/marketplace-leads";

type PrimeManagerOption = {
  profileId: string;
  propertyManagerId: string;
  name: string;
  email: string;
  city: string | null;
  status: "active" | "past_due";
  subscriptionEndsAt: string | null;
  graceEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
};

type SelectedPrimeManager = PrimeManagerOption & {
  nextLeadExpiryAt: string | null;
};

type PrimeZonePayload = {
  propertyManagers: PrimeManagerOption[];
  selected: SelectedPrimeManager | null;
  leads: PrimeZoneLead[];
  error?: string;
};

export function AdminPrimeZoneConsole() {
  const [payload, setPayload] = useState<PrimeZonePayload>({
    propertyManagers: [],
    selected: null,
    leads: [],
  });
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [selectedLead, setSelectedLead] = useState<PrimeZoneLead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (profileId?: string) => {
    setLoading(true);
    setError("");
    const supabase = createPublicSupabaseClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setError("Sessione non disponibile. Effettua nuovamente il login.");
      setLoading(false);
      return;
    }

    const query = profileId ? `?profileId=${encodeURIComponent(profileId)}` : "";
    const response = await fetch(`/api/admin/prime-zone${query}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const result = (await response.json()) as PrimeZonePayload;
    if (!response.ok) {
      setError(result.error ?? "Non riesco a caricare la Prime Zone.");
      setLoading(false);
      return;
    }
    setPayload(result);
    setSelectedProfileId(result.selected?.profileId ?? "");
    setSelectedLead(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  const selected = payload.selected;

  return (
    <>
      <section className="card p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,460px)] lg:items-end">
          <div>
            <p className="section-kicker">Controllo assegnazioni 1 to 1</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Prime Zone dei Property Manager</h2>
            <p className="mt-2 max-w-3xl leading-7 text-muted">
              Seleziona un abbonato PRIME per verificare i lead che vede nella propria
              area riservata e le relative scadenze.
            </p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-amber-200 text-amber-950">
                <Crown size={17} fill="currentColor" />
              </span>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-amber-800">
                  Property Manager PRIME
                </p>
                <p className="mt-0.5 text-xs text-amber-950/70">
                  Seleziona la zona riservata da visualizzare
                </p>
              </div>
            </div>
            <label className="relative mt-3 block">
              <UserRound className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
              <select
                className="min-h-12 w-full appearance-none rounded-lg border border-slate-200 bg-white py-3 pl-12 pr-11 text-sm font-semibold text-ink outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                value={selectedProfileId}
                disabled={loading || payload.propertyManagers.length === 0}
                aria-label="Seleziona Property Manager PRIME"
                onChange={(event) => {
                  setSelectedProfileId(event.target.value);
                  void load(event.target.value);
                }}
              >
                {payload.propertyManagers.length === 0 ? (
                  <option value="">Nessun PM PRIME disponibile</option>
                ) : null}
                {payload.propertyManagers.map((manager) => (
                  <option key={manager.profileId} value={manager.profileId}>
                    {manager.name} · {manager.email}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-slate-500" />
            </label>
          </div>
        </div>
      </section>

      {error ? (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <section className="card mt-5 p-8 text-center text-muted">Carico la Prime Zone...</section>
      ) : selected ? (
        <>
          <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Summary label="Property Manager" value={selected.name} detail={selected.city ?? selected.email} />
            <Summary
              label="Stato PRIME"
              value={selected.status === "past_due" ? "Pagamento da regolarizzare" : "Attivo"}
              detail={selected.cancelAtPeriodEnd ? "Disdetta a fine periodo" : "Rinnovo attivo"}
            />
            <Summary
              label="Prossimo rinnovo"
              value={formatDateTime(selected.subscriptionEndsAt)}
              detail={selected.graceEndsAt ? `Grace period fino al ${formatDateTime(selected.graceEndsAt)}` : "Abbonamento PRIME"}
            />
            <Summary
              label="Prossima scadenza lead"
              value={formatDateTime(selected.nextLeadExpiryAt)}
              detail={`${payload.leads.length} ${payload.leads.length === 1 ? "lead assegnato" : "lead assegnati"}`}
            />
          </section>

          <section className="mt-6 overflow-hidden rounded-lg border border-amber-300 bg-white shadow-[0_18px_55px_rgba(146,94,13,0.10)]">
            <div className="flex flex-col gap-3 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-3 py-1 text-xs font-extrabold uppercase text-slate-950">
                  <Crown size={15} fill="currentColor" /> Prime Zone
                </span>
                <h2 className="mt-4 text-2xl font-semibold text-ink">
                  Opportunità riservate a {selected.name}
                </h2>
                <p className="mt-2 text-sm text-muted">
                  Questa è la stessa selezione attualmente visibile al Property Manager.
                </p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
                {payload.leads.length} {payload.leads.length === 1 ? "opportunità attiva" : "opportunità attive"}
              </div>
            </div>
          </section>

          {payload.leads.length ? (
            <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {payload.leads.map((lead) => (
                <PrimeLeadCard
                  key={lead.id}
                  lead={lead}
                  reservedLabel={`Riservato a ${selected.name}`}
                  onOpen={() => setSelectedLead(lead)}
                />
              ))}
            </div>
          ) : (
            <section className="card mt-5 px-5 py-14 text-center sm:px-8">
              <Crown className="mx-auto text-amber-700" size={34} />
              <h2 className="mt-4 text-2xl font-semibold text-ink">Nessun lead assegnato</h2>
              <p className="mt-2 text-muted">La Prime Zone selezionata non contiene opportunità attive.</p>
            </section>
          )}
        </>
      ) : (
        <section className="card mt-5 px-5 py-14 text-center sm:px-8">
          <UserRound className="mx-auto text-muted" size={34} />
          <h2 className="mt-4 text-2xl font-semibold text-ink">Nessun PM PRIME disponibile</h2>
          <p className="mt-2 text-muted">Non risultano abbonati PRIME accessibili al tuo account.</p>
        </section>
      )}

      {selectedLead && selected ? (
        <LeadPreviewModal
          lead={selectedLead}
          managerName={selected.name}
          onClose={() => setSelectedLead(null)}
        />
      ) : null}
    </>
  );
}

function Summary({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="card min-w-0 p-5">
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <p className="mt-2 break-words text-lg font-semibold text-ink">{value}</p>
      <p className="mt-1 break-words text-sm text-muted">{detail}</p>
    </article>
  );
}

function LeadPreviewModal({
  lead,
  managerName,
  onClose,
}: {
  lead: PrimeZoneLead;
  managerName: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[140] overflow-y-auto bg-slate-950/65 p-3 sm:p-6" role="dialog" aria-modal="true">
      <div className="mx-auto max-w-5xl rounded-lg bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white p-5 sm:p-6">
          <div>
            <p className="section-kicker">Prime Zone di {managerName}</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">{lead.title}</h2>
          </div>
          <button className="icon-button shrink-0" type="button" aria-label="Chiudi" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_320px]">
          <article>
            <div className="flex flex-wrap gap-2">
              {lead.ownerVerified ? <VerifiedOwnerBadge /> : <StandardLeadBadge />}
              {lead.sublettingAvailable ? <SublettingAvailableBadge /> : null}
            </div>
            <p className="mt-5 flex items-center gap-2 font-semibold text-ink">
              <MapPin size={18} /> {lead.address}
            </p>
            <dl className="mt-7 grid gap-4 sm:grid-cols-2">
              <ReadOnlyDetail icon={BedDouble} label="Camere" value={String(lead.bedrooms)} />
              <ReadOnlyDetail icon={Bath} label="Bagni" value={String(lead.bathrooms)} />
              <ReadOnlyDetail icon={Ruler} label="Metratura" value={`${lead.areaSqm} mq`} />
              <ReadOnlyDetail label="Tempistica" value={lead.timing} />
            </dl>
            <section className="mt-7 border-t border-slate-200 pt-6">
              <h3 className="font-semibold text-ink">Descrizione proprietario</h3>
              <p className="mt-3 leading-7 text-muted">{lead.ownerDescription}</p>
            </section>
            <section className="mt-7 border-t border-slate-200 pt-6">
              <h3 className="font-semibold text-ink">Servizi richiesti</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {lead.services.map((service) => (
                  <span key={service} className="rounded-full bg-fog px-3 py-1 text-sm font-semibold text-ink">{service}</span>
                ))}
              </div>
            </section>
            {lead.financialEstimate ? (
              <section className="mt-7 border-t border-slate-200 pt-6">
                <MarketplaceLeadFinancialEstimate
                  estimate={lead.financialEstimate}
                  leadTitle={lead.title}
                  location={lead.address}
                  modalZIndexClass="z-[160]"
                />
              </section>
            ) : null}
          </article>
          <aside className="h-fit rounded-lg border border-amber-300 bg-amber-50/60 p-5">
            <PrimeCountdown expiresAt={lead.primeAccessUntil} />
            <div className="mt-5 flex items-start gap-3 text-sm leading-6 text-amber-950">
              <CalendarClock className="mt-1 shrink-0" size={18} />
              <p>
                Assegnato il {formatDateTime(lead.primeAccessStartedAt)}. Alla scadenza potrà
                passare al Marketplace pubblico secondo le regole PRIME.
              </p>
            </div>
            <p className="mt-5 text-xs font-bold uppercase text-amber-800">Acquisto esclusivo</p>
            <p className="mt-1 text-2xl font-bold text-ink">
              {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format((lead.exclusivePriceCents ?? 0) / 100)}
            </p>
            <p className="mt-4 text-xs leading-5 text-muted">
              Vista amministrativa in sola lettura. L’acquisto resta disponibile esclusivamente al Property Manager.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ReadOnlyDetail({
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
        {Icon ? <Icon size={16} /> : null} {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold text-ink">{value}</dd>
    </div>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "Non prevista";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
