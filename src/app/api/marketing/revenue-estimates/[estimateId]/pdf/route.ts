import type PDFDocumentType from "pdfkit";
import { NextResponse, type NextRequest } from "next/server";
import { requireSuperAdmin, adminApiErrorResponse } from "@/lib/admin/auth";

// The standalone build embeds the standard fonts, avoiding filesystem reads in Vercel functions.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require("pdfkit/js/pdfkit.standalone.js") as typeof PDFDocumentType;

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
    const { data: template, error: templateError } = await supabase
      .from("marketing_revenue_templates")
      .select("brand_name, header_text, contact_details, logo_path")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (templateError) throw templateError;
    const identity = {
      brandName: estimate.brand_name ?? template?.brand_name ?? null,
      headerText: estimate.header_text ?? template?.header_text ?? null,
      contactDetails:
        estimate.contact_details ?? template?.contact_details ?? null,
      logoPath: estimate.logo_path ?? template?.logo_path ?? null,
    };
    let logoBuffer: Buffer | null = null;
    if (identity.logoPath) {
      const logo = await supabase.storage
        .from("marketing-revenue-branding")
        .download(identity.logoPath);
      if (!logo.error) logoBuffer = Buffer.from(await logo.data.arrayBuffer());
    }
    const pdf = await createRevenueEstimatePdf(estimate, identity, logoBuffer);
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
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Errore PDF non identificato.",
      },
      { status: 500 },
    );
  }
}

