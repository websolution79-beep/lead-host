"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Cloud,
  DatabaseBackup,
  ExternalLink,
  GitBranch,
  HardDrive,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type ComponentId = "database" | "storage" | "verification" | "repository";
type BackupStatus = "success" | "failure" | "cancelled" | "skipped" | "unknown";

type BackupComponent = {
  component: ComponentId;
  status: BackupStatus;
  last_attempt_at: string | null;
  last_success_at: string | null;
  run_id: string | null;
  run_url: string | null;
  metadata: Record<string, number> | null;
  updated_at: string;
};

type BackupResponse = {
  storageReady: boolean;
  components: BackupComponent[];
  error?: string;
};

const definitions: Record<
  ComponentId,
  {
    label: string;
    description: string;
    schedule: string;
    thresholdHours: number;
    icon: typeof DatabaseBackup;
  }
> = {
  database: {
    label: "Database PostgreSQL",
    description: "Dump completo cifrato e verificato prima del caricamento su R2.",
    schedule: "Ogni giorno alle 04:27 ora italiana estiva (03:27 invernale)",
    thresholdHours: 36,
    icon: DatabaseBackup,
  },
  storage: {
    label: "File Supabase Storage",
    description: "Copia incrementale cifrata di documenti, immagini e allegati.",
    schedule: "Ogni giorno alle 04:27 ora italiana estiva (03:27 invernale)",
    thresholdHours: 36,
    icon: HardDrive,
  },
  verification: {
    label: "Verifica esterna",
    description: "Controllo dei manifesti e dell'esistenza degli oggetti salvati su R2.",
    schedule: "Al termine di ogni backup giornaliero",
    thresholdHours: 36,
    icon: ShieldCheck,
  },
  repository: {
    label: "Repository GitHub",
    description: "Mirror completo cifrato del codice e della cronologia Git.",
    schedule: "Ogni domenica alle 05:41 ora italiana estiva (04:41 invernale)",
    thresholdHours: 192,
    icon: GitBranch,
  },
};

const orderedComponents: ComponentId[] = [
  "database",
  "storage",
  "verification",
  "repository",
];

function formatDate(value: string | null) {
  if (!value) return "Non ancora registrato";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "unit",
    unit: "megabyte",
    maximumFractionDigits: 2,
  }).format(value / 1024 / 1024);
}

function isStale(component: BackupComponent | undefined, thresholdHours: number) {
  if (!component?.last_success_at) return true;
  return Date.now() - new Date(component.last_success_at).getTime() > thresholdHours * 3_600_000;
}

export function AdminBackupConsole() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [components, setComponents] = useState<BackupComponent[]>([]);
  const [storageReady, setStorageReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setError("Sessione Super Admin non trovata.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin/backup", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as BackupResponse;
    if (!response.ok) {
      setError(payload.error ?? "Non riesco a caricare il monitoraggio backup.");
      setLoading(false);
      return;
    }

    setStorageReady(payload.storageReady);
    setComponents(payload.components);
    setError(payload.error ?? "");
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadStatus(), 0);
    return () => window.clearTimeout(timer);
  }, [loadStatus]);

  const byId = useMemo(
    () => new Map(components.map((component) => [component.component, component])),
    [components],
  );
  const hasProblem = orderedComponents.some((id) => {
    const component = byId.get(id);
    return (
      !component ||
      component.status !== "success" ||
      isStale(component, definitions[id].thresholdHours)
    );
  });

  return (
    <div className="grid gap-6">
      <section className="card flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className={`flex size-12 shrink-0 items-center justify-center rounded-lg ${hasProblem ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
            {hasProblem ? <AlertTriangle size={23} /> : <CheckCircle2 size={23} />}
          </span>
          <div className="min-w-0">
            <p className="section-kicker">Stato protezione</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">
              {loading
                ? "Controllo backup in corso"
                : hasProblem
                  ? "Monitoraggio da verificare"
                  : "Backup operativi e aggiornati"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Il pannello mostra solo informazioni operative. Credenziali, chiavi di cifratura e contenuti dei backup non sono accessibili dall&apos;applicazione.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadStatus()}
          disabled={loading}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={loading ? "animate-spin" : ""} size={17} />
          Aggiorna
        </button>
      </section>

      {!storageReady ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
          Il registro di monitoraggio non è ancora inizializzato. Applica la migration <strong>backup_monitoring</strong> e avvia una volta i due workflow di backup.
        </section>
      ) : null}
      {error ? (
        <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800">{error}</section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        {orderedComponents.map((id) => {
          const definition = definitions[id];
          const component = byId.get(id);
          const stale = isStale(component, definition.thresholdHours);
          const healthy = component?.status === "success" && !stale;
          const Icon = definition.icon;
          const metadata = component?.metadata ?? {};

          return (
            <article key={id} className="card min-w-0 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                    <Icon size={20} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-ink">{definition.label}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{definition.description}</p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${healthy ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                  {healthy ? "Operativo" : component ? "Da verificare" : "In attesa"}
                </span>
              </div>

              <dl className="mt-5 grid gap-3 border-t border-slate-100 pt-5 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">Ultimo successo</dt>
                  <dd className="mt-1 font-semibold text-ink">{formatDate(component?.last_success_at ?? null)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Ultimo tentativo</dt>
                  <dd className="mt-1 font-semibold text-ink">{formatDate(component?.last_attempt_at ?? null)}</dd>
                </div>
                {typeof metadata.encryptedBytes === "number" ? (
                  <div>
                    <dt className="text-slate-500">Archivio cifrato</dt>
                    <dd className="mt-1 font-semibold text-ink">{formatBytes(metadata.encryptedBytes)}</dd>
                  </div>
                ) : null}
                {typeof metadata.objects === "number" ? (
                  <div>
                    <dt className="text-slate-500">Oggetti protetti</dt>
                    <dd className="mt-1 font-semibold text-ink">{metadata.objects.toLocaleString("it-IT")}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-5 flex flex-col gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="flex items-start gap-2 text-slate-600">
                  <Clock3 className="mt-0.5 shrink-0" size={16} />
                  {definition.schedule}
                </span>
                {component?.run_url ? (
                  <a className="inline-flex shrink-0 items-center gap-1 font-semibold text-green hover:underline" href={component.run_url} target="_blank" rel="noreferrer">
                    Apri esecuzione <ExternalLink size={14} />
                  </a>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>

      <section className="card grid gap-5 p-5 sm:p-6 lg:grid-cols-[auto_1fr]">
        <span className="flex size-11 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
          <Cloud size={21} />
        </span>
        <div>
          <p className="section-kicker">Secondo livello</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Backup gestiti Supabase Pro</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Supabase esegue anche il backup giornaliero gestito del database. Il backup esterno su Cloudflare R2 protegge separatamente database, Storage e repository, evitando un unico punto di ripristino.
          </p>
        </div>
      </section>
    </div>
  );
}
