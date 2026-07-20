"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  ExternalLink,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { formatCurrencyCents } from "@/lib/auth/roles";

type WalletRow = {
  id: string;
  profile_id: string;
  balance_cents: number;
  currency: string;
};

type WalletTransaction = {
  id: string;
  type: "top_up" | "lead_purchase" | "refund" | "adjustment";
  status: "pending" | "completed" | "failed" | "cancelled";
  amount_cents: number;
  balance_after_cents: number | null;
  description: string | null;
  provider: string | null;
  lead_purchase_id: string | null;
  metadata: { lead_id?: string } | null;
  created_at: string;
};

type CommercialSettingsResponse = {
  settings?: {
    minTopUpCents: number;
    quickTopUpCents: number[];
  };
};

const transactionLabels: Record<WalletTransaction["type"], string> = {
  top_up: "Ricarica wallet",
  lead_purchase: "Acquisto lead",
  refund: "Rimborso",
  adjustment: "Rettifica",
};

export function WalletCenter() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [topUpAmount, setTopUpAmount] = useState("30");
  const [minTopUpCents, setMinTopUpCents] = useState(3000);
  const [quickTopUps, setQuickTopUps] = useState([3000, 5000, 10000]);
  const [activeTab, setActiveTab] = useState<"movements" | "lead_purchases">(
    "movements",
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadWallet() {
      const settingsResponse = await fetch("/api/settings/commercial", {
        cache: "no-store",
      }).catch(() => null);

      if (settingsResponse?.ok) {
        const payload = (await settingsResponse.json()) as CommercialSettingsResponse;
        const commercialSettings = payload.settings;

        if (commercialSettings) {
          setMinTopUpCents(commercialSettings.minTopUpCents);
          setQuickTopUps(commercialSettings.quickTopUpCents);
          setTopUpAmount((current) =>
            current === "30" ? formatAmountInput(commercialSettings.minTopUpCents) : current,
          );
        }
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();

      const typedProfile = profile as { id: string } | null;

      if (!typedProfile) return;

      const { data: walletData } = await supabase
        .from("wallets")
        .select("id,profile_id,balance_cents,currency")
        .eq("profile_id", typedProfile.id)
        .maybeSingle();

      const typedWallet = walletData as WalletRow | null;
      setWallet(typedWallet);

      if (typedWallet) {
        const { data: transactionRows } = await supabase
          .from("wallet_transactions")
          .select("id,type,status,amount_cents,balance_after_cents,description,provider,lead_purchase_id,metadata,created_at")
          .eq("wallet_id", typedWallet.id)
          .order("created_at", { ascending: false })
          .limit(30);

        setTransactions((transactionRows ?? []) as WalletTransaction[]);
      }

      setIsLoading(false);
    }

    loadWallet();
  }, [supabase]);

  const currency = wallet?.currency ?? "eur";
  const topUpAmountCents = parseTopUpAmountCents(topUpAmount);
  const canTopUp = topUpAmountCents >= minTopUpCents;
  const leadPurchaseTransactions = transactions.filter(
    (transaction) => transaction.type === "lead_purchase",
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
      <section className="card p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-green/10 text-green">
            <Wallet size={22} />
          </span>
          <div>
            <p className="section-kicker">Wallet</p>
            <h2 className="text-xl font-semibold text-ink">Saldo disponibile</h2>
          </div>
        </div>
        <p className="mt-8 text-4xl font-semibold text-ink">
          {wallet ? formatCurrencyCents(wallet.balance_cents, currency) : "0,00 EUR"}
        </p>
        <p className="mt-3 leading-7 text-muted">
          Il wallet sara usato per ricariche, acquisti lead, rimborsi e riconciliazioni
          amministrative.
        </p>

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-ink">Scegli importo ricarica</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Importo minimo di ricarica: {formatCurrencyCents(minTopUpCents, currency)}.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {quickTopUps.map((amount) => {
              const isSelected = topUpAmountCents === amount;

              return (
                <button
                  key={amount}
                  className={`rounded-lg border px-4 py-3 text-sm font-semibold transition ${
                    isSelected
                      ? "border-green bg-green/10 text-green"
                      : "border-slate-200 bg-white text-slate-700 hover:border-green/40 hover:text-green"
                  }`}
                  type="button"
                  onClick={() => setTopUpAmount(formatAmountInput(amount))}
                >
                  {formatCurrencyCents(amount, currency)}
                </button>
              );
            })}
          </div>

          <label className="mt-4 grid gap-2 text-sm font-semibold text-ink">
            Importo da caricare
            <div className="flex min-h-12 items-center rounded-lg border border-ink/12 bg-white px-4 focus-within:border-green">
              <span className="pr-3 font-semibold text-slate-500">EUR</span>
              <input
                className="min-h-11 w-full bg-transparent outline-none"
                inputMode="decimal"
                min={minTopUpCents / 100}
                placeholder={formatAmountInput(minTopUpCents)}
                value={topUpAmount}
                onChange={(event) => setTopUpAmount(event.target.value)}
              />
            </div>
          </label>

          {!canTopUp ? (
            <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              Inserisci almeno {formatCurrencyCents(minTopUpCents, currency)}.
            </p>
          ) : null}

          <button
            className="btn btn-primary mt-4 w-full opacity-60"
            type="button"
            disabled
          >
            <CreditCard size={17} />
            Ricarica {formatCurrencyCents(Math.max(topUpAmountCents, 0), currency)}
          </button>
          <p className="mt-3 text-xs leading-5 text-muted">
            Il checkout Stripe verra attivato nella fase pagamenti. Intanto puoi gia
            scegliere la somma da ricaricare.
          </p>
        </div>
      </section>

      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="section-kicker">Storico</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">Wallet e acquisti</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {activeTab === "movements"
              ? `${transactions.length} movimenti`
              : `${leadPurchaseTransactions.length} acquisti`}
          </span>
        </div>

        <div className="mt-5 grid gap-2 rounded-xl bg-slate-100 p-1 sm:grid-cols-2">
          <button
            className={tabButtonClassName(activeTab === "movements")}
            type="button"
            onClick={() => setActiveTab("movements")}
          >
            Movimenti
          </button>
          <button
            className={tabButtonClassName(activeTab === "lead_purchases")}
            type="button"
            onClick={() => setActiveTab("lead_purchases")}
          >
            Acquisti lead
          </button>
        </div>

        <div className="mt-6 grid gap-3">
          {isLoading ? (
            <p className="rounded-lg bg-slate-50 p-4 text-sm font-semibold text-muted">
              Carico movimenti...
            </p>
          ) : activeTab === "movements" && transactions.length > 0 ? (
            transactions.map((transaction) => {
              const isPositive = transaction.amount_cents > 0;
              const Icon = isPositive ? ArrowDownLeft : ArrowUpRight;

              return (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex size-10 items-center justify-center rounded-lg ${
                        isPositive ? "bg-green/10 text-green" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <Icon size={18} />
                    </span>
                    <div>
                      <p className="font-semibold text-ink">
                        {transaction.description || transactionLabels[transaction.type]}
                      </p>
                      <p className="text-sm text-muted">
                        {new Intl.DateTimeFormat("it-IT", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(transaction.created_at))}{" "}
                        - {transaction.status}
                      </p>
                    </div>
                  </div>
                  <p
                    className={`text-right font-semibold ${
                      isPositive ? "text-green" : "text-ink"
                    }`}
                  >
                    {formatCurrencyCents(transaction.amount_cents, currency)}
                  </p>
                </div>
              );
            })
          ) : (
            activeTab === "movements" ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <p className="font-semibold text-ink">Nessuna transazione ancora</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Qui compariranno ricariche wallet, acquisti lead, rimborsi e rettifiche.
              </p>
            </div>
            ) : (
              <LeadPurchasesPanel
                currency={currency}
                leadPurchaseTransactions={leadPurchaseTransactions}
              />
            )
          )}
        </div>
      </section>
    </div>
  );
}

