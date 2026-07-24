import { NextResponse } from "next/server";
import { fetchPmRegistrationSettings } from "@/lib/config/pm-registration-settings";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createServiceSupabaseClient();
  const { settings } = await fetchPmRegistrationSettings(supabase);

  return NextResponse.json(
    { open: settings.open },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
