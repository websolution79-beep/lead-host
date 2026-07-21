import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  Filter,
  LockKeyhole,
  MousePointerClick,
  ShieldCheck,
  Sparkles,
  Star,
  TimerReset,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { PmSignupForm } from "@/components/pm-signup-form";
import { PublicNav } from "@/components/public-nav";

const proofPoints = [
  { value: "Gratis", label: "iscrizione PM" },
  { value: "Prima", label: "vedi la richiesta" },
  { value: "Solo se vuoi", label: "sblocchi il contatto" },
];

const painPoints = [
  "Setup iniziale, landing page e funnel prima di vedere un solo proprietario.",
  "Budget pubblicitario da anticipare senza sapere quali contatti arriveranno.",
  "Settimane di test, call e report prima di capire se la campagna funziona.",
  "Lead generici da richiamare e qualificare da zero.",
];

const steps = [
  {
    icon: Eye,
    title: "Vedi le opportunità",
    text: "Entri gratis e consulti zona, immobile, richiesta, servizi e descrizione del proprietario.",
  },
  {
    icon: Filter,
    title: "Filtri ciò che conta",
    text: "Regione, provincia, città, disponibilità condivisa o possibilità di esclusiva.",
  },
  {
    icon: MousePointerClick,
    title: "Sblocchi solo se conviene",
    text: "Nome, telefono ed email restano riservati. Li apri solo sui lead che vuoi lavorare.",
  },
];

const leadDetails = [
  "Città, indirizzo e zona",
  "Tipologia, camere, bagni e mq",
  "Tempistica del proprietario",
  "Servizi richiesti",
  "Descrizione dell'immobile",
  "Quote disponibili o esclusiva",
];

const comparison = [
  {
    label: "Costo prima di partire",
    agency: "Setup, funnel e gestione",
    diy: "Tempo, tool e test",
    leadHost: "Iscrizione gratuita",
  },
  {
    label: "Budget pubblicitario",
    agency: "Da anticipare",
    diy: "Da gestire ogni giorno",
    leadHost: "Non necessario per iniziare",
  },
  {
    label: "Quando vedi l'opportunità",
    agency: "Dopo campagne e qualifica",
    diy: "Dopo vari test",
    leadHost: "Subito nel marketplace",
  },
  {
    label: "Dati immobile prima del pagamento",
    agency: "Dipende dal funnel",
    diy: "Da costruire",
    leadHost: "Visibili prima dello sblocco",
  },
  {
    label: "Pagamento",
    agency: "Prima del risultato",
    diy: "Prima di validare",
    leadHost: "Solo sui contatti scelti",
  },
];

const faqs = [
  {
    question: "Devo pagare per registrarmi?",
    answer:
      "No. L'iscrizione PM è gratuita e puoi consultare il marketplace prima di decidere se sbloccare un contatto.",
  },
  {
    question: "Vedrò il telefono del proprietario subito?",
    answer:
      "No. Prima vedi i dati utili per valutare l'opportunità. Nome, email e telefono vengono sbloccati solo dopo l'acquisto tramite wallet.",
  },
  {
    question: "Posso evitare contatti condivisi?",
    answer:
      "Sì. Quando un lead è ancora libero puoi scegliere l'esclusiva e impedire ad altri PM di acquistarlo.",
  },
  {
    question: "Serve una campagna pubblicitaria?",
    answer:
      "No per iniziare. Lead Host nasce proprio per darti accesso a richieste già raccolte e leggibili senza costruire un funnel da zero.",
  },
];

