"use client";

import type { ComponentType } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import {
  type AnalyticsCountRow,
  type AnalyticsRangeKey,
} from "@/lib/admin/business-analytics";

export function RangeSelector({
  value,
  options,
  onChange,
}: {
  value: AnalyticsRangeKey;
  options: Array<{ key: AnalyticsRangeKey; label: string }>;
  onChange: (value: AnalyticsRangeKey) => void;
}) {
  return (
    <div
      className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-1 lg:flex-wrap lg:overflow-x-visible"
      aria-label="Periodo analizzato"
    >
      {options.map((option) => (
        <button
          key={option.key}
          className={`min-h-10 shrink-0 rounded-md px-3 text-sm font-bold transition ${
            value === option.key
              ? "bg-white text-green shadow-sm"
              : "text-slate-600 hover:text-slate-950"
          }`}
          type="button"
          aria-pressed={value === option.key}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  current,
  previous,
  detail,
  accent = "green",
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  current?: number;
  previous?: number;
  detail?: string;
  accent?: "green" | "blue" | "amber" | "slate";
}) {
  const accentClasses = {
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-100 text-slate-700",
  };

  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${accentClasses[accent]}`}
        >
          <Icon size={19} />
        </span>
        {current !== undefined && previous !== undefined ? (
          <DeltaBadge current={current} previous={previous} />
        ) : null}
      </div>
      <p className="mt-4 break-words text-2xl font-semibold text-ink">
        {value}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-700">{label}</p>
      {detail ? (
        <p className="mt-2 text-xs leading-5 text-muted">{detail}</p>
      ) : null}
    </article>
  );
}

export function DeltaBadge({
  current,
  previous,
  invert = false,
}: {
  current: number;
  previous: number;
  invert?: boolean;
}) {
  if (current === 0 && previous === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
        <Minus size={13} />
        0%
      </span>
    );
  }

  if (previous === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
        <ArrowUpRight size={13} />
        Nuovo
      </span>
    );
  }

  const delta = Math.round(((current - previous) / Math.abs(previous)) * 100);
  const positive = invert ? delta <= 0 : delta >= 0;
  const Icon = delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold ${
        delta === 0
          ? "bg-slate-100 text-slate-600"
          : positive
            ? "bg-emerald-50 text-emerald-700"
            : "bg-red-50 text-red-700"
      }`}
      title="Variazione rispetto al periodo precedente"
    >
      <Icon size={13} />
      {Math.abs(delta)}%
    </span>
  );
}

export function RankList({
  title,
  rows,
  emptyText = "Nessun dato nel periodo.",
}: {
  title: string;
  rows: AnalyticsCountRow[];
  emptyText?: string;
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <div className="mt-4 grid gap-4">
        {rows.length ? (
          rows.slice(0, 8).map((row) => (
            <div key={`${row.label}-${row.value}`}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-semibold text-slate-700">
                  {formatMetricLabel(row.label)}
                </span>
                <span className="shrink-0 text-sm font-bold text-ink">
                  {row.value}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-600"
                  style={{ width: `${Math.max((row.value / max) * 100, 3)}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-muted">
            {emptyText}
          </p>
        )}
      </div>
    </section>
  );
}

export function TrendBars({
  rows,
  series,
}: {
  rows: Array<{ date: string; label: string } & Record<string, number | string>>;
  series: Array<{
    key: string;
    label: string;
    color: string;
    format?: (value: number) => string;
  }>;
}) {
  const max = Math.max(
    ...rows.flatMap((row) =>
      series.map((item) => Number(row[item.key]) || 0),
    ),
    1,
  );

  if (!rows.length) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 p-5 text-sm text-muted">
        Nessun andamento disponibile per il periodo selezionato.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-4">
        {series.map((item) => (
          <span
            key={item.key}
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-600"
          >
            <span className={`size-2.5 rounded-sm ${item.color}`} />
            {item.label}
          </span>
        ))}
      </div>
      <div className="max-w-full overflow-x-auto pb-2">
        <div
          className="flex h-52 min-w-full items-end gap-2"
          style={{ width: `${Math.max(rows.length * 52, 640)}px` }}
        >
          {rows.map((row) => (
            <div
              key={row.date}
              className="flex h-full min-w-0 flex-1 flex-col justify-end"
            >
              <div className="flex h-40 items-end justify-center gap-1">
                {series.map((item) => {
                  const value = Number(row[item.key]) || 0;

                  return (
                    <div
                      key={item.key}
                      className={`w-full max-w-4 rounded-t-sm ${item.color}`}
                      style={{
                        height: `${value ? Math.max((value / max) * 100, 3) : 1}%`,
                        opacity: value ? 1 : 0.18,
                      }}
                      title={`${item.label}: ${
                        item.format ? item.format(value) : value
                      }`}
                    />
                  );
                })}
              </div>
              <p className="mt-2 truncate text-center text-[11px] font-semibold text-slate-500">
                {formatTrendLabel(row.label)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function formatMetricLabel(value: string) {
  const labels: Record<string, string> = {
    landing: "Form proprietari",
    meta_lead_ads: "Meta Lead Ads",
    manual: "Manuale",
    api: "API / Make",
    available: "Disponibili",
    one_slot_sold: "Ultima quota",
    sold_two_pm: "Venduti condivisi",
    sold_exclusive: "Venduti in esclusiva",
    withdrawn_after_7_days: "Scaduti",
    cancelled: "Annullati",
    refunded: "Rimborsati",
    pending: "In attesa",
    reviewing: "In lavorazione",
    resolved: "Risolti",
    rejected: "Non accolti",
    generating: "In generazione",
    ready: "Pronte",
    downloaded: "Scaricate",
    imported: "Importate",
    sent: "Inviate",
    error: "Errore",
  };

  return labels[value] ?? value.replaceAll("_", " ");
}

function formatTrendLabel(value: string) {
  if (/^\d{4}-\d{2}$/.test(value)) {
    return new Intl.DateTimeFormat("it-IT", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    }).format(new Date(`${value}-01T00:00:00.000Z`));
  }

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}
