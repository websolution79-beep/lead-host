import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Calculator,
  Check,
  Columns3,
  Building2,
  CreditCard,
  FileDown,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MarketingCheckoutButton } from "@/components/marketing-checkout-button";
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
                Organizza i proprietari nella pipeline, prepara relazioni professionali
                e gestisci gli immobili già acquisiti in un unico spazio.
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

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
          <ToolLink
            href="/app/marketing/immobili"
            icon={Building2}
            title="Gestione Immobili"
            description="Organizza immobili già acquisiti, contatti operativi, documenti, manutenzioni e annunci OTA."
            cta="Gestisci gli immobili"
          />
        </section>
      </div>
    </AppShell>
  );
}

function MarketingOffer({ addon }: { addon: Awaited<ReturnType<typeof getMarketingAddonState>> }) {
  const product = addon.product;
  const trialDays = product?.trialDays ?? 0;
  const hasTrial = trialDays > 0;
  const features = product?.features.length
    ? product.features
    : [
        "CRM con pipeline personalizzabile",
        "Schede proprietario e immobile complete",
        "Rendita Stimata con PDF professionale",
        "Gestione Immobili con contatti, documenti e manutenzioni",
        "Documenti e immagini organizzati nel CRM",
      ];

  return (
    <AppShell section="pm" eyebrow="Marketing" title={product?.name ?? "Modulo Marketing"}>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <section className="px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-14">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[.82fr_1.18fr] lg:items-center lg:gap-10">
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
                <Sparkles size={14} />
                CRM, valutazioni e gestione operativa per Property Manager
              </div>
              <h2 className="mt-5 text-3xl font-semibold leading-tight text-ink sm:text-4xl lg:text-[2.65rem]">
                Trasforma ogni contatto in una trattativa organizzata e professionale.
              </h2>
              <p className="mt-5 text-base leading-7 text-muted sm:text-lg">
                {product?.description || product?.shortDescription || "Gestisci i proprietari, segui ogni trattativa e crea relazioni di rendita personalizzate in un unico spazio di lavoro."}
              </p>
              {hasTrial ? (
                <p className="mt-5 text-base font-bold text-emerald-800">
                  Accesso gratuito per {trialDays} giorni.
                </p>
              ) : null}
            <OfferButton
              checkoutEnabled={Boolean(product?.checkoutEnabled)}
              currency={product?.currency ?? "eur"}
              priceCents={product?.salePriceCents ?? null}
              termsUrl={product?.termsUrl ?? "/termini"}
              trialDays={trialDays}
            />
            </div>

            <MarketingHeroPreview />
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50 px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[.82fr_1.18fr] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-700">CRM proprietari</p>
              <h2 className="mt-3 text-2xl font-semibold text-ink sm:text-3xl">Sai sempre chi contattare e cosa fare dopo.</h2>
              <p className="mt-4 leading-7 text-muted">
                Porta ogni proprietario nella tua pipeline, aggiorna lo stato con il drag and drop e conserva immobili, appuntamenti, documenti e immagini nella stessa scheda.
              </p>
              <FeatureList items={["Pipeline e fasi personalizzabili", "Promemoria per i prossimi contatti", "Documenti e foto organizzati per proprietario"]} />
            </div>
            <ProductPreview alt="Esempio della pipeline CRM per la gestione dei proprietari" src="/images/marketing-crm-preview.webp" />
          </div>
        </section>

        <section className="px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.18fr_.82fr] lg:items-center">
            <div className="lg:order-2">
              <p className="text-xs font-bold uppercase text-blue-700">Rendita Stimata</p>
              <h2 className="mt-3 text-2xl font-semibold text-ink sm:text-3xl">Presenta numeri chiari, con la tua identità.</h2>
              <p className="mt-4 leading-7 text-muted">
                Calcola la possibile rendita dell’immobile, personalizza parametri e commissioni e consegna al proprietario un PDF professionale con logo e contatti.
              </p>
              <FeatureList items={["Parametri modificabili per ogni immobile", "Relazione personalizzata con il tuo brand", "PDF pronto da scaricare o allegare al CRM"]} />
            </div>
            <div className="lg:order-1">
              <ProductPreview alt="Esempio di una relazione professionale di rendita stimata" src="/images/marketing-revenue-preview.webp" />
            </div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-950 px-5 py-10 text-white sm:px-8 lg:px-12 lg:py-14">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase text-emerald-300">Un flusso completo</p>
              <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">Dall’interesse del proprietario alla proposta.</h2>
            </div>
            <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-white/15 bg-white/15 md:grid-cols-3">
              <ProcessStep number="01" title="Organizza" text="Inserisci il proprietario e raccogli tutte le informazioni dell’immobile." />
              <ProcessStep number="02" title="Segui" text="Gestisci contatti, appuntamenti e avanzamento direttamente dalla pipeline." />
              <ProcessStep number="03" title="Presenta" text="Crea la stima, genera il PDF e collegalo alla scheda CRM." />
            </div>
          </div>
        </section>

        <section className="px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-700">Tutto nel modulo</p>
              <h2 className="mt-3 text-2xl font-semibold text-ink sm:text-3xl">Gli strumenti che servono per acquisire nuovi immobili.</h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
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
            <aside className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-5 sm:p-6">
              <p className="text-xs font-bold uppercase text-emerald-800">Offerta mensile</p>
              {hasTrial ? <p className="mt-3 text-lg font-semibold text-ink">Primi {trialDays} giorni gratuiti</p> : null}
              <div className="mt-4 flex flex-wrap items-baseline gap-2">
                {product?.listPriceCents ? (
                  <span className="text-sm font-semibold text-muted line-through">{formatCurrency(product.listPriceCents, product.currency)}</span>
                ) : null}
                <span className="text-3xl font-semibold text-ink">
                  {product?.salePriceCents ? formatCurrency(product.salePriceCents, product.currency) : "Da configurare"}
                </span>
              </div>
              {product?.salePriceCents ? <p className="mt-1 text-sm text-muted">al mese dopo la prova</p> : null}
              <div className="mt-5 border-t border-emerald-200 pt-5 text-sm leading-6 text-muted">
                <p className="flex items-start gap-2"><CreditCard className="mt-1 shrink-0" size={16} /> Pagamento ricorrente gestito in sicurezza tramite Stripe.</p>
              </div>
              <OfferButton
                checkoutEnabled={Boolean(product?.checkoutEnabled)}
                compact
                currency={product?.currency ?? "eur"}
                priceCents={product?.salePriceCents ?? null}
                termsUrl={product?.termsUrl ?? "/termini"}
                trialDays={trialDays}
              />
            </aside>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function ProductPreview({ alt, src }: { alt: string; src: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg shadow-slate-200/60">
      <Image alt={alt} className="h-auto w-full" height={900} sizes="(max-width: 1024px) 100vw, 680px" src={src} width={1440} />
    </div>
  );
}

function MarketingHeroPreview() {
  return (
    <div className="relative min-h-[310px] w-full sm:min-h-[430px] lg:min-h-[470px]">
      <div className="absolute left-0 top-0 w-[92%] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
        <Image
          alt="Pipeline CRM del Modulo Marketing Lead Host"
          className="h-auto w-full"
          height={900}
          priority
          sizes="(max-width: 1024px) 92vw, 650px"
          src="/images/marketing-crm-preview.webp"
          width={1440}
        />
      </div>
      <div className="absolute bottom-0 right-0 h-[61%] w-[68%] overflow-hidden rounded-lg border-2 border-white bg-slate-100 shadow-2xl shadow-slate-400/40 sm:h-[64%] sm:w-[66%]">
        <Image
          alt="Anteprima della relazione Rendita Stimata sovrapposta alla pipeline CRM"
          className="h-full w-full object-cover object-[72%_center]"
          height={900}
          priority
          sizes="(max-width: 1024px) 68vw, 430px"
          src="/images/marketing-revenue-preview.webp"
          width={1440}
        />
      </div>
    </div>
  );
}

function OfferButton({
  checkoutEnabled,
  compact = false,
  currency,
  priceCents,
  termsUrl,
  trialDays,
}: {
  checkoutEnabled: boolean;
  compact?: boolean;
  currency: string;
  priceCents: number | null;
  termsUrl: string;
  trialDays: number;
}) {
  return (
    <MarketingCheckoutButton
      checkoutEnabled={checkoutEnabled && Boolean(priceCents)}
      compact={compact}
      priceLabel={priceCents ? formatCurrency(priceCents, currency) : "Prezzo da configurare"}
      termsUrl={termsUrl}
      trialDays={trialDays}
    />
  );
}

function FeatureList({ items }: { items: string[] }) {
  return (
    <div className="mt-6 grid gap-3">
      {items.map((item) => (
        <p className="flex items-start gap-3 text-sm font-semibold leading-6 text-ink" key={item}>
          <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-700"><Check size={14} /></span>
          {item}
        </p>
      ))}
    </div>
  );
}

function ProcessStep({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <article className="bg-slate-950 p-5 sm:p-6">
      <span className="text-sm font-bold text-emerald-300">{number}</span>
      <h3 className="mt-4 flex items-center gap-2 text-lg font-semibold"><UserRoundCheck size={18} />{title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-300">{text}</p>
      {number === "03" ? <FileDown className="mt-5 text-emerald-300" size={20} /> : null}
    </article>
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