function LeadPurchasesPanel({
  currency,
  leadPurchaseTransactions,
}: {
  currency: string;
  leadPurchaseTransactions: WalletTransaction[];
}) {
  if (leadPurchaseTransactions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
        <p className="font-semibold text-ink">Nessun acquisto lead ancora</p>
        <p className="mt-2 text-sm leading-6 text-muted">
          Qui compariranno i lead acquistati con data, modalita e importo.
        </p>
      </div>
    );
  }

  return (
    <>
      {leadPurchaseTransactions.map((transaction) => {
        const leadId = transaction.metadata?.lead_id;
        const content = (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-green/10 text-green">
                  <ShoppingBag size={18} />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-ink group-hover:text-green">
                    {transaction.description || "Acquisto lead"}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {formatDateTime(transaction.created_at)} - {transaction.status}
                  </p>
                </div>
              </div>
              {leadId ? (
                <ExternalLink
                  size={17}
                  className="shrink-0 text-slate-400 group-hover:text-green"
                />
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                Sbloccato
              </span>
              <span className="font-semibold text-ink">
                {formatCurrencyCents(transaction.amount_cents, currency)}
              </span>
            </div>
          </>
        );

        return leadId ? (
          <Link
            key={transaction.id}
            className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:border-green/30 hover:shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
            href={`/app/i-miei-lead/${leadId}`}
          >
            {content}
          </Link>
        ) : (
          <div
            key={transaction.id}
            className="group rounded-xl border border-slate-200 bg-white p-4"
          >
            {content}
          </div>
        );
      })}
    </>
  );
}

function tabButtonClassName(isActive: boolean) {
  return `min-h-10 rounded-lg px-4 text-sm font-semibold transition ${
    isActive
      ? "bg-white text-ink shadow-sm"
      : "text-slate-500 hover:bg-white/70 hover:text-ink"
  }`;
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

function parseTopUpAmountCents(value: string) {
  const normalizedValue = value.replace(",", ".").replace(/[^\d.]/g, "");
  const amount = Number.parseFloat(normalizedValue);

  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Math.round(amount * 100);
}

function formatAmountInput(amountCents: number) {
  return String(amountCents / 100);
}
