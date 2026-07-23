import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import {
  fetchCommercialSettings,
  saveCommercialSettings,
  type CommercialSettings,
} from "@/lib/config/commercial-settings";

const priceRuleSchema = z.object({
  id: z.string().trim().min(1).optional(),
  scope: z.enum(["region", "province", "city"]),
  value: z.string().trim().min(2).max(120),
  sharedPriceCents: z.number().int().min(100).max(100000),
  exclusivePriceCents: z.number().int().min(100).max(200000),
  active: z.boolean(),
});

const commercialSettingsSchema = z.object({
  minTopUpCents: z.number().int().min(100).max(100000),
  quickTopUpCents: z.array(z.number().int().min(100).max(100000)).min(1).max(6),
  defaultSharedLeadPriceCents: z.number().int().min(100).max(100000),
  defaultExclusiveLeadPriceCents: z.number().int().min(100).max(200000),
  maxSharedBuyers: z.number().int().min(1).max(5),
  unavailableVisibilityDays: z.number().int().min(0).max(90),
  priceRules: z.array(priceRuleSchema).max(100),
});

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const { settings, storageReady } = await fetchCommercialSettings(supabase);

    return NextResponse.json(
      { settings, storageReady },
      {
        headers: {
          "Cache-Control": "private, max-age=15, stale-while-revalidate=45",
        },
      },
    );
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const payload = commercialSettingsSchema.parse(await request.json());
    const settings: CommercialSettings = {
      ...payload,
      priceRules: payload.priceRules.map((rule) => ({
        ...rule,
        id: rule.id ?? crypto.randomUUID(),
      })),
    };

    await saveCommercialSettings({
      supabase,
      profileId: profile.id,
      settings,
    });

    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
