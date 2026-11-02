"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Mail, RefreshCw, Save } from "lucide-react";
import { DateTime } from "luxon";
import { useAppSession } from "@/components/app-session-provider";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { getLeadAccessToken } from "@/lib/auth/lead-access-token";
import { hasAdminPermission } from "@/lib/admin/permissions";
import { bookingCallTaskSchema, type BookingCallTask } from "@/lib/booking-call/contracts";
import { formatCents } from "@/lib/config/commercial";

const labels = { to_schedule: "Da organizzare", in_progress: "In lavorazione", scheduled: "Appuntamento fissato", refunded: "Riaccreditato" };
const emailLabels = { pending: "In attesa di invio", processing: "Invio in corso", sent: "Notifiche inviate", skipped: "Invio annullato" };

export function AdminBookingCallTask({ bookingId, leadId, embedded = false }: { bookingId?: string; leadId?: string; embedded?: boolean }) {
  const session = useAppSession();
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [task, setTask] = useState<BookingCallTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState("to_schedule");
  const [date, setDate] = useState("");
  const mutation = useRef(false);
  const canWrite = Boolean(session.isSuperAdmin || (session.adminPermissions && hasAdminPermission(session.adminPermissions, "leads", "write")));
  const acceptTask = useCallback((value: unknown) => {
    const next = value ? bookingCallTaskSchema.parse(value) : null;
    setTask(next);
    setStatus(next?.status ?? "to_schedule");
    setDate(next?.scheduledAt ? DateTime.fromISO(next.scheduledAt).setZone("Europe/Rome").toFormat("yyyy-MM-dd'T'HH:mm") : "");
  }, []);
  const request = useCallback(async (method: "GET" | "PATCH" | "POST", body?: object, signal?: AbortSignal) => {
    const token = await getLeadAccessToken(supabase, session.userId);
    if (!token) throw new Error("Sessione non disponibile. Effettua nuovamente l'accesso.");
    const params = new URLSearchParams(bookingId ? { id: bookingId } : { leadId: leadId ?? "" });
    const response = await fetch(`/api/admin/booking-calls${method === "GET" ? `?${params}` : ""}`, {
      method, signal, cache: "no-store", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Booking non disponibile.");
    return payload;
  }, [bookingId, leadId, session.userId, supabase]);

  useEffect(() => {
    const controller = new AbortController();
    void request("GET", undefined, controller.signal).then(payload => {
      if (!controller.signal.aborted) { acceptTask(payload.bookingCall); setError(""); }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Booking non disponibile."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [acceptTask, request]);

  async function update(retryEmail = false) {
    if (!task || mutation.current) return;
    const scheduled = status === "scheduled" ? DateTime.fromISO(date, { zone: "Europe/Rome" }) : null;
    if (!retryEmail && scheduled && !scheduled.isValid) { setError("Inserisci data e ora dell'appuntamento."); return; }
    mutation.current = true;
    setBusy(true); setError(""); setNotice("");
    try {
      const payload = await request(retryEmail ? "POST" : "PATCH", retryEmail ? { id: task.id } : { id: task.id, status, scheduledAt: scheduled?.toUTC().toISO() ?? null });
      if (!retryEmail) { acceptTask(payload.bookingCall); setNotice("Appuntamento aggiornato."); }
      else {
        setNotice(payload.queued ? "Riprova richiesta. Gli invii gia riusciti non saranno duplicati." : "Notifica gia in elaborazione.");
        acceptTask((await request("GET")).bookingCall);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Operazione non riuscita."); }
    finally { mutation.current = false; setBusy(false); }
  }

  if (embedded && !task && !error) return null;
  if (loading) return <p className="py-4 text-sm text-muted" role="status">Caricamento booking...</p>;
  if (!task) return <p className="py-4 text-sm text-muted" role="status">{error || "Nessun booking disponibile per il tuo account."}</p>;
  const refunded = task.status === "refunded";
  return <section className={`${embedded ? "mt-5 border-t border-slate-200 pt-5" : "mx-auto max-w-4xl"} text-ink`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-xl font-semibold"><CalendarClock className="text-green" size={22} /> Booking Call</h2>
      <span className={`rounded-md border px-3 py-1 text-sm font-semibold ${refunded ? "border-red-200 bg-red-50 text-red-800" : "border-green/25 bg-green/10 text-green"}`}>{labels[task.status]}</span>
    </div>
    <h3 className="mt-4 text-lg font-semibold">{task.leadTitle}</h3>
    <p className="mt-1 text-sm text-muted">Coordinatore: {task.coordinatorName ?? "Da assegnare al qualificatore"}</p>
    <div className="mt-5 grid gap-5 border-y border-slate-200 py-5 sm:grid-cols-2">
      <Contact title="Proprietario" {...task.owner} />
      <Contact title="Property Manager" {...task.buyer} />
    </div>
    <p className="mt-4 text-sm text-muted">{refunded ? "Booking annullato e compenso booking stornato." : task.needsAttribution ? "Compenso booking da attribuire al qualificatore." : `Compenso booking di ${formatCents(task.compensationCents)} gia maturato all'acquisto.`}</p>
    {task.needsAttribution && session.isSuperAdmin ? <Link className="mt-2 inline-block font-semibold text-green underline" href="/admin/team">Apri i compensi da attribuire</Link> : null}
    {!refunded ? <div className="mt-5 grid items-end gap-3 sm:grid-cols-2">
      <label className="min-w-0 text-sm font-semibold">Stato
        <select aria-label="Stato booking" className="filter-select mt-2 w-full" value={status} disabled={!canWrite || busy} onChange={event => setStatus(event.target.value)}>
          <option value="to_schedule">Da organizzare</option><option value="in_progress">In lavorazione</option><option value="scheduled">Appuntamento fissato</option>
        </select>
      </label>
      {status === "scheduled" ? <label className="min-w-0 text-sm font-semibold">Data e ora (Italia)
        <input className="form-input mt-2" type="datetime-local" value={date} disabled={!canWrite || busy} onChange={event => setDate(event.target.value)} />
      </label> : null}
      {canWrite ? <button className="btn btn-primary sm:justify-self-start" type="button" disabled={busy} onClick={() => void update()}><Save size={17} />{busy ? "Attendi..." : "Salva"}</button> : null}
    </div> : null}
    <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4 text-sm">
      <span className="flex items-center gap-2"><Mail size={17} />{task.emailStatus ? emailLabels[task.emailStatus] : "Notifica non disponibile"}</span>
      {canWrite && !refunded ? <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void update(true)}><RefreshCw size={16} />Riprova notifica</button> : null}
    </div>
    {error ? <p className="mt-4 text-sm font-semibold text-red-700" role="alert">{error}</p> : null}
    {notice ? <p className="mt-4 text-sm font-semibold text-green" role="status">{notice}</p> : null}
  </section>;
}

function Contact({ title, firstName, lastName, email, phone }: { title: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null }) {
  return <div className="min-w-0 text-sm"><p className="font-bold text-muted">{title}</p><p className="mt-2 font-semibold">{[firstName, lastName].filter(Boolean).join(" ") || "Non indicato"}</p>
    {phone ? <a className="mt-2 block break-words text-green underline" href={`tel:${phone}`}>{phone}</a> : null}
    {email ? <a className="mt-2 block break-all text-green underline" href={`mailto:${email}`}>{email}</a> : null}
  </div>;
}
