"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clipboard,
  Code2,
  FileText,
  Globe2,
  KeyRound,
  Link2,
  Megaphone,
  Route,
  Settings2,
  ShieldCheck,
} from "lucide-react";

type AcquisitionTab = "overview" | "owners" | "meta" | "manual";

type AcquisitionAdminConsoleProps = {
  initialTab?: string;
  ownerLandingUrl: string;
  ownerEmbedUrl: string;
  metaEndpointUrl: string;
  metaConfig: {
    appId: boolean;
    appSecret: boolean;
    verifyToken: boolean;
    systemUserAccessToken: boolean;
  };
};

const tabs: { id: AcquisitionTab; label: string; icon: typeof Megaphone }[] = [
  { id: "overview", label: "Panoramica", icon: Megaphone },
  { id: "owners", label: "Form proprietari", icon: FileText },
  { id: "meta", label: "Meta Lead Ads", icon: Link2 },
  { id: "manual", label: "Manuale/API", icon: Code2 },
];

export function AcquisitionAdminConsole({
  initialTab,
  ownerLandingUrl,
  ownerEmbedUrl,
  metaEndpointUrl,
  metaConfig,
}: AcquisitionAdminConsoleProps) {
  const normalizedInitialTab = tabs.some((tab) => tab.id === initialTab)
    ? (initialTab as AcquisitionTab)
    : "overview";
  const [activeTab, setActiveTab] = useState<AcquisitionTab>(normalizedInitialTab);
  const configuredItems = Object.values(metaConfig).filter(Boolean).length;
  const metaReady = configuredItems === Object.values(metaConfig).length;

  const activeContent = useMemo(() => {
    if (activeTab === "owners") {
      return <OwnersTab landingUrl={ownerLandingUrl} embedUrl={ownerEmbedUrl} />;
    }

    if (activeTab === "meta") {
      return (
        <MetaTab
          endpointUrl={metaEndpointUrl}
          config={metaConfig}
          configuredItems={configuredItems}
          ready={metaReady}
        />
      );
    }

    if (activeTab === "manual") {
      return <ManualTab />;
    }

    return <OverviewTab metaReady={metaReady} configuredItems={configuredItems} />;
  }, [activeTab, configuredItems, metaConfig, metaEndpointUrl, metaReady, ownerEmbedUrl, ownerLandingUrl]);

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 lg:grid-cols-3">
        <AcquisitionSummary
          icon={FileText}
          label="Form proprietari"
          value="Attivo"
          description="Le richieste dalla landing entrano direttamente in Lead."
          tone="green"
        />
        <AcquisitionSummary
          icon={Link2}
          label="Meta Lead Ads"
          value={metaReady ? "Configurabile" : "Da completare"}
          description="Webhook ed endpoint sono centralizzati in questa sezione."
          tone={metaReady ? "green" : "slate"}
        />
        <AcquisitionSummary
          icon={Route}
          label="Destinazione"
          value="Lead pending"
          description="Ogni canale confluisce nella pagina Lead per verifica."
          tone="blue"
        />
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 bg-white p-3">
          <div className="admin-acquisition-tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  className={`admin-acquisition-tab ${
                    activeTab === tab.id ? "admin-acquisition-tab-active" : ""
                  }`}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="p-5 sm:p-6">{activeContent}</div>
      </section>
    </div>
  );
}

function OverviewTab({
  metaReady,
  configuredItems,
}: {
  metaReady: boolean;
  configuredItems: number;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div>
        <p className="section-kicker">Flusso unico</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink">
          Tutti i canali finiscono nella stessa coda Lead
        </h2>
        <p className="mt-3 max-w-3xl leading-7 text-muted">
          Acquisizione serve per configurare e monitorare le fonti. La lavorazione
          operativa resta in Lead: pending, approvazione, marketplace, slot,
          esclusiva e acquirenti.
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <FlowStep number="1" title="Acquisizione" text="Landing, Meta, manuale o API." />
          <FlowStep number="2" title="Normalizzazione" text="Dati uniformi in Supabase." />
          <FlowStep number="3" title="Lead" text="Verifica e pubblicazione." />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-paper p-4">
        <p className="text-sm font-bold text-ink">Stato configurazione</p>
        <div className="mt-4 grid gap-3">
          <StatusLine label="Form proprietari" ready />
          <StatusLine
            label={`Meta Lead Ads (${configuredItems}/4)`}
            ready={metaReady}
          />
          <StatusLine label="Manuale/API" ready={false} muted="Previsto" />
        </div>
      </div>
    </div>
  );
}

function OwnersTab({ landingUrl, embedUrl }: { landingUrl: string; embedUrl: string }) {
  const trackedEmbedUrl = `${embedUrl}?utm_source=landing-esterna&utm_medium=iframe&utm_campaign=nome-campagna`;
  const iframeCode = `<iframe src="${trackedEmbedUrl}" width="100%" height="920" style="border:0;max-width:100%;" loading="lazy" title="Richiesta proprietario Lead Host"></iframe>`;

  return (
    <div className="grid gap-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div>
        <p className="section-kicker">Form proprietari</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink">
          Canale landing ed embed proprietari
        </h2>
        <p className="mt-3 max-w-3xl leading-7 text-muted">
          Il form proprietari salva richiesta, immobile, contatti, consenso privacy e
          attribuzione marketing. I lead arrivano in stato pending nella pagina Lead.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <InfoTile title="Landing interna" text="/proprietari" />
          <InfoTile title="Embed iframe" text="/embed/richiesta-proprietario" />
          <InfoTile title="Destinazione" text="owner_requests + properties" />
          <InfoTile title="Stato iniziale" text="Pending" />
          <InfoTile title="Azioni admin" text="Approva, pubblica o scarta" />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-mint p-4">
        <p className="flex items-center gap-2 text-sm font-bold text-green">
          <ShieldCheck size={17} />
          Privacy
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          Nel marketplace restano riservati nome, cognome, telefono ed email del
          proprietario fino all&apos;acquisto del lead.
        </p>
      </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <Globe2 size={17} className="text-green" />
            URL disponibili
          </p>
          <div className="mt-4 grid gap-3">
            <CodeBlock label="Landing proprietari" value={landingUrl} />
            <CodeBlock label="Form embeddabile" value={embedUrl} />
            <CodeBlock label="Embed con tracking" value={trackedEmbedUrl} />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <Code2 size={17} className="text-green" />
            Codice iframe
          </p>
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-950 p-4 text-sm font-semibold text-white">
            <code className="break-all">{iframeCode}</code>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted">
            Cambia i parametri UTM per distinguere dominio, campagna o landing esterna.
          </p>
        </div>
      </div>
    </div>
  );
}

function MetaTab({
  endpointUrl,
  config,
  configuredItems,
  ready,
}: {
  endpointUrl: string;
  config: AcquisitionAdminConsoleProps["metaConfig"];
  configuredItems: number;
  ready: boolean;
}) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div>
          <p className="section-kicker">Meta Lead Ads</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">
            Endpoint webhook per Facebook e Instagram
          </h2>
          <p className="mt-3 max-w-3xl leading-7 text-muted">
            Questo endpoint riceve verifica webhook e notifiche leadgen. La GET
            gestisce la challenge di Meta; la POST valida la firma, salva l'evento
            raw, recupera il lead dal Graph API e crea una richiesta proprietario
            in stato pending.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-paper p-4">
          <p className="text-sm font-bold text-ink">Configurazione</p>
          <p className="mt-1 text-sm text-muted">
            {ready
              ? "Variabili principali presenti."
              : `${configuredItems}/4 variabili configurate.`}
          </p>
          <div className="mt-4 grid gap-3">
            <StatusLine label="META_APP_ID" ready={config.appId} />
            <StatusLine label="META_APP_SECRET" ready={config.appSecret} />
            <StatusLine label="META_VERIFY_TOKEN" ready={config.verifyToken} />
            <StatusLine
              label="META_SYSTEM_USER_ACCESS_TOKEN"
              ready={config.systemUserAccessToken}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <Globe2 size={17} className="text-green" />
            Endpoint Lead Ads
          </p>
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-950 p-4 text-sm font-semibold text-white">
            <code className="break-all">{endpointUrl}</code>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <InfoTile title="Metodo GET" text="Verifica webhook Meta" />
            <InfoTile title="Metodo POST" text="Import leadgen firmato" />
            <InfoTile title="Verify token" text="META_VERIFY_TOKEN" />
            <InfoTile title="Output" text="Lead pending in area admin" />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <Settings2 size={17} className="text-green" />
            Flusso attivo
          </p>
          <div className="mt-4 grid gap-3">
            <ChecklistItem text="Verifica X-Hub-Signature-256 sulla POST." />
            <ChecklistItem text="Recupero dati completi tramite Graph API." />
            <ChecklistItem text="Mapping campi Meta verso modello proprietario." />
            <ChecklistItem text="Deduplica tramite leadgen_id e idempotency key." />
          </div>
        </div>
      </div>
    </div>
  );
}

function ManualTab() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div>
        <p className="section-kicker">Manuale/API</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink">
          Inserimenti interni e integrazioni future
        </h2>
        <p className="mt-3 max-w-3xl leading-7 text-muted">
          Questa tab resta pronta per lead creati manualmente dal team o ricevuti da
          partner esterni via API. Anche questi confluiranno nella pagina Lead in
          stato pending.
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-paper p-4">
        <p className="flex items-center gap-2 text-sm font-bold text-ink">
          <KeyRound size={17} className="text-green" />
          Sicurezza prevista
        </p>
        <p className="mt-2 text-sm leading-6 text-muted">
          Ogni endpoint API dovra usare chiavi server-side, idempotenza, audit log e
          validazione schema prima di creare richieste proprietario.
        </p>
      </div>
    </div>
  );
}

function AcquisitionSummary({
  icon: Icon,
  label,
  value,
  description,
  tone,
}: {
  icon: typeof Megaphone;
  label: string;
  value: string;
  description: string;
  tone: "green" | "blue" | "slate";
}) {
  const tones = {
    green: "bg-mint text-green",
    blue: "bg-blue-100 text-blue-700",
    slate: "bg-slate-100 text-slate-700",
  };

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-muted">{label}</p>
          <p className="mt-2 text-xl font-semibold text-ink">{value}</p>
        </div>
        <span className={`rounded-lg p-2 ${tones[tone]}`}>
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}

function FlowStep({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-paper p-4">
      <span className="inline-flex size-8 items-center justify-center rounded-full bg-mint text-sm font-bold text-green">
        {number}
      </span>
      <p className="mt-3 font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm leading-6 text-muted">{text}</p>
    </div>
  );
}

function InfoTile({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-paper p-3">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
        {title}
      </p>
      <p className="mt-1 text-sm font-semibold text-ink">{text}</p>
    </div>
  );
}

function CodeBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
        {label}
      </p>
      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-ink">
        <code className="break-all">{value}</code>
      </div>
    </div>
  );
}

function StatusLine({
  label,
  ready,
  muted,
}: {
  label: string;
  ready: boolean;
  muted?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
      <span className="font-semibold text-ink">{label}</span>
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
          ready ? "bg-mint text-green" : "bg-slate-100 text-slate-600"
        }`}
      >
        {ready ? <CheckCircle2 size={13} /> : <Clipboard size={13} />}
        {ready ? "OK" : muted ?? "Da configurare"}
      </span>
    </div>
  );
}

function ChecklistItem({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 text-sm leading-6 text-muted">
      <CheckCircle2 className="mt-0.5 shrink-0 text-green" size={16} />
      {text}
    </p>
  );
}
