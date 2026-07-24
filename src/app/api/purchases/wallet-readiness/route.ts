import { NextResponse, type NextRequest } from "next/server";
import {
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";
import { getBillingReadiness } from "@/lib/billing/server";
import { CURRENT_TERMS_VERSION } from "@/lib/legal/terms";

export async function GET(request: NextRequest) {
  try {
    const { supabase, profile } = await requirePropertyManager(request);
    const billing = await getBillingReadiness(supabase, profile.id);

    return NextResponse.json({
      billingComplete: billing.complete,
      missingFields: billing.missingFields,
      missingLabels: billing.missingLabels,
      termsVersion: CURRENT_TERMS_VERSION,
    });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}

