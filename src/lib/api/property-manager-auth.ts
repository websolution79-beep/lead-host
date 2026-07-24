import { NextResponse, type NextRequest } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { getAuthenticatedProfileContext } from "@/lib/auth/profile-context";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

export class PropertyManagerApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type PropertyManagerApiContext = {
  supabase: ServiceSupabaseClient;
  profile: Database["public"]["Tables"]["profiles"]["Row"];
  propertyManager: Database["public"]["Tables"]["property_manager_profiles"]["Row"];
};

export async function requirePropertyManager(
  request: NextRequest,
): Promise<PropertyManagerApiContext> {
  const supabase = createServiceSupabaseClient();
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!token) {
    throw new PropertyManagerApiError(401, "Sessione non trovata. Effettua di nuovo il login.");
  }

  const context = await getAuthenticatedProfileContext(token);

  if (!context) {
    throw new PropertyManagerApiError(401, "Sessione non valida. Effettua di nuovo il login.");
  }

  if (context.profile.status !== "active") {
    throw new PropertyManagerApiError(403, "Profilo Property Manager non attivo.");
  }

  if (!context.roles.includes("property_manager")) {
    throw new PropertyManagerApiError(403, "Ruolo Property Manager non attivo.");
  }

  const { data: propertyManager, error: pmError } = await supabase
    .from("property_manager_profiles")
    .select("*")
    .eq("profile_id", context.profile.id)
    .maybeSingle();

  if (pmError) {
    throw new PropertyManagerApiError(403, "Profilo Property Manager non trovato.");
  }

  const resolvedPropertyManager =
    propertyManager ??
    (await createMissingPropertyManagerProfile(supabase, context.profile));

  if (!resolvedPropertyManager) {
    throw new PropertyManagerApiError(403, "Profilo Property Manager non trovato.");
  }

  if (resolvedPropertyManager.verification_status === "suspended") {
    throw new PropertyManagerApiError(403, "Profilo Property Manager sospeso.");
  }

  return {
    supabase,
    profile: context.profile,
    propertyManager: resolvedPropertyManager,
  };
}

async function createMissingPropertyManagerProfile(
  supabase: ServiceSupabaseClient,
  profile: Database["public"]["Tables"]["profiles"]["Row"],
) {
  const fallbackCompanyName =
    [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
    profile.email;

  const { data, error } = await supabase
    .from("property_manager_profiles")
    .insert({
      profile_id: profile.id,
      company_name: fallbackCompanyName,
      verification_status: "verified",
    })
    .select("*")
    .single();

  if (error) {
    console.error("Property Manager profile repair failed:", error.message);
    return null;
  }

  return data;
}

export function propertyManagerApiErrorResponse(error: unknown) {
  if (error instanceof PropertyManagerApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(error);

  return NextResponse.json(
    { error: "Errore interno nella gestione Property Manager." },
    { status: 500 },
  );
}
