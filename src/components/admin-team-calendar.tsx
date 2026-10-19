"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type FullCalendarType from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import luxonPlugin from "@fullcalendar/luxon3";
import itLocale from "@fullcalendar/core/locales/it";
import { DateTime } from "luxon";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, MinusCircle, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { useAppSession } from "@/components/app-session-provider";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { calendarEntrySchema, expandCalendarEntries, projectCalendarOccurrences, TEAM_TIME_ZONE, type CalendarEntry, type CalendarFields, type CalendarMember } from "@/lib/team-calendar";
import styles from "./admin-team-calendar.module.css";
import { canManageCalendarEntry, type CalendarViewer } from "@/lib/team-calendar-access";

const FullCalendar = dynamic(() => import("./team-calendar-view"), { ssr: false, loading: () => <div className="min-h-96 animate-pulse bg-slate-50" /> });
const plugins = [dayGridPlugin, timeGridPlugin, listPlugin, luxonPlugin];
const input = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50";
type Payload = { storageReady: boolean; members: CalendarMember[]; entries: CalendarEntry[]; viewer: CalendarViewer };
function today() { return DateTime.now().setZone(TEAM_TIME_ZONE).toISODate()!; }
function blank(memberId: string): CalendarFields {
  return { member_id: memberId, kind: "available", start_date: today(), end_date: today(), all_day: false, start_time: "09:00", end_time: "13:00", repeats_weekly: false, repeat_until: null, note: "" };
}

