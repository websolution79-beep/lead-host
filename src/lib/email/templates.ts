import { appUrl } from "@/lib/env";
import { formatCurrencyCents } from "@/lib/auth/roles";

type EmailContent = {
  subject: string;
  preview: string;
  html: string;
  text: string;
};

type LeadDigestItem = {
  title: string;
  city: string | null;
  province: string | null;
  sharedPriceCents: number;
  exclusivePriceCents: number;
};

export function renderWelcomeEmail(firstName: string | null) {
  return emailLayout({
    subject: "Benvenuto in Lead Host",
    preview: "Il tuo account Property Manager e stato creato.",
    title: `Benvenuto${firstName ? `, ${firstName}` : ""}.`,
    body:
      "Il tuo account gratuito Lead Host e pronto. Puoi completare il profilo e accedere al marketplace appena il tuo profilo sara verificato.",
    ctaLabel: "Vai al profilo",
    ctaUrl: `${appUrl}/app/profilo`,
  });
}

export function renderPropertyManagerVerifiedEmail(firstName: string | null) {
  return emailLayout({
    subject: "Profilo verificato su Lead Host",
    preview: "Ora puoi accedere al marketplace e acquistare lead.",
    title: `Profilo verificato${firstName ? `, ${firstName}` : ""}.`,
    body:
      "Il tuo profilo Property Manager e stato verificato. Da ora puoi consultare il marketplace, filtrare le opportunita e sbloccare i contatti tramite wallet.",
    ctaLabel: "Apri il marketplace",
    ctaUrl: `${appUrl}/app/marketplace`,
  });
}

export function renderOwnerRequestReceivedEmail(reference: string) {
  return emailLayout({
    subject: "Richiesta ricevuta su Lead Host",
    preview: "Abbiamo ricevuto la tua richiesta proprietario.",
    title: "La tua richiesta e stata inviata.",
    body:
      "Grazie. Verificheremo i dati dell'immobile e, se la richiesta sara approvata, potra essere mostrata a un massimo di 2 Consulenti esperti verificati.",
    extra: `Codice richiesta: ${reference}`,
  });
}

export function renderAdminOwnerRequestEmail(reference: string, city: string, propertyType: string) {
  return emailLayout({
    subject: `Nuovo lead proprietario da verificare: ${city}`,
    preview: "Un proprietario ha inviato una nuova richiesta.",
    title: "Nuovo lead proprietario in pending.",
    body: `${propertyType} a ${city}. Entra in area admin per verificare i dati e decidere se pubblicarlo nel marketplace.`,
    extra: `Codice richiesta: ${reference}`,
    ctaLabel: "Apri lead admin",
    ctaUrl: `${appUrl}/admin/leads`,
  });
}

export function renderLeadPurchaseEmail({
  leadTitle,
  mode,
  amountCents,
  balanceCents,
}: {
  leadTitle: string;
  mode: "shared" | "exclusive";
  amountCents: number;
  balanceCents: number;
}) {
  return emailLayout({
    subject: `Lead acquistato: ${leadTitle}`,
    preview: "Il contatto proprietario e ora disponibile nei tuoi lead.",
    title: "Acquisto lead completato.",
    body: `Hai acquistato il lead "${leadTitle}" in modalita ${mode === "exclusive" ? "esclusiva" : "condivisa"}. Il contatto e ora disponibile nella sezione I miei lead.`,
    extra: `Importo: ${formatCurrencyCents(amountCents)}. Saldo wallet residuo: ${formatCurrencyCents(balanceCents)}.`,
    ctaLabel: "Apri i miei lead",
    ctaUrl: `${appUrl}/app/i-miei-lead`,
  });
}

