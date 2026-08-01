import PDFDocument from "pdfkit";
import { NextResponse, type NextRequest } from "next/server";
import { requireSuperAdmin, adminApiErrorResponse } from "@/lib/admin/auth";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ estimateId: string }> },
) {
  try {
    const { estimateId } = await params;
    const { supabase, profile } = await requireSuperAdmin(request);
    const { data: estimate, error } = await supabase
      .from("marketing_revenue_estimates")
      .select("*")
      .eq("id", estimateId)
      .eq("profile_id", profile.id)
      .single();
    if (error || !estimate)
      return NextResponse.json(
        { error: "Valutazione non trovata." },
        { status: 404 },
      );
    const pdf = await createPdf(estimate);
    const filename = `relazione-incassi-${slug(estimate.owner_name || "immobile")}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Revenue estimate PDF generation failed", error);
    const response = adminApiErrorResponse(error);
    if (response.status !== 500) return response;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Errore PDF non identificato." }, { status: 500 });
  }
}

async function createPdf(estimate: Record<string, unknown>) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 42,
    info: { Title: String(estimate.report_title) },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks))),
  );
  const green = "#00856A";
  const ink = "#142033";
  const pale = "#EAF3FF";
  doc.rect(42, 42, 511, 3).fill(green);
  doc.moveDown(1.2);
  doc
    .fontSize(16)
    .fillColor(green)
    .font("Helvetica-Bold")
    .text(String(estimate.brand_name || ""), { align: "center" });
  if (estimate.header_text)
    doc
      .moveDown(0.25)
      .fontSize(9)
      .fillColor("#64748B")
      .font("Helvetica")
      .text(String(estimate.header_text), { align: "center" });
  if (estimate.contact_details)
    doc
      .moveDown(0.2)
      .fontSize(8)
      .fillColor("#64748B")
      .text(String(estimate.contact_details), { align: "center" });
  doc
    .moveDown(2)
    .fontSize(22)
    .fillColor(ink)
    .font("Helvetica-Bold")
    .text(String(estimate.report_title), { align: "center" });
  doc
    .moveDown(0.6)
    .fontSize(12)
    .font("Helvetica-Bold")
    .text(
      [estimate.property_address, estimate.city].filter(Boolean).join(", ") ||
        "Immobile da definire",
      { align: "center" },
    );
  doc
    .moveDown(0.25)
    .fontSize(9)
    .font("Helvetica")
    .fillColor("#475569")
    .text(`Proprietario: ${estimate.owner_name || "Da definire"}`, {
      align: "center",
    });
  const boxY = doc.y + 24;
  doc.rect(42, boxY, 511, 118).fillAndStroke(pale, ink);
  doc
    .fillColor("#334155")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("NETTO MENSILE PROPRIETARIO", 42, boxY + 20, {
      width: 511,
      align: "center",
    });
  doc
    .fillColor(ink)
    .fontSize(28)
    .text(euro(num(estimate.owner_monthly_net)), 42, boxY + 43, {
      width: 511,
      align: "center",
    });
  doc
    .fontSize(13)
    .text(
      `Netto annuo: ${euro(num(estimate.owner_annual_net))}`,
      42,
      boxY + 84,
      { width: 511, align: "center" },
    );
  doc.y = boxY + 150;
  title(doc, "Analisi finanziaria", green, ink);
  row(
    doc,
    "Incasso lordo annuo",
    num(estimate.gross_annual_revenue),
    false,
    false,
    ink,
    green,
  );
  row(
    doc,
    String(estimate.ota_cost_label),
    num(estimate.ota_commission_gross),
    true,
    false,
    ink,
    green,
  );
  row(
    doc,
    String(estimate.management_cost_label),
    num(estimate.pm_fee_gross),
    true,
    false,
    ink,
    green,
  );
  row(
    doc,
    "Incasso proprietario (pre-tax)",
    num(estimate.owner_pre_tax),
    false,
    false,
    ink,
    green,
  );
  row(
    doc,
    String(estimate.tax_cost_label),
    num(estimate.tax_amount),
    true,
    false,
    ink,
    green,
  );
  row(
    doc,
    "NETTO ANNUO",
    num(estimate.owner_annual_net),
    false,
    true,
    ink,
    green,
  );
  row(
    doc,
    "NETTO MENSILE",
    num(estimate.owner_monthly_net),
    false,
    true,
    ink,
    green,
  );
  doc.moveDown(1.5);
  title(doc, "Metriche chiave", green, ink);
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(ink)
    .text(
      `Incasso lordo annuo: ${euro(num(estimate.gross_annual_revenue))}     ADR: ${estimate.adr_per_night ? euro(num(estimate.adr_per_night)) : "n/d"}     Occupazione: ${estimate.occupancy_rate === null ? "n/d" : percent(num(estimate.occupancy_rate))}`,
      { align: "center" },
    );
  doc
    .moveDown(1.5)
    .fontSize(8)
    .fillColor("#475569")
    .text(
      `Parametri: Mix Airbnb ${percent(num(estimate.airbnb_mix_rate))} · Booking ${percent(num(estimate.booking_mix_rate))} · Diretto ${percent(num(estimate.direct_mix_rate))} · Fee PM ${percent(num(estimate.pm_fee_rate))} · Aliquota fiscale ${percent(num(estimate.tax_rate))}`,
    );
  doc
    .moveDown(0.8)
    .fontSize(8)
    .fillColor("#475569")
    .text(String(estimate.disclaimer));
  doc.end();
  return done;
}
function title(
  doc: PDFKit.PDFDocument,
  text: string,
  green: string,
  ink: string,
) {
  doc.font("Helvetica-Bold").fontSize(15).fillColor(ink).text(text);
  doc.moveDown(0.25).rect(42, doc.y, 511, 3).fill(green);
  doc.moveDown(0.7);
}
function row(
  doc: PDFKit.PDFDocument,
  label: string,
  value: number,
  negative: boolean,
  strong: boolean,
  ink: string,
  green: string,
) {
  const y = doc.y;
  doc.rect(42, y, 511, 30).fillAndStroke(strong ? green : "#FFFFFF", "#D8E0EA");
  doc
    .fillColor(strong ? "#FFFFFF" : ink)
    .font(strong ? "Helvetica-Bold" : "Helvetica")
    .fontSize(10)
    .text(label, 54, y + 10, { width: 330 });
  doc
    .font(strong ? "Helvetica-Bold" : "Helvetica")
    .text(`${negative ? "- " : ""}${euro(value)}`, 400, y + 10, {
      width: 140,
      align: "right",
    });
  doc.y = y + 30;
}
function num(value: unknown) {
  return typeof value === "number" ? value : Number(value || 0);
}
function euro(value: number) {
  const [i, d] = Math.abs(value).toFixed(2).split(".");
  return `${value < 0 ? "-" : ""}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d} EUR`;
}
function percent(value: number) {
  return `${(value * 100).toLocaleString("it-IT", { maximumFractionDigits: 2 })}%`;
}
function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "") || "immobile"
  );
}
