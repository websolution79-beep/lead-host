import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import {
  fetchPmRegistrationSettings,
  savePmRegistrationSettings,
} from "@/lib/config/pm-registration-settings";

const settingsSchema = z.object({
  open: z.boolean(),
});

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const { settings, storageReady } =
      await fetchPmRegistrationSettings(supabase);

    return NextResponse.json(
      { settings, storageReady },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile, isSuperAdmin } =
      await requireSuperAdmin(request);
    const settings = settingsSchema.parse(await request.json());
    const { settings: previousSettings } =
      await fetchPmRegistrationSettings(supabase);

    await savePmRegistrationSettings({
      supabase,
      profileId: profile.id,
      settings,
    });

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      entityType: "pm_registration_settings",
      action: "settings.pm_registration_updated",
      before: previousSettings,
      after: settings,
    });

    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
