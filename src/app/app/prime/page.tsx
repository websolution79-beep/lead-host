import { redirect } from "next/navigation";
import { BellRing, Crown } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PrimeLeadCard } from "@/components/prime-lead-card";
import { getServerSessionProfile } from "@/lib/auth/server-session";
import { getPrimeZoneLeadsForProfile } from "@/lib/domain/marketplace-leads";
import { getPrimeAccessState } from "@/lib/prime/access";

export const dynamic = "force-dynamic";

export default async function PrimeZonePage() {
  const session = await getServerSessionProfile();

  if (!session) redirect("/login?redirect=/app/prime");

  const primeAccess = await getPrimeAccessState(session.profile.id);

  if (!primeAccess.hasAccess) redirect("/app/marketplace");

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
