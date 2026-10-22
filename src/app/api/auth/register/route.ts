import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { fetchPmRegistrationSettings } from "@/lib/config/pm-registration-settings";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import {
  createServerTrackingEventId,
  trackMetaHybridEvent,
} from "@/lib/tracking/server-events";
import { MARKETING_CONSENT_POLICY_VERSION } from "@/lib/brevo/config";
import { runBrevoWorkerSafely } from "@/lib/brevo/worker";
import { recordTermsAcceptance } from "@/lib/legal/acceptances";
import { getPmSignupMarketingActivation, PM_SIGNUP_NOTICE_TEXT, PM_SIGNUP_NOTICE_VERSION } from "@/lib/legal/pm-signup-notice";
import {
  CURRENT_PRIVACY_POLICY_VERSION,
  CURRENT_TERMS_VERSION,
} from "@/lib/legal/terms";

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
  legalAccepted: z.literal(true),
  emailMarketingConsent: z.boolean().optional().default(false),
  signupNoticeVersion: z.literal(PM_SIGNUP_NOTICE_VERSION).optional(),
  trackingConsent: z
    .object({
      resolved: z.boolean(),
      measurement: z.boolean(),
      marketing: z.boolean(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const payload = registrationSchema.parse(await request.json());
    // Legacy forms retain their actual optional choice, including a refusal.
    const marketingActivation = getPmSignupMarketingActivation(payload, MARKETING_CONSENT_POLICY_VERSION);
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

    if (marketingActivation.automatic) {
      const readiness = serviceClient as unknown as { rpc: (name: string) => Promise<{ data: unknown; error: unknown }> };
      const { data: ready, error: readinessError } = await readiness.rpc("pm_signup_automatic_marketing_ready");
      if (readinessError || ready !== true) {
        return NextResponse.json({ error: "La registrazione è in aggiornamento. Riprova tra poco." }, { status: 503 });
      }
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
          legal_accepted: payload.legalAccepted,
          terms_version: CURRENT_TERMS_VERSION,
          privacy_policy_version: CURRENT_PRIVACY_POLICY_VERSION,
          email_marketing_consent: marketingActivation.enabled,
          email_marketing_policy_version: marketingActivation.policyVersion,
          marketing_activation_source: marketingActivation.source,
          marketing_activation_automatic: marketingActivation.automatic,
          ...(marketingActivation.automatic ? {
            registration_notice_version: PM_SIGNUP_NOTICE_VERSION,
            registration_notice_text: PM_SIGNUP_NOTICE_TEXT,
          } : {}),
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

    const trackingEventId = data.user
      ? createServerTrackingEventId("lead", data.user.id)
      : null;

    if (data.user && trackingEventId) {
      const trackingConsent = payload.trackingConsent ?? {
        resolved: false,
        measurement: false,
        marketing: false,
      };
      const trackingUser = {
        profileId: data.user.id,
        email: payload.email,
        phone: payload.phone,
      };

      after(async () => {
        const trackingClient = createServiceSupabaseClient();
        await trackMetaHybridEvent({
          supabase: trackingClient,
          input: {
            eventName: "lead",
            eventId: trackingEventId,
            pagePath: "/",
            occurredAt: new Date().toISOString(),
            consent: trackingConsent,
            user: trackingUser,
          },
        });
      });
    }

    if (data.user) {
      const { data: registrationProfile, error: profileError } = await serviceClient
        .from("profiles").select("id").eq("auth_user_id", data.user.id).maybeSingle();
      if (profileError) console.error("PM registration acceptance profile lookup failed", { code: profileError.code });
      // profiles.id is not auth.users.id. Do not insert evidence for an obfuscated duplicate response.
      if (registrationProfile) {
      const { error: acceptanceError } = await recordTermsAcceptance(
        serviceClient,
        {
          profileId: registrationProfile.id,
          context: "account_registration",
          termsVersion: CURRENT_TERMS_VERSION,
          metadata: {
            privacy_policy_version: CURRENT_PRIVACY_POLICY_VERSION,
            source: "pm_signup_form",
            ...(marketingActivation.automatic ? {
              signup_notice_version: PM_SIGNUP_NOTICE_VERSION,
              signup_notice_text: PM_SIGNUP_NOTICE_TEXT,
              marketing_activation_source: marketingActivation.source,
              marketing_activation_automatic: true,
              explicit_marketing_checkbox: false,
            } : {}),
          },
        },
      );

      // A duplicate can only result from a repeated signup response; it is safe.
      if (acceptanceError && acceptanceError.code !== "23505") {
        console.error("PM registration legal acceptance recording failed", acceptanceError);
      }
      }
    }

    if (data.user) {
      after(() => runBrevoWorkerSafely(10));
    }

    return NextResponse.json({
      userId: data.user?.id ?? null,
      trackingEventId,
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
