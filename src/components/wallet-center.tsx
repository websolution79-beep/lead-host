"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CreditCard, Wallet } from "lucide-react";
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
  created_at: string;
};

const quickTopUps = [2900, 5000, 10000];

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
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadWallet() {
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
          .select("id,type,status,amount_cents,balance_after_cents,description,provider,created_at")
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

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {quickTopUps.map((amount) => (
            <button
              key={amount}
              className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500"
              type="button"
              disabled
            >
              {formatCurrencyCents(amount, currency)}
            </button>
          ))}
        </div>
        <button className="btn btn-primary mt-4 w-full opacity-60" type="button" disabled>
          <CreditCard size={17} />
          Ricarica con Stripe
        </button>
        <p className="mt-3 text-xs leading-5 text-muted">
          Ricariche abilitate nella fase Stripe. Lo storico transazioni e gia pronto.
        </p>
      </section>

      <section className="card p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="section-kicker">Movimenti</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">Transazioni wallet</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {transactions.length} movimenti
          </span>
        </div>

        <div className="mt-6 grid gap-3">
          {isLoading ? (
            <p className="rounded-lg bg-slate-50 p-4 text-sm font-semibold text-muted">
              Carico movimenti...
            </p>
          ) : transactions.length > 0 ? (
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
                        · {transaction.status}
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
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <p className="font-semibold text-ink">Nessuna transazione ancora</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Qui compariranno ricariche wallet, acquisti lead, rimborsi e rettifiche.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
