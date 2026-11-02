"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, RefreshCw, ShoppingBag, X } from "lucide-react";
import { useAppSession } from "@/components/app-session-provider";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { getLeadAccessToken } from "@/lib/auth/lead-access-token";
import type { quoteBookingCall } from "@/lib/booking-call/config";
import { BOOKING_CALL_WAIT_NOTICE } from "@/lib/booking-call/contracts";
import { bookingCallWalletPurchaseSchema, type BookingCallWalletPurchase } from "@/lib/booking-call/wallet";
import { clearBookingCallAttempt, loadBookingCallAttempt, saveBookingCallAttempt, UnreadableBookingCallAttemptError, type BookingCallAttempt } from "@/lib/booking-call/purchase-attempt";
import { formatCents } from "@/lib/config/commercial";
import { CURRENT_TERMS_VERSION } from "@/lib/legal/terms";

export type BookingCallQuote = NonNullable<ReturnType<typeof quoteBookingCall>>;
type Props = {
  leadId: string; leadTitle: string; quote: BookingCallQuote | null; disabled: boolean;
  onBusyChange: (busy: boolean) => void; onSuccess: (receipt: BookingCallWalletPurchase) => void;
};

export function BookingCallPurchaseAction({ leadId, leadTitle, quote, disabled, onBusyChange, onSuccess }: Props) {
  const session = useAppSession();
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState<BookingCallAttempt | null>(null);
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [unreadableAttempt, setUnreadableAttempt] = useState(false);
  const sending = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  const busy = !loaded || open || pending || unreadableAttempt;
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      try {
        const saved = loadBookingCallAttempt(window.sessionStorage, session.userId, leadId);
        setAttempt(saved); setPending(Boolean(saved));
      } catch (reason) {
        setBlocked(true);
        const unreadable = reason instanceof UnreadableBookingCallAttemptError;
        setUnreadableAttempt(unreadable);
        setError(unreadable ? "Non riesco a verificare una richiesta precedente. Controlla I miei lead prima di procedere o contatta l'assistenza."
          : "Memoria del browser non accessibile. Il booking Call non e disponibile; puoi utilizzare l'acquisto ordinario.");
      }
      setLoaded(true);
    });
    return () => { active = false; };
  }, [leadId, session.userId]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !sending.current) setOpen(false);
      if (event.key !== "Tab") return;
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled)');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", onKey); previousFocus?.focus(); };
  }, [open]);

  function showConfirmation() {
    if (disabled || blocked || !loaded) return;
    if (!pending && quote) setAttempt({ version: 1, requestId: crypto.randomUUID(), leadAmountCents: quote.leadAmountCents, bookingFeeCents: quote.bookingFeeCents });
    setAccepted(false); setError(""); setErrorCode(""); setOpen(true);
  }

  async function purchase() {
    if (!attempt || !accepted || sending.current || disabled) return;
    sending.current = true; setLoading(true); setError(""); setErrorCode("");
    let submitted = false;
    try {
      const token = await getLeadAccessToken(supabase, session.userId);
      if (!token) throw new Error("Sessione scaduta. Accedi nuovamente e riprova.");
      saveBookingCallAttempt(window.sessionStorage, session.userId, leadId, attempt);
      setPending(true); submitted = true;
      const response = await fetch("/api/purchases/booking-call", {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(25_000),
        body: JSON.stringify({ leadId, requestId: attempt.requestId, expectedLeadAmountCents: attempt.leadAmountCents,
          expectedBookingFeeCents: attempt.bookingFeeCents, termsAccepted: true, termsVersion: CURRENT_TERMS_VERSION }),
      });
      const result = await response.json();
      if (!response.ok) {
        const confirmedFailure = ["PRICE_CHANGED", "INSUFFICIENT_CREDIT", "ALREADY_PURCHASED", "MARKETPLACE_MEMBERSHIP_REQUIRED", "BOOKING_REFUNDED", "BOOKING_UNAVAILABLE", "LEAD_UNAVAILABLE", "NOT_AUTHORIZED"].includes(result.code);
        if (confirmedFailure) {
          clearBookingCallAttempt(window.sessionStorage, session.userId, leadId); setPending(false);
        }
        if (result.code === "PRICE_CHANGED") {
          const changed = { ...attempt, leadAmountCents: result.leadAmountCents, bookingFeeCents: result.bookingFeeCents };
          if (Number.isInteger(changed.leadAmountCents) && changed.leadAmountCents > 0 && Number.isInteger(changed.bookingFeeCents) && changed.bookingFeeCents > 0 && changed.leadAmountCents <= 2147483647 - changed.bookingFeeCents) setAttempt(changed);
          setAccepted(false);
        }
        if (result.code === "TERMS_VERSION_CHANGED") setAccepted(false);
        setErrorCode(result.code ?? "");
        throw new Error(result.error ?? "Acquisto non confermato. Verifica I miei lead o riprova la stessa richiesta.");
      }
      const receipt = bookingCallWalletPurchaseSchema.safeParse(result);
      if (!receipt.success || receipt.data.bookingCallId !== attempt.requestId || receipt.data.leadId !== leadId ||
        receipt.data.leadAmountCents !== attempt.leadAmountCents || receipt.data.bookingFeeCents !== attempt.bookingFeeCents) {
        throw new Error("Conferma non ricevuta. Verifica I miei lead o riprova la stessa richiesta.");
      }
      try { clearBookingCallAttempt(window.sessionStorage, session.userId, leadId); } catch { /* A confirmed receipt is still a successful purchase. */ }
      setPending(false); setOpen(false); onSuccess(receipt.data);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Acquisto non confermato.";
      setError(submitted && (message.includes("fetch") || message.includes("abort") || message.includes("JSON"))
        ? "Conferma non ricevuta. Verifica I miei lead o riprova la stessa richiesta: non avvieremo un secondo acquisto." : message);
    } finally { sending.current = false; setLoading(false); }
  }

  if (!quote && !pending && !unreadableAttempt) return null;
  return <div className="grid min-w-0 gap-2">
    <button className="flex min-h-14 w-full items-center justify-center gap-2 rounded-lg border border-amber-400 bg-amber-100 px-4 py-3 text-center font-bold text-amber-950 shadow-sm transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
      type="button" disabled={disabled || !loaded || blocked} onClick={showConfirmation}>
      <CalendarClock size={20} className="shrink-0" />
      <span>{pending || unreadableAttempt ? "Verifica acquisto con booking Call" : blocked ? "Booking Call non disponibile" : `Esclusiva con appuntamento telefonico - ${formatCents(quote!.totalAmountCents)}`}</span>
    </button>
    <p className="text-sm leading-6 text-muted">Lead Host contatta te e il proprietario per organizzare la chiamata conoscitiva.</p>
    {pending || blocked ? <p className="text-sm font-semibold text-amber-900" role="status">{error || "Una richiesta attende conferma. Verifica I miei lead o riprova la stessa richiesta."} <Link className="underline" href={`/app/i-miei-lead/${leadId}`}>Apri I miei lead</Link></p> : null}
    {open && attempt ? <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget && !loading) setOpen(false); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="booking-purchase-title" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl outline-none sm:max-w-lg sm:rounded-lg sm:p-6">
        <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-amber-800">Esclusiva con booking Call</p><h2 id="booking-purchase-title" className="mt-2 text-xl font-semibold text-ink">{leadTitle}</h2></div>
          <button type="button" aria-label="Chiudi conferma booking" className="icon-button shrink-0" disabled={loading} onClick={() => setOpen(false)}><X size={20} /></button></div>
        <dl className="mt-5 grid gap-3 border-y border-slate-200 py-4 text-sm">
          <div className="flex justify-between gap-3"><dt>Lead in esclusiva</dt><dd className="font-semibold">{formatCents(attempt.leadAmountCents)}</dd></div>
          <div className="flex justify-between gap-3"><dt>Booking Call</dt><dd className="font-semibold">{formatCents(attempt.bookingFeeCents)}</dd></div>
          <div className="flex justify-between gap-3 border-t border-slate-200 pt-3"><dt className="font-semibold">Totale dal wallet</dt><dd className="text-lg font-bold">{formatCents(attempt.leadAmountCents + attempt.bookingFeeCents)}</dd></div>
        </dl>
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">{BOOKING_CALL_WAIT_NOTICE}</p>
        <p className="mt-3 text-sm leading-6 text-muted">Il team organizza la chiamata; non e garantito l&apos;affidamento dell&apos;immobile. In caso di riaccredito del lead viene restituito anche il supplemento booking.</p>
        <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-ink"><input className="mt-1 size-4 shrink-0 accent-green" type="checkbox" checked={accepted} disabled={loading} onChange={event => setAccepted(event.target.checked)} /><span>Accetto le <Link href="/termini" target="_blank" className="font-semibold text-green underline">Condizioni del Servizio</Link> e il servizio booking Call.</span></label>
        {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800" role="alert"><p>{error}</p>
          {errorCode === "INSUFFICIENT_CREDIT" ? <Link className="mt-2 inline-block font-semibold underline" href="/app/acquisti">Ricarica il wallet</Link> : null}
          <Link href={`/app/i-miei-lead/${leadId}`} className="mt-2 block font-semibold underline">Controlla I miei lead</Link>
        </div> : null}
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><button type="button" className="btn btn-secondary" disabled={loading} onClick={() => setOpen(false)}>Chiudi</button>
          <button type="button" className="btn btn-primary" disabled={loading || !accepted} onClick={() => void purchase()}>{pending ? <RefreshCw size={17} /> : <ShoppingBag size={17} />}{loading ? "Acquisto in corso..." : pending ? "Verifica e riprova" : "Conferma acquisto"}</button></div>
      </section>
    </div> : null}
  </div>;
}
