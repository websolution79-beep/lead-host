import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import {
  AdminApiError,
  adminApiErrorResponse,
  requireSuperAdmin,
} from "@/lib/admin/auth";
import {
  fetchWhatsAppWidgetSettings,
  saveWhatsAppWidgetSettings,
} from "@/lib/config/whatsapp-widget-settings";

const settingsSchema = z.object({
  enabled: z.boolean(),
  businessNumber: z.string().trim().regex(/^\d{8,15}$/),
  prefilledMessage: z.string().trim().min(1).max(500),
});

async function requireWidgetSuperAdmin(request: NextRequest) {
  const context = await requireSuperAdmin(request);

  if (!context.isSuperAdmin) {
    throw new AdminApiError(403, "Ruolo Super Admin richiesto.");
  }

  return context;
}

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireWidgetSuperAdmin(request);
    const { settings } = await fetchWhatsAppWidgetSettings(supabase);

    return NextResponse.json(
      { settings },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile, isSuperAdmin } =
      await requireWidgetSuperAdmin(request);
    const settings = settingsSchema.parse(await request.json());
    const { settings: previousSettings } = await fetchWhatsAppWidgetSettings(supabase);

    await saveWhatsAppWidgetSettings({
      supabase,
      profileId: profile.id,
      settings,
    });

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      entityType: "whatsapp_widget_settings",
      action: "settings.whatsapp_widget_updated",
      before: previousSettings,
      after: settings,
    });

    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
