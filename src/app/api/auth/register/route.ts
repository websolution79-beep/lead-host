import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { fetchPmRegistrationSettings } from "@/lib/config/pm-registration-settings";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

const registrationSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(5).max(40),
  managedPropertiesRange: z.enum([
    "starting_now",
    "one_to_three",
    "four_to_ten",
    "more_than_ten",
  ]),
  primaryCity: z.string().trim().min(2).max(120),
  password: z.string().min(8).max(128),
});

export async function POST(request: NextRequest) {
  try {
    const payload = registrationSchema.parse(await request.json());
    const serviceClient = createServiceSupabaseClient();
    const { settings } = await fetchPmRegistrationSettings(serviceClient);

    if (!settings.open) {
      return NextResponse.json(
        {
          code: "pm_registrations_closed",
          error: "Le iscrizioni dei Property Manager sono chiuse.",
        },
        { status: 403 },
      );
    }

    const supabase = createPublicSupabaseClient();
    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
    ).replace(/\/$/, "");
    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        emailRedirectTo: `${appUrl}/auth/callback`,
        data: {
          first_name: payload.firstName,
          last_name: payload.lastName,
          phone: payload.phone,
          managed_properties_range: payload.managedPropertiesRange,
          primary_city: payload.primaryCity,
        },
      },
    });

    if (error) {
      return NextResponse.json(
        {
          error: "Non sono riuscito a creare l'account. Controlla i dati inseriti.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      userId: data.user?.id ?? null,
      session: data.session
        ? {
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
            expiresAt: data.session.expires_at,
          }
        : null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Controlla che tutti i campi siano compilati correttamente." },
        { status: 400 },
      );
    }

    console.error("PM registration failed", error);
    return NextResponse.json(
      { error: "Servizio di registrazione temporaneamente non disponibile." },
      { status: 500 },
    );
  }
}
