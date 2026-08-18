import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";

const updateSchema = z.object({ dismissed: z.literal(true) });

type TelegramPromptPreferenceRow = { dismissed_at: string | null };

export async function GET(request: NextRequest) {
  try {
    const { supabase, profile } = await requirePropertyManager(request);
    const { data, error } = await preferencesTable(supabase)
      .select("dismissed_at")
      .eq("profile_id", profile.id)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({ dismissedAt: data?.dismissed_at ?? null });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile } = await requirePropertyManager(request);
    const payload = updateSchema.safeParse(await request.json());

    if (!payload.success) {
      return NextResponse.json({ error: "Preferenza non valida." }, { status: 400 });
    }

    const { data, error } = await preferencesTable(supabase)
      .upsert(
        { profile_id: profile.id, dismissed_at: new Date().toISOString() },
        { onConflict: "profile_id" },
      )
      .select("dismissed_at")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Preferenza Telegram non aggiornata.");
    }

    return NextResponse.json({ dismissedAt: data.dismissed_at });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}

type PropertyManagerSupabase = Awaited<
  ReturnType<typeof requirePropertyManager>
>["supabase"];

function preferencesTable(supabase: PropertyManagerSupabase) {
  return supabase.from("pm_telegram_prompt_preferences" as never) as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: TelegramPromptPreferenceRow | null;
          error: { message?: string } | null;
        }>;
      };
    };
    upsert: (
      values: Record<string, unknown>,
      options: { onConflict: string },
    ) => {
      select: (columns: string) => {
        single: () => Promise<{
          data: TelegramPromptPreferenceRow | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
}
