import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Columns3,
  MailCheck,
  MessageCircleQuestion,
  Presentation,
  UsersRound,
  Video,
} from "lucide-react";
import { BrevoWebinarForm } from "@/components/brevo-webinar-form";
import { PublicNav } from "@/components/public-nav";

export const metadata: Metadata = {
  title: "Webinar gratuito per Property Manager | Lead Host",
  description:
    "Scopri il prossimo incontro online di Lead Host: confronto tra Property Manager e accesso gratuito a CRM e Rendita Stimata.",
  alternates: {
    canonical: "/webinar",
  },
  openGraph: {
    title: "Webinar gratuito per Property Manager | Lead Host",
    description:
      "Un confronto concreto tra Property Manager con accesso gratuito agli strumenti CRM e Rendita Stimata di Lead Host. Nuova data in arrivo.",
    images: ["/images/lead-host-pm-hero.png"],
    type: "website",
  },
};

const webinarConfig = {
  registrationOpen: false,
  dateLabel: "Nuova data in arrivo",
} as const;

export default function WebinarPage() {
  return (
    <main className="overflow-hidden bg-white text-slate-950">
      <section className="relative min-h-[84svh] overflow-hidden bg-slate-950 text-white">
        <Image
          alt="Property Manager durante un incontro di lavoro online"
          className="object-cover object-center opacity-35"
          fill
          priority
          sizes="100vw"
          src="/images/lead-host-pm-hero.png"
        />
        <div className="absolute inset-0 bg-slate-950/55" />
        <div className="relative mx-auto flex min-h-[84svh] max-w-[1500px] flex-col px-5 pb-10 pt-5 sm:px-8 sm:pb-14 sm:pt-7 lg:px-12">
          <PublicNav variant="dark" />

          <div className="grid flex-1 items-center gap-10 py-8 sm:py-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,.75fr)] lg:py-16">
            <div className="max-w-4xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-2 text-xs font-bold uppercase tracking-normal text-white backdrop-blur-sm">
                <Video size={15} />
                Incontro gratuito su Zoom
              </div>
              <div className="mt-4 flex w-fit flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-emerald-300/50 bg-emerald-400/15 px-4 py-3 text-white backdrop-blur-sm sm:mt-5 sm:px-5">
                <span className="inline-flex items-center gap-2 text-base font-bold sm:text-lg">
                  <CalendarDays className="text-emerald-300" size={20} />
                  {webinarConfig.dateLabel}
                </span>
              </div>
              <h1 className="mt-4 max-w-4xl text-[2rem] font-semibold leading-[1.1] sm:mt-5 sm:text-5xl sm:leading-[1.08] lg:text-6xl">
                Un confronto tra Property Manager, con nuovi strumenti da provare sul campo.
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-200 sm:mt-6 sm:text-xl sm:leading-8">
                Parliamo delle difficoltà reali nell&apos;acquisizione e nella gestione dei proprietari. Durante l&apos;incontro presenteremo CRM e Rendita Stimata, con la possibilità di provarli gratuitamente.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center">
                {webinarConfig.registrationOpen ? (
                  <Link className="btn btn-primary justify-center" href="#iscrizione">
                    Partecipa gratuitamente
                    <ArrowDown size={17} />
                  </Link>
                ) : (
                  <span className="inline-flex w-fit items-center rounded-lg border border-white/25 bg-white/10 px-4 py-3 text-sm font-bold text-white">
                    Iscrizioni momentaneamente chiuse
                  </span>
                )}
                <p className="text-sm font-semibold text-slate-200">
                  Comunicheremo presto la nuova data dell&apos;incontro.
                </p>
              </div>
            </div>

            <div className="hidden overflow-hidden rounded-lg border border-white/20 bg-white/95 p-3 shadow-2xl shadow-black/35 lg:block">
              <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-slate-100">
                <Image
                  alt="Anteprima del CRM e della Rendita Stimata di Lead Host"
                  className="object-cover object-left-top"
                  fill
                  sizes="520px"
                  src="/images/marketing-crm-preview.webp"
                />
                <div className="absolute bottom-4 right-4 h-[58%] w-[58%] overflow-hidden rounded-md border-2 border-white bg-white shadow-2xl">
                  <Image
                    alt="Anteprima della relazione Rendita Stimata"
                    className="object-cover object-[72%_center]"
                    fill
                    sizes="300px"
                    src="/images/marketing-revenue-preview.webp"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-slate-50 px-5 py-12 sm:px-8 sm:py-16 lg:px-12" id="iscrizione">
        {webinarConfig.registrationOpen ? (
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,.9fr)_minmax(420px,1.1fr)] lg:items-start">
          <div className="lg:sticky lg:top-8">
            <p className="section-kicker">Iscrizione gratuita</p>
            <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-900">
              <CalendarDays size={17} />
              Martedì 11 agosto, ore 21:00
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-slate-950 sm:text-4xl">
              Ricevi il link dell&apos;incontro direttamente via email.
            </h2>
            <p className="mt-5 text-base leading-7 text-slate-600 sm:text-lg">
              Compila il modulo per riservare la partecipazione. Non dovrai registrarti su Zoom: ti invieremo il link e tutte le indicazioni necessarie via email.
            </p>

            <div className="mt-8 grid gap-5 border-t border-slate-200 pt-7">
              <ParticipationStep icon={MailCheck} number="01" text="Compila nome, email e numero WhatsApp." />
              <ParticipationStep icon={MessageCircleQuestion} number="02" text="Ricevi via email le informazioni e il link Zoom." />
              <ParticipationStep icon={Video} number="03" text="Accedi all'incontro senza una seconda registrazione." />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/70 sm:p-8">
            <div className="mb-7">
              <p className="text-xs font-bold uppercase text-emerald-700">Prenota il tuo posto</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">Partecipa al webinar</h2>
              <p className="mt-3 flex items-center gap-2 text-sm font-bold text-emerald-800">
                <Clock3 size={17} />
                Martedì 11 agosto, ore 21:00
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                I campi contrassegnati con * sono obbligatori.
              </p>
            </div>
            <BrevoWebinarForm />
            <p className="mt-5 text-center text-xs leading-5 text-slate-500">
              Riceverai comunicazioni relative all&apos;incontro e all&apos;accesso agli strumenti presentati.
            </p>
          </div>
        </div>
        ) : (
          <div className="mx-auto max-w-4xl">
            <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center shadow-xl shadow-slate-200/60 sm:px-10 sm:py-14">
              <span className="mx-auto grid size-14 place-items-center rounded-lg bg-emerald-100 text-emerald-800">
                <CalendarDays size={27} />
              </span>
              <p className="section-kicker mt-6">Webinar Lead Host</p>
              <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-semibold leading-tight text-slate-950 sm:text-4xl">
                L&apos;iscrizione al webinar non è più disponibile.
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                Stiamo definendo una nuova data per permettere a più Property Manager di partecipare. Torna presto per scoprire quando si terrà il prossimo incontro.
              </p>
              <p className="mx-auto mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
                <Clock3 size={17} />
                {webinarConfig.dateLabel}
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <p className="section-kicker">Un confronto concreto</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-slate-950 sm:text-4xl">
              Non una presentazione a senso unico.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              Vogliamo ascoltare chi lavora ogni giorno con proprietari e immobili, condividere ciò che abbiamo costruito e capire insieme come renderlo ancora più utile.
            </p>
          </div>

          <div className="mt-10 grid border-y border-slate-200 md:grid-cols-3 md:divide-x md:divide-slate-200">
            <Topic icon={UsersRound} title="Confronto tra professionisti" text="Esperienze, difficoltà e metodi di lavoro raccontati senza filtri." />
            <Topic icon={Presentation} title="Lead Host dal vivo" text="Vedremo come organizzare opportunità e attività in un unico flusso." />
            <Topic icon={CheckCircle2} title="Accesso gratuito al test" text="Potrai provare CRM e Rendita Stimata e darci il tuo feedback." />
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-950 px-5 py-14 text-white sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-300">CRM proprietari</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
              Ogni contatto ha una prossima azione chiara.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-300">
              Una pipeline personalizzabile per gestire proprietari, immobili, richiami, appuntamenti, documenti e avanzamento delle trattative.
            </p>
            <ToolPoints items={["Pipeline drag and drop", "Fasi personalizzabili", "Schede proprietario e immobile complete"]} />
          </div>
          <ProductImage alt="Pipeline CRM Lead Host per Property Manager" src="/images/marketing-crm-preview.webp" />
        </div>
      </section>

      <section className="px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-center">
          <div className="lg:order-2">
            <p className="text-xs font-bold uppercase text-blue-700">Rendita Stimata</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-slate-950 sm:text-4xl">
              Una valutazione professionale da presentare al proprietario.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              Inserisci i parametri dell&apos;immobile, calcola la possibile rendita e genera una relazione PDF personalizzata con logo e contatti.
            </p>
            <div className="mt-7 grid gap-3 text-sm font-semibold text-slate-800">
              <p className="flex items-center gap-3"><BarChart3 className="text-blue-700" size={18} /> Parametri economici modificabili</p>
              <p className="flex items-center gap-3"><CheckCircle2 className="text-blue-700" size={18} /> PDF pronto da condividere</p>
            </div>
          </div>
          <div className="lg:order-1">
            <ProductImage alt="Relazione Rendita Stimata Lead Host" src="/images/marketing-revenue-preview.webp" />
          </div>
        </div>
      </section>

      <section className="bg-emerald-50 px-5 py-12 sm:px-8 sm:py-16 lg:px-12">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-800">Incontro gratuito</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950 sm:text-3xl">
              Porta la tua esperienza al tavolo.
            </h2>
            <p className="mt-3 max-w-2xl leading-7 text-slate-600">
              Iscriviti e ricevi via email il link per partecipare alla conversazione.
            </p>
          </div>
          {webinarConfig.registrationOpen ? (
            <Link className="btn btn-primary shrink-0 justify-center" href="#iscrizione">
              Iscriviti gratuitamente
            </Link>
          ) : (
            <span className="inline-flex shrink-0 items-center rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm font-bold text-emerald-900">
              Nuova data in arrivo
            </span>
          )}
        </div>
      </section>
    </main>
  );
}

