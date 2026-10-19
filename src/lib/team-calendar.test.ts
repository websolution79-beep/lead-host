import test from "node:test";
import assert from "node:assert/strict";
import { calendarEntrySchema, calendarEntriesOverlap, expandCalendarEntries, projectCalendarOccurrences, type CalendarEntry } from "./team-calendar";

const base: CalendarEntry = { id: "event-a", updated_at: "2026-10-19T08:00:00Z", member_id: "00000000-0000-4000-8000-000000000001", kind: "available", start_date: "2026-10-19", end_date: "2026-10-19", all_day: false, start_time: "09:00", end_time: "12:00", repeats_weekly: false, repeat_until: null, note: "" };
const fields = ({ id, updated_at, ...entry }: CalendarEntry) => { void id; void updated_at; return entry; };

test("all-day absences become separate 09-20 bands only in time-grid views", () => {
  const entry = { ...base, all_day: true, start_time: null, end_time: null, kind: "absent" as const, end_date: "2026-10-29" };
  const events = expandCalendarEntries([entry], "2026-10-26", "2026-11-02");
  const before = JSON.stringify(events);
  const bands = projectCalendarOccurrences(events, "timeGridWeek", "2026-10-26", "2026-11-02");
  assert.equal(bands.length, 4);
  assert.equal(bands[0].start, "2026-10-26T09:00:00.000+01:00");
  assert.equal(bands[3].end, "2026-10-29T20:00:00.000+01:00");
  assert.ok(bands.every((event) => !event.allDay && event.fullDay && event.entryId === entry.id));
  assert.equal(new Set(bands.map((event) => event.id)).size, 4);
  assert.equal(JSON.stringify(events), before);
});
test("month and agenda retain original all-day interval", () => {
  const events = expandCalendarEntries([{ ...base, all_day: true, start_time: null, end_time: null, end_date: "2026-10-29" }], "2026-10-19", "2026-11-02");
  for (const view of ["dayGridMonth", "listDay", "listWeek"]) {
    const projected = projectCalendarOccurrences(events, view, "2026-10-19", "2026-11-02");
    assert.equal(projected.length, 1);
    assert.equal(projected[0].allDay, true);
    assert.equal(projected[0].end, "2026-10-30");
  }
});
test("day view clips the display without changing timed events or other members", () => {
  const events = expandCalendarEntries([base, { ...base, id: "absence", member_id: "other", all_day: true, start_time: null, end_time: null, end_date: "2026-10-29" }], "2026-10-19", "2026-10-20");
  const projected = projectCalendarOccurrences(events, "timeGridDay", "2026-10-19", "2026-10-20");
  assert.equal(projected.length, 2);
  assert.deepEqual(projected[0], { ...events[0], fullDay: false });
  assert.equal(projected[1].memberId, "other");
});

test("validates timed events and rejects backwards dates, missing times and invalid calendar dates", () => {
  assert.ok(calendarEntrySchema.safeParse(fields(base)).success);
  for (const change of [{ end_date: "2026-10-18" }, { start_time: null }, { end_time: "08:00" }, { start_date: "2026-02-30" }, { start_time: "25:00" }]) assert.equal(calendarEntrySchema.safeParse(fields({ ...base, ...change })).success, false);
});
test("all-day range includes final day and has exclusive following-day end", () => {
  const entry = { ...base, kind: "absent" as const, all_day: true, start_time: null, end_time: null, end_date: "2026-10-29" };
  assert.ok(calendarEntrySchema.safeParse(fields(entry)).success);
  const [event] = expandCalendarEntries([entry], "2026-10-26", "2026-11-02");
  assert.equal(event.start, "2026-10-19"); assert.equal(event.end, "2026-10-30");
});
test("weekly recurrence preserves Rome wall time across daylight-saving change", () => {
  const entry = { ...base, repeats_weekly: true, repeat_until: "2026-11-02" };
  const events = expandCalendarEntries([entry], "2026-10-19", "2026-11-03");
  assert.equal(events.length, 3);
  assert.equal(events[0].start, "2026-10-19T09:00:00.000+02:00");
  assert.equal(events[1].start, "2026-10-26T09:00:00.000+01:00");
});
test("weekly recurrence outside original week and until date is bounded", () => {
  const entry = { ...base, repeats_weekly: true, repeat_until: "2026-11-02" };
  assert.equal(expandCalendarEntries([entry], "2026-10-26", "2026-11-02").length, 1);
  assert.equal(expandCalendarEntries([entry], "2026-11-03", "2026-11-10").length, 0);
  assert.equal(calendarEntrySchema.safeParse(fields({ ...entry, repeat_until: null })).success, false);
  assert.equal(calendarEntrySchema.safeParse(fields({ ...entry, repeat_until: "2028-01-01" })).success, false);
});
test("different members can always overlap; adjacent times are not a conflict", () => {
  assert.equal(calendarEntriesOverlap(base, { ...base, member_id: "00000000-0000-4000-8000-000000000002" }), false);
  assert.equal(calendarEntriesOverlap(base, { ...base, start_time: "12:00", end_time: "14:00" }), false);
  assert.equal(calendarEntriesOverlap(base, { ...base, start_time: "11:00", end_time: "14:00" }), true);
});
test("all-day absence conflicts with local midnight availability, not following day", () => {
  const absent = { ...base, all_day: true, start_time: null, end_time: null, kind: "absent" as const };
  assert.equal(calendarEntriesOverlap(absent, { ...base, start_time: "00:00", end_time: "01:00" }), true);
  assert.equal(calendarEntriesOverlap(absent, { ...base, start_date: "2026-10-20", end_date: "2026-10-20", start_time: "00:00", end_time: "01:00" }), false);
});
test("long absence detects overlapping recurring availability", () => {
  const absent = { ...base, kind: "absent" as const, all_day: true, start_time: null, end_time: null, start_date: "2026-10-22", end_date: "2026-10-29" };
  assert.equal(calendarEntriesOverlap(absent, { ...base, repeats_weekly: true, repeat_until: "2026-11-02" }), true);
});
test("spring clock jump rejects nonexistent local times", () => {
  assert.equal(calendarEntrySchema.safeParse(fields({ ...base, start_date: "2027-03-28", end_date: "2027-03-28", start_time: "02:30", end_time: "04:00" })).success, false);
});
