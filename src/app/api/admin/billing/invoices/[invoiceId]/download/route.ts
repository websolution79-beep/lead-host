import { NextResponse, type NextRequest } from "next/server";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { recordInvoiceEvent } from "@/lib/billing/invoices";

type InvoiceDownloadRow = {
  id: string;
  xml_content: string | null;
  transmission_progressive: string;
  provisional_number: string | null;
  status: string;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ invoiceId: string }> },
) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const { invoiceId } = await context.params;
    const table = supabase.from("billing_invoices" as never) as unknown as {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          single: () => Promise<{
            data: InvoiceDownloadRow | null;
            error: { message?: string } | null;
          }>;
        };
      };
      update: (values: Record<string, unknown>) => {
        eq: (
          column: string,
          value: string,
        ) => Promise<{ error: { message?: string } | null }>;
      };
    };
    const { data, error } = await table
      .select(
        "id,xml_content,transmission_progressive,provisional_number,status",
      )
      .eq("id", invoiceId)
      .single();

    if (error || !data?.xml_content) {
      return NextResponse.json(
        { error: error?.message ?? "XML non disponibile." },
        { status: 404 },
      );
    }

    const downloadedAt = new Date().toISOString();
    const updateResult = await table
      .update({
        downloaded_at: downloadedAt,
        ...(data.status === "ready" ? { status: "downloaded" } : {}),
      })
      .eq("id", invoiceId);

    if (updateResult.error) throw updateResult.error;

    await recordInvoiceEvent(supabase, {
      invoiceId,
      eventType: "xml_downloaded",
      actorProfileId: profile.id,
      details: { downloaded_at: downloadedAt },
    });

    const filename = `IT01879020517_${data.transmission_progressive}.xml`;

    return new NextResponse(data.xml_content, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
