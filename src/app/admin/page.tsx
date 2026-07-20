import { AppShell } from "@/components/app-shell";

const queues = [
  ["Acquisiti oggi", "18"],
  ["Da verificare", "7"],
  ["Pubblicati", "24"],
  ["Ricavi mese", "812 EUR"],
];

export default function AdminDashboardPage() {
  return (
    <AppShell section="admin" eyebrow="Super Admin" title="Dashboard">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {queues.map(([label, value]) => (
          <div key={label} className="card p-5">
            <p className="text-sm font-semibold text-muted">{label}</p>
            <p className="mt-3 text-3xl font-semibold text-ink">{value}</p>
          </div>
        ))}
      </div>
      <section className="mt-6 border-t border-ink/10 pt-6">
        <h2 className="text-xl font-semibold text-ink">
          Pipeline centrale pronta
        </h2>
        <p className="mt-2 max-w-2xl leading-7 text-muted">
          Meta Lead Ads e landing proprietari confluiranno in acquisizione,
          normalizzazione, duplicati, qualificazione, approvazione e
          pubblicazione.
        </p>
      </section>
    </AppShell>
  );
}
