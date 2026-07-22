import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import {
  fetchTransactionalEmailTemplates,
  saveTransactionalEmailTemplates,
  transactionalEmailTemplateIds,
  type TransactionalEmailTemplate,
  type TransactionalEmailTemplateId,
} from "@/lib/config/transactional-email-settings";
import { sendTransactionalEmail } from "@/lib/email/service";

const templateSchema = z.object({
  id: z.enum(transactionalEmailTemplateIds),
  enabled: z.boolean(),
  subject: z.string().trim().min(1).max(180),
  preview: z.string().trim().max(220),
  title: z.string().trim().min(1).max(180),
  body: z.string().trim().min(1).max(2000),
  extra: z.string().trim().max(1200),
  ctaLabel: z.string().trim().max(80),
  ctaUrl: z.string().trim().max(300),
});

const patchSchema = z.object({
  templates: z.array(templateSchema).min(1),
});

const testSchema = z.object({
  templateId: z.enum(transactionalEmailTemplateIds),
});

type EmailLogRow = {
  id: string;
  recipient_email: string;
  event_type: string;
  subject: string;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const [{ templates, storageReady }, logsResult] = await Promise.all([
      fetchTransactionalEmailTemplates(supabase),
      (supabase.from("email_delivery_logs" as never) as unknown as {
        select: (columns: string) => {
          order: (
            column: string,
            options: { ascending: boolean },
          ) => {
            limit: (count: number) => Promise<{
              data: EmailLogRow[] | null;
              error: { code?: string; message?: string } | null;
            }>;
          };
        };
      })
        .select("id,recipient_email,event_type,subject,status,error_message,sent_at,created_at")
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

    return NextResponse.json({
      templates,
      logs: logsResult.error ? [] : logsResult.data ?? [],
      logsReady: !logsResult.error,
      storageReady,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const payload = patchSchema.parse(await request.json());
    const { templates: defaultTemplates } =
      await fetchTransactionalEmailTemplates(supabase);
    const defaultById = new Map(defaultTemplates.map((template) => [template.id, template]));
    const templates = payload.templates.map((template) => ({
      ...defaultById.get(template.id),
      ...template,
    })) as TransactionalEmailTemplate[];
    const savedTemplates = await saveTransactionalEmailTemplates({
      supabase,
      profileId: profile.id,
      templates,
    });

    return NextResponse.json({ ok: true, templates: savedTemplates });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireSuperAdmin(request);
    const payload = testSchema.parse(await request.json());
    const variables = getSampleVariables(payload.templateId);
    const result = await sendTransactionalEmail({
      to: profile.email,
      profileId: profile.id,
      eventType: payload.templateId,
      subject: "Test Lead Host",
      html: "<p>Email di test Lead Host.</p>",
      text: "Email di test Lead Host.",
      metadata: { test: true, template_id: payload.templateId },
      templateVariables: variables,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function getSampleVariables(
  templateId: TransactionalEmailTemplateId,
): Record<string, string | number> {
  const common = {
    first_name: "Luca",
    first_name_suffix: ", Luca",
    reference: "LH-TEST-001",
    city: "Roma",
    city_suffix: " - Roma",
    property_type: "Appartamento",
    lead_title: "Bilocale a Roma Prati",
    purchase_mode: "shared",
    purchase_mode_label: "condivisa",
    amount: "29,00 €",
    wallet_balance: "71,00 €",
    shared_price: "29,00 €",
    exclusive_price: "50,00 €",
    lead_count: 3,
    lead_list_text:
      "- Bilocale a Roma Prati: condiviso 29,00 €, esclusivo 50,00 €\n- Trilocale a Milano: condiviso 35,00 €, esclusivo 60,00 €",
  };

  return {
    ...common,
    template_id: templateId,
  };
}
