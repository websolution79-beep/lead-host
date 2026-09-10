import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  CalendarDays,
  Check,
  Clock3,
  Eye,
  Gift,
  Search,
  Target,
  UsersRound,
} from "lucide-react";
import { PublicNav } from "@/components/public-nav";
import { WebinarJamRegistrationForm } from "@/components/webinarjam-registration-form";

export const metadata: Metadata = {
  title: "Gli immobili che cerchi, prima degli altri | Webinar Lead Host",
  description:
    "Webinar gratuito per Property Manager dedicato all'acquisizione di nuovi immobili da gestire. Martedì 15 settembre alle ore 21:00.",
  alternates: { canonical: "/webinar" },
  openGraph: {
    title: "Lead Host - Gli immobili che cerchi, prima degli altri",
    description:
      "Un webinar gratuito per scoprire un modo diverso di trovare e valutare nuove opportunità immobiliari.",
    images: ["/images/lead-host-hero.png"],
    type: "website",
  },
};

const webinarPoints = [
  "Perché essere un bravo Property Manager non basta se nessun proprietario sa che esisti.",
  "Tutta la verità sui sistemi di acquisizione che molte agenzie di marketing preferiscono non raccontarti.",
  "Perché puoi spendere migliaia di euro in marketing senza avere la certezza di trovare l'immobile giusto.",
  "Un modo diverso di acquisire opportunità: vedere prima l'immobile e decidere solo dopo se investire.",
  "Come Lead Host sta cambiando il modo in cui i Property Manager possono accedere a nuovi proprietari.",
  "Come avere accesso alle opportunità più compatibili con quello che stai realmente cercando.",
  "La nuova evoluzione di Lead Host e cosa cambierà per chi utilizza la piattaforma.",
];

