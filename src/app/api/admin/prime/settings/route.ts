import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import {
  fetchCommercialSettings,
  savePrimeSettings,
} from "@/lib/config/commercial-settings";

const primeSettingsSchema = z.object({
  defaultAccessDurationHours: z.number().int().min(1).max(720),
  firstMonthServiceFeeCents: z.number().int().min(100).max(1000000),
  recurringServiceFeeCents: z.number().int().min(100).max(1000000),
  monthlyWalletRechargeCents: z.number().int().min(0).max(1000000),
});

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const { settings, storageReady } = await fetchCommercialSettings(supabase);

    return NextResponse.json({
      settings: {
        defaultAccessDurationHours: settings.primeDefaultAccessDurationHours,
        firstMonthServiceFeeCents: settings.primeFirstMonthServiceFeeCents,
        recurringServiceFeeCents: settings.primeRecurringServiceFeeCents,
        monthlyWalletRechargeCents: settings.primeMonthlyWalletRechargeCents,
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

    await savePrimeSettings({
      supabase,
      profileId: profile.id,
      durationHours: payload.defaultAccessDurationHours,
      firstMonthServiceFeeCents: payload.firstMonthServiceFeeCents,
      recurringServiceFeeCents: payload.recurringServiceFeeCents,
      monthlyWalletRechargeCents: payload.monthlyWalletRechargeCents,
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
        firstMonthServiceFeeCents:
          previousSettings.primeFirstMonthServiceFeeCents,
        recurringServiceFeeCents:
          previousSettings.primeRecurringServiceFeeCents,
        monthlyWalletRechargeCents:
          previousSettings.primeMonthlyWalletRechargeCents,
      },
      after: payload,
    });

    return NextResponse.json({ ok: true, settings: payload });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
