import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import {
  fetchTrackingSettings,
  saveTrackingSettings,
  trackingEventCatalog,
  trackingEventIds,
  trackingProviderIds,
  type TrackingSettings,
} from "@/lib/config/tracking-settings";

const scopesSchema = z.object({
  public: z.boolean(),
  pm: z.boolean(),
  admin: z.boolean(),
});

const eventSettingsSchema = z.object({
  enabled: z.boolean(),
  providers: z.array(z.enum(trackingProviderIds)).max(trackingProviderIds.length),
});

const settingsSchema = z.object({
  version: z.literal(1),
  providers: z.object({
    meta: z.object({
      enabled: z.boolean(),
      pixelId: z.union([z.literal(""), z.string().regex(/^\d{5,30}$/)]),
      scopes: scopesSchema,
    }),
    ga4: z.object({
      enabled: z.boolean(),
      measurementId: z.union([
        z.literal(""),
        z.string().regex(/^G-[A-Z0-9]{4,30}$/i),
      ]),
      scopes: scopesSchema,
    }),
    hotjar: z.object({
      enabled: z.boolean(),
      siteId: z.union([z.literal(""), z.string().regex(/^\d{3,30}$/)]),
      scopes: scopesSchema,
    }),
  }),
  events: z.object(
    Object.fromEntries(
      trackingEventIds.map((eventId) => [eventId, eventSettingsSchema]),
    ) as Record<(typeof trackingEventIds)[number], typeof eventSettingsSchema>,
  ),
});

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const { settings, storageReady } = await fetchTrackingSettings(supabase);

    return NextResponse.json(
      {
        settings,
        storageReady,
        eventCatalog: trackingEventCatalog,
        environment: {
          metaConversionsApiConfigured: Boolean(
            process.env.META_CONVERSIONS_API_TOKEN,
          ),
          ga4MeasurementProtocolConfigured: Boolean(
            process.env.GA4_MEASUREMENT_PROTOCOL_SECRET,
          ),
        },
      },
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
    const { supabase, profile } = await requireSuperAdmin(request);
    const payload = settingsSchema.parse(
      await request.json(),
    ) as TrackingSettings;
    const settings = await saveTrackingSettings({
      supabase,
      profileId: profile.id,
      settings: normalizeEventProviders(payload),
    });

    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function normalizeEventProviders(settings: TrackingSettings): TrackingSettings {
  return {
    ...settings,
    events: Object.fromEntries(
      trackingEventIds.map((eventId) => [
        eventId,
        {
          ...settings.events[eventId],
          providers: Array.from(new Set(settings.events[eventId].providers)).filter(
            (provider) => trackingProviderIds.includes(provider),
          ),
        },
      ]),
    ) as TrackingSettings["events"],
  };
}
