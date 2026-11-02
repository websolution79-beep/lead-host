import { CalendarClock } from "lucide-react";
import { BOOKING_CALL_WAIT_NOTICE, type BookingCallSummary } from "@/lib/booking-call/contracts";
import { formatCents } from "@/lib/config/commercial";

export function BookingCallNotice({ booking, detailed = false }: { booking: BookingCallSummary; detailed?: boolean }) {
  const scheduled = booking.status === "scheduled" && booking.scheduledAt;
  const date = scheduled && Number.isFinite(Date.parse(scheduled)) ? new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(scheduled)) : null;
  return <section className="mt-5 border-y border-amber-300 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950" aria-label="Servizio booking Call">
    <p className="flex items-center gap-2 font-bold"><CalendarClock size={19} className="shrink-0" />{booking.status === "refunded" ? "Booking Call riaccreditato" : date ? "Chiamata conoscitiva organizzata" : "Booking Call incluso"}</p>
    <p className="mt-2 font-semibold">{booking.status === "refunded" ? "Il servizio booking e stato annullato con il riaccredito del lead." : date ? `Appuntamento: ${date} (ora italiana). Segui le indicazioni ricevute da Lead Host per la chiamata.` : BOOKING_CALL_WAIT_NOTICE}</p>
    {detailed ? <dl className="mt-3 grid max-w-md gap-1 border-t border-amber-200 pt-3">
      <div className="flex justify-between gap-3"><dt>Lead in esclusiva</dt><dd>{formatCents(booking.leadAmountCents)}</dd></div>
      <div className="flex justify-between gap-3"><dt>Booking Call</dt><dd>{formatCents(booking.bookingFeeCents)}</dd></div>
      <div className="flex justify-between gap-3 font-bold"><dt>Totale acquisto</dt><dd>{formatCents(booking.leadAmountCents + booking.bookingFeeCents)}</dd></div>
    </dl> : null}
  </section>;
}
