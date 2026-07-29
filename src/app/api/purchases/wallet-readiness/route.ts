import { NextResponse, type NextRequest } from "next/server";
import {
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";
import { getBillingReadiness } from "@/lib/billing/server";
import { fetchCommercialSettings } from "@/lib/config/commercial-settings";
import { CURRENT_TERMS_VERSION } from "@/lib/legal/terms";
import { resolveWalletTopUpPolicy } from "@/lib/wallet/top-up-policy";
import { fetchWalletCouponsEnabled } from "@/lib/wallet/coupons";

export async function GET(request: NextRequest) {
  try {
    const { supabase, profile } = await requirePropertyManager(request);
    const [billing, commercialSettings, couponsEnabled] = await Promise.all([
      getBillingReadiness(supabase, profile.id),
      fetchCommercialSettings(supabase),
      fetchWalletCouponsEnabled(supabase),
    ]);
    const topUpPolicy = await resolveWalletTopUpPolicy({
      supabase,
      profileId: profile.id,
      settings: commercialSettings.settings,
    });

    return NextResponse.json({
      billingComplete: billing.complete,
      missingFields: billing.missingFields,
      missingLabels: billing.missingLabels,
      termsVersion: CURRENT_TERMS_VERSION,
      couponsEnabled,
      ...topUpPolicy,
    });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}
