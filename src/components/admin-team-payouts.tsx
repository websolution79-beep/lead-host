"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, CircleX, Plus, X } from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { formatCurrencyCents } from "@/lib/auth/roles";

type MemberBalance = {
  memberId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  roleName: string;
  accruedCents: number;
  paidCents: number;
  dueCents: number;
};
type Payout = {
  id: string;
  memberId: string;
  status: "completed" | "voided";
  amountCents: number;
  paymentMethod: "paypal" | "bank_transfer" | "cash" | "other";
  paymentReference: string | null;
  notes: string | null;
  paidAt: string;
  voidReason: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
  roleName: string;
};
type Payload = {
  featureEnabled: boolean;
  summary: { accruedCents: number; paidCents: number; dueCents: number };
  memberBalances: MemberBalance[];
  payouts: Payout[];
  error?: string;
};
type Draft = {
  memberId: string;
  amount: string;
  paymentMethod: Payout["paymentMethod"];
  paymentReference: string;
  notes: string;
  paidAt: string;
};

export function AdminTeamPayouts({ onChanged }: { onChanged?: () => void }) {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [payload, setPayload] = useState<Payload>({ featureEnabled: false, summary: { accruedCents: 0, paidCents: 0, dueCents: 0 }, memberBalances: [], payouts: [] });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [voidTarget, setVoidTarget] = useState<Payout | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);
  const load = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    const response = await fetch("/api/admin/team/payouts", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const result = (await response.json()) as Payload;
    if (!response.ok) setError(result.error ?? "Non riesco a caricare le liquidazioni.");
    else setPayload(result);
    setLoading(false);
  }, [getToken]);

  useEffect(() => { const id = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(id); }, [load]);

  function openDraft() {
    const first = payload.memberBalances.find((member) => member.dueCents > 0);
    setDraft({ memberId: first?.memberId ?? "", amount: first ? formatInput(first.dueCents) : "", paymentMethod: "bank_transfer", paymentReference: "", notes: "", paidAt: toLocalDateTime(new Date()) });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true); setError("");
    const token = await getToken();
    const response = await fetch("/api/admin/team/payouts", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        memberId: draft.memberId,
        amountCents: parseCents(draft.amount),
        paymentMethod: draft.paymentMethod,
        paymentReference: draft.paymentReference,
        notes: draft.notes,
        paidAt: new Date(draft.paidAt).toISOString(),
      }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) setError(result.error ?? "Liquidazione non registrata.");
    else { setDraft(null); await load(); onChanged?.(); }
    setSaving(false);
  }

  async function voidPayout() {
    if (!voidTarget || voidReason.trim().length < 3) return;
    setSaving(true);
    const token = await getToken();
    const response = await fetch("/api/admin/team/payouts", { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ payoutId: voidTarget.id, reason: voidReason }) });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) setError(result.error ?? "Liquidazione non annullata.");
    else { setVoidTarget(null); setVoidReason(""); await load(); onChanged?.(); }
    setSaving(false);
  }

  const payableMembers = payload.memberBalances.filter((member) => member.dueCents > 0);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="section-kicker">Liquidazioni</p><h4 className="mt-1 text-lg font-semibold text-ink">Pagamenti collaboratori</h4><p className="mt-1 text-sm leading-6 text-muted">Registra i pagamenti effettuati esternamente a Lead Host, anche parziali.</p></div>
        <button className="btn btn-primary w-full sm:w-auto" type="button" onClick={openDraft} disabled={!payload.featureEnabled || !payableMembers.length}><Plus size={17} /> Registra pagamento</button>
      </div>
      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Summary label="Maturato" value={payload.summary.accruedCents} />
        <Summary label="Già pagato" value={payload.summary.paidCents} />
        <Summary label="Da pagare" value={payload.summary.dueCents} accent />
      </div>
      {loading ? <p className="py-8 text-center text-sm text-muted">Carico liquidazioni...</p> : payload.payouts.length ? (
        <div className="mt-5 grid gap-3">
          {payload.payouts.map((payout) => <article key={payout.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-ink">{nameOf(payout)}</strong><span className={payout.status === "completed" ? "rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700" : "rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600"}>{payout.status === "completed" ? "Pagato" : "Annullato"}</span></div><p className="mt-1 text-xs text-muted">{methodLabel(payout.paymentMethod)} · {formatDate(payout.paidAt)}{payout.paymentReference ? ` · Rif. ${payout.paymentReference}` : ""}</p>{payout.voidReason ? <p className="mt-1 text-xs text-red-600">Motivo: {payout.voidReason}</p> : null}</div><div className="flex items-center justify-between gap-3 sm:justify-end"><strong className="text-lg text-green">{formatCurrencyCents(payout.amountCents)}</strong>{payout.status === "completed" ? <button className="btn" type="button" onClick={() => { setVoidTarget(payout); setVoidReason(""); }} title="Annulla registrazione"><CircleX size={16} /> Annulla</button> : null}</div></article>)}
        </div>
      ) : <p className="mt-5 text-sm text-muted">Nessuna liquidazione registrata.</p>}

      {draft ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3 sm:p-6" role="dialog" aria-modal="true"><form className="max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl sm:p-6" onSubmit={submit}><div className="flex items-start justify-between gap-3"><div><p className="section-kicker">Nuova liquidazione</p><h3 className="mt-1 text-xl font-semibold text-ink">Registra pagamento</h3></div><button className="icon-button" type="button" onClick={() => setDraft(null)} aria-label="Chiudi"><X size={19} /></button></div><div className="mt-5 grid gap-4"><label className="grid gap-2 text-sm font-semibold">Collaboratore<select className="input" required value={draft.memberId} onChange={(event) => { const member = payableMembers.find((item) => item.memberId === event.target.value); setDraft((current) => current ? { ...current, memberId: event.target.value, amount: member ? formatInput(member.dueCents) : "" } : current); }}><option value="">Seleziona</option>{payableMembers.map((member) => <option key={member.memberId} value={member.memberId}>{nameOf(member)} · da pagare {formatCurrencyCents(member.dueCents)}</option>)}</select></label><label className="grid gap-2 text-sm font-semibold">Importo pagato<input className="input" inputMode="decimal" required value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /></label><label className="grid gap-2 text-sm font-semibold">Metodo<select className="input" value={draft.paymentMethod} onChange={(event) => setDraft({ ...draft, paymentMethod: event.target.value as Draft["paymentMethod"] })}><option value="bank_transfer">Bonifico bancario</option><option value="paypal">PayPal</option><option value="cash">Contanti</option><option value="other">Altro</option></select></label><label className="grid gap-2 text-sm font-semibold">Data e ora<input className="input" type="datetime-local" required value={draft.paidAt} onChange={(event) => setDraft({ ...draft, paidAt: event.target.value })} /></label><label className="grid gap-2 text-sm font-semibold">Riferimento pagamento<input className="input" value={draft.paymentReference} onChange={(event) => setDraft({ ...draft, paymentReference: event.target.value })} placeholder="CRO, ID PayPal o altro riferimento" /></label><label className="grid gap-2 text-sm font-semibold">Note<textarea className="input min-h-24" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label></div><button className="btn btn-primary mt-5 w-full" type="submit" disabled={saving}><Banknote size={17} /> {saving ? "Registrazione..." : "Conferma pagamento"}</button></form></div> : null}
      {voidTarget ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3 sm:p-6" role="dialog" aria-modal="true"><div className="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="section-kicker">Conferma richiesta</p><h3 className="mt-1 text-xl font-semibold text-ink">Annulla liquidazione</h3></div><button className="icon-button" type="button" onClick={() => setVoidTarget(null)} aria-label="Chiudi"><X size={19} /></button></div><p className="mt-4 text-sm leading-6 text-muted">La registrazione di {formatCurrencyCents(voidTarget.amountCents)} verrà annullata e l&apos;importo tornerà tra i compensi da pagare.</p><label className="mt-4 grid gap-2 text-sm font-semibold">Motivo<textarea className="input min-h-24" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder="Indica il motivo dell'annullamento" /></label><div className="mt-5 grid gap-2 sm:grid-cols-2"><button className="btn" type="button" onClick={() => setVoidTarget(null)}>Mantieni pagamento</button><button className="btn border-red-200 text-red-700" type="button" disabled={saving || voidReason.trim().length < 3} onClick={() => void voidPayout()}><CircleX size={16} /> {saving ? "Annullamento..." : "Annulla pagamento"}</button></div></div></div> : null}
    </section>
  );
}

function Summary({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) { return <div className="rounded-lg bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-muted">{label}</p><p className={`mt-2 text-xl font-semibold ${accent ? "text-green" : "text-ink"}`}>{formatCurrencyCents(value)}</p></div>; }
function nameOf(person: { firstName: string | null; lastName: string | null; email: string }) { return [person.firstName, person.lastName].filter(Boolean).join(" ") || person.email; }
function methodLabel(method: Payout["paymentMethod"]) { return { paypal: "PayPal", bank_transfer: "Bonifico bancario", cash: "Contanti", other: "Altro" }[method]; }
function formatDate(value: string) { return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function formatInput(cents: number) { return (cents / 100).toFixed(2).replace(".", ","); }
function parseCents(value: string) { const parsed = Number(value.replace(/\s/g, "").replace(",", ".")); return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0; }
function toLocalDateTime(date: Date) { const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16); }
