import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ArrowRight, BadgeCheck, LockKeyhole, PanelsTopLeft } from "lucide-react";

export default function MarketingPage() {
  return (
    <AppShell section="pm" eyebrow="Marketing" title="Modulo Marketing">
      <div className="grid gap-6">
        <section className="card overflow-hidden p-6 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">
                <LockKeyhole size={14} />
                Anteprima privata Super Admin
              </div>
              <h2 className="mt-5 text-2xl font-semibold text-ink sm:text-3xl">
                Uno spazio operativo per acquisire e valutare immobili.
              </h2>
              <p className="mt-4 max-w-2xl leading-7 text-muted">
                Il modulo è in costruzione e resta visibile solo a te. I Property Manager
                non vedono questa sezione, non possono aprirla tramite URL e non ricevono
                riferimenti alla prova gratuita.
              </p>
            </div>
            <Link className="btn btn-primary w-full lg:w-auto" href="/app/marketing/crm">
              Apri CRM
              <ArrowRight size={17} />
            </Link>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Link className="card group p-5 transition hover:border-green/40 hover:shadow-md" href="/app/marketing/crm">
            <span className="grid size-11 place-items-center rounded-lg bg-green text-white"><PanelsTopLeft size={21} /></span>
            <h3 className="mt-5 text-xl font-semibold text-ink">CRM</h3>
            <p className="mt-2 leading-6 text-muted">Pipeline personalizzabile per seguire ogni proprietario, attività e prossimi contatti.</p>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-green">Entra nel CRM <ArrowRight size={16} /></span>
          </Link>
          <article className="card p-5 opacity-80">
            <span className="grid size-11 place-items-center rounded-lg bg-slate-100 text-slate-500"><BadgeCheck size={21} /></span>
            <h3 className="mt-5 text-xl font-semibold text-ink">Rendita Stimata</h3>
            <p className="mt-2 leading-6 text-muted">Calcolo della possibile rendita e PDF brandizzato: lo realizzeremo come secondo blocco del modulo.</p>
            <span className="mt-5 inline-flex text-sm font-bold text-slate-500">In arrivo</span>
          </article>
        </section>
      </div>
    </AppShell>
  );
}
