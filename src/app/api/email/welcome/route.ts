import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";
import { sendWelcomeEmail } from "@/lib/email/notifications";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import {
  createServerTrackingEventId,
  trackMetaHybridEvent,
} from "@/lib/tracking/server-events";

const trackingSchema = z
  .object({
    trackingConsent: z
      .object({
        resolved: z.boolean(),
        measurement: z.boolean(),
        marketing: z.boolean(),
      })
      .optional(),
  })
  .nullable();

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile } = await requirePropertyManager(request);
    const parsedBody = trackingSchema.safeParse(
      await request.json().catch(() => null),
    );
    const trackingConsent =
      parsedBody.success && parsedBody.data?.trackingConsent
        ? parsedBody.data.trackingConsent
        : {
            resolved: false,
            measurement: false,
            marketing: false,
          };
    const trackingEventId = createServerTrackingEventId(
      "complete_registration",
      profile.id,
    );

    after(async () => {
      const trackingClient = createServiceSupabaseClient();
      await trackMetaHybridEvent({
        supabase: trackingClient,
        input: {
          eventName: "complete_registration",
          eventId: trackingEventId,
          pagePath: "/auth/callback",
          occurredAt: new Date().toISOString(),
          consent: trackingConsent,
          user: {
            profileId: profile.id,
            email: profile.email,
            phone: profile.phone,
          },
        },
      });
    });

    const logs = supabase.from("email_delivery_logs" as never) as unknown as {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            limit: (count: number) => Promise<{
              data: Array<{ id: string }> | null;
              error: { message?: string } | null;
            }>;
          };
        };
      };
    };
    const { data: alreadySent } = await logs
      .select("id")
      .eq("profile_id", profile.id)
      .eq("event_type", "pm.welcome")
      .limit(1);

    if (alreadySent?.length) {
      return NextResponse.json({
        ok: true,
        status: "already_sent",
        trackingEventId,
      });
    }

    const result = await sendWelcomeEmail({
      id: profile.id,
      email: profile.email,
      first_name: profile.first_name,
      last_name: profile.last_name,
      status: profile.status,
    });

    return NextResponse.json({
      ok: true,
      status: result.status,
      trackingEventId,
    });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}
