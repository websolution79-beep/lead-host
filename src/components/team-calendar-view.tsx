"use client";

import FullCalendar from "@fullcalendar/react";
import type { CalendarOptions } from "@fullcalendar/core";
import type { RefObject } from "react";

export default function TeamCalendarView({ calendarRef, ...options }: CalendarOptions & { calendarRef: RefObject<FullCalendar | null> }) {
  return <FullCalendar ref={calendarRef} {...options} />;
}