export default function WebinarPage() {
  return (
    <main className="overflow-hidden bg-white text-slate-950">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1440px] px-5 pb-12 pt-5 sm:px-8 sm:pb-16 sm:pt-7 lg:px-12 lg:pb-20">
          <PublicNav />

          <div className="grid items-center gap-10 pt-10 sm:pt-14 lg:grid-cols-[minmax(0,1.08fr)_minmax(390px,.72fr)] lg:gap-14 lg:pt-16">
            <div className="max-w-4xl">
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase text-emerald-700 sm:text-sm">
                <UsersRound size={17} />
                Webinar gratuito riservato ai Property Manager
              </p>

              <p className="mt-5 text-sm font-bold text-slate-500">
                Lead Host - Gli immobili che cerchi, prima degli altri
              </p>

              <h1 className="mt-4 max-w-5xl text-[2.35rem] font-semibold leading-[1.08] sm:text-5xl sm:leading-[1.08] xl:text-[3.75rem]">
                Sai gestire gli immobili. <span className="text-emerald-700">Ma sai dove trovarli?</span>
              </h1>

              <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600 sm:text-xl sm:leading-8">
                Acquisire nuovi immobili è probabilmente la parte più difficile del tuo lavoro. In questa diretta parleremo di come creare realmente nuove opportunità per acquisire immobili da gestire.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <EventDetail icon={CalendarDays} text="Martedì 15 settembre" />
                <EventDetail icon={Clock3} text="Ore 21:00" />
                <EventDetail icon={UsersRound} text="Partecipazione gratuita" />
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link className="btn btn-primary min-h-13 justify-center px-6 text-base" href="#iscrizione">
                  Riserva il tuo posto gratuito
                  <ArrowDown size={18} />
                </Link>
                <p className="text-sm font-bold text-amber-700">I posti live sono limitati.</p>
              </div>
            </div>

            <RegistrationPanel formId="iscrizione" />
          </div>
        </div>
      </section>

      <section className="bg-emerald-50 px-5 py-12 sm:px-8 sm:py-16 lg:px-12">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,.78fr)_minmax(0,1.22fr)] lg:items-center lg:gap-14">
          <div>
            <p className="section-kicker">La domanda che conta</p>
            <p className="mt-4 text-xl font-semibold leading-8 text-slate-500">
              La domanda non è: “Sei abbastanza bravo a gestire un appartamento?”
            </p>
          </div>
          <p className="border-l-4 border-emerald-600 pl-5 text-3xl font-semibold leading-tight sm:text-4xl">
            La vera domanda è: “Come trovi il prossimo proprietario disposto ad affidartelo?”
          </p>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <p className="section-kicker">Durante il webinar scoprirai</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
              Cosa succede dopo i corsi, dopo la formazione e dopo aver aperto la tua attività.
            </h2>
          </div>

          <div className="mt-10 grid gap-x-12 gap-y-6 md:grid-cols-2">
            {webinarPoints.map((point) => (
              <div className="flex gap-4 border-t border-slate-200 pt-5" key={point}>
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                  <Check size={16} strokeWidth={3} />
                </span>
                <p className="font-semibold leading-7 text-slate-700">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50 px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
          <Link
            aria-label="Vai al modulo gratuito di iscrizione al webinar"
            className="relative block aspect-[3/2] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg shadow-slate-200/70 transition hover:border-emerald-400 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            href="#iscrizione"
          >
            <Image
              alt="Gli immobili che cerchi, prima degli altri"
              className="object-cover"
              fill
              sizes="(max-width: 1024px) 100vw, 560px"
              src="/images/webinar-gli-immobili-prima-degli-altri.webp"
            />
          </Link>

          <div>
            <p className="section-kicker">Competenze e opportunità</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
              Puoi conoscere perfettamente Airbnb. Ma senza immobili da gestire non hai un&apos;attività.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              Puoi sapere tutto di pricing, revenue management, check-in e automazioni.
            </p>
            <p className="mt-5 text-2xl font-semibold text-emerald-700">Hai soltanto competenze.</p>
          </div>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:items-start lg:gap-16">
          <div>
            <p className="section-kicker">Il principio Lead Host</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
              Gli immobili che cerchi, prima degli altri.
            </h2>
            <p className="mt-6 text-lg leading-8 text-slate-600">
              Lead Host nasce da un principio molto semplice: per acquisire nuovi immobili non dovresti essere costretto a investire migliaia di euro alla cieca.
            </p>
          </div>

          <div className="grid gap-6 border-l border-slate-200 pl-6 sm:pl-9">
            <PositioningStep icon={Eye} number="01" text="Prima vedi l'opportunità." />
            <PositioningStep icon={Search} number="02" text="Poi valuti se è interessante." />
            <PositioningStep icon={Target} number="03" text="Solo allora decidi se acquistarla." />
          </div>
        </div>
      </section>

      <section className="border-y border-amber-200 bg-amber-50 px-5 py-12 sm:px-8 sm:py-16 lg:px-12">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-700">Una nuova evoluzione</p>
            <h2 className="mt-3 text-2xl font-semibold leading-tight sm:text-3xl">
              Durante il webinar presenteremo una delle evoluzioni più importanti di Lead Host dal suo lancio.
            </h2>
            <p className="mt-4 leading-7 text-slate-700">
              Cambierà il modo in cui alcuni Property Manager potranno accedere alle nuove opportunità immobiliari. Non anticiperemo tutto nella pagina.
            </p>
          </div>

          <div className="border-t border-amber-300 pt-8 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
            <p className="flex items-center gap-2 text-xs font-bold uppercase text-amber-800">
              <Gift size={18} /> Solo per chi parteciperà live
            </p>
            <h2 className="mt-3 text-2xl font-semibold leading-tight sm:text-3xl">
              Alla fine presenteremo una sorpresa riservata esclusivamente ai partecipanti collegati in diretta.
            </h2>
            <p className="mt-4 font-semibold text-slate-700">Non verrà comunicata prima del webinar.</p>
          </div>
        </div>
      </section>

      <section className="bg-white px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,.85fr)_minmax(390px,.75fr)] lg:items-center lg:gap-16">
          <div>
            <p className="section-kicker">Martedì 15 settembre, ore 21:00</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
              Se vuoi acquisire nuovi immobili da gestire, questo webinar riguarda la parte più importante del tuo business.
            </h2>
            <p className="mt-5 text-xl leading-8 text-slate-600">
              Non come gestire il prossimo immobile. <strong className="text-slate-950">Ma come trovarlo.</strong>
            </p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 sm:p-8">
            <p className="text-xs font-bold uppercase text-emerald-700">Partecipazione gratuita</p>
            <p className="mt-3 text-2xl font-semibold leading-tight">Il tuo posto è a un clic.</p>
            <p className="mt-3 leading-7 text-slate-600">Compila il modulo e assicurati l&apos;accesso alla diretta.</p>
            <Link className="btn btn-primary mt-6 w-full justify-center sm:w-auto" href="#iscrizione">
              Riserva il tuo posto gratuito
              <ArrowDown size={18} />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function EventDetail({ icon: Icon, text }: { icon: typeof CalendarDays; text: string }) {
  return (
    <span className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 text-sm font-bold text-slate-800">
      <Icon className="text-emerald-700" size={18} />
      {text}
    </span>
  );
}

function RegistrationPanel({ formId }: { formId: string }) {
  return (
    <div className="scroll-mt-5 rounded-lg border border-emerald-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,118,86,0.12)] sm:p-7" id={formId}>
      <p className="text-xs font-bold uppercase text-emerald-700">Iscrizione gratuita</p>
      <h2 className="mt-2 text-3xl font-semibold leading-tight">Riserva il tuo posto</h2>
      <p className="mt-3 leading-7 text-slate-600">Inserisci i tuoi dati per registrarti gratuitamente al webinar.</p>
      <WebinarJamRegistrationForm />
      <p className="mt-4 text-center text-sm font-bold text-amber-700">I posti live sono limitati.</p>
    </div>
  );
}

function PositioningStep({ icon: Icon, number, text }: { icon: typeof Eye; number: string; text: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700"><Icon size={21} /></span>
      <div>
        <p className="text-xs font-bold text-emerald-700">{number}</p>
        <p className="mt-1 text-lg font-semibold">{text}</p>
      </div>
    </div>
  );
}
