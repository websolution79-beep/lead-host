"use client";

import { useState } from "react";
import {
  BadgeEuro,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Crown,
  FileWarning,
  Inbox,
  MessageSquareWarning,
  Percent,
  Receipt,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  Target,
  Timer,
  UserPlus,
  UserRoundCheck,
  Users,
  WalletCards,
  XCircle,
} from "lucide-react";
import {
  MetricCard,
  RangeSelector,
  RankList,
  TrendBars,
} from "@/components/admin-analytics-elements";
import {
  ANALYTICS_RANGE_OPTIONS,
  type AnalyticsRangeKey,
} from "@/lib/admin/business-analytics";
import { useBusinessAnalytics } from "@/lib/admin/use-business-analytics";
import { formatCurrencyCents } from "@/lib/auth/roles";

type AnalyticsTab =
  | "overview"
  | "leads"
  | "wallet"
  | "propertyManagers"
  | "prime"
  | "operations";

const tabs: Array<{ key: AnalyticsTab; label: string }> = [
  { key: "overview", label: "Panoramica" },
  { key: "leads", label: "Lead e funnel" },
  { key: "wallet", label: "Vendite e wallet" },
  { key: "propertyManagers", label: "Property Manager" },
  { key: "prime", label: "Lead Host PRIME" },
  { key: "operations", label: "Operatività" },
];

