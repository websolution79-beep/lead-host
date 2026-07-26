import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { recordInvoiceEvent } from "@/lib/billing/invoices";

const updateSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("imported"),
  }),
  z.object({
    status: z.literal("sent"),
    finalInvoiceNumber: z.string().trim().min(1).max(80),
    finalInvoiceDate: z.string().date(),
  }),
  z.object({
    status: z.literal("cancelled"),
  }),
]);

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ invoiceId: string }> },
) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const { invoiceId } = await context.params;
    const parsed = updateSchema.safeParse(
      await request.json().catch(() => null),
    );

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Stato fattura non valido." },
        { status: 422 },
      );
    }

    const now = new Date().toISOString();
    const values =
      parsed.data.status === "sent"
        ? {
            status: "sent",
            sent_at: now,
            final_invoice_number: parsed.data.finalInvoiceNumber,
            final_invoice_date: parsed.data.finalInvoiceDate,
          }
        : parsed.data.status === "imported"
          ? { status: "imported", imported_at: now }
          : { status: "cancelled" };
    const table = supabase.from("billing_invoices" as never) as unknown as {
      update: (values: Record<string, unknown>) => {
        eq: (column: string, value: string) => {
          select: (columns: string) => {
            single: () => Promise<{
              data: Record<string, unknown> | null;
              error: { message?: string } | null;
            }>;
          };
        };
      };
    };
    const { data, error } = await table
      .update(values)
      .eq("id", invoiceId)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Fattura non aggiornata.");
    }

    await recordInvoiceEvent(supabase, {
      invoiceId,
      eventType: `invoice_${parsed.data.status}`,
      actorProfileId: profile.id,
      details: parsed.data,
    });

    return NextResponse.json({ ok: true, invoice: data });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