export async function createRevenueEstimatePdf(
  estimate: Record<string, unknown>,
  identity: {
    brandName: string | null;
    headerText: string | null;
    contactDetails: string | null;
  },
  logoBuffer: Buffer | null,
) {
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
  const cream = "#FFF9E9";
  const creamBorder = "#F1E6C5";
  doc.rect(42, 42, 511, 3).fill(green);
  doc.x = 42;
  doc.y = 54;
  if (logoBuffer) {
    const mime =
      logoBuffer[0] === 0x89 && logoBuffer[1] === 0x50
        ? "image/png"
        : "image/jpeg";
    doc.image(
      `data:${mime};base64,${logoBuffer.toString("base64")}`,
      222,
      doc.y,
      { fit: [150, 44], align: "center", valign: "center" },
    );
    doc.y += 48;
  }
  if (identity.brandName)
    doc
      .fontSize(13)
      .fillColor(green)
      .font("Helvetica-Bold")
      .text(identity.brandName, 42, doc.y, { width: 511, align: "center" });
  if (identity.headerText)
    doc
      .moveDown(0.25)
      .fontSize(9)
      .fillColor("#64748B")
      .font("Helvetica")
      .text(identity.headerText, 42, doc.y, { width: 511, align: "center" });
  doc
    .moveDown(1.15)
    .fontSize(21)
    .fillColor(ink)
    .font("Helvetica-Bold")
    .text(String(estimate.report_title), 42, doc.y, {
      width: 511,
      align: "center",
    });
  doc
    .moveDown(0.6)
    .fontSize(12)
    .font("Helvetica-Bold")
    .text(
      [estimate.property_address, estimate.city].filter(Boolean).join(", ") ||
        "Immobile da definire",
      42,
      doc.y,
      { width: 511, align: "center" },
    );
  doc
    .moveDown(0.25)
    .fontSize(9)
    .font("Helvetica")
    .fillColor("#475569")
    .text(`Proprietario: ${estimate.owner_name || "Da definire"}`, 42, doc.y, {
      width: 511,
      align: "center",
    });
  const boxY = doc.y + 18;
  doc.rect(42, boxY, 511, 108).fillAndStroke(pale, ink);
  doc
    .fillColor("#334155")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("NETTO MENSILE PROPRIETARIO", 42, boxY + 17, {
      width: 511,
      align: "center",
    });
  doc
    .fillColor(ink)
    .fontSize(29)
    .text(euro(num(estimate.owner_monthly_net)), 42, boxY + 39, {
      width: 511,
      align: "center",
    });
  doc
    .fontSize(13)
    .text(
      `Netto annuo: ${euro(num(estimate.owner_annual_net))}`,
      42,
      boxY + 78,
      { width: 511, align: "center" },
    );
  doc.y = boxY + 128;
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
  doc.moveDown(0.8);
  title(doc, "Metriche chiave", green, ink);
  const metricsY = doc.y;
  const metricWidth = 511 / 3;
  metric(
    doc,
    42,
    metricsY,
    metricWidth,
    "Incasso lordo annuo",
    euro(num(estimate.gross_annual_revenue)),
    ink,
  );
  metric(
    doc,
    42 + metricWidth,
    metricsY,
    metricWidth,
    "ADR",
    estimate.adr_per_night ? euro(num(estimate.adr_per_night)) : "n/d",
    ink,
  );
  metric(
    doc,
    42 + metricWidth * 2,
    metricsY,
    metricWidth,
    "Occupazione",
    estimate.occupancy_rate === null
      ? "n/d"
      : percent(num(estimate.occupancy_rate)),
    ink,
  );
  doc.x = 42;
  doc.y = metricsY + 62;
  const cardX = 42;
  const cardY = doc.y;
  const cardWidth = 511;
  const cardPadding = 16;
  const textWidth = cardWidth - cardPadding * 2;
  const parameters = `Mix Airbnb ${percent(num(estimate.airbnb_mix_rate))} - Booking ${percent(num(estimate.booking_mix_rate))} - Diretto ${percent(num(estimate.direct_mix_rate))} - Fee PM ${percent(num(estimate.pm_fee_rate))} - Aliquota fiscale ${percent(num(estimate.tax_rate))}`;
  const disclaimer = String(estimate.disclaimer || "");
  doc.font("Helvetica").fontSize(8.5);
  const parametersHeight = doc.heightOfString(`Parametri: ${parameters}`, {
    width: textWidth,
    lineGap: 2,
  });
  const disclaimerHeight = doc.heightOfString(disclaimer, {
    width: textWidth,
    lineGap: 3,
  });
  const cardHeight =
    cardPadding + parametersHeight + 12 + disclaimerHeight + cardPadding;
  doc
    .roundedRect(cardX, cardY, cardWidth, cardHeight, 6)
    .fillAndStroke(cream, creamBorder);
  doc
    .fillColor(ink)
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .text("Parametri:", cardX + cardPadding, cardY + cardPadding, {
      continued: true,
    })
    .font("Helvetica")
    .text(` ${parameters}`, { width: textWidth, lineGap: 2 });
  const disclaimerY = cardY + cardPadding + parametersHeight + 12;
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor("#334155")
    .text(disclaimer, cardX + cardPadding, disclaimerY, {
      width: textWidth,
      lineGap: 3,
    });
  doc.x = 42;
  doc.y = cardY + cardHeight + 10;
  if (identity.contactDetails || identity.brandName) {
    doc.page.margins.bottom = 20;
    doc
      .moveTo(42, doc.y)
      .lineTo(553, doc.y)
      .strokeColor("#D8E0EA")
      .lineWidth(1)
      .stroke();
    doc.y += 10;
    doc
      .fontSize(8.5)
      .fillColor("#64748B")
      .text(identity.contactDetails || identity.brandName || "", 42, doc.y, {
        width: 511,
        align: "center",
      });
  }
  doc.end();
  return done;
}
function title(
  doc: PDFKit.PDFDocument,
  text: string,
  green: string,
  ink: string,
) {
  doc.x = 42;
  doc
    .font("Helvetica-Bold")
    .fontSize(15)
    .fillColor(ink)
    .text(text, 42, doc.y, { width: 511 });
  doc.moveDown(0.15).rect(42, doc.y, 511, 3).fill(green);
  doc.moveDown(0.5);
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
  doc.rect(42, y, 511, 28).fillAndStroke(strong ? green : "#FFFFFF", "#D8E0EA");
  doc
    .fillColor(strong ? "#FFFFFF" : ink)
    .font(strong ? "Helvetica-Bold" : "Helvetica")
    .fontSize(10)
    .text(label, 54, y + 8.5, { width: 330 });
  doc
    .font(strong ? "Helvetica-Bold" : "Helvetica")
    .text(`${negative ? "- " : ""}${euro(value)}`, 400, y + 8.5, {
      width: 140,
      align: "right",
    });
  doc.x = 42;
  doc.y = y + 28;
}
function metric(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  ink: string,
) {
  doc.rect(x, y, width, 54).fillAndStroke("#FFFFFF", "#D8E0EA");
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#64748B")
    .text(label, x + 8, y + 11, { width: width - 16, align: "center" });
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(ink)
    .text(value, x + 8, y + 30, { width: width - 16, align: "center" });
}
function num(value: unknown) {
  return typeof value === "number" ? value : Number(value || 0);
}
function euro(value: number) {
  const [i, d] = Math.abs(value).toFixed(2).split(".");
  return `${value < 0 ? "-" : ""}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d} €`;
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
