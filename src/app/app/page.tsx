import { AppShell } from "@/components/app-shell";

const metrics = [
  ["Lead compatibili", "12"],
  ["Contatti sbloccati", "4"],
  ["Spesa mese", "116 EUR"],
];

export default function PropertyManagerDashboardPage() {
  return (
    <AppShell section="pm" eyebrow="Property Manager" title="Dashboard">
      <div className="grid gap-4 sm:grid-cols-3">
        {metrics.map(([label, value]) => (
          <div key={label} className="card p-5">
            <p className="text-sm font-semibold text-muted">{label}</p>
            <p className="mt-3 text-3xl font-semibold text-ink">{value}</p>
          </div>
        ))}
      </div>
      <section className="mt-6 border-t border-ink/10 pt-6">
        <h2 className="text-xl font-semibold text-ink">Prossima fase PM</h2>
        <p className="mt-2 max-w-2xl leading-7 text-muted">
          La Fase 5 colleghera onboarding, verifica, servizi offerti e copertura
          geografica. Questa dashboard e pronta per ricevere quei dati.
        </p>
      </section>
    </AppShell>
  );
}