export default function Home() {
  return (
    <main className="bg-white pb-20 sm:pb-0">
      <section className="relative min-h-[88svh] overflow-hidden bg-graphite text-white">
        <Image
          src="/images/lead-host-pm-hero.png"
          alt="Appartamento per affitti brevi con strumenti di property management"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.94),rgba(15,23,42,0.74)_48%,rgba(15,23,42,0.2))]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(180deg,transparent,rgba(247,248,250,0.98))]" />

        <div className="relative mx-auto flex min-h-[88svh] max-w-7xl flex-col px-5 py-5 sm:px-8">
          <PublicNav variant="dark" />
          <div className="flex max-w-4xl flex-1 flex-col justify-center py-16">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-200 backdrop-blur">
              <Sparkles size={15} />
              Iscrizione gratuita per Property Manager
            </div>

            <h1 className="mt-7 max-w-4xl text-4xl font-semibold leading-[1.03] text-white sm:text-6xl lg:text-7xl">
              Trova immobili da gestire senza pagare marketing al buio.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/88 sm:text-xl">
              Lead Host ti mostra richieste di proprietari interessati agli
              affitti brevi: vedi zona, immobile e descrizione prima di decidere
              se sbloccare il contatto. Iscrizione gratuita.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link className="btn btn-primary" href="#iscrizione">
                Registrati gratis
                <ArrowRight size={18} />
              </Link>
              <Link className="btn btn-secondary-dark" href="#come-funziona">
                Guarda come funziona
              </Link>
            </div>

            <div className="mt-10 grid max-w-3xl gap-3 sm:grid-cols-3">
              {proofPoints.map((point) => (
                <div
                  key={point.label}
                  className="border-l border-white/18 py-2 pl-4"
                >
                  <p className="text-2xl font-semibold text-white">{point.value}</p>
                  <p className="mt-1 text-sm font-medium text-white/68">
                    {point.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative -mt-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <LeadPreviewStrip />
        </div>
      </section>

      <section className="bg-paper">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <p className="section-kicker">Il problema</p>
            <h2 className="mt-3 max-w-xl text-3xl font-semibold leading-tight text-ink sm:text-5xl">
              Le agenzie ti fanno investire prima. Lead Host ti fa valutare
              prima.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted sm:text-lg">
              Funnel, landing page, ads e report possono funzionare, ma spesso
              richiedono tempo, budget e fiducia prima di mostrarti una richiesta
              concreta. Qui il processo si ribalta: prima vedi l'opportunità,
              poi decidi.
            </p>
          </div>

          <div className="grid gap-3">
            {painPoints.map((point) => (
              <div
                key={point}
                className="flex items-start gap-3 border-b border-ink/10 bg-white px-4 py-5 last:border-b-0"
              >
                <X className="mt-0.5 shrink-0 text-red-500" size={18} />
                <p className="leading-7 text-ink">{point}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-5 pb-20 sm:px-8">
          <SectionCta
            title="Guarda le richieste prima di investire budget."
            text="Entra gratis e valuta subito se ci sono opportunità interessanti per la tua zona."
            cta="Registrati gratis"
          />
        </div>
      </section>

      <section id="come-funziona" className="bg-white">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <div className="max-w-3xl">
            <p className="section-kicker">Come funziona</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-ink sm:text-5xl">
              Parti da proprietari già interessati, non da campagne da
              inventare.
            </h2>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {steps.map((step, index) => {
              const Icon = step.icon;

              return (
                <div
                  key={step.title}
                  className="border border-ink/10 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.05)]"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex size-11 items-center justify-center rounded-lg bg-green text-white">
                      <Icon size={21} />
                    </span>
                    <span className="text-sm font-extrabold text-muted">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-6 text-xl font-semibold text-ink">
                    {step.title}
                  </h3>
                  <p className="mt-3 leading-7 text-muted">{step.text}</p>
                </div>
              );
            })}
          </div>

          <SectionCta
            className="mt-8"
            title="Accedi al marketplace e scegli solo i lead che vuoi lavorare."
            text="L'iscrizione è gratuita: telefono ed email si sbloccano solo quando decidi tu."
            cta="Accedi gratis al marketplace"
          />
        </div>
      </section>

      <section className="bg-fog">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <p className="section-kicker">Prima dello sblocco</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-ink sm:text-5xl">
              Sai già se vale la pena contattare quel proprietario.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted sm:text-lg">
              Il contatto resta riservato, ma il PM può leggere abbastanza per
              capire se la richiesta è coerente con zona, modello operativo e
              qualità dell'immobile cercato.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {leadDetails.map((detail) => (
                <div key={detail} className="flex items-center gap-3 text-ink">
                  <CheckCircle2 className="shrink-0 text-green" size={20} />
                  <span className="font-semibold">{detail}</span>
                </div>
              ))}
            </div>
          </div>

          <MarketplaceMockup />
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <div className="max-w-3xl">
            <p className="section-kicker">Confronto</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-ink sm:text-5xl">
              La differenza è quando inizi a pagare.
            </h2>
            <p className="mt-5 text-base leading-7 text-muted sm:text-lg">
              Lead Host non sostituisce una strategia marketing completa. Ti dà
              però una strada più immediata per vedere richieste reali prima di
              impegnare budget su funnel e campagne.
            </p>
          </div>

          <ComparisonTable />

          <SectionCta
            className="mt-8"
            title="Meglio vedere una richiesta reale che pagare una promessa."
            text="Crea il tuo account gratuito e valuta le opportunità disponibili prima di acquistare qualsiasi contatto."
            cta="Crea account gratuito"
          />
        </div>
      </section>

      <section className="bg-graphite text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-emerald-300">
              Condiviso o esclusiva
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-5xl">
              Scegli quanto proteggere ogni opportunità.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/72 sm:text-lg">
              Se vuoi lavorare a volume puoi acquistare lead condivisi. Se vuoi
              bloccare una richiesta strategica, puoi scegliere l'esclusiva
              quando è ancora disponibile.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="border border-white/14 bg-white/8 p-6">
              <Users className="text-emerald-300" size={26} />
              <h3 className="mt-5 text-xl font-semibold">Contatto condiviso</h3>
              <p className="mt-3 leading-7 text-white/68">
                Ottimo per testare più zone, lavorare più richieste e mantenere
                flessibilità.
              </p>
            </div>
            <div className="border border-amber-300/34 bg-amber-300/10 p-6">
              <Star className="text-amber-300" fill="#fbbf24" size={26} />
              <h3 className="mt-5 text-xl font-semibold">Contatto in esclusiva</h3>
              <p className="mt-3 leading-7 text-white/72">
                Blocchi il lead e nessun altro PM potrà acquistare quel contatto.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="iscrizione" className="bg-paper">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.85fr_1fr] lg:items-start">
          <div>
            <p className="section-kicker">Accesso gratuito</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-ink sm:text-5xl">
              Crea il tuo account e guarda il marketplace.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted sm:text-lg">
              Non serve scegliere un piano, non serve parlare con un consulente e
              non devi anticipare budget pubblicitario. Entri, valuti e decidi
              quali contatti sbloccare.
            </p>
            <div className="mt-8 grid gap-3">
              {[
                "Nessun abbonamento obbligatorio",
                "Marketplace consultabile prima dell'acquisto",
                "Wallet interno per controllare la spesa",
                "Contatti sbloccati solo server-side dopo acquisto",
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 text-ink">
                  <BadgeCheck className="shrink-0 text-green" size={20} />
                  <span className="font-semibold">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <PmSignupForm />
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <div className="max-w-3xl">
            <p className="section-kicker">Domande frequenti</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-ink sm:text-5xl">
              Tutto chiaro prima di registrarti.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            {faqs.map((faq) => (
              <div key={faq.question} className="border-t border-ink/12 pt-5">
                <h3 className="text-lg font-semibold text-ink">{faq.question}</h3>
                <p className="mt-3 leading-7 text-muted">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink/10 bg-white/94 p-3 shadow-[0_-18px_40px_rgba(15,23,42,0.12)] backdrop-blur sm:hidden">
        <Link className="btn btn-primary w-full" href="#iscrizione">
          Registrati gratis
          <ArrowRight size={18} />
        </Link>
      </div>
    </main>
  );
}

function SectionCta({
  title,
  text,
  cta,
  className = "",
}: {
  title: string;
  text: string;
  cta: string;
  className?: string;
}) {
  return (
    <div
      className={`grid gap-5 border border-green/20 bg-[linear-gradient(135deg,#ffffff_0%,rgba(223,247,238,0.72)_100%)] p-5 shadow-[0_18px_55px_rgba(15,23,42,0.06)] sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6 ${className}`}
    >
      <div>
        <h3 className="text-xl font-semibold leading-tight text-ink sm:text-2xl">
          {title}
        </h3>
        <p className="mt-2 max-w-2xl leading-7 text-muted">{text}</p>
      </div>
      <Link
        className="btn btn-primary sm:shrink-0"
        href="#iscrizione"
      >
        {cta}
        <ArrowRight size={18} />
      </Link>
    </div>
  );
}

function LeadPreviewStrip() {
  return (
    <div className="grid gap-3 border border-ink/10 bg-white p-3 shadow-[0_24px_70px_rgba(15,23,42,0.12)] md:grid-cols-3">
      {[
        {
          icon: BriefcaseBusiness,
          title: "Richieste proprietari",
          text: "Non liste fredde: opportunità con immobile, descrizione e tempistica.",
        },
        {
          icon: ShieldCheck,
          title: "Contatti protetti",
          text: "Dati sensibili riservati fino allo sblocco tramite wallet.",
        },
        {
          icon: TimerReset,
          title: "Decisione rapida",
          text: "Valuti la richiesta e scegli condiviso o esclusiva quando disponibile.",
        },
      ].map((item) => {
        const Icon = item.icon;

        return (
          <div key={item.title} className="bg-paper p-5">
            <Icon className="text-green" size={24} />
            <h3 className="mt-4 text-lg font-semibold text-ink">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{item.text}</p>
          </div>
        );
      })}
    </div>
  );
}

function MarketplaceMockup() {
  return (
    <div className="border border-ink/10 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.1)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 pb-4">
        <div>
          <p className="section-kicker">Marketplace</p>
          <h3 className="mt-1 text-xl font-semibold text-ink">
            Opportunità disponibili
          </h3>
        </div>
        <span className="rounded-full bg-mint px-3 py-1 text-sm font-bold text-green">
          6 lead attivi
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MockLeadCard
          city="Roma"
          title="Appartamento a Prati"
          status="Esclusiva disponibile"
          tone="green"
        />
        <MockLeadCard
          city="Milano"
          title="Bilocale Navigli"
          status="Ultima quota"
          tone="blue"
        />
      </div>

      <div className="mt-4 grid gap-2 text-sm text-muted sm:grid-cols-3">
        <span className="flex items-center gap-2">
          <LockKeyhole size={15} />
          Telefono riservato
        </span>
        <span className="flex items-center gap-2">
          <WalletCards size={15} />
          Wallet interno
        </span>
        <span className="flex items-center gap-2">
          <CircleDollarSign size={15} />
          Paghi se sblocchi
        </span>
      </div>
    </div>
  );
}

function MockLeadCard({
  city,
  title,
  status,
  tone,
}: {
  city: string;
  title: string;
  status: string;
  tone: "green" | "blue";
}) {
  const statusClass =
    tone === "green" ? "bg-mint text-green" : "bg-blue-100 text-blue-700";

  return (
    <div className="border border-ink/10 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-green">
          Appartamento
        </p>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass}`}>
          {status}
        </span>
      </div>
      <h4 className="mt-4 text-lg font-semibold text-ink">{title}</h4>
      <p className="mt-2 text-sm text-muted">Via riservata, {city}</p>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-muted">
        <span>2 camere</span>
        <span>1 bagno</span>
        <span>72 mq</span>
        <span>Entro 30 giorni</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-fog px-2.5 py-1 text-xs font-bold text-ink">
          Gestione completa
        </span>
        <span className="rounded-full bg-fog px-2.5 py-1 text-xs font-bold text-ink">
          Revenue
        </span>
      </div>
    </div>
  );
}

function ComparisonTable() {
  return (
    <div className="mt-10 overflow-hidden border border-ink/10 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.06)]">
      <div className="hidden grid-cols-[1.1fr_1fr_1fr_1fr] border-b border-ink/10 bg-paper px-5 py-4 text-sm font-extrabold uppercase tracking-[0.08em] text-muted lg:grid">
        <span>Scenario</span>
        <span>Agenzia marketing</span>
        <span>Ads fai da te</span>
        <span className="text-green">Lead Host</span>
      </div>
      {comparison.map((row) => (
        <div
          key={row.label}
          className="grid gap-3 border-b border-ink/10 px-5 py-5 last:border-b-0 lg:grid-cols-[1.1fr_1fr_1fr_1fr] lg:items-center"
        >
          <p className="font-semibold text-ink">{row.label}</p>
          <ComparisonCell type="neutral" label="Agenzia" value={row.agency} />
          <ComparisonCell type="neutral" label="Fai da te" value={row.diy} />
          <ComparisonCell type="positive" label="Lead Host" value={row.leadHost} />
        </div>
      ))}
    </div>
  );
}

function ComparisonCell({
  type,
  label,
  value,
}: {
  type: "neutral" | "positive";
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 text-sm leading-6 text-muted">
      {type === "positive" ? (
        <CheckCircle2 className="mt-0.5 shrink-0 text-green" size={17} />
      ) : (
        <X className="mt-0.5 shrink-0 text-slate-400" size={17} />
      )}
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted lg:hidden">
          {label}
        </p>
        <p className={type === "positive" ? "font-semibold text-ink" : ""}>
          {value}
        </p>
      </div>
    </div>
  );
}
