import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Calculator,
  Check,
  Columns3,
  CreditCard,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getMarketingAddonState } from "@/lib/addons/access";
import { getServerSessionProfile } from "@/lib/auth/server-session";

export default async function MarketingPage() {
  const session = await getServerSessionProfile();
  if (!session) redirect("/login?redirect=/app/marketing");

  const addon = await getMarketingAddonState(
    session.profile.id,
    session.isSuperAdmin,
  );
  if (!addon.menuVisible) redirect("/app/marketplace");

  if (!addon.hasAccess) {
    return <MarketingOffer addon={addon} />;
  }

  return (
    <AppShell section="pm" eyebrow="Marketing" title={addon.product?.name ?? "Modulo Marketing"}>
      <div className="grid gap-6">
        <section className="card overflow-hidden p-6 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
                <BadgeCheck size={14} />
                {addon.accessSource === "super_admin"
                  ? "Anteprima privata Super Admin"
                  : "Accesso attivo"}
              </div>
              <h2 className="mt-5 text-2xl font-semibold text-ink sm:text-3xl">
                Il tuo spazio operativo per acquisire e valutare immobili.
              </h2>
              <p className="mt-4 max-w-2xl leading-7 text-muted">
                Organizza i proprietari nella pipeline e prepara relazioni professionali
                sulla rendita stimata degli immobili.
              </p>
              {addon.accessExpiresAt ? (
                <p className="mt-4 text-sm font-semibold text-amber-700">
                  Accesso valido fino al {formatDate(addon.accessExpiresAt)}.
                </p>
              ) : null}
            </div>
            <Link className="btn btn-primary w-full lg:w-auto" href="/app/marketing/crm">
              Apri CRM
              <ArrowRight size={17} />
            </Link>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <ToolLink
            href="/app/marketing/crm"
            icon={Columns3}
            title="CRM"
            description="Pipeline personalizzabile per seguire proprietari, attività e prossimi contatti."
            cta="Entra nel CRM"
          />
          <ToolLink
            href="/app/marketing/rendita-stimata"
            icon={Calculator}
            title="Rendita Stimata"
            description="Crea valutazioni professionali e PDF personalizzati da presentare ai proprietari."
            cta="Crea una valutazione"
          />
        </section>
      </div>
    </AppShell>
  );
}

function MarketingOffer({ addon }: { addon: Awaited<ReturnType<typeof getMarketingAddonState>> }) {
  const product = addon.product;
  const features = product?.features.length
    ? product.features
    : [
        "CRM con pipeline personalizzabile",
        "Schede proprietario e immobile complete",
        "Rendita Stimata con PDF professionale",
        "Documenti e immagini organizzati nel CRM",
      ];

  return (
    <AppShell section="pm" eyebrow="Marketing" title={product?.name ?? "Modulo Marketing"}>
      <div className="grid gap-6">
        <section className="card overflow-hidden">
          <div className="grid min-h-[390px] lg:grid-cols-[1.3fr_.7fr]">
            <div className="flex flex-col justify-center p-6 sm:p-9 lg:p-10">
              <div className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
                <Sparkles size={14} />
                Strumenti premium per Property Manager
              </div>
              <h2 className="mt-5 max-w-2xl text-3xl font-semibold leading-tight text-ink sm:text-4xl">
                Più ordine nella trattativa. Più valore durante il sopralluogo.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg">
                {product?.description || product?.shortDescription || "Gestisci i proprietari e crea valutazioni professionali della rendita degli immobili in un unico modulo."}
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button className="btn btn-primary w-full sm:w-auto" type="button" disabled>
                  <LockKeyhole size={17} />
                  {product?.trialDays
                    ? `Prova gratuita di ${product.trialDays} giorni`
                    : "Attivazione disponibile a breve"}
                </button>
                <span className="text-sm text-muted">Nessun addebito disponibile in questa fase.</span>
              </div>
            </div>
            <div
              className="relative min-h-64 bg-slate-950 bg-cover bg-center lg:min-h-full"
              style={product?.coverImageUrl ? { backgroundImage: `linear-gradient(rgba(15,23,42,.22),rgba(15,23,42,.42)),url(${JSON.stringify(product.coverImageUrl)})` } : undefined}
            >
              {!product?.coverImageUrl ? (
                <div className="absolute inset-0 grid place-items-center p-8 text-center">
                  <div>
                    <span className="mx-auto grid size-16 place-items-center rounded-lg bg-white/10 text-emerald-300 ring-1 ring-white/15">
                      <Columns3 size={30} />
                    </span>
                    <p className="mt-5 font-semibold text-white">CRM e Rendita Stimata</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">Due strumenti, un unico flusso di lavoro.</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold text-ink">Cosa include</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {features.map((feature) => (
                <div className="flex min-w-0 items-start gap-3 rounded-lg border border-slate-200 bg-white p-4" key={feature}>
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-700">
                    <Check size={15} />
                  </span>
                  <p className="min-w-0 text-sm font-semibold leading-6 text-ink">{feature}</p>
                </div>
              ))}
            </div>
          </div>
          <aside className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
            <p className="text-xs font-bold uppercase text-emerald-700">Offerta mensile</p>
            <div className="mt-4 flex flex-wrap items-baseline gap-2">
              {product?.listPriceCents ? (
                <span className="text-sm font-semibold text-muted line-through">{formatCurrency(product.listPriceCents, product.currency)}</span>
              ) : null}
              <span className="text-3xl font-semibold text-ink">
                {product?.salePriceCents ? formatCurrency(product.salePriceCents, product.currency) : "Da configurare"}
              </span>
            </div>
            {product?.salePriceCents ? <p className="mt-1 text-sm text-muted">al mese</p> : null}
            <div className="mt-5 border-t border-slate-200 pt-5 text-sm leading-6 text-muted">
              <p className="flex items-start gap-2"><CreditCard className="mt-1 shrink-0" size={16} /> Il pagamento ricorrente sarà gestito in sicurezza tramite Stripe.</p>
            </div>
          </aside>
        </section>
      </div>
    </AppShell>
  );
}

function ToolLink({ href, icon: Icon, title, description, cta }: { href: string; icon: typeof Columns3; title: string; description: string; cta: string }) {
  return (
    <Link className="card group p-5 transition hover:border-green/40 hover:shadow-md" href={href}>
      <span className="grid size-11 place-items-center rounded-lg bg-green text-white"><Icon size={21} /></span>
      <h3 className="mt-5 text-xl font-semibold text-ink">{title}</h3>
      <p className="mt-2 leading-6 text-muted">{description}</p>
      <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-green">{cta} <ArrowRight size={16} /></span>
    </Link>
  );
}

function formatCurrency(cents: number, currency: string) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(value));
}
