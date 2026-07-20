import { NextResponse, type NextRequest } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

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

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    throw new PropertyManagerApiError(401, "Sessione non valida. Effettua di nuovo il login.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();

  if (profileError || !profile || profile.status !== "active") {
    throw new PropertyManagerApiError(403, "Profilo Property Manager non attivo.");
  }

  const { data: propertyManager, error: pmError } = await supabase
    .from("property_manager_profiles")
    .select("*")
    .eq("profile_id", profile.id)
    .single();

  if (pmError || !propertyManager) {
    throw new PropertyManagerApiError(403, "Profilo Property Manager non trovato.");
  }

  if (propertyManager.verification_status === "suspended") {
    throw new PropertyManagerApiError(403, "Profilo Property Manager sospeso.");
  }

  return { supabase, profile, propertyManager };
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
