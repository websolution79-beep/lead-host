import type { Metadata } from "next";
import Image from "next/image";
import {
  ArrowRight,
  BadgeCheck,
  Bath,
  BedDouble,
  BellRing,
  Building2,
  CalendarClock,
  Check,
  KeyRound,
  LayoutGrid,
  MapPin,
  MegaphoneOff,
  Plus,
  Ruler,
  Rocket,
  SearchCheck,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import styles from "./landing.module.css";

const telegramUrl = "https://t.me/+nZiF2verYaUzNzg0";

export const metadata: Metadata = {
  title: {
    absolute: "Cerchi immobili da gestire? | Lead Host",
  },
  description:
    "Scopri un modo diverso per trovare immobili da gestire: visualizza le richieste dei proprietari prima di decidere quali lead acquistare.",
  alternates: {
    canonical: "/accesso-anticipato",
  },
};

const steps = [
  {
    number: "01",
    icon: SearchCheck,
    title: "Troviamo proprietari interessati",
    text: "Raccogliamo richieste di proprietari che stanno valutando la gestione professionale del proprio immobile.",
  },
  {
    number: "02",
    icon: LayoutGrid,
    title: "Tu valuti gratuitamente",
    text: "Nel marketplace leggi località, tipologia e richiesta prima di sbloccare qualsiasi contatto.",
  },
  {
    number: "03",
    icon: KeyRound,
    title: "Sblocchi solo ciò che ti interessa",
    text: "Se l’opportunità è adatta al tuo lavoro, acquisti il lead e accedi ai dati del proprietario.",
  },
];

const comparisonRows = [
  {
    traditional: "Paghi campagne e gestione pubblicitaria",
    leadHost: "Nessuna campagna da gestire",
  },
  {
    traditional: "Investi prima di vedere le richieste",
    leadHost: "Visualizzi prima ogni opportunità",
  },
  {
    traditional: "Sostieni un budget mensile",
    leadHost: "Nessun costo mensile obbligatorio",
  },
  {
    traditional: "Paghi anche per contatti che potrebbero non interessarti",
    leadHost: "Acquisti solo le opportunità che vuoi contattare",
  },
];

const channelBenefits = [
  "Dal 30 luglio: aggiornamenti sulle prime richieste raccolte",
  "3 agosto, ore 11:00: link per la registrazione gratuita",
  "Dopo il lancio: notifiche sulle nuove opportunità pubblicate",
  "Aggiornamenti essenziali e anteprime su Lead Host",
];

const faqs = [
  {
    question: "Quanto costa iscriversi?",
    answer: "Nulla. L’accesso a Lead Host per i Property Manager è gratuito.",
  },
  {
    question: "Devo pagare un abbonamento?",
    answer:
      "No. Pagherai solamente i lead che deciderai liberamente di acquistare.",
  },
  {
    question: "Quando apre Lead Host?",
    answer: "Il lancio ufficiale è previsto il 3 agosto alle ore 11:00.",
  },
];

export default function EarlyAccessLandingPage() {
  return (
    <main className="overflow-hidden bg-white text-ink">
      <section className="relative min-h-[92svh] overflow-hidden bg-graphite text-white">
        <Image
          src="/images/lead-host-early-access-hero.webp"
          alt="Property Manager al lavoro in un appartamento destinato agli affitti brevi"
          fill
          priority
          loading="eager"
          sizes="100vw"
          className="object-cover object-[68%_center]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,15,28,0.96)_0%,rgba(8,15,28,0.88)_38%,rgba(8,15,28,0.38)_72%,rgba(8,15,28,0.14)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(180deg,transparent,rgba(255,255,255,0.12))]" />

        <div className="relative mx-auto flex min-h-[92svh] max-w-7xl flex-col px-5 pb-9 pt-5 sm:px-8 sm:pb-12">
          <div className="flex items-center justify-between">
            <Image
              src="/images/lead-host-logo.png"
              alt="Lead Host"
              width={230}
              height={40}
              priority
              className="h-9 w-auto rounded-md bg-white px-2 py-1 sm:h-11"
            />
            <div className="hidden items-center gap-2 text-sm font-semibold text-white/76 sm:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Apertura 3 agosto · ore 11:00
            </div>
          </div>

          <div
            className={`${styles.heroContent} flex max-w-3xl flex-1 flex-col justify-center py-9 sm:py-11`}
          >
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/18 bg-white/10 px-3 py-2 text-xs font-bold uppercase text-emerald-200 backdrop-blur-md">
              <Sparkles size={15} />
              Accesso anticipato per Property Manager
            </div>

            <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.02] text-white sm:text-6xl">
              CERCHI IMMOBILI DA GESTIRE?
            </h1>
            <p className="mt-6 max-w-2xl text-xl font-semibold leading-8 text-white sm:text-2xl sm:leading-9">
              Smetti di investire in marketing sperando che arrivino proprietari
              interessati.
            </p>
            <p className="mt-3 max-w-2xl text-base leading-7 text-white/78 sm:text-lg sm:leading-8">
              Con Lead Host visualizzi le richieste dei proprietari prima di
              decidere se acquistare il lead. Nessuna campagna da gestire,
              nessun investimento pubblicitario iniziale: valuti prima e scegli
              tu.
            </p>

            <p className="mt-7 inline-flex w-fit items-center gap-2 text-sm font-extrabold text-emerald-200 sm:text-base">
              <Rocket size={18} />
              Apertura Lead Host: 3 agosto, ore 11:00
            </p>
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.cta} mt-4 inline-flex min-h-16 w-full max-w-xl items-center justify-center gap-3 rounded-lg bg-emerald-500 px-5 py-4 text-center text-base font-extrabold text-white shadow-[0_22px_60px_rgba(16,185,129,0.32)] transition hover:-translate-y-0.5 hover:bg-emerald-400 sm:w-fit sm:px-7 sm:text-lg`}
            >
              <Rocket size={22} />
              Voglio accedere a Lead Host il 3 agosto
              <ArrowRight className={styles.ctaIcon} size={21} />
            </a>
            <p className="mt-3 text-sm font-medium text-white/62">
              Chi è nel canale riceverà il link di accesso al momento
              dell’apertura.
            </p>
          </div>
        </div>
      </section>

      <section className="relative -mt-8 pb-20 sm:-mt-12 sm:pb-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div
            className={`${styles.proofPanel} rounded-lg border border-slate-200 bg-white p-3 shadow-[0_28px_80px_rgba(15,23,42,0.14)] sm:p-5`}
          >
            <MarketplacePreview />
          </div>

          <div className="mx-auto mt-14 max-w-3xl text-center sm:mt-20">
            <p className="text-sm font-extrabold uppercase text-emerald-700">
              Prima vedi. Poi decidi.
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-5xl">
              Non acquistare una promessa. Valuta un’opportunità concreta.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              Ogni Property Manager può capire se un immobile è coerente con la
              propria attività prima di accedere ai dati riservati del
              proprietario.
            </p>
            <TelegramCta label="Voglio vedere le prime opportunità" />
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-extrabold uppercase text-emerald-700">
              Come funziona
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-5xl">
              Un percorso più diretto per trovare immobili da gestire.
            </h2>
          </div>

          <div className="mt-12 grid gap-0 lg:grid-cols-3">
            {steps.map(({ number, icon: Icon, title, text }, index) => (
              <article
                key={number}
                className="relative border-t border-slate-300 py-8 lg:border-l lg:border-t-0 lg:px-8 lg:py-4 first:lg:border-l-0 first:lg:pl-0"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold text-emerald-700">
                    {number}
                  </span>
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                    <Icon size={22} />
                  </span>
                </div>
                <h3 className="mt-7 text-2xl font-semibold">{title}</h3>
                <p className="mt-3 text-base leading-7 text-slate-600">{text}</p>
                {index < steps.length - 1 ? (
                  <ArrowRight
                    className="absolute -right-3 top-1/2 hidden -translate-y-1/2 bg-slate-50 text-slate-400 lg:block"
                    size={24}
                  />
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-extrabold uppercase text-emerald-700">
              Un modello diverso
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-5xl">
              Perché Lead Host è diverso
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              Il marketing tradizionale ti chiede di investire prima. Lead Host
              ti permette di vedere prima la richiesta e decidere dopo.
            </p>
          </div>

          <div
            className="mt-10 overflow-hidden rounded-lg border border-slate-200"
            role="table"
            aria-label="Confronto tra marketing tradizionale e Lead Host"
          >
            <div
              className="grid grid-cols-2 bg-slate-950 text-white"
              role="row"
            >
              <div className="px-4 py-5 sm:px-7" role="columnheader">
                <span className="flex items-center gap-2 font-semibold">
                  <MegaphoneOff size={19} />
                  Marketing tradizionale
                </span>
              </div>
              <div
                className="bg-emerald-700 px-4 py-5 sm:px-7"
                role="columnheader"
              >
                <span className="flex items-center gap-2 font-semibold">
                  <Building2 size={19} />
                  Lead Host
                </span>
              </div>
            </div>
            {comparisonRows.map((row) => (
              <div
                key={row.traditional}
                className="grid grid-cols-2 border-t border-slate-200 bg-white"
                role="row"
              >
                <div
                  className="flex min-w-0 items-start gap-2 px-4 py-5 text-sm leading-6 text-slate-600 sm:px-7 sm:text-base"
                  role="cell"
                >
                  <X className="mt-0.5 shrink-0 text-rose-500" size={18} />
                  <span>{row.traditional}</span>
                </div>
                <div
                  className="flex min-w-0 items-start gap-2 bg-emerald-50 px-4 py-5 text-sm font-semibold leading-6 text-emerald-950 sm:px-7 sm:text-base"
                  role="cell"
                >
                  <Check className="mt-0.5 shrink-0 text-emerald-700" size={18} />
                  <span>{row.leadHost}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-950 py-20 text-white sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-emerald-500 text-white">
              <Send size={27} />
            </span>
            <p className="mt-7 text-sm font-extrabold uppercase text-emerald-300">
              Canale privato Telegram
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-5xl">
              Entra ora nel canale privato Lead Host.
            </h2>
            <p className="mt-5 text-lg leading-8 text-white/66">
              Dal 30 luglio inizieremo a pubblicare aggiornamenti sulle prime
              richieste raccolte. Il 3 agosto alle 11:00 riceverai direttamente
              nel canale il link per registrarti gratuitamente. Dopo il lancio
              continuerai a ricevere le notifiche delle nuove opportunità
              pubblicate nel marketplace.
            </p>
            <TelegramCta label="Entra ora nel canale privato" dark />
          </div>

          <div className="border-t border-white/16">
            {channelBenefits.map((benefit) => (
              <div
                key={benefit}
                className="flex items-center gap-4 border-b border-white/16 py-5"
              >
                <BadgeCheck className="shrink-0 text-emerald-300" size={22} />
                <span className="text-base font-semibold sm:text-lg">
                  {benefit}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <div className="text-center">
            <p className="text-sm font-extrabold uppercase text-emerald-700">
              Domande frequenti
            </p>
            <h2 className="mt-3 text-3xl font-semibold sm:text-5xl">
              Tutto quello che serve sapere.
            </h2>
          </div>

          <div className="mt-10 divide-y divide-slate-200 border-y border-slate-200">
            {faqs.map((faq) => (
              <details key={faq.question} className="group py-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold marker:hidden sm:text-xl">
                  {faq.question}
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-emerald-700 transition group-open:rotate-45">
                    <Plus size={20} />
                  </span>
                </summary>
                <p className="max-w-2xl pt-4 text-base leading-7 text-slate-600 sm:text-lg">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-emerald-200 bg-emerald-50 py-20 sm:py-28">
        <div className="mx-auto max-w-4xl px-5 text-center sm:px-8">
          <BellRing className="mx-auto text-emerald-700" size={38} />
          <p className="mt-6 text-sm font-extrabold uppercase text-emerald-700">
            3 agosto · ore 11:00
          </p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-5xl">
            Cerchi immobili da gestire? Parti dal posto giusto.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            Entra ora nel canale privato e ricevi l’accesso a Lead Host il giorno
            del lancio.
          </p>
          <TelegramCta label="Voglio essere tra i primi ad accedere" />
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-semibold text-slate-600">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck size={17} className="text-emerald-700" />
              Accesso gratuito
            </span>
            <span className="inline-flex items-center gap-2">
              <BadgeCheck size={17} className="text-emerald-700" />
              Nessun abbonamento
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}

function TelegramCta({
  label,
  dark = false,
}: {
  label: string;
  dark?: boolean;
}) {
  return (
    <div className={dark ? "text-left" : "text-center"}>
      <a
        href={telegramUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`${styles.cta} mt-8 inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-lg bg-emerald-600 px-5 py-4 text-center text-base font-extrabold text-white shadow-[0_18px_45px_rgba(5,150,105,0.22)] transition hover:-translate-y-0.5 hover:bg-emerald-700 sm:w-fit sm:px-7`}
      >
        <Rocket size={21} />
        {label}
        <ArrowRight className={styles.ctaIcon} size={20} />
      </a>
      <p
        className={`mt-3 inline-flex items-center gap-2 text-sm font-bold ${
          dark ? "text-emerald-200" : "text-emerald-800"
        }`}
      >
        <CalendarClock size={16} />
        Apertura Lead Host: 3 agosto, ore 11:00
      </p>
      <p
        className={`mt-1 text-sm ${
          dark ? "text-white/60" : "text-slate-500"
        }`}
      >
        Chi è nel canale riceverà il link al momento dell’apertura.
      </p>
    </div>
  );
}

function MarketplacePreview() {
  const leads = [
    {
      image: "/images/lead-example-roma-prati.webp",
      city: "Roma · Prati",
      type: "Appartamento",
      title: "Trilocale per affitti brevi",
      address: "Via Cola di Rienzo 152, Roma",
      bedrooms: "2 camere",
      bathrooms: "2 bagni",
      area: "92 mq",
      timing: "Entro 30 giorni",
      availability: "2 quote disponibili",
      description:
        "Il proprietario cerca una gestione completa: annunci, accoglienza ospiti e pulizie.",
    },
    {
      image: "/images/lead-example-milano-navigli.webp",
      city: "Milano · Navigli",
      type: "Bilocale",
      title: "Immobile appena ristrutturato",
      address: "Alzaia Naviglio Grande 44, Milano",
      bedrooms: "1 camera",
      bathrooms: "1 bagno",
      area: "58 mq",
      timing: "Il prima possibile",
      availability: "Ultima quota",
      description:
        "Richiesta di valutazione, pubblicazione online e avvio della gestione turistica.",
    },
    {
      image: "/images/lead-example-firenze-centro.webp",
      city: "Firenze · Centro",
      type: "Appartamento",
      title: "Soluzione vicina al centro storico",
      address: "Via dei Neri 18, Firenze",
      bedrooms: "3 camere",
      bathrooms: "2 bagni",
      area: "108 mq",
      timing: "Entro 60 giorni",
      availability: "2 quote disponibili",
      description:
        "Il proprietario vuole affidare operatività, annunci e accoglienza ospiti.",
    },
  ];

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Image
            src="/images/lead-host-logo.png"
            alt=""
            width={150}
            height={26}
            className="h-6 w-auto"
          />
          <span className="hidden h-5 w-px bg-slate-200 sm:block" />
          <span className="hidden text-sm font-semibold text-slate-500 sm:block">
            Marketplace
          </span>
        </div>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
          Nuove opportunità
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 border-b border-slate-200 bg-white p-3 sm:gap-3 sm:p-5">
        {["Tutta Italia", "Affitti brevi", "Disponibili"].map((filter) => (
          <div
            key={filter}
            className="truncate rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 sm:text-sm"
          >
            {filter}
          </div>
        ))}
      </div>

      <div className="grid gap-3 p-3 sm:p-5 md:grid-cols-3">
        {leads.map((lead) => (
          <article
            key={lead.city}
            className="overflow-hidden rounded-md border border-slate-200 bg-white"
          >
            <div className="relative aspect-[16/8.5] overflow-hidden bg-slate-200">
              <Image
                src={lead.image}
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, 33vw"
                className="object-cover"
              />
              <span className="absolute left-3 top-3 rounded-full bg-white/92 px-2.5 py-1 text-[11px] font-extrabold text-emerald-800 shadow-sm backdrop-blur">
                Richiesta verificata
              </span>
            </div>
            <div className="p-4">
              <p className="text-xs font-extrabold uppercase text-emerald-700">
                {lead.type}
              </p>
              <h3 className="mt-2 text-base font-semibold text-slate-950">
                {lead.title}
              </h3>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {lead.city}
              </p>
              <p className="mt-3 flex items-start gap-2 text-sm leading-5 text-slate-700">
                <MapPin
                  className="mt-0.5 shrink-0 text-emerald-700"
                  size={15}
                />
                <span>{lead.address}</span>
              </p>
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs font-semibold text-slate-600">
                <span className="flex items-center gap-2">
                  <BedDouble className="shrink-0 text-slate-400" size={15} />
                  {lead.bedrooms}
                </span>
                <span className="flex items-center gap-2">
                  <Bath className="shrink-0 text-slate-400" size={15} />
                  {lead.bathrooms}
                </span>
                <span className="flex items-center gap-2">
                  <Ruler className="shrink-0 text-slate-400" size={15} />
                  {lead.area}
                </span>
                <span className="flex items-center gap-2">
                  <CalendarClock
                    className="shrink-0 text-slate-400"
                    size={15}
                  />
                  {lead.timing}
                </span>
              </div>
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                {lead.description}
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <div>
                  <p className="text-xs font-extrabold text-emerald-700">
                    {lead.availability}
                  </p>
                  <p className="mt-1 text-[11px] font-bold text-slate-500">
                    Dati proprietario protetti
                  </p>
                </div>
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                  <ShieldCheck size={16} />
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