function ParticipationStep({ icon: Icon, number, text }: { icon: typeof MailCheck; number: string; text: string }) {
  return (
    <div className="flex items-start gap-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-800">
        <Icon size={19} />
      </span>
      <div>
        <p className="text-xs font-bold text-emerald-700">{number}</p>
        <p className="mt-1 font-semibold leading-6 text-slate-900">{text}</p>
      </div>
    </div>
  );
}

function Topic({ icon: Icon, text, title }: { icon: typeof UsersRound; text: string; title: string }) {
  return (
    <article className="py-7 md:px-7 md:py-9 first:md:pl-0 last:md:pr-0">
      <Icon className="text-emerald-700" size={25} />
      <h3 className="mt-5 text-xl font-semibold text-slate-950">{title}</h3>
      <p className="mt-3 leading-7 text-slate-600">{text}</p>
    </article>
  );
}

function ProductImage({ alt, src }: { alt: string; src: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white p-2 shadow-2xl shadow-black/15">
      <Image alt={alt} className="h-auto w-full rounded-md" height={900} sizes="(max-width: 1024px) 100vw, 560px" src={src} width={1440} />
    </div>
  );
}

function ToolPoints({ items }: { items: string[] }) {
  return (
    <div className="mt-7 grid gap-3 text-sm font-semibold text-slate-100">
      {items.map((item) => (
        <p className="flex items-center gap-3" key={item}>
          <Columns3 className="text-emerald-300" size={18} />
          {item}
        </p>
      ))}
    </div>
  );
}
