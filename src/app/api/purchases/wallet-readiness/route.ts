import { NextResponse, type NextRequest } from "next/server";
import {
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";
import { getBillingReadiness } from "@/lib/billing/server";
import { fetchCommercialSettings } from "@/lib/config/commercial-settings";
import { CURRENT_TERMS_VERSION } from "@/lib/legal/terms";
import { resolveWalletTopUpPolicy } from "@/lib/wallet/top-up-policy";

export async function GET(request: NextRequest) {
  try {
    const { supabase, profile } = await requirePropertyManager(request);
    const [billing, commercialSettings] = await Promise.all([
      getBillingReadiness(supabase, profile.id),
      fetchCommercialSettings(supabase),
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
      ...topUpPolicy,
    });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}
