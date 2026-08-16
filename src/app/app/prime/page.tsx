import { redirect } from "next/navigation";
import { BellRing, Crown, ShieldCheck, UserRoundCheck, WalletCards, Zap } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PrimeLeadCard } from "@/components/prime-lead-card";
import { PrimeCheckoutButton } from "@/components/prime-checkout-button";
import { PrimeSubscriptionActions } from "@/components/prime-subscription-actions";
import { getServerSessionProfile } from "@/lib/auth/server-session";
import { fetchCommercialSettings } from "@/lib/config/commercial-settings";
import { getPrimeZoneLeadsForProfile } from "@/lib/domain/marketplace-leads";
import { getPrimeAccessState } from "@/lib/prime/access";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PrimeZonePage() {
  const session = await getServerSessionProfile();

  if (!session) redirect("/login?redirect=/app/prime");

  const primeAccess = await getPrimeAccessState(session.profile.id);

  if (!primeAccess.isVisible) redirect("/app/marketplace");

  if (!primeAccess.hasAccess) {
    const supabase = createServiceSupabaseClient();
    const [{ settings }, productResult] = await Promise.all([
      fetchCommercialSettings(supabase),
      supabase
        .from("addon_products")
        .select("terms_url")
        .eq("slug", "lead-host-prime")
        .single(),
    ]);
    const firstTotal = settings.primeFirstMonthServiceFeeCents + settings.primeMonthlyWalletRechargeCents;
    const renewalTotal = settings.primeRecurringServiceFeeCents + settings.primeMonthlyWalletRechargeCents;

    return (
      <AppShell section="pm" eyebrow="Lead Host PRIME" title="La tua opportunità riservata">
        <section className="overflow-hidden rounded-lg border border-amber-300 bg-white shadow-[0_22px_70px_rgba(146,94,13,0.14)]">
          <div className="grid gap-8 p-6 sm:p-9 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-3 py-1 text-xs font-extrabold uppercase text-slate-950">
                <Crown size={15} fill="currentColor" /> Offerta riservata
              </span>
              <h2 className="mt-5 max-w-3xl text-3xl font-semibold leading-tight text-ink sm:text-4xl">
                Accedi alle opportunità PRIME prima del Marketplace pubblico.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
                Ricevi una Prime Zone personale e un Account Manager dedicato, che potrai
                contattare direttamente per qualsiasi esigenza o domanda. Acquista i lead
                assegnati esclusivamente al tuo account e continua a usare normalmente tutto
                il Marketplace Lead Host.
              </p>
              <div className="mt-7">
                <PrimeCheckoutButton
                  firstMonthLabel={formatMoney(settings.primeFirstMonthServiceFeeCents)}
                  renewalLabel={formatMoney(settings.primeRecurringServiceFeeCents)}
                  walletRechargeLabel={formatMoney(settings.primeMonthlyWalletRechargeCents)}
                  termsUrl={productResult.data?.terms_url ?? "/termini"}
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 sm:p-6">
              <p className="text-xs font-extrabold uppercase text-emerald-700">Primo mese</p>
              <p className="mt-2 text-4xl font-semibold text-ink">{formatMoney(firstTotal)}</p>
              <div className="mt-4 grid gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-slate-700">
                <PriceRow
                  label="Costi di startup e attivazione PRIME"
                  value={formatMoney(settings.primeFirstMonthServiceFeeCents)}
                />
                <PriceRow
                  label="Credito caricato nel Wallet"
                  value={formatMoney(settings.primeMonthlyWalletRechargeCents)}
                />
              </div>
              <div className="mt-5 grid gap-3 text-sm text-slate-700">
                <Feature icon={<Zap size={18} />} text="Accesso immediato alla tua Prime Zone" />
                <Feature icon={<WalletCards size={18} />} text={`${formatMoney(settings.primeMonthlyWalletRechargeCents)} accreditati nel Wallet`} />
                <Feature icon={<ShieldCheck size={18} />} text="Acquisto esclusivo delle opportunità assegnate" />
                <Feature icon={<UserRoundCheck size={18} />} text="Account Manager dedicato e contattabile direttamente" />
              </div>
              <div className="mt-5 border-t border-slate-200 pt-4">
                <p className="text-xs font-extrabold uppercase text-emerald-700">Dal secondo mese</p>
                <p className="mt-1 text-2xl font-semibold text-ink">{formatMoney(renewalTotal)} al mese</p>
                <div className="mt-3 grid gap-2 text-sm text-slate-700">
                  <PriceRow
                    label="Abbonamento PRIME"
                    value={formatMoney(settings.primeRecurringServiceFeeCents)}
                  />
                  <PriceRow
                    label="Credito caricato nel Wallet"
                    value={formatMoney(settings.primeMonthlyWalletRechargeCents)}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </AppShell>
    );
  }

  const leads = await getPrimeZoneLeadsForProfile(session.profile.id);

  return (
    <AppShell section="pm" eyebrow="Lead Host PRIME" title="Prime Zone">
      <section className="mb-6 overflow-hidden rounded-lg border border-amber-300 bg-white shadow-[0_18px_55px_rgba(146,94,13,0.10)]">
        <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-3 py-1 text-xs font-extrabold uppercase text-slate-950">
              <Crown size={15} fill="currentColor" />
              Accesso PRIME
            </span>
            <h2 className="mt-4 text-2xl font-semibold text-ink sm:text-3xl">
              Le opportunità selezionate per te, prima del Marketplace.
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted sm:text-base">
              Ogni opportunità è riservata esclusivamente al tuo account per il tempo
              indicato. Se non viene acquistata, potrà essere pubblicata nel Marketplace
              e diventare disponibile agli altri Property Manager.
            </p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="flex items-center gap-2 font-bold">
              <BellRing size={18} />
              {leads.length} {leads.length === 1 ? "opportunità riservata" : "opportunità riservate"}
            </p>
            <PrimeSubscriptionActions />
          </div>
        </div>
      </section>

      {leads.length === 0 ? (
        <section className="card px-5 py-14 text-center sm:px-8">
          <span className="mx-auto flex size-14 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
            <Crown size={26} />
          </span>
          <h2 className="mt-5 text-2xl font-semibold text-ink">
            Nessuna opportunità riservata in questo momento
          </h2>
          <p className="mx-auto mt-3 max-w-xl leading-7 text-muted">
            Quando il team assegnerà un lead alla tua Prime Zone, lo troverai qui con
            il tempo di accesso esclusivo disponibile.
          </p>
        </section>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {leads.map((lead) => <PrimeLeadCard key={lead.id} lead={lead} />)}
        </div>
      )}
    </AppShell>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
      <span className="text-emerald-700">{icon}</span>
      <span className="font-semibold text-ink">{text}</span>
    </div>
  );
}

function PriceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span>{label}</span>
      <strong className="shrink-0 text-ink">{value}</strong>
    </div>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);
}
