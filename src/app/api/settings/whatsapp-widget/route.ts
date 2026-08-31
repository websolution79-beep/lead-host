import { NextResponse } from "next/server";
import { fetchWhatsAppWidgetSettings } from "@/lib/config/whatsapp-widget-settings";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const { settings } = await fetchWhatsAppWidgetSettings(
      createServiceSupabaseClient(),
    );

    return NextResponse.json(
      { settings },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Widget WhatsApp non disponibile." },
      { status: 500 },
    );
  }
}
