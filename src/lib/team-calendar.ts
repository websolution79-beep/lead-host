import { DateTime } from "luxon";
import { z } from "zod";

export const TEAM_TIME_ZONE = "Europe/Rome";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => DateTime.fromISO(s).isValid, "Data non valida.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const calendarEntrySchema = z.object({
  member_id: z.string().uuid(),
  kind: z.enum(["available", "absent"]),
  start_date: date,
  end_date: date,
  all_day: z.boolean(),
  start_time: time.nullable(),
  end_time: time.nullable(),
  repeats_weekly: z.boolean(),
  repeat_until: date.nullable(),
  note: z.string().trim().max(1000),
}).strict().superRefine((entry, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (entry.end_date < entry.start_date) fail("La data finale precede quella iniziale.");
  if (DateTime.fromISO(entry.end_date).diff(DateTime.fromISO(entry.start_date), "days").days > 366) fail("L'intervallo massimo e di un anno.");
  if (entry.all_day && (entry.start_time || entry.end_time)) fail("Per tutto il giorno non indicare gli orari.");
  if (!entry.all_day) {
    if (!entry.start_time || !entry.end_time) fail("Indica entrambi gli orari.");
    else {
      const start = DateTime.fromISO(`${entry.start_date}T${entry.start_time}`, { zone: TEAM_TIME_ZONE });
      const end = DateTime.fromISO(`${entry.end_date}T${entry.end_time}`, { zone: TEAM_TIME_ZONE });
      if (end <= start) fail("L'orario finale deve essere successivo all'inizio.");
      if (start.toFormat("HH:mm") !== entry.start_time || end.toFormat("HH:mm") !== entry.end_time) fail("Orario non valido nel cambio dell'ora legale.");
    }
  }
  if (entry.repeats_weekly) {
    if (entry.start_date !== entry.end_date) fail("Una fascia settimanale deve iniziare e terminare nello stesso giorno.");
    if (!entry.repeat_until || entry.repeat_until < entry.start_date) fail("Indica una fine della ripetizione valida.");
    else if (DateTime.fromISO(entry.repeat_until).diff(DateTime.fromISO(entry.start_date), "days").days > 366) fail("La ripetizione puo durare al massimo un anno.");
  } else if (entry.repeat_until) fail("Rimuovi la fine ripetizione per un evento singolo.");
});

export type CalendarFields = z.infer<typeof calendarEntrySchema>;
export type CalendarEntry = CalendarFields & { id: string; updated_at: string };
export type CalendarMember = { id: string; name: string; color: string; active: boolean };
export type CalendarOccurrence = { id: string; entryId: string; memberId: string; kind: CalendarFields["kind"]; start: string; end: string; allDay: boolean };

export function projectCalendarOccurrences(occurrences: CalendarOccurrence[], view: string, from: string, to: string): Array<CalendarOccurrence & { fullDay: boolean }> {
  if (!view.startsWith("timeGrid")) return occurrences.map((event) => ({ ...event, fullDay: event.allDay }));
  const rangeStart = DateTime.fromISO(from, { zone: TEAM_TIME_ZONE }).startOf("day");
  const rangeEnd = DateTime.fromISO(to, { zone: TEAM_TIME_ZONE }).startOf("day");
  return occurrences.flatMap((event) => {
    if (!event.allDay) return [{ ...event, fullDay: false }];
    let day = DateTime.fromISO(event.start, { zone: TEAM_TIME_ZONE }).startOf("day");
    const end = DateTime.fromISO(event.end, { zone: TEAM_TIME_ZONE }).startOf("day");
    if (day < rangeStart) day = rangeStart;
    const bands: Array<CalendarOccurrence & { fullDay: boolean }> = [];
    while (day < end && day < rangeEnd) {
      bands.push({ ...event, id: `${event.id}:band:${day.toISODate()}`, allDay: false, fullDay: true,
        start: day.set({ hour: 9 }).toISO()!, end: day.set({ hour: 20 }).toISO()! });
      day = day.plus({ days: 1 });
    }
    return bands;
  });
}

export function expandCalendarEntries(entries: CalendarEntry[], from: string, to: string): CalendarOccurrence[] {
  const rangeStart = DateTime.fromISO(from, { zone: TEAM_TIME_ZONE }).startOf("day");
  const rangeEnd = DateTime.fromISO(to, { zone: TEAM_TIME_ZONE }).startOf("day");
  const result: CalendarOccurrence[] = [];
  for (const entry of entries) {
    let day = DateTime.fromISO(entry.start_date, { zone: TEAM_TIME_ZONE });
    const until = DateTime.fromISO(entry.repeat_until ?? entry.start_date, { zone: TEAM_TIME_ZONE });
    if (entry.repeats_weekly && day < rangeStart) {
      const weeks = Math.max(0, Math.floor(rangeStart.diff(day, "days").days / 7) - 1);
      day = day.plus({ weeks });
    }
    do {
      const startDay = day.toISODate()!;
      const endDay = entry.repeats_weekly ? startDay : entry.end_date;
      const start = entry.all_day ? day : DateTime.fromISO(`${startDay}T${entry.start_time}`, { zone: TEAM_TIME_ZONE });
      const end = entry.all_day
        ? DateTime.fromISO(endDay, { zone: TEAM_TIME_ZONE }).plus({ days: 1 })
        : DateTime.fromISO(`${endDay}T${entry.end_time}`, { zone: TEAM_TIME_ZONE });
      if (end > rangeStart && start < rangeEnd) result.push({
        id: `${entry.id}:${startDay}`, entryId: entry.id, memberId: entry.member_id, kind: entry.kind,
        start: entry.all_day ? start.toISODate()! : start.toISO()!,
        end: entry.all_day ? end.toISODate()! : end.toISO()!, allDay: entry.all_day,
      });
      if (!entry.repeats_weekly) break;
      day = day.plus({ weeks: 1 });
    } while (day <= until && day < rangeEnd);
  }
  return result;
}

export function calendarEntriesOverlap(a: CalendarEntry, b: CalendarEntry): boolean {
  if (a.member_id !== b.member_id) return false;
  const until = [a.repeat_until ?? a.end_date, b.repeat_until ?? b.end_date].sort()[0];
  const from = [a.start_date, b.start_date].sort()[1];
  if (until < from) return false;
  const to = DateTime.fromISO(until).plus({ days: 1 }).toISODate()!;
  const millis = (value: string) => DateTime.fromISO(value, { zone: TEAM_TIME_ZONE }).toMillis();
  const intervals = (entry: CalendarEntry) => expandCalendarEntries([entry], from, to).map((event) => ({ start: millis(event.start), end: millis(event.end) }));
  const first = intervals(a);
  const second = intervals(b);
  let i = 0;
  let j = 0;
  while (i < first.length && j < second.length) {
    if (first[i].start < second[j].end && second[j].start < first[i].end) return true;
    if (first[i].end <= second[j].end) i++;
    else j++;
  }
  return false;
}
