import { NextResponse } from "next/server";
import { fetchTrackingSettings } from "@/lib/config/tracking-settings";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createServiceSupabaseClient();
    const { settings, storageReady } = await fetchTrackingSettings(supabase);

    return NextResponse.json(
      {
        version: settings.version,
        storageReady,
        providers: settings.providers,
        events: settings.events,
      },
      {
        headers: {
          "Cache-Control":
            "public, max-age=30, s-maxage=30, stale-while-revalidate=300",
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        version: 1,
        storageReady: false,
        providers: {
          meta: {
            enabled: false,
            pixelId: "",
            scopes: { public: false, pm: false, admin: false },
          },
          ga4: {
            enabled: false,
            measurementId: "",
            scopes: { public: false, pm: false, admin: false },
          },
          hotjar: {
            enabled: false,
            siteId: "",
            scopes: { public: false, pm: false, admin: false },
          },
        },
        events: {},
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
