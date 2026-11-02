import { BookingCallWalletError } from "./wallet";

export function bookingCallHttpError(error: BookingCallWalletError) {
  let detail: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(error.details ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) detail = parsed as Record<string, unknown>;
  } catch { /* A provider error may not contain JSON. */ }
  const response = (status: number, code: string, message: string, extra = {}) => ({ status, body: { code, error: message, ...extra } });
  if (error.mayHaveCompleted) return response(503, "BOOKING_PURCHASE_UNCONFIRMED", "Conferma non ricevuta. Verifica I miei lead o riprova la stessa richiesta senza effettuare un nuovo acquisto.");
  if (error.code.includes("price_changed")) return response(409, "PRICE_CHANGED", "Il prezzo e cambiato. Controlla gli importi e conferma nuovamente.", {
    currentAmountCents: detail.currentAmountCents, leadAmountCents: detail.leadAmountCents, bookingFeeCents: detail.bookingFeeCents,
  });
  if (error.code.includes("insufficient_credit")) return response(402, "INSUFFICIENT_CREDIT", "Credito insufficiente per il totale lead e booking Call.", { missingAmountCents: detail.missing_amount_cents });
  if (error.code.includes("already_purchased")) return response(409, "ALREADY_PURCHASED", "Hai gia acquistato questo lead. Lo trovi in I miei lead.");
  if (error.code.includes("marketplace_membership_required")) return response(403, "MARKETPLACE_MEMBERSHIP_REQUIRED", "Per acquistare serve un accesso Marketplace valido.");
  if (error.code.includes("refunded")) return response(409, "BOOKING_REFUNDED", "Questo acquisto e stato riaccreditato. Aggiorna la pagina.");
  if (error.code.includes("request_conflict")) return response(409, "BOOKING_REQUEST_CONFLICT", "Richiesta non corrispondente. Verifica prima I miei lead.");
  if (error.code.includes("booking_call_disabled")) return response(409, "BOOKING_UNAVAILABLE", "Il servizio booking Call non e attualmente disponibile.");
  if (error.code === "BOOKING_MIGRATION_REQUIRED") return response(409, "BOOKING_NOT_READY", "Servizio booking Call in aggiornamento. L'acquisto ordinario resta disponibile.");
  if (["booking_public_only", "exclusive_not_available", "lead_unavailable", "lead_not_found"].some(code => error.code.includes(code))) return response(409, "LEAD_UNAVAILABLE", "Questa opzione non e piu disponibile per il lead selezionato.");
  if (error.code.includes("not_authorized")) return response(403, "NOT_AUTHORIZED", "Account non autorizzato all'acquisto.");
  return response(500, "BOOKING_PURCHASE_FAILED", "Acquisto non completato. Riprova mantenendo la stessa richiesta.");
}