export function renderNewLeadEmail({
  leadTitle,
  city,
  sharedPriceCents,
  exclusivePriceCents,
}: {
  leadTitle: string;
  city: string | null;
  sharedPriceCents: number;
  exclusivePriceCents: number;
}) {
  return emailLayout({
    subject: `Nuovo lead disponibile: ${leadTitle}`,
    preview: "Una nuova opportunita e stata pubblicata nel marketplace.",
    title: "Nuovo lead disponibile nel marketplace.",
    body: `${leadTitle}${city ? ` - ${city}` : ""}. Puoi consultare i dettagli pubblici e decidere se acquistarlo in condivisione o in esclusiva.`,
    extra: `Prezzo condiviso: ${formatCurrencyCents(sharedPriceCents)}. Prezzo esclusivo: ${formatCurrencyCents(exclusivePriceCents)}.`,
    ctaLabel: "Vedi marketplace",
    ctaUrl: `${appUrl}/app/marketplace`,
  });
}

export function renderLeadDigestEmail(leads: LeadDigestItem[]) {
  const listText = leads
    .map(
      (lead) =>
        `- ${lead.title}${lead.city ? `, ${lead.city}` : ""}: condiviso ${formatCurrencyCents(lead.sharedPriceCents)}, esclusivo ${formatCurrencyCents(lead.exclusivePriceCents)}`,
    )
    .join("\n");
  const listHtml = leads
    .map(
      (lead) =>
        `<li><strong>${escapeHtml(lead.title)}</strong>${lead.city ? `, ${escapeHtml(lead.city)}` : ""}<br><span>Condiviso ${formatCurrencyCents(lead.sharedPriceCents)} - Esclusivo ${formatCurrencyCents(lead.exclusivePriceCents)}</span></li>`,
    )
    .join("");

  return emailLayout({
    subject: `${leads.length} nuovi lead disponibili su Lead Host`,
    preview: "Riepilogo delle nuove opportunita pubblicate nel marketplace.",
    title: "Nuovi lead disponibili.",
    body: "Ecco il riepilogo delle nuove opportunita pubblicate nel marketplace.",
    extraHtml: `<ul style="padding-left:20px;line-height:1.7">${listHtml}</ul>`,
    extraText: listText,
    ctaLabel: "Apri marketplace",
    ctaUrl: `${appUrl}/app/marketplace`,
  });
}

function emailLayout({
  subject,
  preview,
  title,
  body,
  extra,
  extraHtml,
  extraText,
  ctaLabel,
  ctaUrl,
}: {
  subject: string;
  preview: string;
  title: string;
  body: string;
  extra?: string;
  extraHtml?: string;
  extraText?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): EmailContent {
  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f7f8fa;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preview)}</div>
    <main style="max-width:640px;margin:0 auto;padding:32px 18px;">
      <section style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:28px;">
        <p style="margin:0 0 18px;color:#047857;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">Lead Host</p>
        <h1 style="margin:0 0 16px;font-size:28px;line-height:1.15;">${escapeHtml(title)}</h1>
        <p style="margin:0;color:#475569;font-size:16px;line-height:1.7;">${escapeHtml(body)}</p>
        ${extra ? `<p style="margin:18px 0 0;color:#0f172a;font-size:15px;line-height:1.6;font-weight:700;">${escapeHtml(extra)}</p>` : ""}
        ${extraHtml ? `<div style="margin-top:18px;color:#334155;font-size:15px;">${extraHtml}</div>` : ""}
        ${
          ctaLabel && ctaUrl
            ? `<p style="margin:26px 0 0;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;font-weight:700;border-radius:10px;padding:13px 18px;">${escapeHtml(ctaLabel)}</a></p>`
            : ""
        }
      </section>
      <p style="margin:18px 0 0;text-align:center;color:#94a3b8;font-size:12px;">Email transazionale inviata da Lead Host.</p>
    </main>
  </body>
</html>`;

  const text = [
    title,
    "",
    body,
    extra || extraText || "",
    ctaLabel && ctaUrl ? `${ctaLabel}: ${ctaUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, preview, html, text };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
