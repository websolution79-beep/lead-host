import { NextResponse } from "next/server";
import { fetchCommercialSettings } from "@/lib/config/commercial-settings";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createServiceSupabaseClient();
    const { settings } = await fetchCommercialSettings(supabase);

    return NextResponse.json({ settings });
  } catch {
    return NextResponse.json(
      { error: "Impostazioni commerciali non disponibili." },
      { status: 500 },
    );
  }
}
