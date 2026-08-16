import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import {
  fetchCommercialSettings,
  savePrimeDefaultAccessDuration,
} from "@/lib/config/commercial-settings";

const primeSettingsSchema = z.object({
  defaultAccessDurationHours: z.number().int().min(1).max(720),
});

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const { settings, storageReady } = await fetchCommercialSettings(supabase);

    return NextResponse.json({
      settings: {
        defaultAccessDurationHours: settings.primeDefaultAccessDurationHours,
      },
      storageReady,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile, isSuperAdmin } =
      await requireSuperAdmin(request);
    const payload = primeSettingsSchema.parse(await request.json());
    const { settings: previousSettings } =
      await fetchCommercialSettings(supabase);

    await savePrimeDefaultAccessDuration({
      supabase,
      profileId: profile.id,
      durationHours: payload.defaultAccessDurationHours,
    });

    revalidatePath("/admin/leads", "layout");
    revalidatePath("/admin/prime", "layout");

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      entityType: "prime_settings",
      action: "settings.prime_updated",
      before: {
        defaultAccessDurationHours:
          previousSettings.primeDefaultAccessDurationHours,
      },
      after: payload,
    });

    return NextResponse.json({ ok: true, settings: payload });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
