import { AppShell } from "@/components/app-shell";
import { AdminBookingCallTask } from "@/components/admin-booking-call-task";

export default async function BookingCallPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  return <AppShell section="admin" eyebrow="Lead" title="Booking Call"><AdminBookingCallTask bookingId={bookingId} /></AppShell>;
}