export function AdminTeamCalendar() {
  const session = useAppSession();
  const hasAccess = Boolean(session.isSuperAdmin || session.roles.includes("team_member"));
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const calendar = useRef<FullCalendarType | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const requestVersion = useRef(0);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [memberFilter, setMemberFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [initialView, setInitialView] = useState<string | null>(null);
  const [view, setView] = useState("timeGridWeek");
  const [title, setTitle] = useState("");
  const [range, setRange] = useState({ start: today(), end: DateTime.now().setZone(TEAM_TIME_ZONE).plus({ days: 8 }).toISODate()! });
  const [editing, setEditing] = useState<CalendarEntry | null>(null);
  const [form, setForm] = useState<CalendarFields | null>(null);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const viewer = data?.viewer ?? { isSuperAdmin: Boolean(session.isSuperAdmin), memberId: null };
  const selectableMembers = (data?.members ?? []).filter((member) => member.active && canManageCalendarEntry(viewer, member.id));
  const canEdit = editing ? canManageCalendarEntry(viewer, editing.member_id) : selectableMembers.length > 0;

  const request = useCallback(async (method: string, body?: unknown) => {
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) throw new Error("Sessione scaduta. Accedi nuovamente.");
    const response = await fetch("/api/admin/team-calendar", { method, cache: "no-store", headers: { Authorization: `Bearer ${auth.session.access_token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) {
      if (result.overlap) return { ...result, needsConfirmation: true };
      throw new Error(result.error || "Operazione non riuscita.");
    }
    return result;
  }, [supabase]);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true); setError("");
    try { const result = await request("GET"); if (version === requestVersion.current) setData(result); }
    catch (e) { if (version === requestVersion.current) setError(e instanceof Error ? e.message : "Errore di caricamento."); }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, [request]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const next = window.matchMedia("(max-width: 767px)").matches ? "listDay" : "timeGridWeek";
      setInitialView(next); setView(next);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!hasAccess) return;
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [hasAccess, load]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (form) dialog.current?.showModal();
    else dialog.current?.close();
  }, [form]);

  const occurrences = useMemo(() => expandCalendarEntries(data?.entries ?? [], range.start, range.end), [data?.entries, range]);
  const events = useMemo(() => projectCalendarOccurrences(occurrences, view, range.start, range.end).filter((e) => (!memberFilter || e.memberId === memberFilter) && (!kindFilter || e.kind === kindFilter)).map((e) => {
    const member = data?.members.find((m) => m.id === e.memberId);
    const entry = data?.entries.find((entry) => entry.id === e.entryId);
    const color = member?.color ?? "#008568";
    return { ...e, title: member?.name ?? "Membro del team", backgroundColor: `${color}18`, borderColor: color, textColor: "#17202a", extendedProps: { entryId: e.entryId, kind: e.kind, note: entry?.note, recurring: entry?.repeats_weekly, fullDay: e.fullDay } };
  }), [occurrences, data, memberFilter, kindFilter, view, range]);

  const summary = useMemo(() => {
    const date = DateTime.fromMillis(now).setZone(TEAM_TIME_ZONE);
    const dayEvents = expandCalendarEntries(data?.entries ?? [], date.toISODate()!, date.plus({ days: 1 }).toISODate()!);
    const current = dayEvents.filter((e) => DateTime.fromISO(e.start, { zone: TEAM_TIME_ZONE }).toMillis() <= now && DateTime.fromISO(e.end, { zone: TEAM_TIME_ZONE }).toMillis() > now);
    return (data?.members ?? []).filter((m) => m.active).map((m) => {
      const own = current.filter((e) => e.memberId === m.id);
      return { ...m, state: own.some((e) => e.kind === "absent") ? "absent" : own.length ? "available" : "unknown" };
    });
  }, [data, now]);

  function open(entry?: CalendarEntry) {
    setEditing(entry ?? null); setFormError(""); setSuccess("");
    setForm(entry ? { member_id: data?.members.some((m) => m.id === entry.member_id && m.active) ? entry.member_id : "", kind: entry.kind, start_date: entry.start_date, end_date: entry.end_date, all_day: entry.all_day, start_time: entry.start_time, end_time: entry.end_time, repeats_weekly: entry.repeats_weekly, repeat_until: entry.repeat_until, note: entry.note } : blank(selectableMembers[0]?.id ?? ""));
  }
  function change<K extends keyof CalendarFields>(key: K, value: CalendarFields[K]) { setForm((previous) => previous ? { ...previous, [key]: value } : previous); }

  async function save(event: FormEvent) {
    event.preventDefault(); if (!form || busy || !canEdit) return;
    const parsed = calendarEntrySchema.safeParse(form);
    if (!parsed.success) { setFormError(parsed.error.issues[0].message); return; }
    setBusy(true); setFormError("");
    const body = { entry: parsed.data, ...(editing ? { id: editing.id, updatedAt: editing.updated_at } : {}) };
    try {
      const result = await request(editing ? "PATCH" : "POST", body);
      if (result.needsConfirmation) {
        if (!window.confirm(result.error)) return;
        await request(editing ? "PATCH" : "POST", { ...body, allowOverlap: true });
      }
      setForm(null); setSuccess("Calendario aggiornato."); await load();
    } catch (e) { setFormError(e instanceof Error ? e.message : "Errore durante il salvataggio."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!editing || busy || !canEdit || !window.confirm(editing.repeats_weekly ? "Eliminare tutta la serie settimanale?" : "Eliminare questo evento?")) return;
    setBusy(true); setFormError("");
    try { await request("DELETE", { id: editing.id, updatedAt: editing.updated_at }); setForm(null); setSuccess("Evento eliminato."); await load(); }
    catch (e) { setFormError(e instanceof Error ? e.message : "Eliminazione non riuscita."); }
    finally { setBusy(false); }
  }

  if (!hasAccess) return null;
  return <div className={styles.root}>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800"><CalendarDays size={18} /> Calendario del team</span>
      <span className="text-xs text-slate-500">Orari di Roma</span>
    </div>
    {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    {success && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>}
    {data && !data.storageReady && <div role="status" className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Calendario non ancora attivato: applicare la migration 202610190001_team_calendar.sql. Nessun dato esistente viene modificato.</div>}
    <div className="mb-6 grid gap-4 sm:grid-cols-3">
      {[{ state: "available", label: "Disponibili adesso", icon: CheckCircle2, color: "text-emerald-700" }, { state: "absent", label: "Assenti adesso", icon: MinusCircle, color: "text-red-700" }, { state: "unknown", label: "Non indicato adesso", icon: CalendarDays, color: "text-slate-500" }].map(({ state, label, icon: Icon, color }) => <section key={state} className="border-b border-slate-200 pb-4">
        <div className={`flex items-center gap-2 text-sm font-semibold ${color}`}><Icon size={17} />{label}<span className="ml-auto text-lg">{summary.filter((m) => m.state === state).length}</span></div>
        <div className="mt-3 flex flex-wrap gap-2">{summary.filter((m) => m.state === state).map((m) => <span key={m.id} className="rounded border px-2 py-1 text-xs font-medium" style={{ borderColor: m.color, background: `${m.color}12` }}>{m.name}</span>)}{!summary.some((m) => m.state === state) && <span className="text-sm text-slate-400">Nessuno</span>}</div>
      </section>)}
    </div>
    <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-2"><button className={button} title="Periodo precedente" aria-label="Periodo precedente" onClick={() => calendar.current?.getApi().prev()}><ChevronLeft size={18} /></button><button className={button} title="Periodo successivo" aria-label="Periodo successivo" onClick={() => calendar.current?.getApi().next()}><ChevronRight size={18} /></button><button className={button} onClick={() => calendar.current?.getApi().today()}>Oggi</button><h2 className="ml-1 text-sm font-semibold text-slate-900 sm:text-base" aria-live="polite">{title}</h2></div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto"><button className={button} onClick={() => void load()} disabled={loading} title="Aggiorna calendario" aria-label="Aggiorna calendario"><RefreshCw size={17} className={loading ? "animate-spin" : ""} /></button><button className={`${primary} flex-1 sm:flex-none`} disabled={!data?.storageReady || loading || !selectableMembers.length} onClick={() => open()}><Plus size={18} />Aggiungi evento</button></div>
    </div>
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      <label className="grid gap-1.5 text-xs font-semibold text-slate-600">Membro<select className={input} value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)}><option value="">Tutto il team</option>{data?.members.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <label className="grid gap-1.5 text-xs font-semibold text-slate-600">Tipo<select className={input} value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}><option value="">Disponibilita e assenze</option><option value="available">Disponibilita</option><option value="absent">Assenze</option></select></label>
      <label className="grid gap-1.5 text-xs font-semibold text-slate-600">Vista<select className={input} value={view} onChange={(e) => { setView(e.target.value); calendar.current?.getApi().changeView(e.target.value); }}><option value="timeGridDay">Giorno</option><option value="timeGridWeek">Settimana</option><option value="dayGridMonth">Mese</option><option value="listDay">Agenda del giorno</option><option value="listWeek">Agenda della settimana</option></select></label>
    </div>
    <div className={styles.legend}>{data?.members.filter((m) => m.active).map((m) => <span key={m.id}><span className="size-2.5 shrink-0 rounded-full" style={{ background: m.color }} />{m.name}</span>)}</div>
    <div aria-busy={loading} className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
      {initialView && <FullCalendar calendarRef={calendar} plugins={plugins} locale={itLocale} timeZone={TEAM_TIME_ZONE} initialView={initialView} initialDate={today()} headerToolbar={false} firstDay={1} height={view.startsWith("timeGrid") ? 720 : "auto"} slotMinTime="09:00:00" slotMaxTime="20:00:00" scrollTime="09:00:00" nowIndicator allDaySlot={false} allDayText="Intera giornata" noEventsText="Nessuna disponibilita o assenza indicata" dayMaxEvents={3} slotEventOverlap={false} eventMinHeight={56} events={events} editable={false} eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        datesSet={(info) => { setTitle(info.view.title); setRange({ start: info.startStr.slice(0, 10), end: info.endStr.slice(0, 10) }); }}
        eventClick={(info) => { const entry = data?.entries.find((e) => e.id === info.event.extendedProps.entryId); if (entry) open(entry); }}
        eventDidMount={(info) => { info.el.title = [info.event.title, info.event.extendedProps.kind === "absent" ? "Assente" : "Disponibile", info.event.extendedProps.fullDay ? "Intera giornata" : info.timeText, info.event.extendedProps.note].filter(Boolean).join(" - "); }}
        eventContent={(info) => <div className={styles.eventDetails}><strong className="block">{info.event.title}</strong>{info.event.extendedProps.fullDay && info.view.type.startsWith("timeGrid") ? <span className="block">Intera giornata</span> : info.timeText && <span className="block">{info.timeText}</span>}<span className={`${styles.eventStatus} ${info.event.extendedProps.kind === "absent" ? "text-red-700" : "text-emerald-800"}`}>{info.event.extendedProps.kind === "absent" ? <MinusCircle size={12} /> : <CheckCircle2 size={12} />}{info.event.extendedProps.kind === "absent" ? "Assente" : "Disponibile"}</span></div>}
      />}
    </div>
    <dialog ref={dialog} aria-labelledby="team-calendar-dialog-title" onCancel={(e) => { if (busy) e.preventDefault(); else setForm(null); }} onClose={() => { if (!busy) setForm(null); }} className={styles.dialog}>
      {form && <form onSubmit={save}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-5"><h2 id="team-calendar-dialog-title" className="text-lg font-semibold text-slate-900">{editing ? canEdit ? "Modifica evento" : "Dettaglio evento" : "Nuova disponibilita o assenza"}</h2><button type="button" className={button} disabled={busy} onClick={() => setForm(null)} title="Chiudi" aria-label="Chiudi"><X size={18} /></button></div>
        {!canEdit && <p className="px-5 pt-4 text-sm font-semibold text-slate-600">Evento di un altro membro: sola lettura.</p>}
        <fieldset disabled={busy || !canEdit} className="grid gap-4 p-5">
          {editing?.repeats_weekly && canEdit && <p className="text-sm font-medium text-amber-800">La modifica riguarda tutta la serie settimanale.</p>}
          {canEdit ? <label className="grid gap-1 text-sm font-semibold">Membro del team<select required className={input} value={form.member_id} onChange={(e) => change("member_id", e.target.value)}><option value="">Seleziona membro</option>{selectableMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label> : <div className="text-sm"><span className="font-semibold">Membro del team</span><p className="mt-1">{data?.members.find((m) => m.id === editing?.member_id)?.name ?? "Membro del team"}</p></div>}
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tipo evento">{(["available", "absent"] as const).map((kind) => <button type="button" key={kind} aria-pressed={form.kind === kind} data-kind={kind} className={styles.statusChoice} onClick={() => change("kind", kind)}><span>{kind === "available" ? <CheckCircle2 size={16} /> : <MinusCircle size={16} />}{kind === "available" ? "Disponibile" : "Assente"}</span><small aria-hidden="true">{form.kind === kind ? "Selezionato" : "\u00a0"}</small></button>)}</div>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-emerald-700" checked={form.all_day} onChange={(e) => setForm({ ...form, all_day: e.target.checked, start_time: e.target.checked ? null : "09:00", end_time: e.target.checked ? null : "13:00" })} />Tutto il giorno</label>
          <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1 text-sm font-semibold">Dal giorno<input type="date" required className={input} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value, end_date: form.repeats_weekly || form.end_date < e.target.value ? e.target.value : form.end_date })} /></label><label className="grid gap-1 text-sm font-semibold">Al giorno (compreso)<input type="date" required disabled={form.repeats_weekly} min={form.start_date} className={input} value={form.end_date} onChange={(e) => change("end_date", e.target.value)} /></label></div>
          {!form.all_day && <div className="grid grid-cols-2 gap-4"><label className="grid gap-1 text-sm font-semibold">Dalle<input type="time" required className={input} value={form.start_time ?? ""} onChange={(e) => change("start_time", e.target.value)} /></label><label className="grid gap-1 text-sm font-semibold">Alle<input type="time" required className={input} value={form.end_time ?? ""} onChange={(e) => change("end_time", e.target.value)} /></label></div>}
          <label className="grid gap-1 text-sm font-semibold">Ripetizione<select className={input} value={form.repeats_weekly ? "weekly" : "none"} onChange={(e) => setForm({ ...form, repeats_weekly: e.target.value === "weekly", end_date: e.target.value === "weekly" ? form.start_date : form.end_date, repeat_until: e.target.value === "weekly" ? DateTime.fromISO(form.start_date).plus({ months: 3 }).toISODate()! : null })}><option value="none">Non ripetere</option><option value="weekly">Ogni settimana, nello stesso giorno</option></select></label>
          {form.repeats_weekly && <label className="grid gap-1 text-sm font-semibold">Ripeti fino al<input type="date" required min={form.start_date} max={DateTime.fromISO(form.start_date).plus({ days: 366 }).toISODate()!} className={input} value={form.repeat_until ?? ""} onChange={(e) => change("repeat_until", e.target.value)} /></label>}
          <label className="grid gap-1 text-sm font-semibold">Nota facoltativa<textarea className={`${input} min-h-20 resize-y`} maxLength={1000} value={form.note} onChange={(e) => change("note", e.target.value)} /></label>
          {formError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{formError}</div>}
        </fieldset>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 p-5">{editing && canEdit && <button type="button" className={`${button} mr-auto !border-red-200 !text-red-700`} disabled={busy} onClick={() => void remove()}><Trash2 size={16} />Elimina</button>}<button type="button" className={button} disabled={busy} onClick={() => setForm(null)}>{canEdit ? "Annulla" : "Chiudi"}</button>{canEdit && <button type="submit" className={primary} disabled={busy}><Save size={16} />{busy ? "Salvataggio..." : "Salva"}</button>}</div>
      </form>}
    </dialog>
  </div>;
}
