import { NextResponse, type NextRequest } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

export class AdminApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type AdminContext = {
  supabase: ServiceSupabaseClient;
  profile: Database["public"]["Tables"]["profiles"]["Row"];
};

export async function requireSuperAdmin(request: NextRequest): Promise<AdminContext> {
  const supabase = createServiceSupabaseClient();
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!token) {
    throw new AdminApiError(401, "Sessione admin non trovata.");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    throw new AdminApiError(401, "Sessione admin non valida.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();

  if (profileError || !profile || profile.status !== "active") {
    throw new AdminApiError(403, "Profilo admin non autorizzato.");
  }

  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("profile_id", profile.id);

  if (rolesError || !roles?.some((item) => item.role === "super_admin")) {
    throw new AdminApiError(403, "Ruolo Super Admin richiesto.");
  }

  return { supabase, profile };
}

export function adminApiErrorResponse(error: unknown) {
  if (error instanceof AdminApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(error);

  return NextResponse.json(
    { error: "Errore interno nella gestione admin." },
    { status: 500 },
  );
}
