import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  Gift,
  Lightbulb,
  Search,
  Target,
  UsersRound,
} from "lucide-react";
import { PublicNav } from "@/components/public-nav";

export const metadata: Metadata = {
  title: "Gli immobili che cerchi, prima degli altri | Webinar Lead Host",
  description:
    "Webinar gratuito per Property Manager dedicato all'acquisizione di nuovi immobili da gestire. Martedì 15 settembre alle ore 21:00.",
  alternates: { canonical: "/webinar" },
  openGraph: {
    title: "Lead Host - Gli immobili che cerchi, prima degli altri",
    description:
      "Un webinar gratuito per scoprire un modo diverso di trovare e valutare nuove opportunità immobiliari.",
    images: ["/images/lead-host-pm-hero.png"],
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
      <section className="relative min-h-[92svh] overflow-hidden bg-slate-950 text-white">
        <Image
          alt="Property Manager durante un incontro professionale"
          className="object-cover object-center opacity-35"
          fill
          priority
          sizes="100vw"
          src="/images/lead-host-pm-hero.png"
        />
        <div className="absolute inset-0 bg-slate-950/60" />

        <div className="relative mx-auto flex min-h-[92svh] max-w-[1500px] flex-col px-5 pb-10 pt-5 sm:px-8 sm:pb-14 sm:pt-7 lg:px-12">
          <PublicNav variant="dark" />

          <div className="flex flex-1 items-center py-10 sm:py-14 lg:py-16">
            <div className="max-w-5xl">
              <p className="inline-flex items-center gap-2 rounded-lg border border-emerald-300/40 bg-emerald-400/15 px-3 py-2 text-xs font-bold uppercase text-emerald-100 backdrop-blur-sm sm:text-sm">
                <UsersRound size={16} />
                Webinar gratuito riservato ai Property Manager
              </p>

              <p className="mt-5 text-sm font-bold text-white sm:text-base">Lead Host - Gli immobili che cerchi, prima degli altri</p>

              <div className="mt-3 flex w-fit flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-white/25 bg-white/10 px-4 py-3 backdrop-blur-sm sm:px-5">
                <span className="inline-flex items-center gap-2 text-base font-bold sm:text-lg">
                  <CalendarDays className="text-emerald-300" size={20} />
                  Martedì 15 settembre
                </span>
                <span className="inline-flex items-center gap-2 text-base font-bold sm:text-lg">
                  <Clock3 className="text-emerald-300" size={20} />
                  Ore 21:00
                </span>
              </div>

              <h1 className="mt-6 max-w-5xl text-[2.25rem] font-semibold leading-[1.08] sm:text-5xl sm:leading-[1.08] lg:text-6xl">
                Hai fatto il corso da Property Manager.
                <span className="mt-2 block">Hai imparato a gestire gli immobili.</span>
                <span className="mt-2 block text-emerald-300">Ma adesso… dove li trovi?</span>
              </h1>

              <div className="mt-6 max-w-3xl text-base leading-7 text-slate-200 sm:text-xl sm:leading-8">
                <p>Acquisire nuovi immobili è probabilmente la parte più difficile del tuo lavoro.</p>
                <p className="mt-4">
                  Durante questo webinar parleremo di quello che succede DOPO i corsi, DOPO la formazione e DOPO aver aperto la tua attività: come creare realmente nuove opportunità per acquisire immobili da gestire.
                </p>
              </div>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                <Link className="btn btn-primary min-h-13 justify-center px-6 text-base" href="#iscrizione">
                  Riserva il tuo posto gratuito
                  <ArrowDown size={18} />
                </Link>
                <p className="text-sm font-semibold text-slate-200">I posti live sono limitati.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,.78fr)_minmax(0,1.22fr)] lg:gap-16">
          <div>
            <p className="section-kicker">La domanda giusta</p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight sm:text-4xl">La domanda non è:</h2>
            <blockquote className="mt-5 border-l-4 border-slate-300 pl-5 text-xl font-semibold leading-8 text-slate-500 sm:text-2xl">
              “Sei abbastanza bravo a gestire un appartamento?”
            </blockquote>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 sm:p-9">
            <p className="text-sm font-bold uppercase text-emerald-800">La vera domanda è:</p>
            <p className="mt-4 text-3xl font-semibold leading-tight text-slate-950 sm:text-4xl">
              “Come trovi il prossimo proprietario disposto ad affidartelo?”
            </p>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <p className="section-kicker">Durante il webinar scoprirai</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">Quello che viene dopo la formazione.</h2>
          </div>

          <div className="mt-9 grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 md:grid-cols-2">
            {webinarPoints.map((point, index) => (
              <article className="flex gap-4 bg-white p-5 sm:p-6" key={point}>
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-100 text-sm font-bold text-emerald-800">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="font-semibold leading-7 text-slate-800">{point}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-950 px-5 py-14 text-white sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,.72fr)] lg:items-center">
          <div>
            <Lightbulb className="text-emerald-300" size={30} />
            <p className="mt-6 text-2xl font-semibold leading-9 sm:text-3xl sm:leading-10">
              Puoi conoscere perfettamente Airbnb. Puoi sapere tutto di pricing, revenue management, check-in e automazioni.
            </p>
            <p className="mt-6 text-lg leading-8 text-slate-300">Ma senza immobili da gestire non hai un&apos;attività.</p>
          </div>
          <div className="border-t border-white/20 pt-8 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
            <p className="text-4xl font-semibold leading-tight text-emerald-300 sm:text-5xl">Hai soltanto competenze.</p>
          </div>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
            <div>
              <p className="section-kicker">Il principio Lead Host</p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">Gli immobili che cerchi, prima degli altri.</h2>
              <p className="mt-6 text-lg leading-8 text-slate-600">
                Lead Host nasce da un principio molto semplice: per acquisire nuovi immobili non dovresti essere costretto a investire migliaia di euro alla cieca.
              </p>
            </div>

            <div className="grid gap-3">
              <PositioningStep icon={Eye} number="01" text="Prima vedi l'opportunità." />
              <PositioningStep icon={Search} number="02" text="Poi valuti se è interessante." />
              <PositioningStep icon={Target} number="03" text="Solo allora decidi se acquistarla." />
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-amber-200 bg-amber-50 px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[auto_1fr] lg:gap-10">
          <span className="grid size-14 place-items-center rounded-lg bg-amber-200 text-amber-950"><Gift size={28} /></span>
          <div>
            <p className="text-sm font-bold uppercase text-amber-800">Solo per chi parteciperà live</p>
            <h2 className="mt-3 max-w-4xl text-3xl font-semibold leading-tight sm:text-4xl">
              Alla fine del webinar presenteremo anche una sorpresa riservata esclusivamente ai partecipanti collegati in diretta.
            </h2>
            <p className="mt-5 text-lg font-semibold text-slate-700">Non verrà comunicata prima del webinar.</p>
          </div>
        </div>
      </section>

      <section className="bg-emerald-950 px-5 py-14 text-white sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase text-emerald-300">Una nuova evoluzione</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
              Durante il webinar presenteremo una delle evoluzioni più importanti di Lead Host dal suo lancio.
            </h2>
            <p className="mt-6 text-lg leading-8 text-emerald-100">
              E cambierà il modo in cui alcuni Property Manager potranno accedere alle nuove opportunità immobiliari.
            </p>
            <p className="mt-5 font-bold text-white">Non anticiperemo tutto nella pagina.</p>
          </div>
          <div className="rounded-lg border border-emerald-700 bg-white/5 p-6 sm:p-8">
            <p className="text-sm font-bold uppercase text-emerald-300">Lead Host</p>
            <p className="mt-4 text-3xl font-semibold leading-tight">Gli immobili che cerchi, prima degli altri.</p>
            <Link className="btn btn-primary mt-7 w-full justify-center sm:w-auto" href="#iscrizione">
              Riserva il tuo posto gratuito <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 px-5 py-14 sm:px-8 sm:py-20 lg:px-12" id="iscrizione">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,.85fr)_minmax(420px,1.15fr)] lg:items-start">
          <div className="lg:sticky lg:top-8">
            <p className="section-kicker">Iscrizione gratuita</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-2 font-bold text-emerald-900"><CalendarDays size={18} /> Martedì 15 settembre</span>
              <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-2 font-bold text-emerald-900"><Clock3 size={18} /> Ore 21:00</span>
            </div>
            <h2 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">Riserva il tuo posto gratuito.</h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">Inserisci i tuoi dati per registrarti gratuitamente al webinar.</p>
            <p className="mt-4 flex items-center gap-2 font-bold text-amber-700"><CheckCircle2 size={19} /> I posti live sono limitati.</p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 sm:p-8">
            <p className="text-sm font-bold uppercase text-emerald-700">Modulo di iscrizione</p>
            <h3 className="mt-2 text-2xl font-semibold">Registrazioni in apertura</h3>
            <p className="mt-4 leading-7 text-slate-600">Il modulo per riservare il posto sarà disponibile qui a breve.</p>
            <div className="mt-7 rounded-lg border border-dashed border-emerald-300 bg-emerald-50 px-5 py-10 text-center">
              <CalendarDays className="mx-auto text-emerald-700" size={30} />
              <p className="mt-4 font-semibold text-emerald-950">Spazio predisposto per il modulo di iscrizione</p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-14 text-center sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-4xl">
          <p className="text-xl leading-8 text-slate-600 sm:text-2xl sm:leading-9">
            Se il tuo obiettivo è acquisire nuovi immobili da gestire, questo webinar riguarda probabilmente la parte più importante del tuo business.
          </p>
          <p className="mt-6 text-3xl font-semibold leading-tight sm:text-4xl">
            Non come gestire il prossimo immobile.
            <span className="mt-2 block text-emerald-700">Ma come trovarlo.</span>
          </p>
        </div>
      </section>
    </main>
  );
}

function PositioningStep({ icon: Icon, number, text }: { icon: typeof Eye; number: string; text: string }) {
  return (
    <article className="flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-5">
      <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-white text-emerald-700 shadow-sm"><Icon size={21} /></span>
      <div>
        <p className="text-xs font-bold text-emerald-700">{number}</p>
        <p className="mt-1 text-lg font-semibold text-slate-950">{text}</p>
      </div>
    </article>
  );
}
