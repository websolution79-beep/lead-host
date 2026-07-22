import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";

const preferenceSchema = z.object({
  newLeadFrequency: z.enum(["immediate", "daily", "every_3_days", "off"]),
});

type EmailPreferenceRow = {
  profile_id: string;
  new_lead_frequency: "immediate" | "daily" | "every_3_days" | "off";
  transactional_enabled: boolean;
  last_lead_digest_sent_at: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase, profile } = await requirePropertyManager(request);
    const preferences = supabase.from("email_preferences" as never) as unknown as {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{
            data: EmailPreferenceRow | null;
            error: { message?: string } | null;
          }>;
        };
      };
    };
    const { data, error } = await preferences
      .select("profile_id,new_lead_frequency,transactional_enabled,last_lead_digest_sent_at")
      .eq("profile_id", profile.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({
        preferences: getDefaultPreferences(),
        warning: "Preferenze email non ancora inizializzate nel database.",
      });
    }

    return NextResponse.json({
      preferences: data
        ? {
            newLeadFrequency: data.new_lead_frequency,
            transactionalEnabled: data.transactional_enabled,
            lastLeadDigestSentAt: data.last_lead_digest_sent_at,
          }
        : getDefaultPreferences(),
    });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile } = await requirePropertyManager(request);
    const payload = preferenceSchema.parse(await request.json());
    const preferences = supabase.from("email_preferences" as never) as unknown as {
      upsert: (
        row: Record<string, unknown>,
        options: { onConflict: string },
      ) => {
        select: (columns: string) => {
          single: () => Promise<{
            data: EmailPreferenceRow | null;
            error: { message?: string } | null;
          }>;
        };
      };
    };
    const { data, error } = await preferences
      .upsert(
        {
          profile_id: profile.id,
          new_lead_frequency: payload.newLeadFrequency,
          transactional_enabled: true,
        },
        { onConflict: "profile_id" },
      )
      .select("profile_id,new_lead_frequency,transactional_enabled,last_lead_digest_sent_at")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Non sono riuscito a salvare le preferenze email." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      preferences: {
        newLeadFrequency: data.new_lead_frequency,
        transactionalEnabled: data.transactional_enabled,
        lastLeadDigestSentAt: data.last_lead_digest_sent_at,
      },
    });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}

function getDefaultPreferences() {
  return {
    newLeadFrequency: "immediate",
    transactionalEnabled: true,
    lastLeadDigestSentAt: null,
  };
}