export function AdminAnalyticsConsole() {
  const [selectedRange, setSelectedRange] =
    useState<AnalyticsRangeKey>("last30");
  const [query, setQuery] = useState<{
    range: AnalyticsRangeKey;
    from?: string;
    to?: string;
  }>({ range: "last30" });
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [tab, setTab] = useState<AnalyticsTab>("overview");
  const { payload, loading, refreshing, error, reload } =
    useBusinessAnalytics({
      range: query.range,
      customFrom: query.from,
      customTo: query.to,
    });

  function selectRange(value: AnalyticsRangeKey) {
    setSelectedRange(value);
    if (value !== "custom") {
      setQuery({ range: value });
    }
  }

  if (loading && !payload) {
    return <AnalyticsSkeleton />;
  }

  if (error || !payload) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">
        {error || "Analytics non disponibili."}
      </div>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <RangeSelector
            value={selectedRange}
            options={ANALYTICS_RANGE_OPTIONS}
            onChange={selectRange}
          />
          <div className="flex items-center gap-3">
            <p className="text-xs font-semibold text-slate-500">
              Aggiornato {formatDateTime(payload.generatedAt)}
            </p>
            <button
              className="icon-button"
              type="button"
              aria-label="Aggiorna Analytics"
              title="Aggiorna Analytics"
              disabled={refreshing}
              onClick={reload}
            >
              <RefreshCw
                size={17}
                className={refreshing ? "animate-spin" : undefined}
              />
            </button>
          </div>
        </div>

        {selectedRange === "custom" ? (
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
            <DateField
              label="Data iniziale"
              value={customFrom}
              onChange={setCustomFrom}
            />
            <DateField
              label="Data finale"
              value={customTo}
              onChange={setCustomTo}
            />
            <button
              className="btn btn-primary min-h-11"
              type="button"
              disabled={!customFrom || !customTo}
              onClick={() =>
                setQuery({
                  range: "custom",
                  from: customFrom,
                  to: customTo,
                })
              }
            >
              <CalendarDays size={17} />
              Applica periodo
            </button>
          </div>
        ) : null}

        <p className="mt-3 text-xs font-semibold text-muted">
          Periodo visualizzato: {payload.range.label}. Le variazioni confrontano
          il periodo precedente equivalente.
        </p>
      </section>

      <div
        className="flex max-w-full gap-1 overflow-x-auto border-b border-slate-200"
        role="tablist"
        aria-label="Sezioni Analytics"
      >
        {tabs.map((item) => (
          <button
            key={item.key}
            className={`min-h-11 shrink-0 border-b-2 px-4 text-sm font-bold ${
              tab === item.key
                ? "border-green text-green"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? <Overview payload={payload} /> : null}
      {tab === "leads" ? <LeadAnalytics payload={payload} /> : null}
      {tab === "wallet" ? <WalletAnalytics payload={payload} /> : null}
      {tab === "propertyManagers" ? (
        <PropertyManagerAnalytics payload={payload} />
      ) : null}
      {tab === "prime" ? <PrimeAnalytics payload={payload} /> : null}
      {tab === "operations" ? <OperationsAnalytics payload={payload} /> : null}
    </div>
  );
}

function Overview({
  payload,
}: {
  payload: NonNullable<ReturnType<typeof useBusinessAnalytics>["payload"]>;
}) {
  const { current, previous } = payload;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          icon={Inbox}
          label="Lead proprietari"
          value={String(current.ownerRequests)}
          current={current.ownerRequests}
          previous={previous.ownerRequests}
        />
        <MetricCard
          icon={CheckCircle2}
          label="Lead pubblicati"
          value={String(current.publishedLeads)}
          current={current.publishedLeads}
          previous={previous.publishedLeads}
        />
        <MetricCard
          icon={ShoppingCart}
          label="Acquisti Lead"
          value={String(current.purchases)}
          current={current.purchases}
          previous={previous.purchases}
          accent="slate"
        />
        <MetricCard
          icon={BadgeEuro}
          label="Valore acquisti"
          value={formatCurrencyCents(current.purchaseValueCents)}
          current={current.purchaseValueCents}
          previous={previous.purchaseValueCents}
          accent="blue"
        />
        <MetricCard
          icon={Banknote}
          label="Ricariche wallet"
          value={formatCurrencyCents(current.topUpCents)}
          current={current.topUpCents}
          previous={previous.topUpCents}
        />
        <MetricCard
          icon={UserRoundCheck}
          label="PM acquirenti"
          value={String(current.uniqueBuyers)}
          current={current.uniqueBuyers}
          previous={previous.uniqueBuyers}
        />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="section-kicker">Andamento del periodo</p>
        <h2 className="mt-1 text-xl font-semibold text-ink">
          Acquisizione, pubblicazione e acquisti
        </h2>
        <div className="mt-5">
          <TrendBars
            rows={payload.trends}
            series={[
              {
                key: "ownerRequests",
                label: "Lead arrivati",
                color: "bg-emerald-600",
              },
              {
                key: "publishedLeads",
                label: "Lead pubblicati",
                color: "bg-blue-500",
              },
              {
                key: "purchases",
                label: "Acquisti",
                color: "bg-slate-800",
              },
            ]}
          />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Funnel rows={payload.funnel} />
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="section-kicker">Indicatori chiave</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">
            Efficienza marketplace
          </h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <SummaryValue
              label="Tasso pubblicazione"
              value={`${current.publicationRate}%`}
            />
            <SummaryValue
              label="Tasso vendita"
              value={`${current.sellThroughRate}%`}
            />
            <SummaryValue
              label="Acquisto medio"
              value={formatCurrencyCents(current.averagePurchaseCents)}
            />
            <SummaryValue
              label="Acquisti medi per cliente"
              value={String(current.averagePurchasesPerBuyer)}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function LeadAnalytics({
  payload,
}: {
  payload: NonNullable<ReturnType<typeof useBusinessAnalytics>["payload"]>;
}) {
  const { current, previous } = payload;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Inbox}
          label="Lead arrivati"
          value={String(current.ownerRequests)}
          current={current.ownerRequests}
          previous={previous.ownerRequests}
        />
        <MetricCard
          icon={CheckCircle2}
          label="Pubblicati"
          value={String(current.publishedLeads)}
          current={current.publishedLeads}
          previous={previous.publishedLeads}
          accent="blue"
        />
        <MetricCard
          icon={XCircle}
          label="Non validi"
          value={String(current.rejectedLeads)}
          current={current.rejectedLeads}
          previous={previous.rejectedLeads}
          detail={`${current.invalidRate}% dei Lead ricevuti`}
          accent="amber"
        />
        <MetricCard
          icon={Clock3}
          label="Scaduti"
          value={String(current.expiredLeads)}
          current={current.expiredLeads}
          previous={previous.expiredLeads}
          accent="slate"
        />
        <MetricCard
          icon={ShoppingCart}
          label="Lead acquistati"
          value={String(current.soldLeads)}
          current={current.soldLeads}
          previous={previous.soldLeads}
        />
        <MetricCard
          icon={Percent}
          label="Tasso pubblicazione"
          value={`${current.publicationRate}%`}
          current={current.publicationRate}
          previous={previous.publicationRate}
        />
        <MetricCard
          icon={Timer}
          label="Tempo medio pubblicazione"
          value={formatDurationHours(current.averagePublishHours)}
          current={current.averagePublishHours}
          previous={previous.averagePublishHours}
          accent="blue"
        />
        <MetricCard
          icon={Target}
          label="Tempo al primo acquisto"
          value={formatDurationHours(current.averageFirstPurchaseHours)}
          current={current.averageFirstPurchaseHours}
          previous={previous.averageFirstPurchaseHours}
          accent="amber"
        />
      </div>

      <Funnel rows={payload.funnel} />

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <RankList
          title="Canali di acquisizione"
          rows={payload.dimensions.acquisitionChannels}
        />
        <RankList title="Città principali" rows={payload.dimensions.topCities} />
        <RankList
          title="Tipologie immobili"
          rows={payload.dimensions.propertyTypes}
        />
        <RankList
          title="Servizi richiesti"
          rows={payload.dimensions.topServices}
        />
      </section>
    </div>
  );
}

function WalletAnalytics({
  payload,
}: {
  payload: NonNullable<ReturnType<typeof useBusinessAnalytics>["payload"]>;
}) {
  const { current, previous, snapshot } = payload;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Banknote}
          label="Ricariche completate"
          value={formatCurrencyCents(current.topUpCents)}
          current={current.topUpCents}
          previous={previous.topUpCents}
          detail={`${current.topUpCount} transazioni`}
        />
        <MetricCard
          icon={BadgeEuro}
          label="Valore acquisti lordo"
          value={formatCurrencyCents(current.purchaseValueCents)}
          current={current.purchaseValueCents}
          previous={previous.purchaseValueCents}
          accent="blue"
        />
        <MetricCard
          icon={RotateCcw}
          label="Riaccrediti wallet"
          value={formatCurrencyCents(current.refundCents)}
          current={current.refundCents}
          previous={previous.refundCents}
          detail={`${current.refundCount} riaccrediti`}
          accent="amber"
        />
        <MetricCard
          icon={WalletCards}
          label="Credito wallet attuale"
          value={formatCurrencyCents(snapshot.walletBalanceCents)}
          detail="Saldo complessivo in circolazione"
          accent="slate"
        />
        <MetricCard
          icon={ShoppingCart}
          label="Numero acquisti"
          value={String(current.purchases)}
          current={current.purchases}
          previous={previous.purchases}
        />
        <MetricCard
          icon={Target}
          label="Acquisto medio"
          value={formatCurrencyCents(current.averagePurchaseCents)}
          current={current.averagePurchaseCents}
          previous={previous.averagePurchaseCents}
        />
        <MetricCard
          icon={Receipt}
          label="Ricarica media"
          value={formatCurrencyCents(current.averageTopUpCents)}
          current={current.averageTopUpCents}
          previous={previous.averageTopUpCents}
          accent="blue"
        />
        <MetricCard
          icon={BadgeEuro}
          label="Valore Lead netto"
          value={formatCurrencyCents(current.netLeadValueCents)}
          current={current.netLeadValueCents}
          previous={previous.netLeadValueCents}
          detail="Acquisti lordi meno riaccrediti"
          accent="slate"
        />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="section-kicker">Andamento economico</p>
        <h2 className="mt-1 text-xl font-semibold text-ink">
          Ricariche e utilizzo del credito
        </h2>
        <div className="mt-5">
          <TrendBars
            rows={payload.trends}
            series={[
              {
                key: "topUpCents",
                label: "Ricariche wallet",
                color: "bg-emerald-600",
                format: formatCurrencyCents,
              },
              {
                key: "purchaseValueCents",
                label: "Valore acquisti",
                color: "bg-blue-600",
                format: formatCurrencyCents,
              },
            ]}
          />
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <BreakdownPanel
          title="Acquisti condivisi"
          count={current.sharedPurchases}
          value={formatCurrencyCents(current.sharedValueCents)}
          detail="Transazioni con contatto condiviso"
        />
        <BreakdownPanel
          title="Acquisti in esclusiva"
          count={current.exclusivePurchases}
          value={formatCurrencyCents(current.exclusiveValueCents)}
          detail="Transazioni con contatto esclusivo"
        />
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="section-kicker">Ricariche</p>
          <h3 className="mt-1 text-lg font-semibold text-ink">
            Prime e successive
          </h3>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <SummaryValue label="Prime ricariche" value={String(current.firstTopUps)} />
            <SummaryValue label="Successive" value={String(current.repeatTopUps)} />
          </div>
        </div>
      </section>

      <p className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        Le ricariche rappresentano gli incassi tramite Stripe. Il valore degli
        acquisti rappresenta invece il credito utilizzato dai PM: i due importi
        sono mostrati separatamente per evitare doppi conteggi.
      </p>
    </div>
  );
}

function PropertyManagerAnalytics({
  payload,
}: {
  payload: NonNullable<ReturnType<typeof useBusinessAnalytics>["payload"]>;
}) {
  const { current, previous, snapshot } = payload;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Users}
          label="PM attivi"
          value={String(snapshot.activePropertyManagers)}
          detail="Situazione attuale"
        />
        <MetricCard
          icon={UserPlus}
          label="Nuovi PM"
          value={String(current.newPropertyManagers)}
          current={current.newPropertyManagers}
          previous={previous.newPropertyManagers}
        />
        <MetricCard
          icon={Banknote}
          label="PM che hanno ricaricato"
          value={String(current.uniqueTopUpPms)}
          current={current.uniqueTopUpPms}
          previous={previous.uniqueTopUpPms}
          accent="blue"
        />
        <MetricCard
          icon={UserRoundCheck}
          label="PM che hanno acquistato"
          value={String(current.uniqueBuyers)}
          current={current.uniqueBuyers}
          previous={previous.uniqueBuyers}
        />
        <MetricCard
          icon={Percent}
          label="Nuovi PM diventati clienti"
          value={`${current.newPmBuyerRate}%`}
          current={current.newPmBuyerRate}
          previous={previous.newPmBuyerRate}
          detail="Registrati nel periodo con almeno un acquisto"
        />
        <MetricCard
          icon={RefreshCw}
          label="Acquirenti ricorrenti"
          value={`${current.repeatBuyerRate}%`}
          current={current.repeatBuyerRate}
          previous={previous.repeatBuyerRate}
          detail="PM con almeno due acquisti nel periodo"
          accent="blue"
        />
        <MetricCard
          icon={ShoppingCart}
          label="Acquisti medi per cliente"
          value={String(current.averagePurchasesPerBuyer)}
          current={current.averagePurchasesPerBuyer}
          previous={previous.averagePurchasesPerBuyer}
          accent="slate"
        />
        <MetricCard
          icon={BadgeEuro}
          label="Valore medio per Lead"
          value={formatCurrencyCents(current.averageRevenuePerLeadCents)}
          current={current.averageRevenuePerLeadCents}
          previous={previous.averageRevenuePerLeadCents}
          accent="amber"
        />
      </div>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="section-kicker">Attivazione</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">
            Dal wallet al primo acquisto
          </h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <SummaryValue
              label="Prime ricariche"
              value={String(current.firstTopUps)}
            />
            <SummaryValue
              label="Ricariche successive"
              value={String(current.repeatTopUps)}
            />
            <SummaryValue
              label="PM con ricarica"
              value={String(current.uniqueTopUpPms)}
            />
            <SummaryValue
              label="PM con acquisto"
              value={String(current.uniqueBuyers)}
            />
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="section-kicker">Valore cliente</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">
            Comportamento d’acquisto
          </h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <SummaryValue
              label="Acquisto medio"
              value={formatCurrencyCents(current.averagePurchaseCents)}
            />
            <SummaryValue
              label="Acquisti per cliente"
              value={String(current.averagePurchasesPerBuyer)}
            />
            <SummaryValue
              label="Acquirenti ricorrenti"
              value={`${current.repeatBuyerRate}%`}
            />
            <SummaryValue
              label="Valore netto Lead"
              value={formatCurrencyCents(current.netLeadValueCents)}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function OperationsAnalytics({
  payload,
}: {
  payload: NonNullable<ReturnType<typeof useBusinessAnalytics>["payload"]>;
}) {
  const { snapshot } = payload;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Clock3}
          label="Lead da verificare"
          value={String(snapshot.pendingReview)}
          accent="amber"
        />
        <MetricCard
          icon={FileWarning}
          label="Lead da completare"
          value={String(snapshot.waitingCompletion)}
          accent="amber"
        />
        <MetricCard
          icon={Inbox}
          label="Lead disponibili"
          value={String(snapshot.availableLeads)}
        />
        <MetricCard
          icon={Timer}
          label="Scadenza entro 24 ore"
          value={String(snapshot.expiringSoon)}
          accent="slate"
        />
        <MetricCard
          icon={MessageSquareWarning}
          label="Assistenze da rispondere"
          value={String(snapshot.supportAwaitingAdmin)}
          accent="amber"
        />
        <MetricCard
          icon={RotateCcw}
          label="Rimborsi da gestire"
          value={String(snapshot.pendingRefunds)}
          accent="blue"
        />
        <MetricCard
          icon={Receipt}
          label="Fatture da gestire"
          value={String(snapshot.invoicesToManage)}
          accent="slate"
        />
        <MetricCard
          icon={XCircle}
          label="Possibili duplicati"
          value={String(snapshot.duplicateWarnings)}
          accent="amber"
        />
      </div>

      <section className="grid gap-5 lg:grid-cols-3">
        <RankList
          title="Stato inventario Lead"
          rows={payload.operations.leadStatuses}
        />
        <RankList
          title="Stato assistenze"
          rows={payload.operations.supportStatuses}
        />
        <RankList
          title="Stato fatture"
          rows={payload.operations.invoiceStatuses}
        />
      </section>
    </div>
  );
}

function PrimeAnalytics({
  payload,
}: {
  payload: NonNullable<ReturnType<typeof useBusinessAnalytics>["payload"]>;
}) {
  const { current, previous, snapshot } = payload.prime;
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Crown} label="Abbonati PRIME attivi" value={String(snapshot.active)} />
        <MetricCard icon={UserPlus} label="Nuove attivazioni" value={String(current.activations)} current={current.activations} previous={previous.activations} accent="blue" />
        <MetricCard icon={RefreshCw} label="Rinnovi" value={String(current.renewals)} current={current.renewals} previous={previous.renewals} />
        <MetricCard icon={BadgeEuro} label="Incassi PRIME" value={formatCurrencyCents(current.totalPaidCents)} current={current.totalPaidCents} previous={previous.totalPaidCents} accent="blue" />
        <MetricCard icon={Receipt} label="Ricavi membership" value={formatCurrencyCents(current.membershipCents)} current={current.membershipCents} previous={previous.membershipCents} />
        <MetricCard icon={WalletCards} label="Credito Wallet incluso" value={formatCurrencyCents(current.walletRechargeCents)} current={current.walletRechargeCents} previous={previous.walletRechargeCents} accent="slate" />
        <MetricCard icon={UserRoundCheck} label="PM paganti nel periodo" value={String(current.uniquePropertyManagers)} current={current.uniquePropertyManagers} previous={previous.uniquePropertyManagers} />
        <MetricCard icon={Clock3} label="Pagamenti da gestire" value={String(snapshot.pastDue)} accent="amber" />
      </div>
      <section className="grid gap-5 md:grid-cols-3">
        <BreakdownPanel title="Rinnovi annullati" count={snapshot.cancelAtPeriodEnd} value="Fine periodo programmata" detail="Abbonamenti ancora attivi che non si rinnoveranno" />
        <BreakdownPanel title="Pagamento in ritardo" count={snapshot.pastDue} value="Grace period" detail="PM da contattare prima della sospensione" />
        <BreakdownPanel title="Abbonamenti cancellati" count={snapshot.cancelled} value="Storico" detail="Account PRIME non più attivi" />
      </section>
    </div>
  );
}

function Funnel({
  rows,
}: {
  rows: NonNullable<
    ReturnType<typeof useBusinessAnalytics>["payload"]
  >["funnel"];
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <p className="section-kicker">Funnel Lead</p>
      <h2 className="mt-1 text-xl font-semibold text-ink">
        Dal contatto alla vendita
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Il funnel segue le richieste acquisite nel periodo selezionato.
      </p>
      <div className="mt-5 grid gap-4">
        {rows.map((row) => (
          <div key={row.key ?? row.label}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-slate-700">
                {row.label}
              </span>
              <span className="text-sm font-bold text-ink">{row.value}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-600"
                style={{
                  width: `${row.value ? Math.max((row.value / max) * 100, 2) : 0}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function BreakdownPanel({
  title,
  count,
  value,
  detail,
}: {
  title: string;
  count: number;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <p className="section-kicker">Marketplace</p>
      <h3 className="mt-1 text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-4 text-3xl font-semibold text-ink">{value}</p>
      <p className="mt-2 text-sm font-semibold text-muted">
        {count} acquisti · {detail}
      </p>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-bold uppercase text-slate-500">
        {label}
      </span>
      <input
        className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-ink"
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="grid animate-pulse gap-6">
      <div className="h-24 rounded-lg bg-slate-100" />
      <div className="h-12 rounded-lg bg-slate-100" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="h-36 rounded-lg bg-slate-100" />
        ))}
      </div>
      <div className="h-72 rounded-lg bg-slate-100" />
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDurationHours(value: number) {
  if (!value) return "0 ore";
  if (value < 24) return `${value.toLocaleString("it-IT")} ore`;

  return `${(value / 24).toLocaleString("it-IT", {
    maximumFractionDigits: 1,
  })} giorni`;
}
